import entitiesApi from "@/api/entitiesApi";
import useApi from "@/hooks/useApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════
 *  Types
 * ════════════════════════════════════════════════════════════ */

export interface RetailShop {
    id: string;
    name: string;
    entityType: string;
    isPharmacy: boolean;
    categories: string[];
    primaryCategory: string;
    rating: number;
    image?: string;
    phone?: string;
    latitude: number;
    longitude: number;
    subCountyId?: string;
    subCountyTitle?: string;
    countyId?: string;
    countyTitle?: string;
    town?: string;
}

export type RetailSortKey = "rating" | "name";

/* "idle" = nothing has been picked yet — distinct from "loading"
   (a request is in flight) and "loaded" (a request completed). */
type RetailersStatus = "idle" | "loading" | "loaded" | "error";

/* ════════════════════════════════════════════════════════════
 *  Normalizers
 * ════════════════════════════════════════════════════════════ */

function pickImage(images: any): string | undefined {
    if (!Array.isArray(images) || images.length === 0) return undefined;
    for (const img of images) {
        if (typeof img === "string" && img.length > 0) return img;
        if (img && typeof img === "object") {
            if (typeof img.image === "string" && img.image.length > 0)
                return img.image;
            if (typeof img.thumbnail === "string" && img.thumbnail.length > 0)
                return img.thumbnail;
            if (typeof img.url === "string" && img.url.length > 0) return img.url;
        }
    }
    return undefined;
}

function extractId(v: any): string | undefined {
    if (!v) return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "object") {
        const raw = v.id ?? v.uuid ?? v.value;
        return raw ? String(raw) : undefined;
    }
    return undefined;
}

function normalizeShop(x: any): RetailShop {
    const [lng, lat] = x.point?.coordinates ?? [];
    const titles: string[] = Array.isArray(x.categories)
        ? x.categories.map((c: any) => c?.title).filter(Boolean)
        : [];
    const entityType = x.entity_type ?? "Retailer";

    const subCountyId =
        extractId(x.sub_county) ??
        extractId(x.sub_county_id) ??
        extractId(x.subcounty);

    const subCountyTitle =
        x.sub_county_title ??
        x.sub_county_name ??
        (typeof x.sub_county === "object" ? x.sub_county?.title : undefined);

    return {
        id: String(x.entity ?? x.id ?? Math.random().toString()),
        name: x.entity_title ?? x.title ?? x.name ?? "Unknown Retailer",
        entityType,
        isPharmacy: entityType === "PharmaceuticalRetailer",
        categories: titles,
        primaryCategory: titles[0] ?? entityType ?? "General",
        rating: Number(x.rating ?? 0),
        image: pickImage(x.images ?? x.logos),
        phone: x.phone || x.phone1 || undefined,
        latitude: lat ?? x.latitude ?? 0,
        longitude: lng ?? x.longitude ?? 0,
        subCountyId,
        subCountyTitle,
        countyId: extractId(x.county) ?? extractId(x.county_id),
        countyTitle: x.county_title ?? x.county_name,
        town: x.town,
    };
}

/* ════════════════════════════════════════════════════════════
 *  Response parsing
 * ════════════════════════════════════════════════════════════ */

function extractRows(res: any): { rows: any[]; malformed: boolean } {
    if (res === null || res === undefined) {
        return { rows: [], malformed: false };
    }
    if (Array.isArray(res)) {
        return { rows: res, malformed: false };
    }
    if (Array.isArray(res.results)) {
        return { rows: res.results, malformed: false };
    }
    if (Array.isArray(res.data)) {
        return { rows: res.data, malformed: false };
    }
    if (Array.isArray(res.data?.results)) {
        return { rows: res.data.results, malformed: false };
    }
    return { rows: [], malformed: true };
}

/* ════════════════════════════════════════════════════════════
 *  Hook
 * ════════════════════════════════════════════════════════════ */

