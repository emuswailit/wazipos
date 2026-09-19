// context/RetailerProductRequestsSyncContext.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db } from '@/databases/db';
import {
    PendingOfferAction,
    PendingRequestCreate,
    ProductRequestSummary,
    ProductRequestSummaryLineItem,
    RequestDraftItem,
} from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import { buildDraftId } from '@/utils/draftId';
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

/* =========================================================
 * Types
 * ======================================================= */

interface RetailerProductRequestsSyncContextType {
    requests: ProductRequestSummary[];
    requestsById: Record<string, ProductRequestSummary>;

    drafts: RequestDraftItem[];
    draftCount: number;
    draftTotalQuantity: number;
    draftUniqueWholesalerIds: string[];
    isDraftsHydrated: boolean;

    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    lastSyncedTime: string;
    dataSource: 'server' | 'cache' | 'none';

    pendingRequests: PendingRequestCreate[];
    pendingOffers: PendingOfferAction[];
    pendingRequestCount: number;
    pendingOfferCount: number;
    queueRevision: number;

    addDraftItem: (item: Omit<RequestDraftItem, 'added_at'>) => void;
    removeDraftItem: (productId: string) => void;
    updateDraftItem: (
        productId: string,
        patch: Partial<RequestDraftItem>
    ) => void;
    hasDraftItem: (productId: string) => boolean;
    clearDraft: () => void;

    /**
     * Send the current basket to the server. Creates the request
     * server-side in PUBLISHED and notifies wholesalers. Idempotent
     * via draft_id.
     */
    submitDrafts: () => Promise<{
        requestIds: string[];
        draftCount: number;
    }>;

    /**
     * Direct-create path. Bypasses the local basket and creates a
     * standalone request in one shot.
     */
    createRequest: (
        payload: PendingRequestCreate['payload']
    ) => Promise<string>;

    queueOfferAction: (
        requestId: string,
        offerId: string,
        action: 'confirm' | 'decline',
        note?: string
    ) => Promise<void>;

    setRequests: (data: ProductRequestSummary[]) => Promise<void>;
    patchRequestLocally: (
        remoteId: string,
        partial: Partial<ProductRequestSummary>
    ) => void;
    flushPendingCreates: () => Promise<void>;
    flushPendingOfferActions: () => Promise<void>;
    flushAll: () => Promise<void>;
    reconnectLiveSync: () => Promise<void>;

    debugReadLocal: () => Promise<{
        requests: ProductRequestSummary[];
        drafts: RequestDraftItem[];
    }>;
}

const RetailerProductRequestsSyncContext = createContext<
    RetailerProductRequestsSyncContextType | undefined
>(undefined);

/* =========================================================
 * Constants
 * ======================================================= */

const NATIVE_REQUESTS_SYNCED_AT =
    'wazipos_async_retailer_product_requests_synced_at';

const WS_REQUESTS_URL =
    'wss://api.wazipos.co.ke/ws/analytics/retailer/product-requests/';

const CACHE_SCHEMA_VERSION = 4;
const NATIVE_SCHEMA_KEY = 'wazipos_product_requests_cache_schema';

const PENDING_FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

const isWeb = Platform.OS === 'web';

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__) console.log('[ProductRequestsSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[ProductRequestsSync]', ...args);
};

/* =========================================================
 * Helpers
 * ======================================================= */

/**
 * Resolve a line's wholesalers from whichever shape is present.
 * Prefers the full `wholesalers` array; falls back to zipping the
 * legacy parallel arrays.
 */
function resolveLineWholesalers(
    line: ProductRequestSummaryLineItem
): Array<{ id: string; title: string }> {
    const raw = (line as any).wholesalers;
    if (Array.isArray(raw) && raw.length > 0) {
        return raw
            .filter((w: any) => w && typeof w.id === 'string')
            .map((w: any) => ({
                id: String(w.id),
                title: String(w.title ?? w.id),
            }));
    }

    const ids = line.target_wholesaler_ids;
    const titles = line.wholesaler_titles;

    if (!Array.isArray(ids) || ids.length === 0) return [];

    return ids.map((id, i) => ({
        id: String(id),
        title: String(
            (Array.isArray(titles) ? titles[i] : '') || id
        ),
    }));
}

/**
 * Map a `ProductRequestSummaryLineItem` back into the
 * `RequestDraftItem` shape the forecast UI consumes.
 */
function lineItemToDraft(
    line: ProductRequestSummaryLineItem,
    row: ProductRequestSummary
): RequestDraftItem {
    const wholesalers = resolveLineWholesalers(line);

    return {
        product_id: line.product_id,
        product_title: line.product_title,
        quantity: line.requested_quantity ?? 0,
        urgency:
            (line.urgency as 'low' | 'medium' | 'high') ??
            (row.urgency as 'low' | 'medium' | 'high') ??
            'medium',
        note: line.note ?? '',
        target_wholesaler_ids: wholesalers.map((w) => w.id),
        target_wholesaler_titles: wholesalers.map(
            (w) => w.title
        ),
        wholesalers,
        added_at: row.created,
        best_forecast_quantity:
            line.requested_quantity ?? row.total_line_count,
    };
}

/**
 * Summary → drafts. One draft item per line on each pending row.
 */
function summaryToDrafts(
    row: ProductRequestSummary
): RequestDraftItem[] {
    if (row.is_pending !== true) return [];
    return (row.items_preview ?? []).map((line) =>
        lineItemToDraft(line, row)
    );
}

/**
 * Normalize the server's `RetailerProductRequest` payload into our
 * local `ProductRequestSummary`.
 *
 * Preserves local-only display data (`wholesalers`,
 * `wholesaler_titles`, `target_wholesaler_ids`) that the server
 * doesn't know about, by matching on `product_id` against the
 * previous version of the row.
 */
