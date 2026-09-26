// context/ForecastContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import analyticsApi from '@/api/analyticsApi';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db } from '@/databases/db';
import {
    RequestDraftItem,
    RetailerForecastCampaign,
    RetailerForecastDailyRow,
    RetailerForecastNormalized,
    RetailerForecastOffer,
} from '@/databases/types';

/* =========================================================
 * Constants
 * ======================================================= */

const FORECAST_SYNCED_AT_KEY =
    'wazipos_async_retailer_forecasts_synced_at';
const FORECAST_SCHEMA_KEY = 'wazipos_forecast_cache_schema';
const FORECAST_SCHEMA_VERSION = 1;
const DRAFTS_STORAGE_KEY = 'wazipos_retailer_request_drafts';

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/* =========================================================
 * Public types
 * ======================================================= */

export interface ForecastFilters {
    leadTimeDays: number;
    orderDays: number;
    minAvgDailyDemand?: number;
    onlyWithOffers?: boolean;
}

export type ForecastDataSource = 'server' | 'cache' | 'none';

export type { RequestDraftItem };

interface ForecastContextValue {
    /* Forecasts */
    forecasts: RetailerForecastNormalized[];
    filters: ForecastFilters;
    setFilters: (patch: Partial<ForecastFilters>) => void;
    isLoading: boolean;
    errorMessage: string | null;
    isOnline: boolean;
    isStale: boolean;
    lastSyncedAt: string | null;
    runDate: string | null;
    dataSource: ForecastDataSource;
    refresh: () => Promise<void>;
    getByProductId: (
        productId: string
    ) => RetailerForecastNormalized | undefined;

    /* Draft basket — owned by this context */
    drafts: RequestDraftItem[];
    draftCount: number;
    draftTotalQuantity: number;
    draftUniqueWholesalerIds: string[];
    isDraftsHydrated: boolean;
    addDraftItem: (item: Omit<RequestDraftItem, 'added_at'>) => void;
    removeDraftItem: (product_id: string) => void;
    updateDraftItem: (
        product_id: string,
        patch: Partial<RequestDraftItem>
    ) => void;
    hasDraftItem: (product_id: string) => boolean;
    clearDraft: () => void;

    /* Combined */
    draftForecasts: RetailerForecastNormalized[];
    orphanedDraftItems: RequestDraftItem[];
}

const ForecastContext = createContext<
    ForecastContextValue | undefined
>(undefined);

const DEFAULT_FILTERS: ForecastFilters = {
    leadTimeDays: 7,
    orderDays: 14,
    minAvgDailyDemand: 0,
    onlyWithOffers: false,
};

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__) console.log('[ForecastContext]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[ForecastContext]', ...args);
};

/* =========================================================
 * Normalization
 * ======================================================= */

function normalizeForecast(
    raw: any,
    runDate: string
): RetailerForecastNormalized {
    const offers: RetailerForecastOffer[] =
        raw.suggested_offers ?? [];
    const campaigns: RetailerForecastCampaign[] =
        raw.suggested_campaigns ?? [];
    const totalForecast = Number(raw.total_forecast ?? 0);

    return {
        remote_id: String(raw.product_id ?? ''),
        entity: '',
        entity_title: '',
        product_title: String(raw.product_title ?? '—'),
        total_forecast: totalForecast,
        total_p10: Number(raw.total_p10 ?? 0),
        total_p90: Number(raw.total_p90 ?? 0),
        avg_daily_forecast: Number(raw.avg_daily_forecast ?? 0),
        days_covered: Number(raw.days_covered ?? 0),
        daily: (raw.daily ?? []) as RetailerForecastDailyRow[],
        wholesaler_offers: offers,
        wholesaler_campaigns: campaigns,
        required_quantity: Math.max(1, Math.ceil(totalForecast)),
        has_offers: offers.length > 0,
        has_campaigns: campaigns.length > 0,
        best_offer_score:
            offers.length > 0
                ? Math.max(...offers.map((o) => o.score ?? 0))
                : 0,
        created: runDate
            ? `${runDate} 00:00:00`
            : new Date()
                .toISOString()
                .replace('T', ' ')
                .slice(0, 19),
        demand_pattern: raw.demand_pattern ?? null,
        demand_cv: raw.demand_cv ?? null,
        zero_demand_pct: raw.zero_demand_pct ?? null,
        history_days: raw.history_days ?? null,
        trend_direction: raw.trend_direction ?? null,
        trend_pct: raw.trend_pct ?? null,
    };
}

