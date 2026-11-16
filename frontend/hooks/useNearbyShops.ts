// hooks/useNearbyShops.ts
//
// Adjacent Stores: shops and pharmacies near the shopper.
//
//   1. On open, ask for the device location (the app / browser prompts the
//      shopper to turn it on). Denied or switched off: say so, offer to try
//      again, and let them browse by county instead.
//   2. With a location: shops and pharmacies around them, nearest first, each
//      with how far it is (GetAdjacentRetailersByLocation, backend
//      retailers/utils/retailer_utils.py).
//   3. Second line: pick a county (and sub-county) to browse further afield;
//      distances still show when the location is known.

import retailersApi from '@/api/retailersApi';
import { apiError } from '@/api/deliveriesApi';
import type { Coords } from '@/types/shop';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

// expo-location must not be pulled into the web bundle.
let Location: any = null;
if (Platform.OS !== 'web') {
    Location = require('expo-location');
}

export type LocationState = 'asking' | 'granted' | 'denied' | 'off' | 'unavailable';
export type ShopsMode = 'NEARBY' | 'COUNTY';

export interface NearbyShop {
    id: string;
    name: string;
    entityType: string;
    isPharmacy: boolean;
    categories: string[];
    primaryCategory: string;
    /** Km from the shopper; null when their location isn't known. */
    distanceKm: number | null;
    rating: number;
    image?: string;
    phone?: string;
    latitude: number;
    longitude: number;
    town: string;
    subCountyTitle: string;
    countyTitle: string;
    subCountyId: string | null;
}

/** How the shop can get an order to the shopper at this distance (backend logistics tiers). */
export function deliveryHint(km: number | null): string | null {
    if (km === null) return null;
    if (km < 5) return 'Walking delivery or rider';
    if (km <= 20) return 'Rider delivery';
    return 'Rider or long-haul courier';
}