function normalizeRequestSummary(
    raw: any,
    ts: string,
    previous?: ProductRequestSummary
): ProductRequestSummary {
    const rawItems =
        raw?.items ??
        raw?.request_items ??
        raw?.line_items ??
        raw?.product_request_items ??
        [];

    const priorByProductId = new Map<
        string,
        ProductRequestSummaryLineItem
    >();
    for (const p of previous?.items_preview ?? []) {
        priorByProductId.set(p.product_id, p);
    }

    const itemsPreview: ProductRequestSummaryLineItem[] =
        Array.isArray(rawItems)
            ? rawItems.map((it: any) => {
                const productId = String(
                    it?.product_id ??
                    it?.product ??
                    it?.product?.id ??
                    ''
                );
                const prior = priorByProductId.get(productId);

                return {
                    product_id: productId,
                    product_title:
                        it?.product_title ??
                        it?.product?.title ??
                        prior?.product_title,
                    requested_quantity:
                        Number(
                            it?.requested_quantity ??
                            it?.quantity ??
                            0
                        ) || undefined,
                    urgency: it?.urgency ?? prior?.urgency,
                    note: it?.note ?? prior?.note,
                    status: it?.status ?? prior?.status,
                    offer_count:
                        Number(it?.offer_count ?? 0) || 0,
                    total_offered_quantity:
                        Number(
                            it?.total_offered_quantity ?? 0
                        ) || 0,
                    confirmed_quantity:
                        Number(
                            it?.confirmed_quantity ?? 0
                        ) || 0,

                    // Local-only — carry forward verbatim.
                    wholesalers: prior?.wholesalers,
                    wholesaler_titles:
                        prior?.wholesaler_titles,
                    target_wholesaler_ids:
                        prior?.target_wholesaler_ids,
                };
            })
            : previous?.items_preview ?? [];

    const domainId = raw?.remote_id ?? raw?.id ?? null;
    const serverStatus = String(
        raw?.status ?? 'PUBLISHED'
    );

    return {
        remote_id: domainId ? String(domainId) : null,
        request_number: String(raw?.request_number ?? ''),
        entity: String(raw?.entity ?? ''),
        entity_title: String(raw?.entity_title ?? ''),
        urgency: String(raw?.urgency ?? 'medium'),
        urgency_display: String(
            raw?.urgency_display ??
            (raw?.urgency
                ? raw.urgency
                    .charAt(0)
                    .toUpperCase() +
                raw.urgency.slice(1)
                : 'Medium')
        ),
        status: serverStatus,
        status_display: String(
            raw?.status_display ?? serverStatus
        ),
        total_line_count: Number(raw?.total_line_count ?? 0),
        fulfilled_line_count: Number(
            raw?.fulfilled_line_count ?? 0
        ),
        pending_line_count: Number(
            raw?.pending_line_count ?? 0
        ),
        expires_at: raw?.expires_at ?? null,
        created: String(raw?.created ?? ts),
        cached_at: String(raw?.cached_at ?? ts),
        is_pending: false,
        draft_id:
            raw?.draft_id ?? previous?.draft_id ?? undefined,
        items_preview: itemsPreview,
    };
}

function extractRequestsArray(payload: any): any[] | null {
    const p = payload?.data ?? payload;
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.results)) return p.results;
    if (Array.isArray(p?.requests)) return p.requests;
    if (Array.isArray(p?.product_requests))
        return p.product_requests;
    if (Array.isArray(p?.my_requests)) return p.my_requests;
    if (Array.isArray(p?.data?.results)) return p.data.results;
    if (Array.isArray(p?.data?.requests)) return p.data.requests;
    if (Array.isArray(p?.data?.product_requests))
        return p.data.product_requests;
    if (Array.isArray(p?.data?.my_requests))
        return p.data.my_requests;
    return null;
}

function areRequestsEqual(
    a: ProductRequestSummary[],
    b: ProductRequestSummary[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.remote_id !== y.remote_id ||
            x.draft_id !== y.draft_id ||
            x.status !== y.status ||
            x.fulfilled_line_count !==
            y.fulfilled_line_count ||
            x.pending_line_count !== y.pending_line_count ||
            x.is_pending !== y.is_pending ||
            (x.items_preview?.length ?? 0) !==
            (y.items_preview?.length ?? 0)
        ) {
            return false;
        }
    }
    return true;
}

/* =========================================================
 * Storage
 * ======================================================= */

async function writeRequestsToStorage(
    data: ProductRequestSummary[]
): Promise<void> {
    const tasks: Promise<any>[] = [];

    tasks.push(
        db.saveProductRequests(data).catch((err) =>
            warn('Requests write failed:', err)
        )
    );

    if (!isWeb) {
        tasks.push(
            AsyncStorage.setItem(
                NATIVE_REQUESTS_SYNCED_AT,
                new Date().toISOString()
            ).catch(() => null)
        );
    }

    await Promise.allSettled(tasks);
}

async function readRequestsFromStorage(): Promise<
    ProductRequestSummary[]
> {
    try {
        const viaDb = await db.getProductRequests();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readRequestsFromStorage', err);
        return [];
    }
}

async function readPendingCreatesFromStorage(): Promise<
    PendingRequestCreate[]
> {
    try {
        const viaDb =
            await db.getRetailerProductRequestPendingCreates();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readPendingCreatesFromStorage', err);
        return [];
    }
}

async function writePendingCreatesToStorage(
    creates: PendingRequestCreate[]
): Promise<void> {
    try {
        await db.saveRetailerProductRequestPendingCreates(
            creates
        );
    } catch (err) {
        warn('writePendingCreatesToStorage', err);
    }
}

async function readPendingOffersFromStorage(): Promise<
    PendingOfferAction[]
> {
    try {
        const viaDb =
            await db.getRetailerProductRequestPendingOffers();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readPendingOffersFromStorage', err);
        return [];
    }
}

async function writePendingOffersToStorage(
    offers: PendingOfferAction[]
): Promise<void> {
    try {
        await db.saveRetailerProductRequestPendingOffers(offers);
    } catch (err) {
        warn('writePendingOffersToStorage', err);
    }
}

