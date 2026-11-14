// components/retailers/wholesaleDiscovery/useWholesalerDiscovery.ts
//
// State + data for the wholesaler discovery screen.
//
//   Near me   -> needs the device location; pulls adjacent wholesalers within
//                the chosen radius, nearest first.
//   All Kenya -> pulls every wholesaler the retailer may buy from, optionally
//                filtered by county / sub-county (pulled from the server).
//   Search    -> by wholesaler (name, town, code) or by product (only
//                wholesalers stocking a match, with the matching items).
//
// Requests are debounced, stale responses are dropped, and results page in
// as the list scrolls.

import {
    discoverWholesalers,
    getCounties,
    getSubCounties,
    type CountyOption,
    type DiscoveredWholesaler,
    type DiscoveryMode,
    type PlaceOption,
} from '@/api/wholesaleDiscoveryApi';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type SearchBy = 'wholesaler' | 'product';
export type LocationState = 'idle' | 'locating' | 'ready' | 'denied' | 'off' | 'error';

export const RADIUS_OPTIONS = [5, 10, 30, 100] as const;
const PAGE_SIZE = 20;
const DEBOUNCE_MS = 350;

export interface Coords {
    latitude: number;
    longitude: number;
}

/** Ask for permission, make sure location is on, and read the position. */
async function readDeviceLocation(): Promise<{ coords: Coords | null; state: LocationState }> {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return { coords: null, state: 'denied' };
        let on = await Location.hasServicesEnabledAsync();
        if (!on && Platform.OS === 'android') {
            try {
                await Location.enableNetworkProviderAsync(); // system "turn on location" prompt
                on = await Location.hasServicesEnabledAsync();
            } catch {
                on = false;
            }
        }
        if (!on) return { coords: null, state: 'off' };
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, state: 'ready' };
    } catch {
        return { coords: null, state: 'error' };
    }
}