/**
 * Deep-enough comparison to detect meaningful updates. We compare
 * scalar fields plus the offer id/price/quantity/score so that a
 * server-side price or quantity change is not swallowed by a stale
 * reference held by React state.
 */
function areForecastsEqual(
    a: RetailerForecastNormalized[],
    b: RetailerForecastNormalized[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.remote_id !== y.remote_id ||
            x.product_title !== y.product_title ||
            x.total_forecast !== y.total_forecast ||
            x.total_p10 !== y.total_p10 ||
            x.total_p90 !== y.total_p90 ||
            x.avg_daily_forecast !== y.avg_daily_forecast ||
            x.days_covered !== y.days_covered ||
            x.required_quantity !== y.required_quantity ||
            x.has_offers !== y.has_offers ||
            x.has_campaigns !== y.has_campaigns ||
            x.best_offer_score !== y.best_offer_score ||
            x.demand_pattern !== y.demand_pattern ||
            x.demand_cv !== y.demand_cv ||
            x.zero_demand_pct !== y.zero_demand_pct ||
            x.trend_direction !== y.trend_direction ||
            x.trend_pct !== y.trend_pct ||
            x.wholesaler_offers.length !==
            y.wholesaler_offers.length ||
            x.wholesaler_campaigns.length !==
            y.wholesaler_campaigns.length ||
            x.daily.length !== y.daily.length
        ) {
            return false;
        }

        // Offer-level compare (arrays are small).
        for (let j = 0; j < x.wholesaler_offers.length; j++) {
            const o1: any = x.wholesaler_offers[j];
            const o2: any = y.wholesaler_offers[j];
            if (
                o1?.id !== o2?.id ||
                o1?.price !== o2?.price ||
                o1?.unit_price !== o2?.unit_price ||
                o1?.quantity !== o2?.quantity ||
                o1?.available_quantity !==
                o2?.available_quantity ||
                o1?.score !== o2?.score
            ) {
                return false;
            }
        }
    }
    return true;
}

/* =========================================================
 * Forecast storage
 * ======================================================= */

async function readForecastsFromStorage(): Promise<
    RetailerForecastNormalized[]
> {
    try {
        const viaDb = await db.getRetailerForecasts();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readForecastsFromStorage', err);
        return [];
    }
}

async function writeForecastsToStorage(
    data: RetailerForecastNormalized[]
): Promise<void> {
    const tasks: Promise<any>[] = [];

    tasks.push(
        db.saveRetailerForecasts(data).catch((err) =>
            warn('Forecast DB write failed:', err)
        )
    );

    // AsyncStorage works on web too (it's a localStorage shim), so we
    // no longer need a separate web branch. This also fixes isStale on
    // web, which previously always reported stale after a reload.
    tasks.push(
        AsyncStorage.setItem(
            FORECAST_SYNCED_AT_KEY,
            new Date().toISOString()
        ).catch(() => null)
    );

    await Promise.allSettled(tasks);
}

async function ensureForecastSchema(): Promise<void> {
    try {
        const stored = await AsyncStorage.getItem(
            FORECAST_SCHEMA_KEY
        );
        if (
            stored &&
            Number(stored) === FORECAST_SCHEMA_VERSION
        ) {
            return;
        }
        await AsyncStorage.removeItem(FORECAST_SYNCED_AT_KEY);
        await AsyncStorage.setItem(
            FORECAST_SCHEMA_KEY,
            String(FORECAST_SCHEMA_VERSION)
        );
    } catch (e) {
        warn('ensureForecastSchema', e);
    }
}

/* =========================================================
 * Draft storage helpers
 * ======================================================= */

function readDraftQuantity(d: RequestDraftItem): number {
    const anyD: any = d;
    const q = anyD.quantity ?? anyD.offered_quantity ?? anyD.qty;
    return typeof q === 'number' && isFinite(q) ? q : 0;
}

function readDraftWholesalerId(
    d: RequestDraftItem
): string | null {
    const anyD: any = d;
    const w =
        anyD.wholesaler_id ??
        anyD.wholesalerId ??
        anyD.wholesaler;
    return w ? String(w) : null;
}

async function readDraftsFromStorage(): Promise<
    RequestDraftItem[]
> {
    try {
        const raw = await AsyncStorage.getItem(
            DRAFTS_STORAGE_KEY
        );
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        warn('readDraftsFromStorage', e);
        return [];
    }
}

