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
import { Platform } from 'react-native';

import analyticsApi from '@/api/analyticsApi';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useRetailerProductRequestsSync } from '@/context/RetailerProductRequestsSyncContext';
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

const NATIVE_FORECAST_SYNCED_AT =
    'wazipos_async_retailer_forecasts_synced_at';
const FORECAST_SCHEMA_KEY = 'wazipos_forecast_cache_schema';
const FORECAST_SCHEMA_VERSION = 1;

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const isWeb = Platform.OS === 'web';

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

    /* Draft basket — delegated to RetailerProductRequestsSyncContext */
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
            x.total_forecast !== y.total_forecast ||
            x.has_offers !== y.has_offers ||
            x.has_campaigns !== y.has_campaigns ||
            x.wholesaler_offers.length !==
            y.wholesaler_offers.length ||
            x.wholesaler_campaigns.length !==
            y.wholesaler_campaigns.length
        ) {
            return false;
        }
    }
    return true;
}

/* =========================================================
 * Storage
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
            warn('Forecast write failed:', err)
        )
    );

    if (!isWeb) {
        tasks.push(
            AsyncStorage.setItem(
                NATIVE_FORECAST_SYNCED_AT,
                new Date().toISOString()
            ).catch(() => null)
        );
    }

    await Promise.allSettled(tasks);
}

async function ensureForecastSchema(): Promise<void> {
    try {
        if (isWeb) {
            const stored =
                typeof window !== 'undefined'
                    ? window.localStorage.getItem(
                        FORECAST_SCHEMA_KEY
                    )
                    : null;
            if (
                stored &&
                Number(stored) === FORECAST_SCHEMA_VERSION
            )
                return;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(
                    FORECAST_SCHEMA_KEY,
                    String(FORECAST_SCHEMA_VERSION)
                );
            }
        } else {
            const stored = await AsyncStorage.getItem(
                FORECAST_SCHEMA_KEY
            );
            if (
                stored &&
                Number(stored) === FORECAST_SCHEMA_VERSION
            )
                return;
            await AsyncStorage.removeItem(
                NATIVE_FORECAST_SYNCED_AT
            );
            await AsyncStorage.setItem(
                FORECAST_SCHEMA_KEY,
                String(FORECAST_SCHEMA_VERSION)
            );
        }
    } catch (e) {
        warn('ensureForecastSchema', e);
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

    // Delegate the draft basket to the sync context.
    const {
        drafts: draftItems,
        isDraftsHydrated: isDraftHydrated,
        addDraftItem,
        removeDraftItem,
        updateDraftItem,
        hasDraftItem,
        clearDraft,
        draftCount,
        draftTotalQuantity,
        draftUniqueWholesalerIds,
    } = useRetailerProductRequestsSync();

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

    /* ---------------- Refs ---------------- */

    const forecastsRef = useRef<RetailerForecastNormalized[]>([]);
    const filtersRef = useRef<ForecastFilters>(DEFAULT_FILTERS);
    const lastSyncedAtRef = useRef<string | null>(null);
    const isFetchingRef = useRef(false);
    const hasBootstrappedRef = useRef(false);
    const inflightFiltersKeyRef = useRef<string | null>(null);
    const pendingRefetchRef = useRef(false);

    useEffect(() => {
        forecastsRef.current = forecasts;
    }, [forecasts]);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);
    useEffect(() => {
        lastSyncedAtRef.current = lastSyncedAt;
    }, [lastSyncedAt]);

    /* ---------------- Filters key ---------------- */

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
            if (isFetchingRef.current) {
                pendingRefetchRef.current = true;
                return;
            }
            isFetchingRef.current = true;

            if (!opts?.silent) setIsLoading(true);
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
                const items = (body.products ?? []).map(
                    (p: any) =>
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
                    `Fetched ${items.length} forecasts (${opts?.silent ? 'silent' : 'active'
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
                if (!opts?.silent) setIsLoading(false);

                const currentKey = filtersKey(filtersRef.current);
                const needsRefetch =
                    pendingRefetchRef.current ||
                    currentKey !== requestKey;

                pendingRefetchRef.current = false;

                if (needsRefetch && hasBootstrappedRef.current) {
                    void fetchForecasts({
                        silent: forecastsRef.current.length > 0,
                    });
                }
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

            const cachedForecasts = await readForecastsFromStorage();
            if (cancelled) return;
            if (cachedForecasts.length > 0) {
                forecastsRef.current = cachedForecasts;
                setForecasts(cachedForecasts);
                setDataSource('cache');
            }

            if (!isWeb) {
                const syncedAt = await AsyncStorage.getItem(
                    NATIVE_FORECAST_SYNCED_AT
                );
                if (syncedAt && !cancelled) {
                    setLastSyncedAt(syncedAt);
                    lastSyncedAtRef.current = syncedAt;
                }
            }

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

    /* ---------------- Network recovery ---------------- */

    useEffect(() => {
        if (isOnline) {
            void fetchForecasts({
                silent: forecastsRef.current.length > 0,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    /* ---------------- Combined helpers ---------------- */

    const forecastByProductId = useMemo(() => {
        const map: Record<string, RetailerForecastNormalized> = {};
        for (const f of forecasts) map[f.remote_id] = f;
        return map;
    }, [forecasts]);

    const draftForecasts = useMemo(() => {
        const result: RetailerForecastNormalized[] = [];
        for (const item of draftItems) {
            const fc = forecastByProductId[item.product_id];
            if (fc) result.push(fc);
        }
        return result;
    }, [draftItems, forecastByProductId]);

    const orphanedDraftItems = useMemo(() => {
        return draftItems.filter(
            (item) => !forecastByProductId[item.product_id]
        );
    }, [draftItems, forecastByProductId]);

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

    const refresh = useCallback(
        () => fetchForecasts({ silent: false }),
        [fetchForecasts]
    );

    /* ---------------- Context value ---------------- */

    const value = useMemo<ForecastContextValue>(
        () => ({
            forecasts,
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

            // Draft basket — forwarded from the sync context
            drafts: draftItems,
            draftCount,
            draftTotalQuantity,
            draftUniqueWholesalerIds,
            isDraftsHydrated: isDraftHydrated,
            addDraftItem,
            removeDraftItem,
            updateDraftItem,
            hasDraftItem,
            clearDraft,

            draftForecasts,
            orphanedDraftItems,
        }),
        [
            forecasts,
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
            draftItems,
            draftCount,
            draftTotalQuantity,
            draftUniqueWholesalerIds,
            isDraftHydrated,
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