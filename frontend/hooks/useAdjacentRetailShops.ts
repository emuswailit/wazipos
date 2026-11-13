// hooks/useAdjacentRetailShops.ts

import retailersApi from "@/api/retailersApi";
import useApi from "@/hooks/useApi";
import {
    Coords,
    EntityLocationResponse,
    RetailShop,
    RetailSortKey
} from "@/types/shop";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

// expo-location must not be pulled into the web bundle.
let Location: any = null;
if (Platform.OS !== "web") {
    Location = require("expo-location");
}

/* ════════════════════════════════════════════════════════════
 *  Location acquisition (Unchanged)
 * ════════════════════════════════════════════════════════════ */

type LocationResult =
    | { ok: true; coords: Coords; accuracy?: number; source: "browser" | "native" }
    | { ok: false; error: string };

function mapWebGeoError(err: GeolocationPositionError): string {
    switch (err.code) {
        case 1: return "Location permission denied. Enable it in your browser settings and retry.";
        case 2: return "Your location is unavailable right now. Check your device or network and retry.";
        case 3: return "Location request timed out. Try again.";
        default: return err.message || "Failed to read your location.";
    }
}

function webGetPosition(options: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}

async function requestWebLocation(): Promise<LocationResult> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        return { ok: false, error: "This browser does not expose the Geolocation API." };
    }
    try {
        const pos = await webGetPosition({ enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60 * 1000 });
        return {
            ok: true,
            source: "browser",
            accuracy: pos.coords.accuracy,
            coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        };
    } catch (e: any) {
        if (e?.code === 1) return { ok: false, error: mapWebGeoError(e) };
        try {
            const pos = await webGetPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
            return {
                ok: true,
                source: "browser",
                accuracy: pos.coords.accuracy,
                coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            };
        } catch (e2: any) {
            return { ok: false, error: mapWebGeoError(e2) };
        }
    }
}

async function requestNativeLocation(): Promise<LocationResult> {
    if (!Location) return { ok: false, error: "Location module is unavailable." };
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return { ok: false, error: "Location permission denied." };

        try {
            const loc = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 5000 });
            if (loc) {
                return {
                    ok: true, source: "native", accuracy: loc.coords.accuracy ?? undefined,
                    coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
                };
            }
        } catch { /* fall through */ }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return {
            ok: true, source: "native", accuracy: loc.coords.accuracy ?? undefined,
            coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? "Failed to read your location." };
    }
}

async function requestLocation(): Promise<LocationResult> {
    if (Platform.OS === "web") return requestWebLocation();
    return requestNativeLocation();
}

/* ════════════════════════════════════════════════════════════
 *  Payload helpers
 * ════════════════════════════════════════════════════════════ */

function normalizeShop(x: EntityLocationResponse): RetailShop {
    // 1. Extract coordinates from the GeoJSON Point
    const [lng, lat] = x.point?.coordinates ?? [0, 0];

    // 2. Extract categories
    const titles = Array.isArray(x.categories_array)
        ? x.categories_array.map((c) => c.title)
        : [];

    // 3. Extract image safely
    const firstImageUrl = x.images && x.images.length > 0
        ? x.images[0].url
        : undefined;

    return {
        id: String(x.id),
        name: x.entity_title,
        entityType: x.entity_type,
        isPharmacy: Boolean(x.is_pharmacy),

        categories: titles,
        primaryCategory: titles[0] ?? x.entity_type ?? "General",

        distanceKm: Number(x.farness ?? 0),
        rating: Number(x.rating ?? 0),

        image: firstImageUrl,
        phone: x.phone || undefined,

        latitude: lat,
        longitude: lng,
    };
}

/* ════════════════════════════════════════════════════════════
 *  Hook
 * ════════════════════════════════════════════════════════════ */