async function writeDraftsToStorage(
    drafts: RequestDraftItem[]
): Promise<void> {
    try {
        await AsyncStorage.setItem(
            DRAFTS_STORAGE_KEY,
            JSON.stringify(drafts)
        );
    } catch (e) {
        warn('writeDraftsToStorage', e);
    }
}

/* =========================================================
 * Provider
 * ======================================================= */

export function ForecastProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isOnline } = useNetworkStatus();

    /* ---------------- Forecast state ---------------- */

    const [forecasts, setForecasts] = useState<
        RetailerForecastNormalized[]
    >([]);
    const [filters, setFiltersState] =
        useState<ForecastFilters>(DEFAULT_FILTERS);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(
        null
    );
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
        null
    );
    const [runDate, setRunDate] = useState<string | null>(null);
    const [dataSource, setDataSource] =
        useState<ForecastDataSource>('none');

    /* ---------------- Draft state ---------------- */

    const [drafts, setDraftsState] = useState<RequestDraftItem[]>(
        []
    );
    const [isDraftsHydrated, setIsDraftsHydrated] = useState(false);

    /* ---------------- Refs ---------------- */

    const forecastsRef = useRef<RetailerForecastNormalized[]>([]);
    const filtersRef = useRef<ForecastFilters>(DEFAULT_FILTERS);
    const lastSyncedAtRef = useRef<string | null>(null);
    const draftsRef = useRef<RequestDraftItem[]>([]);

    const isFetchingRef = useRef(false);
    const hasBootstrappedRef = useRef(false);
    const inflightFiltersKeyRef = useRef<string | null>(null);
    const pendingRefetchRef = useRef<{
        needed: boolean;
        silent: boolean;
    }>({ needed: false, silent: true });
    const prevOnlineRef = useRef<boolean>(isOnline);

    useEffect(() => {
        forecastsRef.current = forecasts;
    }, [forecasts]);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);
    useEffect(() => {
        lastSyncedAtRef.current = lastSyncedAt;
    }, [lastSyncedAt]);
    useEffect(() => {
        draftsRef.current = drafts;
    }, [drafts]);

    /* ---------------- Filters key ----------------
     * onlyWithOffers is filtered client-side, so it is intentionally
     * NOT part of the request key — toggling it should not refetch.
     */

    const filtersKey = useCallback((f: ForecastFilters) => {
        return [
            f.leadTimeDays,
            f.orderDays,
            f.minAvgDailyDemand ?? 0,
        ].join('|');
    }, []);

    /* ---------------- Forecast fetch ---------------- */

    const fetchForecasts = useCallback(
        async (opts?: { silent?: boolean }) => {
            const silent = opts?.silent ?? false;

            if (isFetchingRef.current) {
                // Queue a follow-up. Non-silent callers win: if a
                // silent poll is inflight and the user triggers a
                // manual refresh, we must end with the spinner off.
                pendingRefetchRef.current.needed = true;
                if (!silent) {
                    pendingRefetchRef.current.silent = false;
                    setIsLoading(true);
                }
                return;
            }

            isFetchingRef.current = true;
            if (!silent) setIsLoading(true);
            setErrorMessage(null);

            const f = filtersRef.current;
            const requestKey = filtersKey(f);
            inflightFiltersKeyRef.current = requestKey;

            try {
                const res: any =
                    await analyticsApi.getBulkForecastAction({
                        tier: 'RETAILER',
                        lead_time_days: f.leadTimeDays,
                        order_days: f.orderDays,
                        include_daily: true,
                        include_offers: true,
                        include_campaigns: true,
                        min_avg_daily_demand:
                            f.minAvgDailyDemand ?? 0,
                    });

                if (!res?.ok) {
                    throw new Error(
                        res?.problem || 'Request failed'
                    );
                }

                const body = res.data?.bulk_forecast ?? {};
                const items: RetailerForecastNormalized[] = (
                    body.products ?? []
                ).map((p: any) =>
                    normalizeForecast(p, body.run_date ?? '')
                );

                const syncedAt = new Date().toISOString();

                forecastsRef.current = items;
                setForecasts((prev) =>
                    areForecastsEqual(prev, items) ? prev : items
                );
                setRunDate(body.run_date ?? null);
                setLastSyncedAt(syncedAt);
                lastSyncedAtRef.current = syncedAt;
                setDataSource('server');

                await writeForecastsToStorage(items);

                log(
                    `Fetched ${items.length} forecasts (${silent ? 'silent' : 'active'
                    })`
                );
            } catch (e: any) {
                warn('fetchForecasts failed', e);
                setErrorMessage(
                    e?.message ?? 'Could not load forecasts.'
                );
            } finally {
                isFetchingRef.current = false;
                inflightFiltersKeyRef.current = null;

                const pending = pendingRefetchRef.current;
                pendingRefetchRef.current = {
                    needed: false,
                    silent: true,
                };

                const currentKey = filtersKey(filtersRef.current);
                const filtersChanged =
                    currentKey !== requestKey;

                if (
                    (pending.needed || filtersChanged) &&
                    hasBootstrappedRef.current
                ) {
                    // A queued non-silent caller or a filter change
                    // forces the follow-up to be non-silent.
                    const nextSilent =
                        pending.silent && !filtersChanged;
                    void fetchForecasts({ silent: nextSilent });
                    return;
                }

                if (!silent) setIsLoading(false);
            }
        },
        [filtersKey]
    );

    /* ---------------- Bootstrap ---------------- */

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            await ensureForecastSchema();
            if (cancelled) return;

            const cachedForecasts =
                await readForecastsFromStorage();
            if (cancelled) return;
            if (cachedForecasts.length > 0) {
                forecastsRef.current = cachedForecasts;
                setForecasts(cachedForecasts);
                setDataSource('cache');
            }

            const syncedAt = await AsyncStorage.getItem(
                FORECAST_SYNCED_AT_KEY
            );
            if (syncedAt && !cancelled) {
                setLastSyncedAt(syncedAt);
                lastSyncedAtRef.current = syncedAt;
            }

            const cachedDrafts = await readDraftsFromStorage();
            if (cancelled) return;
            if (cachedDrafts.length > 0) {
                draftsRef.current = cachedDrafts;
                setDraftsState(cachedDrafts);
            }
            setIsDraftsHydrated(true);

            if (cancelled) return;

            hasBootstrappedRef.current = true;

            void fetchForecasts({
                silent: forecastsRef.current.length > 0,
            });
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------------- Filter setter ---------------- */

    const setFilters = useCallback(
        (patch: Partial<ForecastFilters>) => {
            setFiltersState((prev) => {
                const next = { ...prev, ...patch };
                filtersRef.current = next;
                return next;
            });
        },
        []
    );

    /* ---------------- Poller ---------------- */

    useEffect(() => {
        if (!isOnline) return;

        const id = setInterval(() => {
            void fetchForecasts({ silent: true });
        }, POLL_INTERVAL_MS);

        return () => clearInterval(id);
    }, [isOnline, fetchForecasts]);

    /* ---------------- Filter-driven refetch ---------------- */

    useEffect(() => {
        if (!hasBootstrappedRef.current) return;
        void fetchForecasts({
            silent: forecastsRef.current.length > 0,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        filters.leadTimeDays,
        filters.orderDays,
        filters.minAvgDailyDemand,
    ]);

    /* ---------------- Network recovery ----------------
     * Only fire on a real offline→online transition. Firing on mount
     * (when isOnline is already true) would duplicate the bootstrap
     * fetch and the WS reconnect.
     */

    useEffect(() => {
        const wasOnline = prevOnlineRef.current;
        prevOnlineRef.current = isOnline;

        if (
            isOnline &&
            !wasOnline &&
            hasBootstrappedRef.current
        ) {
            void fetchForecasts({
                silent: forecastsRef.current.length > 0,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    /* ---------------- Draft actions ---------------- */

    const addDraftItem = useCallback(
        (item: Omit<RequestDraftItem, 'added_at'>) => {
            setDraftsState((prev) => {
                const added_at = new Date().toISOString();
                const next: RequestDraftItem[] = [
                    ...prev.filter(
                        (d) => d.product_id !== item.product_id
                    ),
                    { ...item, added_at } as RequestDraftItem,
                ];
                draftsRef.current = next;
                void writeDraftsToStorage(next);
                return next;
            });
        },
        []
    );

    const removeDraftItem = useCallback((product_id: string) => {
        setDraftsState((prev) => {
            const next = prev.filter(
                (d) => d.product_id !== product_id
            );
            draftsRef.current = next;
            void writeDraftsToStorage(next);
            return next;
        });
    }, []);

    const updateDraftItem = useCallback(
        (
            product_id: string,
            patch: Partial<RequestDraftItem>
        ) => {
            setDraftsState((prev) => {
                let changed = false;
                const next = prev.map((d) => {
                    if (d.product_id !== product_id) return d;
                    changed = true;
                    return {
                        ...d,
                        ...patch,
                    } as RequestDraftItem;
                });
                if (!changed) return prev;
                draftsRef.current = next;
                void writeDraftsToStorage(next);
                return next;
            });
        },
        []
    );

    const hasDraftItem = useCallback(
        (product_id: string) =>
            draftsRef.current.some(
                (d) => d.product_id === product_id
            ),
        []
    );

    const clearDraft = useCallback(() => {
        draftsRef.current = [];
        setDraftsState([]);
        void AsyncStorage.removeItem(
            DRAFTS_STORAGE_KEY
        ).catch(() => null);
    }, []);

    /* ---------------- Derived ---------------- */

    const forecastByProductId = useMemo(() => {
        const map: Record<string, RetailerForecastNormalized> =
            {};
        for (const f of forecasts) map[f.remote_id] = f;
        return map;
    }, [forecasts]);

    // Client-side onlyWithOffers filter. Does not trigger a refetch,
    // so toggling it is instant.
    const visibleForecasts = useMemo(() => {
        if (!filters.onlyWithOffers) return forecasts;
        return forecasts.filter((f) => f.has_offers);
    }, [forecasts, filters.onlyWithOffers]);

    const draftForecasts = useMemo(() => {
        const result: RetailerForecastNormalized[] = [];
        for (const item of drafts) {
            const fc = forecastByProductId[item.product_id];
            if (fc) result.push(fc);
        }
        return result;
    }, [drafts, forecastByProductId]);

    const orphanedDraftItems = useMemo(
        () =>
            drafts.filter(
                (item) =>
                    !forecastByProductId[item.product_id]
            ),
        [drafts, forecastByProductId]
    );

    const draftCount = drafts.length;

    const draftTotalQuantity = useMemo(
        () =>
            drafts.reduce(
                (sum, d) => sum + readDraftQuantity(d),
                0
            ),
        [drafts]
    );

    const draftUniqueWholesalerIds = useMemo(() => {
        const set = new Set<string>();
        for (const d of drafts) {
            const wid = readDraftWholesalerId(d);
            if (wid) set.add(wid);
        }
        return Array.from(set);
    }, [drafts]);

    /* ---------------- Staleness ---------------- */

    const isStale = useMemo(() => {
        const synced = lastSyncedAt;
        if (!synced) return forecasts.length > 0;
        const age = Date.now() - new Date(synced).getTime();
        return age > STALE_AFTER_MS;
    }, [lastSyncedAt, forecasts.length]);

    /* ---------------- Lookup ---------------- */

    const getByProductId = useCallback(
        (productId: string) => forecastByProductId[productId],
        [forecastByProductId]
    );

    /* ---------------- Stable refresh ---------------- */

    const refresh = useCallback(async () => {
        await fetchForecasts({ silent: false });
    }, [fetchForecasts]);

    /* ---------------- Context value ---------------- */

    const value = useMemo<ForecastContextValue>(
        () => ({
            forecasts: visibleForecasts,
            filters,
            setFilters,
            isLoading,
            errorMessage,
            isOnline,
            isStale,
            lastSyncedAt,
            runDate,
            dataSource,
            refresh,
            getByProductId,

            drafts,
            draftCount,
            draftTotalQuantity,
            draftUniqueWholesalerIds,
            isDraftsHydrated,
            addDraftItem,
            removeDraftItem,
            updateDraftItem,
            hasDraftItem,
            clearDraft,

            draftForecasts,
            orphanedDraftItems,
        }),
        [
            visibleForecasts,
            filters,
            setFilters,
            isLoading,
            errorMessage,
            isOnline,
            isStale,
            lastSyncedAt,
            runDate,
            dataSource,
            refresh,
            getByProductId,
            drafts,
            draftCount,
            draftTotalQuantity,
            draftUniqueWholesalerIds,
            isDraftsHydrated,
            addDraftItem,
            removeDraftItem,
            updateDraftItem,
            hasDraftItem,
            clearDraft,
            draftForecasts,
            orphanedDraftItems,
        ]
    );

    return (
        <ForecastContext.Provider value={value}>
            {children}
        </ForecastContext.Provider>
    );
}

/* =========================================================
 * Hook
 * ======================================================= */

export function useForecast() {
    const ctx = useContext(ForecastContext);
    if (!ctx) {
        throw new Error(
            'useForecast must be used inside <ForecastProvider />'
        );
    }
    return ctx;
}