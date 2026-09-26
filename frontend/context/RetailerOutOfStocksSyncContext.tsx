// @/context/RetailerOutOfStocksSyncContext.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import {
    PendingOutOfStockCreate,
    PendingOutOfStockEdit,
    RetailerOutOfStock,
    RetailerOutOfStockNormalized,
    RetailerOutOfStockWholesalerOffer,
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
/* Public types                                                        */
/* ------------------------------------------------------------------ */
export interface OutOfStockItemParamsResponse {
    status?: string;
    item_id?: string;
    params?: Partial<RetailerOutOfStock>;
}

interface RetailerOutOfStocksSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    lastSyncedTime: string;
    outOfStocks: RetailerOutOfStockNormalized[];
    pendingOutOfStocks: RetailerOutOfStockNormalized[];
    pendingCount: number;
    pendingEditCount: number;
    pendingCreateCount: number;
    queueRevision: number;
    dataSource: 'server' | 'cache' | 'none';
    setOutOfStocks: (
        data: RetailerOutOfStock[]
    ) => Promise<void>;
    patchOutOfStockLocally: (
        remoteId: string,
        partial: Partial<RetailerOutOfStockNormalized>
    ) => void;
    applyServerOutOfStock: (
        raw: OutOfStockItemParamsResponse
    ) => Promise<void>;
    queueOutOfStockEdit: (
        remoteId: string,
        params: Partial<RetailerOutOfStockNormalized>
    ) => Promise<void>;
    flushPendingEdits: () => Promise<void>;
    flushEditNow: (remoteId: string) => Promise<void>;
    createOutOfStock: (
        params: PendingOutOfStockCreate['params']
    ) => Promise<string>;
    flushPendingCreates: () => Promise<void>;
    reconnectLiveSync: () => Promise<void>;
}

const RetailerOutOfStocksSyncContext = createContext<
    RetailerOutOfStocksSyncContextType | undefined
>(undefined);

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const NATIVE_OUT_OF_STOCKS_KEY =
    'wazipos_async_retailer_out_of_stocks_registry';
const NATIVE_OUT_OF_STOCKS_SYNCED_AT =
    'wazipos_async_retailer_out_of_stocks_synced_at';
const WEB_OUT_OF_STOCKS_KEY =
    'wazipos_web_retailer_out_of_stocks_registry';
const NATIVE_PENDING_EDITS_KEY =
    'wazipos_async_retailer_out_of_stocks_pending_edits';
const NATIVE_PENDING_CREATES_KEY =
    'wazipos_async_retailer_out_of_stocks_pending_creates';
const WS_OUT_OF_STOCKS_URL =
    'wss://api.wazipos.co.ke/ws/retailers/out-of-stocks/';
const CACHE_SCHEMA_VERSION = 3;
const NATIVE_SCHEMA_KEY =
    'wazipos_out_of_stocks_cache_schema';
const PENDING_FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const WS_RECONNECT_DELAY_MS = 7000;
const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

/* ------------------------------------------------------------------ */
/* Log + utils                                                         */
/* ------------------------------------------------------------------ */
const log = (...args: any[]) => {
    if (__DEV__) console.log('[OutOfStocksSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[OutOfStocksSync]', ...args);
};

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);
const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