export function formatKm(km: number | null): string {
    if (km === null) return '';
    if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m away`;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

const PHARMACY_TYPES = new Set(['PharmaceuticalRetailer', 'PharmaceuticalWholesaler', 'Dispensary', 'Clinic']);

function normalize(x: any): NearbyShop {
    const [lng, lat] = x?.point?.coordinates ?? x?.point ?? [0, 0];
    const cats: string[] = Array.isArray(x?.categories_array) ? x.categories_array.map((c: any) => c?.title).filter(Boolean) : [];
    const far = x?.farness;
    const km = far === null || far === undefined || far === '' ? null : Number(far);
    const images = Array.isArray(x?.images) ? x.images : [];
    return {
        id: String(x.id),
        name: x.title || x.entity_title || 'Shop',
        entityType: x.entity_type || 'Retailer',
        isPharmacy: x.is_pharmacy ?? PHARMACY_TYPES.has(x.entity_type),
        categories: cats,
        primaryCategory: cats[0] ?? (PHARMACY_TYPES.has(x.entity_type) ? 'Pharmacy' : 'Shop'),
        distanceKm: km !== null && Number.isFinite(km) ? km : null,
        rating: Number(x.rating) || 0,
        image: images[0]?.thumbnail || images[0]?.image || images[0]?.url || undefined,
        phone: x.phone || undefined,
        latitude: Number(lat) || 0,
        longitude: Number(lng) || 0,
        town: x.town || '',
        subCountyTitle: x.constituency_title || '',
        countyTitle: x.county_title || '',
        subCountyId: x.constituency != null ? String(x.constituency) : null,
    };
}

/* ---------------------------------------------------------------- location */

type Fix = { ok: true; coords: Coords } | { ok: false; state: LocationState; message: string };

async function webLocation(): Promise<Fix> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return { ok: false, state: 'unavailable', message: 'This browser can’t share your location.' };
    }
    const get = (o: PositionOptions) => new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, o));
    try {
        const p = await get({ enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }).catch(async (e) => {
            if (e?.code === 1) throw e;
            return get({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        });
        return { ok: true, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } };
    } catch (e: any) {
        if (e?.code === 1) return { ok: false, state: 'denied', message: 'Location is blocked for this site. Allow it in your browser’s site settings, then try again.' };
        return { ok: false, state: 'off', message: 'Your location isn’t available. Turn on location (GPS / Wi-Fi) and try again.' };
    }
}

async function nativeLocation(): Promise<Fix> {
    if (!Location) return { ok: false, state: 'unavailable', message: 'Location isn’t available on this device.' };
    try {
        // Location switched off: ask Android to turn it on (shows the system dialog).
        const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
        if (!servicesOn) {
            if (Platform.OS === 'android') await Location.enableNetworkProviderAsync().catch(() => undefined);
            const nowOn = await Location.hasServicesEnabledAsync().catch(() => false);
            if (!nowOn) return { ok: false, state: 'off', message: 'Location is turned off. Turn it on to see shops near you.' };
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return { ok: false, state: 'denied', message: 'Allow location access so we can show shops near you.' };
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 3000 }).catch(() => null);
        const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        return { ok: true, coords: { latitude: fix.coords.latitude, longitude: fix.coords.longitude } };
    } catch (e: any) {
        return { ok: false, state: 'off', message: e?.message || 'We couldn’t read your location.' };
    }
}

/* ---------------------------------------------------------------- hook */

export function useNearbyShops() {
    const [locationState, setLocationState] = useState<LocationState>('asking');
    const [locationMessage, setLocationMessage] = useState<string | null>(null);
    const [coords, setCoords] = useState<Coords | null>(null);
    const [mode, setMode] = useState<ShopsMode>('NEARBY');
    const [county, setCounty] = useState('');
    const [subCounty, setSubCounty] = useState('');
    const [categoryIds, setCategoryIds] = useState<string[]>([]);
    const [shops, setShops] = useState<NearbyShop[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const reqId = useRef(0);

    /** Ask for the location (prompts the shopper to turn it on / allow it). */
    const requestLocation = useCallback(async () => {
        setLocationState('asking');
        setLocationMessage(null);
        const fix = Platform.OS === 'web' ? await webLocation() : await nativeLocation();
        if (fix.ok) {
            setCoords(fix.coords);
            setLocationState('granted');
            setMode('NEARBY');
        } else {
            setCoords(null);
            setLocationState(fix.state);
            setLocationMessage(fix.message);
            // No location: browse by county instead.
            setMode('COUNTY');
        }
    }, []);

    useEffect(() => {
        void requestLocation();
    }, [requestLocation]);

    // Load shops for the current mode.
    useEffect(() => {
        const id = ++reqId.current;
        const run = async () => {
            if (mode === 'NEARBY' && !coords) return;
            if (mode === 'COUNTY' && !county) {
                setShops([]);
                setError(null);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const location = coords ? { latitude: coords.latitude, longitude: coords.longitude } : undefined;
                // Shopper endpoint: any signed-in user, no business subscription needed.
                const res: any =
                    mode === 'NEARBY'
                        ? await retailersApi.clientOrdersAction({ action: 'GetAdjacentRetailersByLocation', location, categories: categoryIds, radius_km: 30 })
                        : await retailersApi.clientOrdersAction({ action: 'GetRetailersByCountyAndCategories', county, categories: categoryIds, ...(location ? { location } : {}) });
                if (id !== reqId.current) return;
                if (!res?.ok) {
                    setError(apiError(res, 'Could not load shops.'));
                    return;
                }
                const rows = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
                setShops(rows.map(normalize));
            } catch (e: any) {
                if (id === reqId.current) setError(e?.message || 'Could not reach the server.');
            } finally {
                if (id === reqId.current) setLoading(false);
            }
        };
        void run();
    }, [mode, coords, county, categoryIds, refreshTick]);

    const visible = useMemo(() => {
        const list = mode === 'COUNTY' && subCounty ? shops.filter((s) => s.subCountyId === subCounty || s.subCountyTitle === subCounty) : shops;
        return [...list].sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.name.localeCompare(b.name));
    }, [shops, mode, subCounty]);

    return {
        // location
        locationState,
        locationMessage,
        coords,
        requestLocation,
        // what's listed
        mode,
        setMode,
        county,
        setCounty: (c: string) => {
            setSubCounty('');
            setCounty(c);
        },
        subCounty,
        setSubCounty,
        categoryIds,
        setCategoryIds,
        shops: visible,
        loading,
        error,
        refresh: () => setRefreshTick((t) => t + 1),
    };
}