export function useWholesalerDiscovery() {
    const [mode, setMode] = useState<DiscoveryMode>('adjacent');
    const [radiusKm, setRadiusKm] = useState<number>(30);
    const [searchBy, setSearchBy] = useState<SearchBy>('wholesaler');
    const [query, setQuery] = useState('');
    const [county, setCounty] = useState<CountyOption | null>(null);
    const [subCounty, setSubCounty] = useState<PlaceOption | null>(null);

    const [coords, setCoords] = useState<Coords | null>(null);
    const [locationState, setLocationState] = useState<LocationState>('idle');

    const [counties, setCounties] = useState<CountyOption[]>([]);
    const [subCounties, setSubCounties] = useState<PlaceOption[]>([]);
    const [placesLoading, setPlacesLoading] = useState(false);

    const [results, setResults] = useState<DiscoveredWholesaler[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Near me hints from the server: wholesalers without a map location, nearest one out of range. */
    const [unlocatedCount, setUnlocatedCount] = useState(0);
    const [nearestKm, setNearestKm] = useState<number | null>(null);

    const requestId = useRef(0);

    /* ---------------- device location ---------------- */
    const locate = useCallback(async () => {
        setLocationState('locating');
        const { coords: next, state } = await readDeviceLocation();
        setCoords(next);
        setLocationState(state);
        return next;
    }, []);

    // Try once on open: Near me is the default when the device can locate.
    useEffect(() => {
        void locate();
    }, [locate]);

    /* ---------------- counties / sub-counties ---------------- */
    useEffect(() => {
        if (mode !== 'kenya' || counties.length) return;
        let cancelled = false;
        setPlacesLoading(true);
        getCounties()
            .then((rows) => !cancelled && setCounties(rows))
            .catch(() => !cancelled && setCounties([]))
            .finally(() => !cancelled && setPlacesLoading(false));
        return () => {
            cancelled = true;
        };
    }, [mode, counties.length]);

    useEffect(() => {
        setSubCounty(null);
        if (!county) return setSubCounties([]);
        if (county.subCounties.length) return setSubCounties(county.subCounties);
        let cancelled = false;
        getSubCounties(county.id)
            .then((rows) => !cancelled && setSubCounties(rows))
            .catch(() => !cancelled && setSubCounties([]));
        return () => {
            cancelled = true;
        };
    }, [county]);

    /* ---------------- wholesalers ---------------- */
    const needsLocation = mode === 'adjacent' && !coords;
    const term = query.trim();
    const key = [mode, radiusKm, searchBy, term, county?.id ?? '', subCounty?.id ?? '', coords?.latitude ?? '', coords?.longitude ?? ''].join('|');

    const fetchPage = useCallback(
        async (pageNo: number) => {
            const id = ++requestId.current;
            const res = await discoverWholesalers({
                mode,
                ...(coords ?? {}),
                radius_km: mode === 'adjacent' ? radiusKm : undefined,
                county: mode === 'kenya' ? county?.id : undefined,
                sub_county: mode === 'kenya' ? subCounty?.id : undefined,
                search: searchBy === 'wholesaler' && term ? term : undefined,
                product: searchBy === 'product' && term ? term : undefined,
                page: pageNo,
                page_size: PAGE_SIZE,
            });
            if (id !== requestId.current) return null; // a newer request superseded this one
            const body = res.data;
            if (!res.ok || !body || body.response_code !== 0) {
                throw new Error(body?.errors?.[0] || body?.response_message || "Couldn't load wholesalers. Check your connection.");
            }
            return body;
        },
        // `key` captures every input that changes the request
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [key]
    );

    const loadFirstPage = useCallback(
        async (asRefresh = false) => {
            if (needsLocation) {
                requestId.current++;
                setResults([]);
                setCount(0);
                setHasMore(false);
                setLoading(false);
                return;
            }
            asRefresh ? setRefreshing(true) : setLoading(true);
            setError(null);
            try {
                const body = await fetchPage(1);
                if (!body) return;
                setResults(body.results);
                setCount(body.count);
                setHasMore(body.has_more);
                setPage(1);
                setUnlocatedCount(body.unlocated_count ?? 0);
                setNearestKm(body.nearest_km ?? null);
            } catch (e: any) {
                setError(e?.message || "Couldn't load wholesalers.");
                setUnlocatedCount(0);
                setNearestKm(null);
                setResults([]);
                setCount(0);
                setHasMore(false);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [fetchPage, needsLocation]
    );

    // Debounced reload whenever the search inputs change.
    useEffect(() => {
        const t = setTimeout(() => void loadFirstPage(), term ? DEBOUNCE_MS : 0);
        return () => clearTimeout(t);
    }, [loadFirstPage, term]);

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore || loading) return;
        setLoadingMore(true);
        try {
            const body = await fetchPage(page + 1);
            if (!body) return;
            setResults((prev) => {
                const seen = new Set(prev.map((r) => r.id));
                return [...prev, ...body.results.filter((r) => !seen.has(r.id))];
            });
            setHasMore(body.has_more);
            setPage(page + 1);
        } catch {
            // keep what we have; the user can pull to refresh
        } finally {
            setLoadingMore(false);
        }
    }, [fetchPage, hasMore, loading, loadingMore, page]);

    const refresh = useCallback(async () => {
        if (mode === 'adjacent') {
            const next = await locate();
            if (!next) return;
        }
        await loadFirstPage(true);
    }, [locate, loadFirstPage, mode]);

    const clearFilters = useCallback(() => {
        setCounty(null);
        setSubCounty(null);
        setQuery('');
    }, []);

    return {
        // inputs
        mode,
        setMode,
        radiusKm,
        setRadiusKm,
        searchBy,
        setSearchBy,
        query,
        setQuery,
        county,
        setCounty,
        subCounty,
        setSubCounty,
        clearFilters,
        // location
        coords,
        locationState,
        locate,
        // places
        counties,
        subCounties,
        placesLoading,
        // results
        results,
        count,
        hasMore,
        loading,
        loadingMore,
        refreshing,
        error,
        unlocatedCount,
        nearestKm,
        loadMore,
        refresh,
        retry: () => loadFirstPage(),
    };
}
