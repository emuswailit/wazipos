// @/context/RetailerIndentsSyncContext.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import {
    RetailerIndent,
    RetailerIndentItem,
    RetailerIndentItemImage,
} from '@/databases/types';
import { useApi } from '@/hooks/useApi';
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

/* ------------------------------------------------------------------ */
/* Response shape from the server                                      */
/* ------------------------------------------------------------------ */
export interface IndentItemParamsResponse {
    status?: string;
    item_id?: string;
    indent_id?: string;
    params?: Partial<RetailerIndentItem>;
}

interface RetailerIndentsSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    lastSyncedTime: string;
    retailerIndents: RetailerIndent[];
    openIndents: RetailerIndent[];
    openCount: number;
    currentOpenIndent: RetailerIndent | null;
    queueRevision: number;
    dataSource: 'server' | 'cache' | 'none';
    patchIndentLocally: (
        remoteId: string,
        partial: Partial<RetailerIndent>
    ) => void;
    patchIndentItemLocally: (
        indentRemoteId: string,
        itemId: string,
        partial: Partial<RetailerIndentItem>
    ) => void;
    applyServerIndentItem: (
        raw: IndentItemParamsResponse
    ) => Promise<void>;

    addOfferToIndent: (input: {
        indentId: string;
        wholesaleReceiptId: string;
        quantity: number;
    }) => Promise<IndentItemParamsResponse | null>;
    removeOfferFromIndent: (input: {
        indentId: string;
        itemId: string;
    }) => Promise<IndentItemParamsResponse | null>;
}

const RetailerIndentsSyncContext = createContext<
    RetailerIndentsSyncContextType | undefined
>(undefined);

const NATIVE_INDENTS_KEY =
    'wazipos_async_retailer_indents_registry';
const NATIVE_INDENTS_SYNCED_AT =
    'wazipos_async_retailer_indents_synced_at';
const WEB_INDENTS_KEY =
    'wazipos_web_retailer_indents_registry';

const WS_INDENTS_URL =
    'wss://api.wazipos.co.ke/ws/retailers/indents/';

const CACHE_SCHEMA_VERSION = 3;
const NATIVE_SCHEMA_KEY = 'wazipos_indents_cache_schema';

const INDENTS_POLL_INTERVAL_MS = 2 * 60 * 1000;
const WS_RECONNECT_DELAY_MS = 7000;

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

const log = (...args: any[]) => {
    if (__DEV__) console.log('[IndentsSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[IndentsSync]', ...args);
};

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

const extractIndentsArray = (payload: any): any[] | null => {
    const p = payload?.data ?? payload;
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.results)) return p.results;
    if (Array.isArray(p?.retailer_indents)) return p.retailer_indents;
    if (Array.isArray(p?.indents)) return p.indents;
    if (Array.isArray(p?.data?.results)) return p.data.results;
    if (Array.isArray(p?.data?.retailer_indents))
        return p.data.retailer_indents;
    return null;
};