export function useRetailersByLocation(
    county: string | null,
    subCounty: string | null,
) {
    const [shops, setShops] = useState<RetailShop[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [sort, setSort] = useState<RetailSortKey>("rating");
    const [status, setStatus] = useState<RetailersStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    const retailersApi = useApi<any>(entitiesApi.getRetailEntitiesAction);

    const retailersApiRef = useRef(retailersApi);
    retailersApiRef.current = retailersApi;

    /* ── Fetch — fires only when a county is selected ────── */
    useEffect(() => {
        /* No county → no request. Clear whatever's on screen and
           drop into "idle" so the UI shows the "pick a county"
           prompt instead of "no retailers match your filters". */
        if (!county) {
            setShops([]);
            setError(null);
            setStatus("idle");
            return;
        }

        let cancelled = false;

        setShops([]);
        setError(null);
        setStatus("loading");

        const payload = {
            action: "GetRetailEntities",
            county,
        };

        console.log("[GetRetailEntities] request:", payload);

        const MIN_LOADING_MS = 250;
        const startedAt = Date.now();

        (async () => {
            try {
                const res = await retailersApiRef.current.request(payload);

                const elapsed = Date.now() - startedAt;
                if (elapsed < MIN_LOADING_MS) {
                    await new Promise((r) =>
                        setTimeout(r, MIN_LOADING_MS - elapsed),
                    );
                }
                if (cancelled) return;
                console.log("[GetRetailEntities] response:", res);

                const { rows, malformed } = extractRows(res);

                if (malformed) {
                    console.warn(
                        "[GetRetailEntities] malformed response — replacing list with empty array. Raw:",
                        res,
                    );
                }

                let nextShops = rows.map(normalizeShop);

                /* Defensive county guard — drop any rows whose
                   county id doesn't match the one we asked for. */
                const before = nextShops.length;
                nextShops = nextShops.filter(
                    (s) => !s.countyId || s.countyId === county,
                );
                const dropped = before - nextShops.length;
                if (dropped > 0) {
                    console.warn(
                        `[GetRetailEntities] backend returned ${dropped} row(s) outside county ${county}. Dropped.`,
                    );
                }

                console.log(
                    "[GetRetailEntities] received",
                    nextShops.length,
                    "row(s) for county",
                    county,
                );

                setShops(nextShops);
                setStatus("loaded");
            } catch (e: any) {
                if (cancelled) return;
                console.error("[GetRetailEntities] failed:", e);
                setError(
                    e?.response?.data?.detail ??
                    e?.message ??
                    "Failed to load retailers.",
                );
                setShops([]);
                setStatus("error");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [county]);

    /* ── Derived ──────────────────────────────────────────── */

    /* Expose nothing to the UI while loading or idle. */
    const visibleShops = useMemo(
        () => (status === "loading" || status === "idle" ? [] : shops),
        [shops, status],
    );

    const categories = useMemo(() => {
        const pool = subCounty
            ? visibleShops.filter((s) => s.subCountyId === subCounty)
            : visibleShops;
        const set = new Set<string>();
        pool.forEach((s) => s.categories.forEach((c) => set.add(c)));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [visibleShops, subCounty]);

    const filteredShops = useMemo(() => {
        if (status !== "loaded") return [];

        const q = searchQuery.trim().toLowerCase();

        const rows = visibleShops.filter((shop) => {
            const matchesSubCounty =
                !subCounty || shop.subCountyId === subCounty;

            const matchesQuery =
                !q ||
                shop.name.toLowerCase().includes(q) ||
                shop.categories.some((c) => c.toLowerCase().includes(q));

            const matchesCategory =
                selectedCategories.length === 0 ||
                selectedCategories.some((c) => shop.categories.includes(c));

            return matchesSubCounty && matchesQuery && matchesCategory;
        });

        switch (sort) {
            case "name":
                return [...rows].sort((a, b) => a.name.localeCompare(b.name));
            default:
                return [...rows].sort((a, b) => b.rating - a.rating);
        }
    }, [visibleShops, status, subCounty, searchQuery, selectedCategories, sort]);

    /* ── Mutators ─────────────────────────────────────────── */

    const toggleCategory = useCallback((category: string) => {
        setSelectedCategories((prev) =>
            prev.includes(category)
                ? prev.filter((c) => c !== category)
                : [...prev, category],
        );
    }, []);

    const clearCategories = useCallback(() => {
        setSelectedCategories([]);
    }, []);

    const isCategorySelected = useCallback(
        (category: string) => selectedCategories.includes(category),
        [selectedCategories],
    );

    /* ── Return ───────────────────────────────────────────── */

    return {
        shops: visibleShops,
        filteredShops,
        categories,
        searchQuery,
        setSearchQuery,
        selectedCategories,
        toggleCategory,
        clearCategories,
        isCategorySelected,
        sort,
        setSort,
        status,
        error,
        isLoading: status === "loading",
    };
}