function makeDraftId(): string {
    const g: any = globalThis as any;
    if (g?.crypto?.randomUUID) {
        return `draft-${g.crypto.randomUUID()}`;
    }
    return `draft-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

const productTitleCache = new Map<string, string>();
export function rememberProductTitle(
    productId: string,
    title: string
) {
    if (productId && title) {
        productTitleCache.set(productId, title);
    }
}

const extractOutOfStocksArray = (
    payload: any
): any[] | null => {
    const p = payload?.data ?? payload;
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.results)) return p.results;
    if (Array.isArray(p?.out_of_stocks))
        return p.out_of_stocks;
    if (Array.isArray(p?.retailer_out_of_stocks))
        return p.retailer_out_of_stocks;
    if (Array.isArray(p?.data?.results))
        return p.data.results;
    if (Array.isArray(p?.data?.out_of_stocks))
        return p.data.out_of_stocks;
    return null;
};

/* ------------------------------------------------------------------ */
/* Normalizers                                                         */
/* ------------------------------------------------------------------ */
export function resolveImageUrl(
    rawPath: any
): string | null {
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

function normalizeOutOfStockImage(raw: any) {
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

function normalizeWholesalerOffer(
    raw: any
): RetailerOutOfStockWholesalerOffer {
    const offer = { ...raw };

    if (offer?.received_from_details) {
        offer.received_from_details = {
            ...offer.received_from_details,
            images: Array.isArray(
                offer.received_from_details.images
            )
                ? offer.received_from_details.images.map(
                    normalizeOutOfStockImage
                )
                : [],
            logos: Array.isArray(
                offer.received_from_details.logos
            )
                ? offer.received_from_details.logos.map(
                    normalizeOutOfStockImage
                )
                : [],
        };
    }

    offer.images = Array.isArray(offer.images)
        ? offer.images.map(normalizeOutOfStockImage)
        : [];

    return offer as RetailerOutOfStockWholesalerOffer;
}

function normalizeOutOfStock(
    raw: any,
    ts: string
): RetailerOutOfStockNormalized {
    return {
        cached_at: String(firstDefined(raw?.cached_at, ts)),
        remote_id: String(firstDefined(raw?.id, raw?.key, '')),
        draft_id: raw?.draft_id ?? undefined,
        is_pending: raw?.is_pending ?? undefined,
        entity: String(raw?.entity ?? ''),
        product: String(raw?.product ?? ''),
        unit_of_receipt: String(raw?.unit_of_receipt ?? ''),
        product_title: String(raw?.product_title ?? ''),
        units_per_pack: Number(raw?.units_per_pack ?? 1),
        customer: null,
        customer_name: raw?.customer_name ?? null,
        customer_phone: raw?.customer_phone ?? null,
        required_quantity: Number(raw?.required_quantity ?? 0),
        is_special_order: toBool(raw?.is_special_order),
        is_ordered: toBool(raw?.is_ordered),
        retailer_indent: null,
        images: Array.isArray(raw?.images)
            ? raw.images.map(normalizeOutOfStockImage)
            : [],
        wholesaler_offers: Array.isArray(
            raw?.wholesaler_offers
        )
            ? raw.wholesaler_offers.map(
                normalizeWholesalerOffer
            )
            : [],
        created: String(firstDefined(raw?.created, ts)),
        updated: String(firstDefined(raw?.updated, ts)),
        owner: String(raw?.owner ?? ''),
    };
}

function areOutOfStocksEqual(
    a: RetailerOutOfStockNormalized[],
    b: RetailerOutOfStockNormalized[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];

        if (
            x.remote_id !== y.remote_id ||
            x.updated !== y.updated ||
            x.is_ordered !== y.is_ordered ||
            x.required_quantity !== y.required_quantity ||
            x.is_pending !== y.is_pending ||
            x.wholesaler_offers.length !==
            y.wholesaler_offers.length
        ) {
            return false;
        }
    }

    return true;
}

/* ------------------------------------------------------------------ */
/* Payload builders                                                    */
/* ------------------------------------------------------------------ */
function toUpdatePayload(
    remoteId: string,
    params: Partial<RetailerOutOfStockNormalized>
) {
    return {
        action: 'UpdateOutOfStockItem',
        out_of_stock_item_id: remoteId,
        product: params.product
            ? String(params.product)
            : undefined,
        required_quantity:
            params.required_quantity !== undefined
                ? Number(params.required_quantity)
                : undefined,
        is_special_order:
            params.is_special_order !== undefined
                ? Boolean(params.is_special_order)
                : undefined,
        customer_name:
            params.customer_name !== undefined
                ? params.customer_name
                : undefined,
        customer_phone:
            params.customer_phone !== undefined
                ? params.customer_phone
                : undefined,
    };
}

function toCreatePayload(
    draftId: string,
    params: PendingOutOfStockCreate['params']
) {
    return {
        action: 'CreateOutOfStockItem',
        draft_id: draftId,
        product: params.product,
        required_quantity: Number(
            params.required_quantity ?? 0
        ),
        is_special_order:
            typeof params.is_special_order === 'boolean'
                ? params.is_special_order
                    ? 'true'
                    : 'false'
                : String(
                    params.is_special_order ?? 'false'
                ),
        customer_name: params.customer_name ?? null,
        customer_phone: params.customer_phone ?? null,
    };
}

/* ------------------------------------------------------------------ */
/* Storage helpers — registry                                          */
/* ------------------------------------------------------------------ */
async function writeOutOfStocksToStorage(
    data: RetailerOutOfStockNormalized[]
): Promise<void> {
    const tasks: Promise<any>[] = [];

    if (Platform.OS !== 'web') {
        tasks.push(
            db
                .saveRetailerOutOfStocks(data)
                .catch((err) =>
                    warn(
                        'AsyncStorage write failed:',
                        err
                    )
                )
        );
        tasks.push(
            AsyncStorage.setItem(
                NATIVE_OUT_OF_STOCKS_SYNCED_AT,
                new Date().toISOString()
            ).catch(() => null)
        );
    }

    if (dbInstance?.retailerOutOfStocks) {
        tasks.push(
            (async () => {
                try {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.retailerOutOfStocks,
                        async () => {
                            await dbInstance.retailerOutOfStocks.clear();
                            await dbInstance.retailerOutOfStocks.bulkPut(
                                data
                            );
                        }
                    );
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
                WEB_OUT_OF_STOCKS_KEY,
                JSON.stringify(data)
            );
        } catch (err) {
            warn('localStorage write failed:', err);
        }
    }

    await Promise.allSettled(tasks);
}

async function readOutOfStocksFromStorage(): Promise<
    RetailerOutOfStockNormalized[]
> {
    try {
        if (Platform.OS === 'web') {
            if (dbInstance?.retailerOutOfStocks) {
                return await dbInstance.retailerOutOfStocks.toArray();
            }
            if (typeof window !== 'undefined') {
                const raw = window.localStorage.getItem(
                    WEB_OUT_OF_STOCKS_KEY
                );
                return raw ? JSON.parse(raw) : [];
            }
            return [];
        }

        const viaDb = await db
            .getRetailerOutOfStocks()
            .catch(() => []);

        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readOutOfStocksFromStorage', err);
        return [];
    }
}

/* ------------------------------------------------------------------ */
/* Storage helpers — pending queues                                    */
/* ------------------------------------------------------------------ */
async function writePendingEditsToStorage(
    edits: PendingOutOfStockEdit[]
): Promise<void> {
    try {
        const payload = JSON.stringify(edits);
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(
                    NATIVE_PENDING_EDITS_KEY,
                    payload
                );
            }
            return;
        }
        await AsyncStorage.setItem(
            NATIVE_PENDING_EDITS_KEY,
            payload
        );
    } catch (err) {
        warn('writePendingEditsToStorage', err);
    }
}

async function readPendingEditsFromStorage(): Promise<
    PendingOutOfStockEdit[]
> {
    try {
        let raw: string | null = null;
        if (Platform.OS === 'web') {
            raw =
                typeof window !== 'undefined'
                    ? window.localStorage.getItem(
                        NATIVE_PENDING_EDITS_KEY
                    )
                    : null;
        } else {
            raw = await AsyncStorage.getItem(
                NATIVE_PENDING_EDITS_KEY
            );
        }
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        warn('readPendingEditsFromStorage', err);
        return [];
    }
}

async function writePendingCreatesToStorage(
    creates: PendingOutOfStockCreate[]
): Promise<void> {
    try {
        const payload = JSON.stringify(creates);
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(
                    NATIVE_PENDING_CREATES_KEY,
                    payload
                );
            }
            return;
        }
        await AsyncStorage.setItem(
            NATIVE_PENDING_CREATES_KEY,
            payload
        );
    } catch (err) {
        warn('writePendingCreatesToStorage', err);
    }
}

async function readPendingCreatesFromStorage(): Promise<
    PendingOutOfStockCreate[]
> {
    try {
        let raw: string | null = null;
        if (Platform.OS === 'web') {
            raw =
                typeof window !== 'undefined'
                    ? window.localStorage.getItem(
                        NATIVE_PENDING_CREATES_KEY
                    )
                    : null;
        } else {
            raw = await AsyncStorage.getItem(
                NATIVE_PENDING_CREATES_KEY
            );
        }
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        warn('readPendingCreatesFromStorage', err);
        return [];
    }
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */
export const RetailerOutOfStocksSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [outOfStocks, setOutOfStocksState] = useState<
        RetailerOutOfStockNormalized[]
    >([]);
    const [queueRevision, setQueueRevision] = useState(0);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] =
        useState(false);
    const [dataSource, setDataSource] = useState<
        'server' | 'cache' | 'none'
    >('none');
    const [pendingEditCount, setPendingEditCount] = useState(0);
    const [pendingCreateCount, setPendingCreateCount] =
        useState(0);

    const getOutOfStocksApi = useApi<any>(
        async () =>
            await retailersApi.retailStaffAction({
                action: 'RetrieveOutOfStockItems',
            })
    );
    const updateOutOfStockApi = useApi<any>(
        async (payload: any) =>
            await retailersApi.retailStaffAction(payload)
    );
    const createOutOfStockApi = useApi<any>(
        async (payload: any) =>
            await retailersApi.retailStaffAction(payload)
    );

    const wsRef = useRef<WebSocket | null>(null);
    const outOfStocksStateRef = useRef<
        RetailerOutOfStockNormalized[]
    >([]);
    const reconnectTimeoutRef =
        useRef<NodeJS.Timeout | null>(null);
    const wsGenerationRef = useRef(0);
    const pollIntervalRef =
        useRef<NodeJS.Timeout | null>(null);
    const pendingFlushIntervalRef =
        useRef<NodeJS.Timeout | null>(null);
    const pendingFlushInProgressRef = useRef(false);

    const pendingEditsRef = useRef<PendingOutOfStockEdit[]>(
        []
    );
    const pendingCreatesRef = useRef<
        PendingOutOfStockCreate[]
    >([]);

    useEffect(() => {
        outOfStocksStateRef.current = outOfStocks;
    }, [outOfStocks]);

    const pendingOutOfStocks = useMemo(
        () => outOfStocks.filter((i) => !i.is_ordered),
        [outOfStocks]
    );

    /* ---------------------------------------------------------
     * Local patch (state only)
     * ------------------------------------------------------- */
    const patchOutOfStockLocally = useCallback(
        (
            remoteId: string,
            partial: Partial<RetailerOutOfStockNormalized>
        ) => {
            setOutOfStocksState((prev) => {
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

    /* ---------------------------------------------------------
     * Snapshot pipeline (HTTP + WS)
     * ------------------------------------------------------- */
    const commitSnapshot = useCallback(
        async (
            raw: any[],
            source: 'server' | 'cache'
        ) => {
            const nowStr = new Date().toISOString();
            const normalized = raw.map((r) =>
                normalizeOutOfStock(r, nowStr)
            );

            await writeOutOfStocksToStorage(normalized);

            outOfStocksStateRef.current = normalized;
            setOutOfStocksState((prev) =>
                areOutOfStocksEqual(prev, normalized)
                    ? prev
                    : normalized
            );
            setDataSource(source);
            setQueueRevision((r) => r + 1);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );
        },
        []
    );

    /* ---------------------------------------------------------
     * Single patch / draft reconcile
     * ------------------------------------------------------- */
    const commitSinglePatch = useCallback(
        async (patch: any) => {
            const itemId = String(
                firstDefined(patch?.item_id, patch?.id, '')
            );
            const draftId = patch?.draft_id
                ? String(patch.draft_id)
                : null;
            const params = patch?.params ?? patch;

            if (!itemId && !draftId) return;

            const nowStr = new Date().toISOString();
            const current = outOfStocksStateRef.current;

            let matched = false;
            let next = current.map((row) => {
                if (
                    draftId &&
                    row.draft_id &&
                    row.draft_id === draftId
                ) {
                    matched = true;
                    const merged: any = {
                        ...row,
                        ...params,
                        remote_id: itemId || row.remote_id,
                        draft_id: undefined,
                        is_pending: false,
                        cached_at: row.cached_at ?? nowStr,
                    };
                    merged.is_special_order = toBool(
                        merged.is_special_order
                    );
                    merged.is_ordered = toBool(
                        merged.is_ordered
                    );
                    return merged as RetailerOutOfStockNormalized;
                }
                return row;
            });

            if (!matched && itemId) {
                let found = false;
                next = next.map((row) => {
                    if (row.remote_id !== itemId) return row;
                    found = true;
                    matched = true;
                    const merged: any = {
                        ...row,
                        ...params,
                        draft_id: undefined,
                        is_pending: false,
                        cached_at: row.cached_at ?? nowStr,
                    };
                    merged.is_special_order = toBool(
                        merged.is_special_order
                    );
                    merged.is_ordered = toBool(
                        merged.is_ordered
                    );
                    return merged as RetailerOutOfStockNormalized;
                });

                if (!found) {
                    next = [
                        normalizeOutOfStock(
                            { ...params, id: itemId },
                            nowStr
                        ),
                        ...next,
                    ];
                }
            }

            await writeOutOfStocksToStorage(next);

            outOfStocksStateRef.current = next;
            setOutOfStocksState(next);
            setDataSource('server');
            setQueueRevision((r) => r + 1);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );
        },
        []
    );

    const applyServerOutOfStock = useCallback(
        async (raw: OutOfStockItemParamsResponse) => {
            if (!raw?.item_id || !raw?.params) return;
            await commitSinglePatch({
                item_id: raw.item_id,
                params: raw.params,
            });
        },
        [commitSinglePatch]
    );

    /* ---------------------------------------------------------
     * Pending edits: flush
     * ------------------------------------------------------- */
    const flushPendingEdits = useCallback(async () => {
        if (pendingFlushInProgressRef.current) return;
        if (!token || !isOnline) return;
        const queue = pendingEditsRef.current;
        if (queue.length === 0) return;

        pendingFlushInProgressRef.current = true;
        const succeededIds = new Set<string>();

        for (const edit of queue) {
            if (
                edit.remote_id.startsWith('local-') &&
                pendingCreatesRef.current.some(
                    (c) =>
                        c.local_row_id === edit.remote_id
                )
            ) {
                continue;
            }

            try {
                const payload = toUpdatePayload(
                    edit.remote_id,
                    edit.params
                );

                if (__DEV__) {
                    console.log(
                        '[OutOfStocksSync] flush edit payload',
                        payload
                    );
                }

                const res =
                    await updateOutOfStockApi.request(
                        payload
                    );
                const data = res?.data ?? res;
                const isOk =
                    res?.ok === true ||
                    res?.status === 200 ||
                    res?.status === 201 ||
                    res?.status === 202 ||
                    data?.status === 'accepted' ||
                    data?.status === 'ok';

                if (isOk) succeededIds.add(edit.id);
                else
                    warn(
                        'flushPendingEdits — rejected',
                        edit.id,
                        data?.detail || data?.message
                    );
            } catch (e) {
                warn('flushPendingEdits — threw', edit.id, e);
            }
        }

        if (succeededIds.size > 0) {
            pendingEditsRef.current =
                pendingEditsRef.current.filter(
                    (e) => !succeededIds.has(e.id)
                );
            setPendingEditCount(
                pendingEditsRef.current.length
            );
            await writePendingEditsToStorage(
                pendingEditsRef.current
            );
        }

        pendingFlushInProgressRef.current = false;
    }, [token, isOnline, updateOutOfStockApi]);

    /* ---------------------------------------------------------
     * Pending edits: enqueue
     * ------------------------------------------------------- */
    const queueOutOfStockEdit = useCallback(
        async (
            remoteId: string,
            params: Partial<RetailerOutOfStockNormalized>
        ) => {
            patchOutOfStockLocally(remoteId, params);

            const nowStr = new Date().toISOString();
            const idx = pendingEditsRef.current.findIndex(
                (e) => e.remote_id === remoteId
            );

            if (idx >= 0) {
                const existing = pendingEditsRef.current[idx];
                pendingEditsRef.current[idx] = {
                    ...existing,
                    params: {
                        ...existing.params,
                        ...params,
                    },
                    created_at: nowStr,
                };
            } else {
                pendingEditsRef.current = [
                    ...pendingEditsRef.current,
                    {
                        id: `oo-edit-${remoteId}-${Date.now()}`,
                        remote_id: remoteId,
                        params,
                        created_at: nowStr,
                    },
                ];
            }

            setPendingEditCount(
                pendingEditsRef.current.length
            );
            await writePendingEditsToStorage(
                pendingEditsRef.current
            );

            if (isOnline && token) void flushPendingEdits();
        },
        [
            patchOutOfStockLocally,
            isOnline,
            token,
            flushPendingEdits,
        ]
    );

    const flushEditNow = useCallback(
        async (remoteId: string) => {
            if (!token || !isOnline) return;
            const edit = pendingEditsRef.current.find(
                (e) => e.remote_id === remoteId
            );
            if (!edit) return;

            try {
                const payload = toUpdatePayload(
                    edit.remote_id,
                    edit.params
                );
                const res =
                    await updateOutOfStockApi.request(
                        payload
                    );
                const data = res?.data ?? res;
                const isOk =
                    res?.ok === true ||
                    res?.status === 200 ||
                    res?.status === 201 ||
                    res?.status === 202 ||
                    data?.status === 'accepted' ||
                    data?.status === 'ok';

                if (isOk) {
                    pendingEditsRef.current =
                        pendingEditsRef.current.filter(
                            (e) => e.id !== edit.id
                        );
                    setPendingEditCount(
                        pendingEditsRef.current.length
                    );
                    await writePendingEditsToStorage(
                        pendingEditsRef.current
                    );
                }
            } catch (e) {
                warn('flushEditNow', remoteId, e);
            }
        },
        [token, isOnline, updateOutOfStockApi]
    );

    /* ---------------------------------------------------------
     * Pending creates: flush
     * ------------------------------------------------------- */
    const flushPendingCreates = useCallback(async () => {
        if (pendingFlushInProgressRef.current) return;
        if (!token || !isOnline) return;
        const queue = pendingCreatesRef.current;
        if (queue.length === 0) return;

        pendingFlushInProgressRef.current = true;
        const succeededIds = new Set<string>();

        for (const create of queue) {
            try {
                const payload = toCreatePayload(
                    create.draft_id,
                    create.params
                );

                if (__DEV__) {
                    console.log(
                        '[OutOfStocksSync] flush create payload',
                        payload
                    );
                }

                const res =
                    await createOutOfStockApi.request(
                        payload
                    );
                const data = res?.data ?? res;
                const isOk =
                    res?.ok === true ||
                    res?.status === 200 ||
                    res?.status === 201 ||
                    res?.status === 202 ||
                    data?.status === 'accepted' ||
                    data?.status === 'ok' ||
                    data?.id;

                if (isOk) {
                    succeededIds.add(create.id);

                    const created =
                        data?.out_of_stock ??
                        data?.out_of_stock_item ??
                        data?.data ??
                        null;

                    if (created?.id) {
                        const normalized =
                            normalizeOutOfStock(
                                {
                                    ...created,
                                    draft_id: undefined,
                                },
                                new Date().toISOString()
                            );
                        const next =
                            outOfStocksStateRef.current.map(
                                (row) =>
                                    row.remote_id ===
                                        create.local_row_id
                                        ? normalized
                                        : row
                            );
                        outOfStocksStateRef.current = next;
                        setOutOfStocksState(next);
                        await writeOutOfStocksToStorage(
                            next
                        );
                    } else {
                        const next =
                            outOfStocksStateRef.current.map(
                                (row) =>
                                    row.remote_id ===
                                        create.local_row_id
                                        ? {
                                            ...row,
                                            is_pending: false,
                                        }
                                        : row
                            );
                        outOfStocksStateRef.current = next;
                        setOutOfStocksState(next);
                        await writeOutOfStocksToStorage(
                            next
                        );
                    }
                } else {
                    warn(
                        'flushPendingCreates — rejected',
                        create.id,
                        data?.detail || data?.message
                    );
                }
            } catch (e) {
                warn(
                    'flushPendingCreates — threw',
                    create.id,
                    e
                );
            }
        }

        if (succeededIds.size > 0) {
            pendingCreatesRef.current =
                pendingCreatesRef.current.filter(
                    (c) => !succeededIds.has(c.id)
                );
            setPendingCreateCount(
                pendingCreatesRef.current.length
            );
            await writePendingCreatesToStorage(
                pendingCreatesRef.current
            );
        }

        pendingFlushInProgressRef.current = false;
    }, [token, isOnline, createOutOfStockApi]);

    /* ---------------------------------------------------------
     * Pending creates: enqueue + optimistic row
     * ------------------------------------------------------- */
    const createOutOfStock = useCallback(
        async (
            params: PendingOutOfStockCreate['params']
        ) => {
            const nowStr = new Date().toISOString();
            const draftId = makeDraftId();
            const localRowId = `local-${draftId}`;

            const entry: PendingOutOfStockCreate = {
                id: `oo-create-${draftId}`,
                draft_id: draftId,
                local_row_id: localRowId,
                params: {
                    product: params.product,
                    required_quantity: Number(
                        params.required_quantity ?? 0
                    ),
                    is_special_order:
                        typeof params.is_special_order ===
                            'boolean'
                            ? params.is_special_order
                            : params.is_special_order ===
                            'true',
                    customer_name:
                        params.customer_name ?? null,
                    customer_phone:
                        params.customer_phone ?? null,
                    unit_of_receipt:
                        params.unit_of_receipt ?? null,
                },
                created_at: nowStr,
            };

            const optimistic: RetailerOutOfStockNormalized =
            {
                cached_at: nowStr,
                remote_id: localRowId,
                draft_id: draftId,
                is_pending: true,
                entity: user?.entity_id ?? '',
                product: String(params.product ?? ''),
                unit_of_receipt: String(
                    params.unit_of_receipt ?? ''
                ),
                product_title:
                    productTitleCache.get(
                        params.product
                    ) ?? '',
                units_per_pack: 1,
                customer: null,
                customer_name:
                    params.customer_name ?? null,
                customer_phone:
                    params.customer_phone ?? null,
                required_quantity: Number(
                    params.required_quantity ?? 0
                ),
                is_special_order:
                    typeof params.is_special_order ===
                        'boolean'
                        ? params.is_special_order
                        : params.is_special_order ===
                        'true',
                is_ordered: false,
                retailer_indent: null,
                images: [],
                wholesaler_offers: [],
                created: nowStr,
                updated: nowStr,
                owner: user?.id ?? '',
            };

            const nextLocal = [
                optimistic,
                ...outOfStocksStateRef.current,
            ];
            outOfStocksStateRef.current = nextLocal;
            setOutOfStocksState(nextLocal);
            await writeOutOfStocksToStorage(nextLocal);

            pendingCreatesRef.current = [
                ...pendingCreatesRef.current,
                entry,
            ];
            setPendingCreateCount(
                pendingCreatesRef.current.length
            );
            await writePendingCreatesToStorage(
                pendingCreatesRef.current
            );

            if (isOnline && token) void flushPendingCreates();

            return draftId;
        },
        [
            isOnline,
            token,
            flushPendingCreates,
            user?.entity_id,
            user?.id,
        ]
    );

    /* ---------------------------------------------------------
     * Cache schema + hydrate
     * ------------------------------------------------------- */
    const ensureCacheSchema = useCallback(async () => {
        try {
            if (Platform.OS === 'web') {
                const stored =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(
                            NATIVE_SCHEMA_KEY
                        )
                        : null;
                if (
                    stored &&
                    Number(stored) === CACHE_SCHEMA_VERSION
                )
                    return;
                if (dbInstance?.retailerOutOfStocks) {
                    await dbInstance.retailerOutOfStocks.clear();
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
                )
                    return;
                await AsyncStorage.removeItem(
                    NATIVE_OUT_OF_STOCKS_SYNCED_AT
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
            const cached =
                await readOutOfStocksFromStorage();
            if (cached.length > 0) {
                outOfStocksStateRef.current = cached;
                setOutOfStocksState((prev) =>
                    areOutOfStocksEqual(prev, cached)
                        ? prev
                        : cached
                );
                setDataSource('cache');
                setQueueRevision((r) => r + 1);
            } else {
                setDataSource('none');
            }

            const edits = await readPendingEditsFromStorage();
            pendingEditsRef.current = edits;
            setPendingEditCount(edits.length);

            const creates =
                await readPendingCreatesFromStorage();
            pendingCreatesRef.current = creates;
            setPendingCreateCount(creates.length);

            if (Platform.OS !== 'web') {
                const syncedAt = await AsyncStorage.getItem(
                    NATIVE_OUT_OF_STOCKS_SYNCED_AT
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

    /* ---------------------------------------------------------
     * HTTP sync
     * ------------------------------------------------------- */
    const runRemoteOutOfStocksSynchronizer = useCallback(
        async () => {
            if (!token) return;

            try {
                await getOutOfStocksApi.request();
            } catch (e) {
                warn('HTTP request threw:', e);
                return;
            }

            const payload = getOutOfStocksApi.data;
            if (!payload) {
                warn('HTTP returned no payload');
                return;
            }

            const data = extractOutOfStocksArray(payload);
            if (!Array.isArray(data)) {
                warn('Unexpected HTTP out-of-stocks shape', payload);
                return;
            }

            await commitSnapshot(data, 'server');
        },
        [token, getOutOfStocksApi, commitSnapshot]
    );

    /* ---------------------------------------------------------
     * WebSocket
     * ------------------------------------------------------- */
    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

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
                    `${WS_OUT_OF_STOCKS_URL}?token=${currentToken}`
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

                    try {
                        const parsed = JSON.parse(event.data);

                        const list =
                            extractOutOfStocksArray(parsed);
                        if (Array.isArray(list)) {
                            await commitSnapshot(
                                list,
                                'server'
                            );
                            return;
                        }

                        if (
                            parsed?.item_id ||
                            (parsed?.id && parsed?.product)
                        ) {
                            await commitSinglePatch(parsed);
                        }
                    } catch (e) {
                        warn('WS parse failed', e);
                    }
                };

                ws.onclose = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
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
            } catch (e) {
                warn('WS threw', e);
            }
        },
        [commitSnapshot, commitSinglePatch]
    );

    /* ---------------------------------------------------------
     * Public setters
     * ------------------------------------------------------- */
    const setOutOfStocks = useCallback(
        async (data: RetailerOutOfStock[]) => {
            await commitSnapshot(data, 'server');
        },
        [commitSnapshot]
    );

    /* ---------------------------------------------------------
     * Manual reconnect
     * ------------------------------------------------------- */
    const reconnectLiveSync = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            if (token) {
                await runRemoteOutOfStocksSynchronizer();
                establishLiveWebSocketSync(token);
            }
        } catch (e) {
            warn('reconnectLiveSync threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        token,
        runRemoteOutOfStocksSynchronizer,
        establishLiveWebSocketSync,
    ]);

    /* ---------------------------------------------------------
     * Action ref — keeps effects deps stable
     * ------------------------------------------------------- */
    const actionsRef = useRef({
        hydrateFromLocalDB,
        runRemoteOutOfStocksSynchronizer,
        establishLiveWebSocketSync,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            runRemoteOutOfStocksSynchronizer,
            establishLiveWebSocketSync,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap
     * ------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await ensureCacheSchema();
            if (cancelled) return;

            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            if (token) {
                await actionsRef.current.runRemoteOutOfStocksSynchronizer();
                if (cancelled) return;

                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
                if (cancelled) return;

                if (pendingFlushIntervalRef.current) {
                    clearInterval(
                        pendingFlushIntervalRef.current
                    );
                }
                pendingFlushIntervalRef.current =
                    setInterval(() => {
                        void flushPendingEdits();
                        void flushPendingCreates();
                    }, PENDING_FLUSH_INTERVAL_MS);
            } else {
                outOfStocksStateRef.current = [];
                setOutOfStocksState([]);
                setDataSource('none');
                if (wsRef.current) {
                    try {
                        wsRef.current.onclose = null;
                        wsRef.current.onerror = null;
                        wsRef.current.close();
                    } catch { }
                    wsRef.current = null;
                }
                if (pendingFlushIntervalRef.current) {
                    clearInterval(
                        pendingFlushIntervalRef.current
                    );
                    pendingFlushIntervalRef.current = null;
                }
            }
        };

        init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            if (pendingFlushIntervalRef.current) {
                clearInterval(
                    pendingFlushIntervalRef.current
                );
                pendingFlushIntervalRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                try {
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /* ---------------------------------------------------------
     * Re-sync on network recovery
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;
        if (isOnline) {
            void flushPendingEdits();
            void flushPendingCreates();
            void runRemoteOutOfStocksSynchronizer();
            establishLiveWebSocketSync(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Context value
     * ------------------------------------------------------- */
    const value = useMemo<RetailerOutOfStocksSyncContextType>(
        () => ({
            isSyncing: getOutOfStocksApi.loading,
            isManualRefreshing,
            isLiveConnected,
            lastSyncedTime,
            outOfStocks,
            pendingOutOfStocks,
            pendingCount: pendingOutOfStocks.length,
            pendingEditCount,
            pendingCreateCount,
            queueRevision,
            dataSource,
            setOutOfStocks,
            patchOutOfStockLocally,
            applyServerOutOfStock,
            queueOutOfStockEdit,
            flushPendingEdits,
            flushEditNow,
            createOutOfStock,
            flushPendingCreates,
            reconnectLiveSync,
        }),
        [
            getOutOfStocksApi.loading,
            isManualRefreshing,
            isLiveConnected,
            lastSyncedTime,
            outOfStocks,
            pendingOutOfStocks,
            pendingEditCount,
            pendingCreateCount,
            queueRevision,
            dataSource,
            setOutOfStocks,
            patchOutOfStockLocally,
            applyServerOutOfStock,
            queueOutOfStockEdit,
            flushPendingEdits,
            flushEditNow,
            createOutOfStock,
            flushPendingCreates,
            reconnectLiveSync,
        ]
    );

    return (
        <RetailerOutOfStocksSyncContext.Provider value={value}>
            {children}
        </RetailerOutOfStocksSyncContext.Provider>
    );
};

export const useRetailerOutOfStocksSync = () => {
    const context = useContext(
        RetailerOutOfStocksSyncContext
    );
    if (!context) {
        throw new Error(
            'useRetailerOutOfStocksSync must be used within a RetailerOutOfStocksSyncProvider'
        );
    }
    return context;
};