function resolveImageUrl(rawPath: any): string | null {
    if (!rawPath) return null;

    const path =
        typeof rawPath === 'string'
            ? rawPath
            : rawPath?.thumbnail ||
            rawPath?.image ||
            rawPath?.url ||
            null;

    if (!path || typeof path !== 'string') return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://')
    ) {
        return trimmed;
    }

    const cleanPath = trimmed.startsWith('/')
        ? trimmed.substring(1)
        : trimmed;

    return `${IMAGE_BASE_URL}/${cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
}

function normalizeIndentItemImage(
    raw: any
): RetailerIndentItemImage {
    const rawImage =
        typeof raw === 'string'
            ? raw
            : raw?.image || raw?.url || null;

    const rawThumb =
        typeof raw === 'string'
            ? raw
            : raw?.thumbnail || raw?.image || null;

    return {
        id: String(raw?.id ?? ''),
        image: resolveImageUrl(rawImage) ?? '',
        thumbnail: resolveImageUrl(rawThumb) ?? '',
        owner: String(raw?.owner ?? ''),
        product: String(raw?.product ?? ''),
        entity: String(raw?.entity ?? ''),
        created: String(raw?.created ?? ''),
        updated: String(raw?.updated ?? ''),
    };
}

function normalizeIndentItem(raw: any): RetailerIndentItem {
    return {
        id: String(raw?.id ?? ''),
        entity: String(raw?.entity ?? ''),
        entity_title: String(raw?.entity_title ?? ''),

        source: String(raw?.source ?? 'PREDICTION'),
        source_label: String(raw?.source_label ?? ''),

        retailer_indent: String(raw?.retailer_indent ?? ''),
        wholesale_receipt: raw?.wholesale_receipt ?? null,
        wholesale_receipt_title: String(
            raw?.wholesale_receipt_title ?? ''
        ),
        wholesaler: raw?.wholesaler ?? null,
        wholesaler_title: String(
            raw?.wholesaler_title ?? ''
        ),

        wholesaler_price_discount:
            raw?.wholesaler_price_discount ?? null,
        wholesaler_price_discount_title: String(
            raw?.wholesaler_price_discount_title ?? ''
        ),
        wholesaler_quantity_discount:
            raw?.wholesaler_quantity_discount ?? null,
        wholesaler_quantity_discount_title: String(
            raw?.wholesaler_quantity_discount_title ?? ''
        ),

        campaign_item: raw?.campaign_item ?? null,
        campaign_item_details:
            raw?.campaign_item_details ?? null,

        required_quantity: Number(
            raw?.required_quantity ?? 0
        ),
        total_quantity: Number(raw?.total_quantity ?? 0),

        bonus_quantity_earned: Number(
            raw?.bonus_quantity_earned ?? 0
        ),
        bonus_blocks_earned: Number(
            raw?.bonus_blocks_earned ?? 0
        ),
        bonus_rule_buy_quantity:
            raw?.bonus_rule_buy_quantity ?? null,
        bonus_rule_free_quantity:
            raw?.bonus_rule_free_quantity ?? null,

        supplier_unit_selling_price:
            raw?.supplier_unit_selling_price ?? null,
        final_supplier_unit_selling_price:
            raw?.final_supplier_unit_selling_price ?? null,
        recommended_retail_price:
            raw?.recommended_retail_price ?? null,
        markup_percentage_used:
            raw?.markup_percentage_used ?? null,

        final_unit_price: raw?.final_unit_price ?? null,
        item_gross_total_amount:
            raw?.item_gross_total_amount ?? null,
        item_net_total_amount:
            raw?.item_net_total_amount ?? null,

        profit_estimate: raw?.profit_estimate ?? null,
        cost_per_unit: raw?.cost_per_unit ?? null,
        sell_per_unit: raw?.sell_per_unit ?? null,
        profit_per_unit: raw?.profit_per_unit ?? null,
        total_profit: raw?.total_profit ?? null,
        total_revenue: raw?.total_revenue ?? null,
        margin_percent: raw?.margin_percent ?? null,
        pricing_source: raw?.pricing_source ?? null,

        lead_time_days: Number(raw?.lead_time_days ?? 0),
        lead_time_variance_days: Number(
            raw?.lead_time_variance_days ?? 0
        ),
        lead_time_source: String(
            raw?.lead_time_source ?? 'default'
        ),

        manufacture_date: raw?.manufacture_date ?? null,
        expiry_date: raw?.expiry_date ?? null,
        images: Array.isArray(raw?.images)
            ? raw.images.map(normalizeIndentItemImage)
            : [],

        created: String(raw?.created ?? ''),
        updated: String(raw?.updated ?? ''),
        owner: String(raw?.owner ?? ''),
    };
}

function normalizeIndent(
    i: any,
    ts: string
): RetailerIndent {
    return {
        cached_at: String(firstDefined(i.cached_at, ts)),
        remote_id: String(firstDefined(i.id, i.key, '')),

        is_open: String(i.is_open ?? 'false'),
        indent_number: String(i.indent_number ?? ''),
        entity: String(i.entity ?? ''),
        entity_title: String(i.entity_title ?? ''),

        lead_time: Number(i.lead_time ?? 0),
        order_days: Number(i.order_days ?? 0),
        budget_amount: i.budget_amount ?? null,
        budget_enforced: String(
            i.budget_enforced ?? 'false'
        ),
        pricing_percentage: String(
            i.pricing_percentage ?? '0.00'
        ),

        average_lead_time_days: String(
            i.average_lead_time_days ?? '0.00'
        ),
        average_variance_days: String(
            i.average_variance_days ?? '0.00'
        ),
        min_lead_time_days: Number(
            i.min_lead_time_days ?? 0
        ),
        max_lead_time_days: Number(
            i.max_lead_time_days ?? 0
        ),
        lead_time_updated_at:
            i.lead_time_updated_at ?? null,

        total_cost: String(i.total_cost ?? '0.00'),
        total_revenue: String(i.total_revenue ?? '0.00'),
        total_profit: String(i.total_profit ?? '0.00'),
        included_item_count: Number(
            i.included_item_count ?? 0
        ),
        excluded_item_count: Number(
            i.excluded_item_count ?? 0
        ),
        over_budget: toBool(i.over_budget),

        has_items: toBool(
            firstDefined(
                i.has_items,
                Array.isArray(i.retailer_indent_items) &&
                i.retailer_indent_items.length > 0
            )
        ),
        active_item_count: Number(
            firstDefined(
                i.active_item_count,
                Array.isArray(i.retailer_indent_items)
                    ? i.retailer_indent_items.filter(
                        (it: any) =>
                            Number(it?.total_quantity ?? 0) > 0
                    ).length
                    : 0
            )
        ),

        config_snapshot: i.config_snapshot ?? null,

        retailer_indent_items: Array.isArray(
            i.retailer_indent_items
        )
            ? i.retailer_indent_items.map(
                normalizeIndentItem
            )
            : [],

        created: String(firstDefined(i.created, ts)),
        updated: String(firstDefined(i.updated, ts)),
        owner: String(i.owner ?? ''),
    };
}

function areIndentsEqual(
    a: RetailerIndent[],
    b: RetailerIndent[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];

        if (
            x.remote_id !== y.remote_id ||
            x.updated !== y.updated ||
            x.is_open !== y.is_open ||
            x.total_cost !== y.total_cost ||
            x.total_profit !== y.total_profit ||
            x.included_item_count !==
            y.included_item_count
        ) {
            return false;
        }
    }

    return true;
}

async function writeIndentsToStorage(
    data: RetailerIndent[]
): Promise<void> {
    log('writeIndentsToStorage:', {
        count: data.length,
        platform: Platform.OS,
        hasDexie: !!dbInstance?.retailerIndents,
        hasLocalStorage: typeof window !== 'undefined',
    });

    const tasks: Promise<any>[] = [];

    if (Platform.OS !== 'web') {
        tasks.push(
            AsyncStorage.setItem(
                NATIVE_INDENTS_KEY,
                JSON.stringify(data)
            ).catch((err) =>
                warn('AsyncStorage write failed:', err)
            )
        );
        tasks.push(
            AsyncStorage.setItem(
                NATIVE_INDENTS_SYNCED_AT,
                new Date().toISOString()
            ).catch(() => null)
        );
    }

    if (dbInstance?.retailerIndents) {
        tasks.push(
            (async () => {
                try {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.retailerIndents,
                        async () => {
                            await dbInstance.retailerIndents.clear();
                            await dbInstance.retailerIndents.bulkPut(
                                data
                            );
                        }
                    );
                    log('Dexie write OK');
                } catch (err) {
                    warn('Dexie write failed:', err);
                }
            })()
        );
    } else if (
        Platform.OS === 'web' &&
        typeof window !== 'undefined'
    ) {
        try {
            window.localStorage.setItem(
                WEB_INDENTS_KEY,
                JSON.stringify(data)
            );
            log('localStorage write OK');
        } catch (err) {
            warn('localStorage write failed:', err);
        }
    }

    await Promise.allSettled(tasks);
    log('writeIndentsToStorage done');
}

async function readIndentsFromStorage(): Promise<
    RetailerIndent[]
> {
    log('readIndentsFromStorage:', {
        platform: Platform.OS,
        hasDexie: !!dbInstance?.retailerIndents,
        hasLocalStorage: typeof window !== 'undefined',
    });

    try {
        if (Platform.OS === 'web') {
            if (dbInstance?.retailerIndents) {
                const rows =
                    await dbInstance.retailerIndents.toArray();
                log(`Dexie read: ${rows.length} rows`);
                return rows;
            }
            if (typeof window !== 'undefined') {
                const raw = window.localStorage.getItem(
                    WEB_INDENTS_KEY
                );
                const rows = raw ? JSON.parse(raw) : [];
                log(
                    `localStorage read: ${rows.length} rows`
                );
                return rows;
            }
            return [];
        }

        const [asyncJson, viaDb] = await Promise.all([
            AsyncStorage.getItem(NATIVE_INDENTS_KEY).catch(
                () => null
            ),
            db?.getRetailerIndents
                ? db.getRetailerIndents().catch(() => [])
                : Promise.resolve([]),
        ]);

        const asyncData: RetailerIndent[] = asyncJson
            ? JSON.parse(asyncJson)
            : [];

        log(
            `Native read — async: ${asyncData.length}, dexie: ${Array.isArray(viaDb) ? viaDb.length : 0
            }`
        );

        if (
            Array.isArray(viaDb) &&
            viaDb.length >= asyncData.length
        ) {
            return viaDb;
        }
        return asyncData;
    } catch (err) {
        warn('readIndentsFromStorage', err);
        return [];
    }
}

export const RetailerIndentsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [retailerIndents, setRetailerIndents] = useState<
        RetailerIndent[]
    >([]);
    const [queueRevision, setQueueRevision] = useState(0);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [dataSource, setDataSource] = useState<
        'server' | 'cache' | 'none'
    >('none');

    /* ---------------------------------------------------------
     * API hooks
     *
     * All indent operations share the same /retailers/orders/staff
     * endpoint. The `action` field in each payload routes to the
     * correct backend handler. `retailStaffAction` is a raw
     * dispatcher — it does not inject an action of its own.
     * ------------------------------------------------------- */
    const getIndentsApi = useApi(retailersApi.retailStaffAction);

    const addOfferApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload)
    );
    const removeOfferApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload)
    );

    const wsRef = useRef<WebSocket | null>(null);
    const indentsStateRef = useRef<RetailerIndent[]>([]);
    const reconnectTimeoutRef =
        useRef<NodeJS.Timeout | null>(null);
    const wsGenerationRef = useRef(0);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        indentsStateRef.current = retailerIndents;
    }, [retailerIndents]);

    const openIndents = useMemo(
        () =>
            retailerIndents.filter((i) =>
                toBool(i.is_open)
            ),
        [retailerIndents]
    );

    const currentOpenIndent = useMemo<RetailerIndent | null>(
        () => (openIndents.length > 0 ? openIndents[0] : null),
        [openIndents]
    );

    /* ---------------------------------------------------------
     * Local patches
     * ------------------------------------------------------- */
    const patchIndentLocally = useCallback(
        (
            remoteId: string,
            partial: Partial<RetailerIndent>
        ) => {
            setRetailerIndents((prev) => {
                let changed = false;
                const next = prev.map((i) => {
                    if (i.remote_id !== remoteId) return i;
                    changed = true;
                    return { ...i, ...partial };
                });
                return changed ? next : prev;
            });
        },
        []
    );

    const patchIndentItemLocally = useCallback(
        (
            indentRemoteId: string,
            itemId: string,
            partial: Partial<RetailerIndentItem>
        ) => {
            setRetailerIndents((prev) => {
                let anyChanged = false;
                const next = prev.map((indent) => {
                    if (indent.remote_id !== indentRemoteId)
                        return indent;
                    let indentChanged = false;
                    const items =
                        indent.retailer_indent_items.map(
                            (it) => {
                                if (it.id !== itemId)
                                    return it;
                                indentChanged = true;
                                return { ...it, ...partial };
                            }
                        );
                    if (!indentChanged) return indent;
                    anyChanged = true;
                    return {
                        ...indent,
                        retailer_indent_items: items,
                    };
                });
                return anyChanged ? next : prev;
            });
        },
        []
    );

    const commitToStorage = useCallback(
        async (data: RetailerIndent[]) => {
            await writeIndentsToStorage(data);
        },
        []
    );

    const applyServerIndentItem = useCallback(
        async (raw: IndentItemParamsResponse) => {
            if (!raw?.item_id || !raw?.indent_id || !raw?.params) {
                warn(
                    'applyServerIndentItem — malformed response:',
                    raw
                );
                return;
            }

            const current = indentsStateRef.current;
            let anyChanged = false;

            const next = current.map((indent) => {
                if (indent.remote_id !== raw.indent_id) {
                    return indent;
                }

                let itemChanged = false;
                const items = indent.retailer_indent_items.map(
                    (it) => {
                        if (it.id !== raw.item_id) return it;
                        itemChanged = true;
                        return { ...it, ...raw.params };
                    }
                );

                if (!itemChanged) return indent;

                anyChanged = true;

                const totalCost = items.reduce(
                    (sum, it) =>
                        sum +
                        Number(
                            it.item_net_total_amount ??
                            it.item_gross_total_amount ??
                            0
                        ),
                    0
                );
                const activeItemCount = items.filter(
                    (it) => Number(it.total_quantity ?? 0) > 0
                ).length;

                return {
                    ...indent,
                    retailer_indent_items: items,
                    total_cost: totalCost.toFixed(2),
                    active_item_count: activeItemCount,
                    has_items: items.length > 0,
                };
            });

            if (!anyChanged) {
                log(
                    'applyServerIndentItem — no matching item',
                    raw.item_id
                );
                return;
            }

            indentsStateRef.current = next;
            setRetailerIndents(next);
            setDataSource('server');
            setQueueRevision((r) => r + 1);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );

            log(
                'applyServerIndentItem — applied:',
                raw.item_id,
                Object.keys(raw.params ?? {})
            );

            await commitToStorage(next);
        },
        [commitToStorage]
    );

    const ensureCacheSchema = useCallback(async () => {
        try {
            if (Platform.OS === 'web') {
                const stored =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(
                            NATIVE_SCHEMA_KEY
                        )
                        : null;
                log('ensureCacheSchema (web) — stored:', stored);
                if (
                    stored &&
                    Number(stored) === CACHE_SCHEMA_VERSION
                ) {
                    return;
                }
                if (dbInstance?.retailerIndents) {
                    await dbInstance.retailerIndents.clear();
                }
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(
                        NATIVE_SCHEMA_KEY,
                        String(CACHE_SCHEMA_VERSION)
                    );
                }
            } else {
                const stored = await AsyncStorage.getItem(
                    NATIVE_SCHEMA_KEY
                );
                if (
                    stored &&
                    Number(stored) === CACHE_SCHEMA_VERSION
                ) {
                    return;
                }
                await AsyncStorage.removeItem(
                    NATIVE_INDENTS_KEY
                );
                await AsyncStorage.removeItem(
                    NATIVE_INDENTS_SYNCED_AT
                );
                await AsyncStorage.setItem(
                    NATIVE_SCHEMA_KEY,
                    String(CACHE_SCHEMA_VERSION)
                );
            }
        } catch (e) {
            warn('ensureCacheSchema', e);
        }
    }, []);

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            log('hydrateFromLocalDB — starting');
            const cached = await readIndentsFromStorage();

            if (Array.isArray(cached) && cached.length > 0) {
                indentsStateRef.current = cached;
                setRetailerIndents((prev) =>
                    areIndentsEqual(prev, cached)
                        ? prev
                        : cached
                );
                setDataSource('cache');
                setQueueRevision((r) => r + 1);
                log(
                    `hydrateFromLocalDB — loaded ${cached.length}`
                );
            } else {
                log('hydrateFromLocalDB — no cached rows');
                setDataSource('none');
            }

            if (Platform.OS !== 'web') {
                const syncedAt = await AsyncStorage.getItem(
                    NATIVE_INDENTS_SYNCED_AT
                );
                if (syncedAt) {
                    setLastSyncedTime(
                        new Date(
                            syncedAt
                        ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })
                    );
                }
            }

            return cached;
        } catch (e) {
            warn('hydrateFromLocalDB', e);
            return [];
        }
    }, []);

    const runRemoteIndentsSynchronizer = useCallback(
        async () => {
            log('=== Inbound HTTP starting ===');
            log('  token:', !!token);

            if (!token) {
                warn('  fetch skipped — no token');
                return;
            }

            const startedAt = Date.now();

            let res: any = null;
            try {
                res = await getIndentsApi.request({
                    action: 'RetrieveRetailerIndents',
                });
            } catch (e: any) {
                warn('  request threw:', e);
                res = {
                    ok: false,
                    problem: 'exception',
                    data: {
                        message: e?.message || 'Request threw',
                    },
                };
            }

            log('  response ok:', res?.ok);
            log('  response status:', res?.status);

            if (!res?.ok) {
                warn(
                    'Inbound HTTP failed:',
                    res?.status,
                    res?.problem
                );
                return;
            }

            const data = extractIndentsArray(res);
            if (!Array.isArray(data)) {
                warn(
                    'Unexpected HTTP indents shape:',
                    res?.data
                );
                return;
            }

            log(`  resolved item count: ${data.length}`);

            const nowStr = new Date().toISOString();
            const normalized: RetailerIndent[] = data.map(
                (item: any) => normalizeIndent(item, nowStr)
            );

            log(`  normalized count: ${normalized.length}`);

            await commitToStorage(normalized);

            indentsStateRef.current = normalized;
            setRetailerIndents((prev) =>
                areIndentsEqual(prev, normalized)
                    ? prev
                    : normalized
            );
            setDataSource('server');
            setQueueRevision((r) => r + 1);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );

            log(
                `Inbound HTTP done — ${normalized.length
                } indents in ${Date.now() - startedAt}ms`
            );
        },
        [token, getIndentsApi, commitToStorage]
    );

    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            log('WebSocket — establishing');

            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);

            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.onerror = null;
                    wsRef.current.onmessage = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }

            if (!currentToken) {
                setIsLiveConnected(false);
                return;
            }

            const generation = ++wsGenerationRef.current;

            try {
                const ws = new WebSocket(
                    `${WS_INDENTS_URL}?token=${currentToken}`
                );
                wsRef.current = ws;

                ws.onopen = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    setIsLiveConnected(true);
                    log('WebSocket — connected');
                };

                ws.onmessage = async (event) => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    log('WebSocket — message received');
                    try {
                        const parsed = JSON.parse(
                            event.data
                        );
                        const incoming =
                            extractIndentsArray(parsed);

                        if (!Array.isArray(incoming)) return;

                        const nowStr =
                            new Date().toISOString();
                        const updated: RetailerIndent[] =
                            incoming.map((raw: any) =>
                                normalizeIndent(raw, nowStr)
                            );

                        indentsStateRef.current = updated;
                        setRetailerIndents((prev) =>
                            areIndentsEqual(prev, updated)
                                ? prev
                                : updated
                        );
                        setDataSource('server');
                        setQueueRevision((r) => r + 1);
                        setLastSyncedTime(
                            new Date().toLocaleTimeString(
                                [],
                                {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                }
                            )
                        );

                        await commitToStorage(updated);
                    } catch (e) {
                        warn(
                            'WebSocket — message parse failed:',
                            e
                        );
                    }
                };

                ws.onclose = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    log('WebSocket — closed');
                    setIsLiveConnected(false);
                    wsRef.current = null;

                    if (currentToken) {
                        reconnectTimeoutRef.current =
                            setTimeout(
                                () =>
                                    establishLiveWebSocketSync(
                                        currentToken
                                    ),
                                WS_RECONNECT_DELAY_MS
                            );
                    }
                };

                ws.onerror = () => { };
            } catch (err) {
                warn(
                    'WebSocket — establishment threw:',
                    err
                );
            }
        },
        [commitToStorage]
    );

    /* ---------------------------------------------------------
     * Mutation actions
     * ------------------------------------------------------- */

    const addOfferToIndent = useCallback(
        async (input: {
            indentId: string;
            wholesaleReceiptId: string;
            quantity: number;
        }) => {
            log('addOfferToIndent', input);

            try {
                const res: any = await addOfferApi.request({
                    action: 'AddIndentItem',
                    indent_id: input.indentId,
                    wholesale_receipt: input.wholesaleReceiptId,
                    quantity: input.quantity,
                });

                const data = res?.data ?? res;

                if (!res?.ok && data?.response_code !== 0) {
                    warn('addOfferToIndent — rejected', data);
                    return null;
                }

                const params = data?.params;
                const itemId = data?.item_id;
                const indentId = data?.indent_id;

                if (itemId && indentId && params) {
                    const response: IndentItemParamsResponse = {
                        item_id: itemId,
                        indent_id: indentId,
                        params,
                    };
                    await applyServerIndentItem(response);
                    log('addOfferToIndent — applied', itemId);
                    return response;
                }

                log('addOfferToIndent — no echo, refetching');
                await runRemoteIndentsSynchronizer();
                return null;
            } catch (e) {
                warn('addOfferToIndent — threw', e);
                return null;
            }
        },
        [
            addOfferApi,
            applyServerIndentItem,
            runRemoteIndentsSynchronizer,
        ]
    );

    const removeOfferFromIndent = useCallback(
        async (input: { indentId: string; itemId: string }) => {
            log('removeOfferFromIndent', input);

            try {
                const res: any = await removeOfferApi.request({
                    action: 'RemoveIndentItem',
                    indent_id: input.indentId,
                    item_id: input.itemId,
                });

                const data = res?.data ?? res;

                if (!res?.ok && data?.response_code !== 0) {
                    warn(
                        'removeOfferFromIndent — rejected',
                        data
                    );
                    return null;
                }

                patchIndentItemLocally(
                    input.indentId,
                    input.itemId,
                    {
                        total_quantity: 0,
                        required_quantity: 0,
                    } as Partial<RetailerIndentItem>
                );

                await runRemoteIndentsSynchronizer();
                log(
                    'removeOfferFromIndent — done',
                    input.itemId
                );
                return null;
            } catch (e) {
                warn('removeOfferFromIndent — threw', e);
                return null;
            }
        },
        [
            removeOfferApi,
            patchIndentItemLocally,
            runRemoteIndentsSynchronizer,
        ]
    );

    const forceManualRefresh = useCallback(async () => {
        log('=== Manual refresh ===');
        setIsManualRefreshing(true);
        try {
            await runRemoteIndentsSynchronizer();
            if (token) establishLiveWebSocketSync(token);
        } catch (e) {
            warn('Manual refresh threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        runRemoteIndentsSynchronizer,
        establishLiveWebSocketSync,
        token,
    ]);

    const actionsRef = useRef({
        hydrateFromLocalDB,
        runRemoteIndentsSynchronizer,
        establishLiveWebSocketSync,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            runRemoteIndentsSynchronizer,
            establishLiveWebSocketSync,
        };
    });

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            log('=== Bootstrap ===');
            log('  token present:', !!token);

            await ensureCacheSchema();
            if (cancelled) return;

            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            if (token) {
                await actionsRef.current.runRemoteIndentsSynchronizer();
                if (cancelled) return;

                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
                if (cancelled) return;

                if (pollIntervalRef.current)
                    clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    actionsRef.current.runRemoteIndentsSynchronizer();
                }, INDENTS_POLL_INTERVAL_MS);
            } else {
                warn('Bootstrap — no token yet');
                indentsStateRef.current = [];
                setRetailerIndents([]);
                setDataSource('none');
                if (wsRef.current) {
                    try {
                        wsRef.current.onclose = null;
                        wsRef.current.onerror = null;
                        wsRef.current.close();
                    } catch { }
                    wsRef.current = null;
                }
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                }
            }
        };

        init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);
            if (pollIntervalRef.current)
                clearInterval(pollIntervalRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        if (!token) return;
        if (isOnline) {
            actionsRef.current.runRemoteIndentsSynchronizer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    const value = useMemo<RetailerIndentsSyncContextType>(
        () => ({
            isSyncing: getIndentsApi.loading,
            isManualRefreshing,
            isLiveConnected,
            triggerManualFetch:
                runRemoteIndentsSynchronizer,
            forceManualRefresh,
            lastSyncedTime,
            retailerIndents,
            openIndents,
            openCount: openIndents.length,
            currentOpenIndent,
            queueRevision,
            dataSource,
            patchIndentLocally,
            patchIndentItemLocally,
            applyServerIndentItem,
            addOfferToIndent,
            removeOfferFromIndent,
        }),
        [
            getIndentsApi.loading,
            isManualRefreshing,
            isLiveConnected,
            runRemoteIndentsSynchronizer,
            forceManualRefresh,
            lastSyncedTime,
            retailerIndents,
            openIndents,
            currentOpenIndent,
            queueRevision,
            dataSource,
            patchIndentLocally,
            patchIndentItemLocally,
            applyServerIndentItem,
            addOfferToIndent,
            removeOfferFromIndent,
        ]
    );

    return (
        <RetailerIndentsSyncContext.Provider value={value}>
            {children}
        </RetailerIndentsSyncContext.Provider>
    );
};

export const useRetailerIndentsSync = () => {
    const context = useContext(RetailerIndentsSyncContext);
    if (!context) {
        throw new Error(
            'useRetailerIndentsSync must be used within a RetailerIndentsSyncProvider'
        );
    }
    return context;
};