// hooks/useCachedList.ts
//
// Offline-first lists for screens that have no sync context of their own
// (discounts, campaigns, returns, payments…).
//
//   - opens instantly from the copy saved on this device (per business);
//   - refreshes from the server when online, and again as soon as the
//     connection comes back (and every `pollMs` while open, if given);
//   - a failed refresh keeps the saved copy on screen and says why;
//   - `patch` updates the list (and the saved copy) after a write, so the
//     screen is right before the next refresh.
//
// The list header shows where the data came from: "Live" (just fetched),
// "Saved on this device" (offline / not refreshed yet) and when it last synced.

import { apiError } from '@/api/deliveriesApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResponse } from 'apisauce';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ListSource = 'server' | 'cache' | 'none';

interface Saved<T> {
    items: T[];
    synced_at: string;
}

export interface CachedList<T> {
    items: T[];
    /** First load with nothing saved yet. */
    loading: boolean;
    /** A refresh is running (pull-to-refresh / Refresh button). */
    refreshing: boolean;
    error: string | null;
    source: ListSource;
    /** "Live" / "Saved on this device" / "Offline — nothing saved yet". */
    sourceLabel: string;
    /** e.g. "14:05" — when the saved copy came from the server. */
    lastSynced: string | undefined;
    isOnline: boolean;
    refresh: () => Promise<void>;
    /** Change the list (and its saved copy) after a write. */
    patch: (update: (items: T[]) => T[]) => void;
}

const time = (iso?: string) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return undefined;
    const today = new Date().toDateString() === d.toDateString();
    return today
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const isOk = (res: any) => !!res?.ok && (res?.data?.response_code == null || String(res.data.response_code) === '0');

export function useCachedList<T>({
    key,
    fetch,
    pick,
    pollMs,
    enabled = true,
}: {
    /** Short unique name, e.g. "wholesaler_price_discounts". */
    key: string;
    fetch: () => Promise<ApiResponse<any>>;
    /** The rows in a successful response. */
    pick: (data: any) => T[] | null | undefined;
    pollMs?: number;
    enabled?: boolean;
}): CachedList<T> {
    const { user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const scope = String(user?.entity_id || user?.entity || 'none');
    const storeKey = `wazipos_list:${key}:${scope}`;

    const [items, setItems] = useState<T[]>([]);
    const [hasCopy, setHasCopy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<ListSource>('none');
    const [syncedAt, setSyncedAt] = useState<string | undefined>();

    // Latest fetch / pick without re-running effects on every render.
    const fetchRef = useRef(fetch);
    const pickRef = useRef(pick);
    fetchRef.current = fetch;
    pickRef.current = pick;
    const mounted = useRef(true);
    const inFlight = useRef<Promise<void> | null>(null);

    const save = useCallback(
        (rows: T[], at: string) => {
            AsyncStorage.setItem(storeKey, JSON.stringify({ items: rows, synced_at: at } satisfies Saved<T>)).catch(() => undefined);
        },
        [storeKey],
    );

    const refresh = useCallback(async () => {
        if (!enabled) return;
        if (inFlight.current) return inFlight.current;
        const run = (async () => {
            setRefreshing(true);
            try {
                const res: any = await fetchRef.current().catch(() => null);
                if (!mounted.current) return;
                if (isOk(res)) {
                    const rows = pickRef.current(res.data) ?? [];
                    const at = new Date().toISOString();
                    setItems(rows);
                    setHasCopy(true);
                    setSource('server');
                    setSyncedAt(at);
                    setError(null);
                    save(rows, at);
                } else {
                    const offline = !res || ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'CONNECTION_ERROR'].includes(res?.problem);
                    setSource((s) => (s === 'server' ? 'server' : hasCopyRef.current ? 'cache' : 'none'));
                    setError(offline ? (hasCopyRef.current ? null : "You're offline and nothing is saved on this device yet.") : apiError(res, 'Could not refresh.'));
                }
            } finally {
                if (mounted.current) {
                    setRefreshing(false);
                    setLoading(false);
                }
                inFlight.current = null;
            }
        })();
        inFlight.current = run;
        return run;
    }, [enabled, save]);

    const hasCopyRef = useRef(false);
    hasCopyRef.current = hasCopy;

    // Open from the saved copy, then refresh when online.
    useEffect(() => {
        mounted.current = true;
        let live = true;
        setLoading(true);
        setItems([]);
        setHasCopy(false);
        setSource('none');
        setSyncedAt(undefined);
        AsyncStorage.getItem(storeKey)
            .then((raw) => {
                if (!live || !raw) return;
                const saved = JSON.parse(raw) as Saved<T>;
                if (Array.isArray(saved?.items)) {
                    setItems(saved.items);
                    setHasCopy(true);
                    hasCopyRef.current = true;
                    setSource('cache');
                    setSyncedAt(saved.synced_at);
                    setLoading(false);
                }
            })
            .catch(() => undefined)
            .finally(() => {
                if (!live) return;
                if (isOnline && enabled) void refresh();
                else setLoading(false);
            });
        return () => {
            live = false;
            mounted.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeKey, enabled]);

    // Back online: refresh straight away.
    const wasOnline = useRef(isOnline);
    useEffect(() => {
        if (isOnline && !wasOnline.current) void refresh();
        if (!isOnline) setSource((s) => (s === 'server' ? 'cache' : s));
        wasOnline.current = isOnline;
    }, [isOnline, refresh]);

    // Keep fresh while the screen is open.
    useEffect(() => {
        if (!pollMs || !isOnline) return;
        const t = setInterval(() => void refresh(), pollMs);
        return () => clearInterval(t);
    }, [pollMs, isOnline, refresh]);

    const patch = useCallback(
        (update: (rows: T[]) => T[]) => {
            setItems((prev) => {
                const next = update(prev);
                save(next, syncedAt ?? new Date().toISOString());
                return next;
            });
        },
        [save, syncedAt],
    );

    const sourceLabel = useMemo(() => {
        if (!isOnline) return hasCopy ? 'Offline · saved copy' : 'Offline';
        if (source === 'server') return 'Live';
        if (source === 'cache') return refreshing ? 'Syncing…' : 'Saved on this device';
        return refreshing ? 'Syncing…' : 'Not synced';
    }, [isOnline, hasCopy, source, refreshing]);

    return {
        items,
        loading: loading && !hasCopy,
        refreshing,
        error,
        source: isOnline ? source : hasCopy ? 'cache' : 'none',
        sourceLabel,
        lastSynced: time(syncedAt),
        isOnline,
        refresh,
        patch,
    };
}

/** Pagination for AdminListView over an already filtered list. */
export function usePaged<T>(rows: T[], resetKey: unknown, initial: 10 | 25 | 50 | 100 = 25) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<10 | 25 | 50 | 100>(initial);
    useEffect(() => setPage(1), [resetKey, pageSize]);
    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    return {
        items: rows.slice(pageStart, pageEnd),
        allItems: rows,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (s: 10 | 25 | 50 | 100) => {
            setPageSize(s);
            setPage(1);
        },
    };
}