export function useAdjacentRetailShops() {
    const [shops, setShops] = useState<RetailShop[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [sort, setSort] = useState<RetailSortKey>("distance");

    const [userLocation, setUserLocation] = useState<Coords | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [error, setError] = useState<any>(null);
    const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
    const [locationSource, setLocationSource] = useState<"browser" | "native" | null>(null);
    const [isAppReady, setIsAppReady] = useState(false);

    const [reloadKey, setReloadKey] = useState(0);

    // Using the new retailersApi dispatcher for the Joint endpoint
    const locationsApi = useApi<any>(async (payload: any) => {
        return await retailersApi.retailerReceiptsAction(payload);
    });

    const apiRef = useRef(locationsApi);
    apiRef.current = locationsApi;

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setIsAppReady(false);
            setLocationError(null);
            setError(null);
            setShops([]);

            const result = await requestLocation();
            if (cancelled) return;

            if (!result.ok) {
                setUserLocation(null);
                setLocationError(result.error);
                setIsAppReady(true);
                return;
            }

            setUserLocation(result.coords);
            setLocationAccuracy(result.accuracy ?? null);
            setLocationSource(result.source);

            try {
                // 🌟 Sending the exact payload format your backend expects
                const res = await apiRef.current.request({
                    action: "GetAdjacentRetailersByLocation",
                    location: {
                        latitude: result.coords.latitude,
                        longitude: result.coords.longitude
                    }
                });

                // The pagination envelope is usually in res.data.results
                if (!res.ok) {
                    if (!cancelled) setError(res);
                } else {
                    const results = res.data?.results || res.data || [];
                    setShops(results.map(normalizeShop));
                }
            } catch (e) {
                console.error("Failed to fetch adjacent retailers:", e);
                if (!cancelled) setError(e);
            }

            if (!cancelled) setIsAppReady(true);
        })();

        return () => { cancelled = true; };
    }, [reloadKey]);

    /* ── Derived ───────────────────────────────────────────── */

    const categories = useMemo(() => {
        const set = new Set<string>();
        shops.forEach((s) => s.categories.forEach((c) => set.add(c)));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [shops]);

    const filteredShops = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        const rows = shops.filter((shop) => {
            const matchesQuery =
                !q ||
                shop.name.toLowerCase().includes(q) ||
                shop.categories.some((c) => c.toLowerCase().includes(q));

            const matchesCategory =
                selectedCategories.length === 0 ||
                selectedCategories.some((c) => shop.categories.includes(c));

            return matchesQuery && matchesCategory;
        });

        switch (sort) {
            case "rating":
                return [...rows].sort((a, b) => b.rating - a.rating);
            case "name":
                return [...rows].sort((a, b) => a.name.localeCompare(b.name));
            default:
                return rows;
        }
    }, [shops, searchQuery, selectedCategories, sort]);

    /* ── Category mutators ─────────────────────────────────── */

    const toggleCategory = useCallback((category: string) => {
        setSelectedCategories((prev) =>
            prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
        );
    }, []);

    const clearCategories = useCallback(() => setSelectedCategories([]), []);

    const isCategorySelected = useCallback(
        (category: string) => selectedCategories.includes(category),
        [selectedCategories]
    );

    /* ── Retry ─────────────────────────────────────────────── */

    const retryLocation = useCallback(() => setReloadKey((k) => k + 1), []);

    /* ── Mobile Compat ─────────────────────────────────────── */
    // The mobile screen passes a single category. If it changes, we overwrite the array.
    const selectedCategory = selectedCategories[0] ?? null;
    const setSelectedCategory = useCallback((c: string | null) => {
        if (!c || c === "All") setSelectedCategories([]);
        else setSelectedCategories([c]);
    }, []);

    const isLoading = !isAppReady || (locationsApi.loading && shops.length === 0);

    return {
        shops,
        filteredShops,
        categories,

        // Multi-select (web)
        selectedCategories,
        toggleCategory,
        clearCategories,
        isCategorySelected,

        // Single-select compat (mobile)
        selectedCategory,
        setSelectedCategory,

        searchQuery,
        setSearchQuery,
        sort,
        setSort,

        // Location
        userLocation,
        locationError,
        error,
        locationAccuracy,
        locationSource,
        retryLocation,

        isLoading,
    };
}