async function ensureSchema(): Promise<void> {
    try {
        if (isWeb) {
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
                NATIVE_REQUESTS_SYNCED_AT
            );
            await AsyncStorage.setItem(
                NATIVE_SCHEMA_KEY,
                String(CACHE_SCHEMA_VERSION)
            );
        }
    } catch (e) {
        warn('ensureSchema', e);
    }
}

/* =========================================================
 * Provider
 * ======================================================= */

export const RetailerProductRequestsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();
    const { isOnline } = useNetworkStatus();

    /* ---------------- State ---------------- */

    const [requests, setRequestsState] = useState<
        ProductRequestSummary[]
    >([]);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [dataSource, setDataSource] = useState<
        'server' | 'cache' | 'none'
    >('none');
    const [pendingRequestCount, setPendingRequestCount] =
        useState(0);
    const [pendingOfferCount, setPendingOfferCount] = useState(0);
    const [queueRevision, setQueueRevision] = useState(0);
    const [isDraftsHydrated, setIsDraftsHydrated] = useState(false);

    /* ---------------- APIs ---------------- */

    const getRequestsApi = useApi<any>(async () =>
        await retailersApi.getMyProductRequestsAction({})
    );
    const createRequestsApi = useApi<any>(async (payload: any) =>
        await retailersApi.createProductRequestAction(payload)
    );
    const confirmOffersApi = useApi<any>(async (payload: any) =>
        await retailersApi.confirmProductRequestOffersAction(payload)
    );

    /* ---------------- Refs ---------------- */

    const wsRef = useRef<WebSocket | null>(null);
    const requestsStateRef = useRef<ProductRequestSummary[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const wsGenerationRef = useRef(0);
    const wsReconnectAttemptRef = useRef(0);
    const pendingFlushIntervalRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const createsFlushLockRef = useRef(false);
    const offersFlushLockRef = useRef(false);
    const isHydratedRef = useRef(false);

    const pendingCreatesRef = useRef<PendingRequestCreate[]>([]);
    const pendingOffersRef = useRef<PendingOfferAction[]>([]);

    useEffect(() => {
        requestsStateRef.current = requests;
    }, [requests]);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    /* ---------------- Derived ---------------- */

    const drafts = useMemo<RequestDraftItem[]>(
        () => requests.flatMap((r) => summaryToDrafts(r)),
        [requests]
    );

    const requestsById = useMemo(() => {
        const map: Record<string, ProductRequestSummary> = {};
        for (const r of requests) {
            const key = r.remote_id ?? r.draft_id;
            if (key) map[key] = r;
        }
        return map;
    }, [requests]);

    const draftCount = drafts.length;

    const draftTotalQuantity = useMemo(
        () =>
            drafts.reduce(
                (sum, i) => sum + (i.quantity || 0),
                0
            ),
        [drafts]
    );

    const draftUniqueWholesalerIds = useMemo(() => {
        const set = new Set<string>();
        for (const item of drafts) {
            for (const wid of item.target_wholesaler_ids)
                set.add(wid);
        }
        return Array.from(set);
    }, [drafts]);

    /* ---------------- Logging ---------------- */

    useEffect(() => {
        if (!__DEV__) return;
        console.log('[ProductRequests] requests', {
            count: requests.length,
            pending: requests.filter((r) => r.is_pending).length,
            remote_ids: requests.map((r) => r.remote_id),
            draft_ids: requests.map((r) => r.draft_id),
        });
    }, [requests]);

    useEffect(() => {
        if (!__DEV__) return;
        console.log('[ProductRequests] drafts', {
            count: drafts.length,
            items: drafts.map((d) => ({
                product_id: d.product_id,
                product_title: d.product_title,
                quantity: d.quantity,
                urgency: d.urgency,
                wholesalers: d.wholesalers?.map((w) => w.title),
            })),
        });
    }, [drafts]);

    useEffect(() => {
        if (!__DEV__) return;
        console.log('[ProductRequests] pending queues', {
            creates: pendingRequestCount,
            offers: pendingOfferCount,
            revision: queueRevision,
        });
    }, [pendingRequestCount, pendingOfferCount, queueRevision]);

    /* ---------------------------------------------------------
     * Persist-on-change
     * ------------------------------------------------------- */

    useEffect(() => {
        if (!isHydratedRef.current) return;
        void writeRequestsToStorage(requests).catch((err) =>
            warn('persist-on-change failed:', err)
        );
    }, [requests]);

    /* ---------------- Local patch ---------------- */

    const patchRequestLocally = useCallback(
        (
            remoteId: string,
            partial: Partial<ProductRequestSummary>
        ) => {
            setRequestsState((prev) => {
                let changed = false;
                const next = prev.map((r) => {
                    const matches =
                        (remoteId && r.remote_id === remoteId) ||
                        (!remoteId && !r.remote_id);
                    if (!matches) return r;
                    changed = true;
                    return { ...r, ...partial };
                });
                return changed ? next : prev;
            });
        },
        []
    );

    /* ---------------- Snapshot commit ---------------- */

    const commitSnapshot = useCallback(
        async (raw: any[], source: 'server' | 'cache') => {
            const nowStr = new Date().toISOString();

            const prevByRemoteId = new Map<
                string,
                ProductRequestSummary
            >();
            const prevByDraftId = new Map<
                string,
                ProductRequestSummary
            >();
            for (const r of requestsStateRef.current) {
                if (r.remote_id)
                    prevByRemoteId.set(r.remote_id, r);
                if (r.draft_id)
                    prevByDraftId.set(r.draft_id, r);
            }

            const serverRemoteIds = new Set(
                raw
                    .map((r) =>
                        String(r?.remote_id ?? r?.id ?? '')
                    )
                    .filter(Boolean)
            );
            const serverDraftIds = new Set(
                raw
                    .map((r) => String(r?.draft_id ?? ''))
                    .filter(Boolean)
            );

            // Preserve local drafts the server hasn't acknowledged.
            const localDrafts =
                requestsStateRef.current.filter((r) => {
                    if (r.is_pending !== true) return false;
                    if (
                        r.remote_id &&
                        serverRemoteIds.has(r.remote_id)
                    )
                        return false;
                    if (
                        r.draft_id &&
                        serverDraftIds.has(r.draft_id)
                    )
                        return false;
                    return true;
                });

            const normalized = raw.map((r) => {
                const remoteId = String(
                    r?.remote_id ?? r?.id ?? ''
                );
                const draftId = r?.draft_id
                    ? String(r.draft_id)
                    : '';
                const previous =
                    (remoteId &&
                        prevByRemoteId.get(remoteId)) ||
                    (draftId && prevByDraftId.get(draftId)) ||
                    undefined;
                return normalizeRequestSummary(
                    r,
                    nowStr,
                    previous
                );
            });

            const merged = [...localDrafts, ...normalized];

            log(
                `commitSnapshot — writing ${merged.length} rows from ${source} (${localDrafts.length} local drafts preserved)`
            );

            await writeRequestsToStorage(merged);

            requestsStateRef.current = merged;
            setRequestsState((prev) =>
                areRequestsEqual(prev, merged) ? prev : merged
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

    /* ---------------- Single patch ---------------- */

    const commitSinglePatch = useCallback(async (patch: any) => {
        const remoteId = patch?.remote_id
            ? String(patch.remote_id)
            : null;
        const draftId = patch?.draft_id
            ? String(patch.draft_id)
            : null;
        const reqId =
            remoteId ?? draftId ?? patch?.request_id ?? patch?.id;
        if (!reqId) return;

        const nowStr = new Date().toISOString();
        const current = requestsStateRef.current;
        const idx = current.findIndex(
            (r) =>
                (remoteId && r.remote_id === remoteId) ||
                (draftId && r.draft_id === draftId)
        );

        let next: ProductRequestSummary[];
        if (idx >= 0) {
            const merged: ProductRequestSummary = {
                ...current[idx],
                ...patch,
                remote_id: remoteId ?? current[idx].remote_id,
                draft_id: draftId ?? current[idx].draft_id,
                items_preview:
                    patch.items_preview ??
                    current[idx].items_preview,
            };
            next = current.map((r, i) =>
                i === idx ? merged : r
            );
        } else {
            next = [
                normalizeRequestSummary(patch, nowStr),
                ...current,
            ];
        }

        await writeRequestsToStorage(next);
        requestsStateRef.current = next;
        setRequestsState(next);
        setDataSource('server');
        setQueueRevision((r) => r + 1);
        setLastSyncedTime(
            new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            })
        );
    }, []);

    /* ---------------- Remote sync ---------------- */

    const runRemoteRequestsSynchronizer = useCallback(async () => {
        if (!token) {
            log('Sync skipped — no token');
            return;
        }
        if (!isOnlineRef.current) {
            log('Sync skipped — offline');
            return;
        }

        try {
            await getRequestsApi.request();
        } catch (e) {
            warn('HTTP request threw:', e);
            return;
        }

        const payload = getRequestsApi.data;

        if (!payload) {
            warn('HTTP returned no payload');
            return;
        }

        const data = extractRequestsArray(payload);

        if (!Array.isArray(data)) {
            warn('Unexpected HTTP shape', payload);
            return;
        }

        await commitSnapshot(data, 'server');
    }, [token, getRequestsApi, commitSnapshot]);

    /* ---------------------------------------------------------
     * Flushers — declared before submitDrafts, which references
     * flushPendingCreates in its dependency array.
     * ------------------------------------------------------- */

    const flushPendingCreates = useCallback(async () => {
        if (createsFlushLockRef.current) return;
        if (!token || !isOnlineRef.current) return;
        const queue = pendingCreatesRef.current;
        if (queue.length === 0) return;

        createsFlushLockRef.current = true;
        const succeeded = new Set<string>();

        try {
            for (const create of queue) {
                try {
                    const res = await createRequestsApi.request({
                        action: 'CreateRequest',
                        draft_id: create.draft_id,
                        urgency:
                            create.payload.urgency ?? 'medium',
                        items: create.payload.items.map(
                            (i) => ({
                                product_id: i.product_id,
                                requested_quantity:
                                    i.requested_quantity,
                                urgency: i.urgency,
                                note: i.note,
                                target_wholesaler_ids:
                                    i.target_wholesaler_ids ??
                                    [],
                            })
                        ),
                        note: create.payload.note ?? '',
                    });

                    if (__DEV__) {
                        console.log(
                            '[ProductRequestsSync] CreateRequest → response',
                            JSON.stringify(res, null, 2)
                        );
                    }

                    const data = res?.data ?? res;
                    const isOk =
                        res?.ok === true ||
                        data?.response_code === 0 ||
                        data?.request;

                    if (isOk) {
                        succeeded.add(create.id);

                        const echoed = data?.request ?? null;
                        if (echoed) {
                            // Replace the optimistic row with the
                            // server's PUBLISHED version, keeping
                            // local-only display data.
                            const localRow =
                                requestsStateRef.current.find(
                                    (r) =>
                                        r.remote_id ===
                                        create.local_row_id ||
                                        r.draft_id ===
                                        create.draft_id
                                );
                            const merged = normalizeRequestSummary(
                                echoed,
                                new Date().toISOString(),
                                localRow
                            );
                            merged.is_pending = false;

                            const without =
                                requestsStateRef.current.filter(
                                    (r) =>
                                        r.remote_id !==
                                        create.local_row_id &&
                                        r.draft_id !==
                                        create.draft_id
                                );
                            const next = [
                                merged,
                                ...without,
                            ];
                            requestsStateRef.current = next;
                            setRequestsState(next);
                            await writeRequestsToStorage(
                                next
                            );
                        } else {
                            // Server didn't echo — flip local row.
                            const next =
                                requestsStateRef.current.map(
                                    (r) =>
                                        (r.remote_id ===
                                            create.local_row_id ||
                                            r.draft_id ===
                                            create.draft_id)
                                            ? {
                                                ...r,
                                                is_pending:
                                                    false,
                                                status:
                                                    'PUBLISHED',
                                                status_display:
                                                    'Published',
                                            }
                                            : r
                                );
                            requestsStateRef.current = next;
                            setRequestsState(next);
                            await writeRequestsToStorage(
                                next
                            );
                            void runRemoteRequestsSynchronizer();
                        }
                    } else {
                        warn(
                            'flushPendingCreates — rejected',
                            create.id,
                            data
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

            if (succeeded.size > 0) {
                pendingCreatesRef.current =
                    pendingCreatesRef.current.filter(
                        (c) => !succeeded.has(c.id)
                    );
                setPendingRequestCount(
                    pendingCreatesRef.current.length
                );
                setQueueRevision((r) => r + 1);
                await writePendingCreatesToStorage(
                    pendingCreatesRef.current
                );
            }
        } finally {
            createsFlushLockRef.current = false;
        }
    }, [
        token,
        createRequestsApi,
        runRemoteRequestsSynchronizer,
    ]);

    const flushPendingOfferActions = useCallback(async () => {
        if (offersFlushLockRef.current) return;
        if (!token || !isOnlineRef.current) return;
        const queue = pendingOffersRef.current;
        if (queue.length === 0) return;

        const byRequest: Record<string, PendingOfferAction[]> =
            {};
        for (const a of queue) {
            byRequest[a.request_id] =
                byRequest[a.request_id] ?? [];
            byRequest[a.request_id].push(a);
        }

        offersFlushLockRef.current = true;
        const succeeded = new Set<string>();

        try {
            for (const [requestId, actions] of Object.entries(
                byRequest
            )) {
                const payload = {
                    action: 'ConfirmOffers',
                    request_id: requestId,
                    confirmations: actions
                        .filter((a) => a.action === 'confirm')
                        .map((a) => ({
                            offer_id: a.offer_id,
                            response_note: a.note ?? '',
                        })),
                    declinations: actions
                        .filter((a) => a.action === 'decline')
                        .map((a) => ({
                            offer_id: a.offer_id,
                            reason: a.note ?? '',
                        })),
                };

                try {
                    const res =
                        await confirmOffersApi.request(payload);
                    const data = res?.data ?? res;
                    const isOk =
                        res?.ok === true ||
                        data?.response_code === 0;

                    if (isOk) {
                        for (const a of actions)
                            succeeded.add(a.id);
                    } else {
                        warn(
                            'flushPendingOfferActions — rejected',
                            requestId,
                            data
                        );
                    }
                } catch (e) {
                    warn(
                        'flushPendingOfferActions — threw',
                        requestId,
                        e
                    );
                }
            }

            if (succeeded.size > 0) {
                pendingOffersRef.current =
                    pendingOffersRef.current.filter(
                        (a) => !succeeded.has(a.id)
                    );
                setPendingOfferCount(
                    pendingOffersRef.current.length
                );
                setQueueRevision((r) => r + 1);
                await writePendingOffersToStorage(
                    pendingOffersRef.current
                );
                await runRemoteRequestsSynchronizer();
            }
        } finally {
            offersFlushLockRef.current = false;
        }
    }, [
        token,
        confirmOffersApi,
        runRemoteRequestsSynchronizer,
    ]);

    /* ---------------------------------------------------------
     * submitDrafts — send the basket once; server publishes
     * ------------------------------------------------------- */

    const submitDrafts = useCallback(async () => {
        const pending = requestsStateRef.current.find(
            (r) => r.is_pending === true
        );
        if (!pending) {
            return { requestIds: [], draftCount: 0 };
        }

        const preview = pending.items_preview ?? [];
        if (preview.length === 0) {
            return { requestIds: [], draftCount: 0 };
        }

        const draftId =
            pending.draft_id ??
            buildDraftId(
                user?.id ?? '',
                preview[0]?.product_id ?? '',
                Date.now()
            );

        const entry: PendingRequestCreate = {
            id: `req-create-${draftId}`,
            draft_id: draftId,
            local_row_id: pending.remote_id ?? draftId,
            payload: {
                items: preview.map((p) => ({
                    product_id: p.product_id,
                    requested_quantity:
                        p.requested_quantity ?? 1,
                    urgency:
                        (p.urgency as
                            | 'low'
                            | 'medium'
                            | 'high') ?? 'medium',
                    note: p.note ?? '',
                    target_wholesaler_ids:
                        resolveLineWholesalers(p).map(
                            (w) => w.id
                        ),
                })) as any,
                note: '',
            },
            created_at: new Date().toISOString(),
        };

        pendingCreatesRef.current = [
            ...pendingCreatesRef.current,
            entry,
        ];
        setPendingRequestCount(pendingCreatesRef.current.length);
        setQueueRevision((r) => r + 1);
        await writePendingCreatesToStorage(
            pendingCreatesRef.current
        );

        // Optimistically flip the local row.
        const next = requestsStateRef.current.map((r) =>
            r.is_pending === true
                ? {
                    ...r,
                    is_pending: false,
                    status: 'PUBLISHED',
                    status_display: 'Published',
                }
                : r
        );
        requestsStateRef.current = next;
        setRequestsState(next);
        await writeRequestsToStorage(next);

        if (isOnlineRef.current && token) {
            void flushPendingCreates();
        }

        return {
            requestIds: [draftId],
            draftCount: preview.length,
        };
    }, [token, user?.id, flushPendingCreates]);

    /* ---------------------------------------------------------
     * createRequest — direct-create path, one-shot
     * ------------------------------------------------------- */

    const createRequest = useCallback(
        async (payload: PendingRequestCreate['payload']) => {
            const nowStr = new Date().toISOString();
            const draftId = buildDraftId(
                user?.id ?? '',
                payload.items[0]?.product_id ?? '',
                Date.now()
            );

            const entry: PendingRequestCreate = {
                id: `req-create-${draftId}`,
                draft_id: draftId,
                local_row_id: draftId,
                payload,
                created_at: nowStr,
            };

            const firstUrgency =
                payload.items[0]?.urgency ?? 'medium';
            const urgencyLabel =
                firstUrgency.charAt(0).toUpperCase() +
                firstUrgency.slice(1);

            const itemsPreview: ProductRequestSummaryLineItem[] =
                payload.items.map((i) => {
                    const raw = i as any;
                    const ids: string[] =
                        raw.target_wholesaler_ids ?? [];
                    const titles: string[] =
                        raw.target_wholesaler_titles ?? [];
                    const objects = raw.wholesalers;

                    const wholesalers =
                        Array.isArray(objects) &&
                            objects.length > 0
                            ? objects
                            : ids.map((id, idx) => ({
                                id,
                                title: titles[idx] ?? '',
                            }));

                    return {
                        product_id: i.product_id,
                        product_title: raw.product_title,
                        requested_quantity:
                            i.requested_quantity,
                        urgency: i.urgency,
                        note: i.note,
                        wholesalers,
                        wholesaler_titles: wholesalers.map(
                            (w) => w.title
                        ),
                        target_wholesaler_ids: wholesalers.map(
                            (w) => w.id
                        ),
                    };
                });

            const optimistic: ProductRequestSummary = {
                remote_id: null,
                request_number: `PENDING-${draftId
                    .slice(-6)
                    .toUpperCase()}`,
                entity: '',
                entity_title: '',
                urgency: firstUrgency,
                urgency_display: urgencyLabel,
                status: 'PUBLISHED',
                status_display: 'Submitting...',
                total_line_count: payload.items.length,
                fulfilled_line_count: 0,
                pending_line_count: payload.items.length,
                expires_at: null,
                created: nowStr,
                cached_at: nowStr,
                is_pending: true,
                draft_id: draftId,
                items_preview: itemsPreview,
            };

            const next = [
                optimistic,
                ...requestsStateRef.current,
            ];
            requestsStateRef.current = next;
            setRequestsState(next);
            await writeRequestsToStorage(next);

            pendingCreatesRef.current = [
                ...pendingCreatesRef.current,
                entry,
            ];
            setPendingRequestCount(
                pendingCreatesRef.current.length
            );
            setQueueRevision((r) => r + 1);
            await writePendingCreatesToStorage(
                pendingCreatesRef.current
            );

            if (isOnlineRef.current && token) {
                void flushPendingCreates();
            }

            return draftId;
        },
        [token, user?.id, flushPendingCreates]
    );

    /* ---------------------------------------------------------
     * Draft actions — local-only
     * ------------------------------------------------------- */

    const addDraftItem = useCallback(
        (item: Omit<RequestDraftItem, 'added_at'>) => {
            const prev = requestsStateRef.current;
            const nowStr = new Date().toISOString();

            const pendingIdx = prev.findIndex(
                (r) => r.is_pending === true
            );

            // Normalize wholesalers from whichever shape the caller
            // provided.
            const wholesalers =
                Array.isArray(item.wholesalers) &&
                    item.wholesalers.length > 0
                    ? item.wholesalers
                    : (item.target_wholesaler_ids ?? []).map(
                        (id, i) => ({
                            id,
                            title:
                                item
                                    .target_wholesaler_titles?.[
                                i
                                ] ?? '',
                        })
                    );

            const lineItem: ProductRequestSummaryLineItem = {
                product_id: item.product_id,
                product_title: item.product_title,
                requested_quantity: item.quantity,
                urgency: item.urgency,
                note: item.note,
                wholesalers,
                wholesaler_titles: wholesalers.map(
                    (w) => w.title
                ),
                target_wholesaler_ids: wholesalers.map(
                    (w) => w.id
                ),
            };

            let next: ProductRequestSummary[];

            if (pendingIdx >= 0) {
                const row = prev[pendingIdx];
                const existing = row.items_preview ?? [];
                const dupIdx = existing.findIndex(
                    (p) => p.product_id === item.product_id
                );

                const mergedItems =
                    dupIdx >= 0
                        ? existing.map((p, i) =>
                            i === dupIdx ? lineItem : p
                        )
                        : [...existing, lineItem];

                const updated: ProductRequestSummary = {
                    ...row,
                    total_line_count: mergedItems.length,
                    pending_line_count: mergedItems.length,
                    items_preview: mergedItems,
                };

                next = prev.slice();
                next[pendingIdx] = updated;
            } else {
                const createdMs = Date.now();
                const userId = user?.id ?? '';
                const draftId = buildDraftId(
                    userId,
                    item.product_id,
                    createdMs
                );

                const draft: ProductRequestSummary = {
                    remote_id: null,
                    request_number: `DRAFT-${createdMs
                        .toString(36)
                        .slice(-6)
                        .toUpperCase()}`,
                    entity: user?.entity ?? '',
                    entity_title: user?.entity_title ?? '',
                    urgency: item.urgency,
                    urgency_display:
                        item.urgency
                            .charAt(0)
                            .toUpperCase() +
                        item.urgency.slice(1),
                    status: 'DRAFT',
                    status_display: 'Draft',
                    total_line_count: 1,
                    fulfilled_line_count: 0,
                    pending_line_count: 1,
                    expires_at: null,
                    created: nowStr,
                    cached_at: nowStr,
                    is_pending: true,
                    draft_id: draftId,
                    items_preview: [lineItem],
                };

                next = [draft, ...prev];
            }

            requestsStateRef.current = next;
            setRequestsState(next);

            void writeRequestsToStorage(next).catch((err) =>
                warn('addDraftItem write failed:', err)
            );
        },
        [user?.id, user?.entity, user?.entity_title]
    );

    const removeDraftItem = useCallback((productId: string) => {
        const prev = requestsStateRef.current;
        const pendingIdx = prev.findIndex(
            (r) => r.is_pending === true
        );
        if (pendingIdx < 0) return;

        const row = prev[pendingIdx];
        const remaining = (row.items_preview ?? []).filter(
            (p) => p.product_id !== productId
        );

        let next: ProductRequestSummary[];

        if (remaining.length === 0) {
            next = prev.filter((_, i) => i !== pendingIdx);
        } else {
            const updated: ProductRequestSummary = {
                ...row,
                total_line_count: remaining.length,
                pending_line_count: remaining.length,
                items_preview: remaining,
            };
            next = prev.slice();
            next[pendingIdx] = updated;
        }

        requestsStateRef.current = next;
        setRequestsState(next);

        void writeRequestsToStorage(next).catch((err) =>
            warn('removeDraftItem write failed:', err)
        );
    }, []);

    const updateDraftItem = useCallback(
        (productId: string, patch: Partial<RequestDraftItem>) => {
            const prev = requestsStateRef.current;
            const pendingIdx = prev.findIndex(
                (r) => r.is_pending === true
            );
            if (pendingIdx < 0) return;

            const row = prev[pendingIdx];
            const items = row.items_preview ?? [];
            const idx = items.findIndex(
                (p) => p.product_id === productId
            );
            if (idx < 0) return;

            const first = items[idx];

            // Determine the merged wholesalers array.
            let mergedWholesalers =
                first.wholesalers ??
                (first.target_wholesaler_ids ?? []).map(
                    (id, i) => ({
                        id,
                        title:
                            first.wholesaler_titles?.[i] ?? '',
                    })
                );

            if (
                Array.isArray(patch.wholesalers) &&
                patch.wholesalers.length > 0
            ) {
                mergedWholesalers = patch.wholesalers;
            } else if (
                patch.target_wholesaler_ids !== undefined
            ) {
                const ids = patch.target_wholesaler_ids;
                const titles =
                    patch.target_wholesaler_titles ?? [];
                mergedWholesalers = ids.map((id, i) => ({
                    id,
                    title: titles[i] ?? '',
                }));
            }

            const updatedLine: ProductRequestSummaryLineItem =
            {
                ...first,
                ...(patch.product_title !== undefined
                    ? {
                        product_title:
                            patch.product_title,
                    }
                    : {}),
                ...(patch.quantity !== undefined
                    ? {
                        requested_quantity:
                            patch.quantity,
                    }
                    : {}),
                ...(patch.urgency !== undefined
                    ? { urgency: patch.urgency }
                    : {}),
                ...(patch.note !== undefined
                    ? { note: patch.note }
                    : {}),
                wholesalers: mergedWholesalers,
                wholesaler_titles:
                    mergedWholesalers.map(
                        (w) => w.title
                    ),
                target_wholesaler_ids:
                    mergedWholesalers.map((w) => w.id),
            };

            const mergedItems = items.map((p, i) =>
                i === idx ? updatedLine : p
            );

            const updatedRow: ProductRequestSummary = {
                ...row,
                items_preview: mergedItems,
            };

            const next = prev.slice();
            next[pendingIdx] = updatedRow;

            requestsStateRef.current = next;
            setRequestsState(next);

            void writeRequestsToStorage(next).catch((err) =>
                warn('updateDraftItem write failed:', err)
            );
        },
        []
    );

    const hasDraftItem = useCallback(
        (productId: string) =>
            drafts.some((d) => d.product_id === productId),
        [drafts]
    );

    const clearDraft = useCallback(() => {
        const prev = requestsStateRef.current;
        const next = prev.filter(
            (r) => r.is_pending !== true
        );

        requestsStateRef.current = next;
        setRequestsState(next);

        void writeRequestsToStorage(next).catch((err) =>
            warn('clearDraft write failed:', err)
        );
    }, []);

    /* ---------------------------------------------------------
     * queueOfferAction
     * ------------------------------------------------------- */

    const queueOfferAction = useCallback(
        async (
            requestId: string,
            offerId: string,
            action: 'confirm' | 'decline',
            note?: string
        ) => {
            const nowStr = new Date().toISOString();
            const entry: PendingOfferAction = {
                id: `offer-${offerId}-${Date.now()}`,
                request_id: requestId,
                offer_id: offerId,
                action,
                note,
                created_at: nowStr,
            };

            pendingOffersRef.current = [
                ...pendingOffersRef.current.filter(
                    (a) => a.offer_id !== offerId
                ),
                entry,
            ];
            setPendingOfferCount(
                pendingOffersRef.current.length
            );
            setQueueRevision((r) => r + 1);
            await writePendingOffersToStorage(
                pendingOffersRef.current
            );

            if (isOnlineRef.current && token) {
                void flushPendingOfferActions();
            }
        },
        [token, flushPendingOfferActions]
    );

    /* ---------------------------------------------------------
     * Public setter
     * ------------------------------------------------------- */

    const setRequests = useCallback(
        async (data: ProductRequestSummary[]) => {
            await commitSnapshot(data, 'server');
        },
        [commitSnapshot]
    );

    /* ---------------------------------------------------------
     * Hydrate
     * ------------------------------------------------------- */

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await readRequestsFromStorage();

            log('Hydrate — cached rows:', cached.length);

            if (cached.length > 0) {
                requestsStateRef.current = cached;
                setRequestsState((prev) =>
                    areRequestsEqual(prev, cached)
                        ? prev
                        : cached
                );
                setDataSource('cache');
                setQueueRevision((r) => r + 1);
            } else {
                setDataSource('none');
            }

            setIsDraftsHydrated(true);
            isHydratedRef.current = true;

            const creates =
                await readPendingCreatesFromStorage();
            pendingCreatesRef.current = creates;
            setPendingRequestCount(creates.length);

            const offers =
                await readPendingOffersFromStorage();
            pendingOffersRef.current = offers;
            setPendingOfferCount(offers.length);

            if (!isWeb) {
                const syncedAt = await AsyncStorage.getItem(
                    NATIVE_REQUESTS_SYNCED_AT
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
            setIsDraftsHydrated(true);
            isHydratedRef.current = true;
            return [];
        }
    }, []);

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
                    `${WS_REQUESTS_URL}?token=${currentToken}`
                );
                wsRef.current = ws;

                ws.onopen = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    setIsLiveConnected(true);
                    wsReconnectAttemptRef.current = 0;
                    log('WebSocket — connected');
                };

                ws.onmessage = async (event) => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;

                    try {
                        const parsed = JSON.parse(
                            event.data
                        );

                        const list =
                            extractRequestsArray(parsed);
                        if (Array.isArray(list)) {
                            await commitSnapshot(
                                list,
                                'server'
                            );
                            return;
                        }

                        if (
                            parsed?.request_id ||
                            parsed?.id ||
                            parsed?.remote_id
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
                        const attempt =
                            wsReconnectAttemptRef.current++;
                        const exp = Math.min(
                            WS_RECONNECT_BASE_MS *
                            2 ** attempt,
                            WS_RECONNECT_MAX_MS
                        );
                        const jitter = Math.floor(
                            Math.random() * 1000
                        );
                        const delay = exp + jitter;

                        log(
                            `WebSocket — reconnecting in ${delay}ms (attempt ${attempt + 1})`
                        );

                        reconnectTimeoutRef.current =
                            setTimeout(
                                () =>
                                    establishLiveWebSocketSync(
                                        currentToken
                                    ),
                                delay
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
     * Manual reconnect
     * ------------------------------------------------------- */

    const reconnectLiveSync = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            if (token) {
                wsReconnectAttemptRef.current = 0;
                await runRemoteRequestsSynchronizer();
                establishLiveWebSocketSync(token);
            }
        } catch (e) {
            warn('reconnectLiveSync threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        token,
        runRemoteRequestsSynchronizer,
        establishLiveWebSocketSync,
    ]);

    /* ---------------------------------------------------------
     * Composite flusher
     * ------------------------------------------------------- */

    const flushAll = useCallback(async () => {
        await Promise.all([
            flushPendingCreates(),
            flushPendingOfferActions(),
        ]);
    }, [flushPendingCreates, flushPendingOfferActions]);

    /* ---------------------------------------------------------
     * Debug helper
     * ------------------------------------------------------- */

    const debugReadLocal = useCallback(async () => {
        const localRequests = await readRequestsFromStorage();

        if (__DEV__) {
            console.log(
                '[ProductRequestsSync] DEBUG — rows in storage:',
                localRequests.length
            );
            console.table(localRequests);
        }

        return {
            requests: localRequests,
            drafts: localRequests.flatMap((r) =>
                summaryToDrafts(r)
            ),
        };
    }, []);

    /* ---------------------------------------------------------
     * Stable refs for bootstrap
     * ------------------------------------------------------- */

    const actionsRef = useRef({
        hydrateFromLocalDB,
        runRemoteRequestsSynchronizer,
        establishLiveWebSocketSync,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            runRemoteRequestsSynchronizer,
            establishLiveWebSocketSync,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap
     * ------------------------------------------------------- */

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await ensureSchema();
            if (cancelled) return;

            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            if (token) {
                await actionsRef.current.runRemoteRequestsSynchronizer();
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
                        void flushPendingCreates();
                        void flushPendingOfferActions();
                    }, PENDING_FLUSH_INTERVAL_MS);
            } else {
                requestsStateRef.current = [];
                setRequestsState([]);
                setDataSource('none');
                if (wsRef.current) {
                    try {
                        wsRef.current.onclose = null;
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

        void init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
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
     * Network recovery
     * ------------------------------------------------------- */

    useEffect(() => {
        if (!token) return;
        if (isOnline) {
            log('Back online — flushing and refetching');
            void flushPendingCreates();
            void flushPendingOfferActions();
            void runRemoteRequestsSynchronizer();
            establishLiveWebSocketSync(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Context value
     * ------------------------------------------------------- */

    const value =
        useMemo<RetailerProductRequestsSyncContextType>(
            () => ({
                requests,
                requestsById,

                drafts,
                draftCount,
                draftTotalQuantity,
                draftUniqueWholesalerIds,
                isDraftsHydrated,

                isSyncing: getRequestsApi.loading,
                isManualRefreshing,
                isLiveConnected,
                lastSyncedTime,
                dataSource,

                pendingRequests: pendingCreatesRef.current,
                pendingOffers: pendingOffersRef.current,
                pendingRequestCount,
                pendingOfferCount,
                queueRevision,

                addDraftItem,
                removeDraftItem,
                updateDraftItem,
                hasDraftItem,
                clearDraft,

                submitDrafts,
                createRequest,

                queueOfferAction,

                setRequests,
                patchRequestLocally,
                flushPendingCreates,
                flushPendingOfferActions,
                flushAll,
                reconnectLiveSync,

                debugReadLocal,
            }),
            [
                requests,
                requestsById,
                drafts,
                draftCount,
                draftTotalQuantity,
                draftUniqueWholesalerIds,
                isDraftsHydrated,
                getRequestsApi.loading,
                isManualRefreshing,
                isLiveConnected,
                lastSyncedTime,
                dataSource,
                pendingRequestCount,
                pendingOfferCount,
                queueRevision,
                addDraftItem,
                removeDraftItem,
                updateDraftItem,
                hasDraftItem,
                clearDraft,
                submitDrafts,
                createRequest,
                queueOfferAction,
                setRequests,
                patchRequestLocally,
                flushPendingCreates,
                flushPendingOfferActions,
                flushAll,
                reconnectLiveSync,
                debugReadLocal,
            ]
        );

    return (
        <RetailerProductRequestsSyncContext.Provider value={value}>
            {children}
        </RetailerProductRequestsSyncContext.Provider>
    );
};

/* =========================================================
 * Hook
 * ======================================================= */

export const useRetailerProductRequestsSync = () => {
    const ctx = useContext(RetailerProductRequestsSyncContext);
    if (!ctx) {
        throw new Error(
            'useRetailerProductRequestsSync must be used within a RetailerProductRequestsSyncProvider'
        );
    }
    return ctx;
};
