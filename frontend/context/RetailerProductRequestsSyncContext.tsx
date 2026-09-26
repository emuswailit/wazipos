// context/RetailerProductRequestsSyncContext.tsx
//
// Sync context for retailer product requests.
//
// The same context serves both audiences — the WebSocket endpoint
// is chosen from the caller's `entity_type`:
//
//   Wholesaler side (GeneralWholesaler | PharmaceuticalWholesaler):
//     wss://api.wazipos.co.ke/ws/wholesalers/products/requests/
//
//   Retailer side (GeneralRetailer | PharmaceuticalRetailer):
//     wss://api.wazipos.co.ke/ws/retailers/products/requests/
//
// Data sources:
//   - WebSocket push (only) — see URLs above
//     Frame shape:  { wholesaler_product_requests: [...] }  (wholesaler)
//                   { retailer_product_requests:   [...] }  (retailer)
//     Single patch: { id | remote_id | request_id, ... }
//   - Local cache:  AsyncStorage + Dexie
//
// HTTP snapshot fetching has been removed. The server is expected to
// push an initial snapshot immediately after the WS handshake.
//
// Field names in the internal cache match the wire payload 1:1.
// `request.items` is the same array the backend sends — no renames.
//
// Pending offline offers are queued in AsyncStorage and flushed on
// connectivity recovery. After a successful flush, the server's own
// push is the only path that refreshes the list.

import wholesalersApi from '@/api/wholesalersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db } from '@/databases/db';
import {
    PendingWholesalerOffer,
    ProductRequestOffer,
    ProductRequestSummary,
    ProductRequestSummaryLineItem,
    WholesalerProductRequestTargetWholesaler,
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

/* =========================================================
 * Types
 * ======================================================= */

interface RetailerProductRequestsSyncContextType {
    requests: ProductRequestSummary[];
    requestsById: Record<string, ProductRequestSummary>;

    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    lastSyncedTime: string;
    dataSource: 'server' | 'cache' | 'none';

    pendingOffers: PendingWholesalerOffer[];
    pendingOfferCount: number;
    queueRevision: number;

    setRequests: (data: ProductRequestSummary[]) => Promise<void>;
    patchRequestLocally: (
        remoteId: string,
        partial: Partial<ProductRequestSummary>
    ) => void;

    queueOfferSubmission: (input: {
        requestId: string;
        lineId: string;
        offeredQuantity: number;
        offeredUnitPrice: number;
        note?: string;
    }) => Promise<void>;

    flushPendingOffers: () => Promise<void>;
    flushAll: () => Promise<void>;
    reconnectLiveSync: () => Promise<void>;

    debugReadLocal: () => Promise<{
        requests: ProductRequestSummary[];
    }>;
}

const RetailerProductRequestsSyncContext = createContext<
    RetailerProductRequestsSyncContextType | undefined
>(undefined);

/* =========================================================
 * Constants
 * ======================================================= */

const REQUESTS_SYNCED_AT_KEY =
    'wazipos_async_wholesaler_product_requests_synced_at';
const REQUESTS_SCHEMA_KEY =
    'wazipos_wholesaler_product_requests_cache_schema';
const PENDING_OFFERS_KEY =
    'wazipos_async_wholesaler_pending_offers';

/* -------- WebSocket endpoints --------
 *
 * The request stream is split by the caller's entity type. Both
 * audiences receive a structurally identical payload; only the
 * envelope key differs.
 */

const WS_URL_WHOLESALER =
    'wss://api.wazipos.co.ke/ws/wholesalers/products/requests/';
const WS_URL_RETAILER =
    'wss://api.wazipos.co.ke/ws/retailers/products/requests/';

const WHOLESALER_ENTITY_TYPES = [
    'GeneralWholesaler',
    'PharmaceuticalWholesaler',
] as const;

const RETAILER_ENTITY_TYPES = [
    'GeneralRetailer',
    'PharmaceuticalRetailer',
] as const;

const CACHE_SCHEMA_VERSION = 2;

const PENDING_FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__)
        console.log('[RetailerProductRequests]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__)
        console.warn('[RetailerProductRequests]', ...args);
};

/* =========================================================
 * WS URL resolver
 *
 * `entity_type` may live at the top level of the profile OR inside
 * one of the roles — the JWT shape varies. Accept either. Matching
 * is exact (case-insensitive) against the canonical values so a
 * typo doesn't silently route a wholesaler to the retailer stream.
 *
 * Returns null when no recognised type is present, so callers can
 * skip the connection rather than hit the wrong endpoint.
 * ======================================================= */

const WHOLESALER_TYPES_LOWER = new Set<string>(
    WHOLESALER_ENTITY_TYPES.map((t) => t.toLowerCase())
);
const RETAILER_TYPES_LOWER = new Set<string>(
    RETAILER_ENTITY_TYPES.map((t) => t.toLowerCase())
);

function resolveWsUrl(
    topLevelType: string | undefined,
    roles: { entity_type?: string }[] | undefined
): string | null {
    const candidates = [
        topLevelType,
        ...(roles ?? []).map((r) => r?.entity_type),
    ]
        .filter((v): v is string => !!v && String(v).trim() !== '')
        .map((v) => String(v).trim());

    for (const raw of candidates) {
        const key = raw.toLowerCase();
        if (WHOLESALER_TYPES_LOWER.has(key))
            return WS_URL_WHOLESALER;
        if (RETAILER_TYPES_LOWER.has(key))
            return WS_URL_RETAILER;
    }

    return null;
}

/* =========================================================
 * Envelope extraction
 * ======================================================= */

function extractRequestsArray(payload: any): any[] | null {
    if (!payload) return null;

    const p = payload?.data ?? payload;

    if (Array.isArray(p)) return p;

    if (Array.isArray(p?.results)) return p.results;

    // Wholesaler-side envelope
    if (Array.isArray(p?.wholesaler_product_requests))
        return p.wholesaler_product_requests;

    // Retailer-side envelope
    if (Array.isArray(p?.retailer_product_requests))
        return p.retailer_product_requests;

    // Generic fallbacks
    if (Array.isArray(p?.requests)) return p.requests;
    if (Array.isArray(p?.product_requests))
        return p.product_requests;

    if (Array.isArray(p?.data?.results)) return p.data.results;
    if (Array.isArray(p?.data?.wholesaler_product_requests))
        return p.data.wholesaler_product_requests;
    if (Array.isArray(p?.data?.retailer_product_requests))
        return p.data.retailer_product_requests;
    if (Array.isArray(p?.data?.requests)) return p.data.requests;
    if (Array.isArray(p?.data?.product_requests))
        return p.data.product_requests;

    return null;
}

/* =========================================================
 * Comparators
 * ======================================================= */

function areOffersEqual(
    a?: ProductRequestOffer[],
    b?: ProductRequestOffer[]
): boolean {
    const A = a ?? [];
    const B = b ?? [];
    if (A.length !== B.length) return false;
    for (let i = 0; i < A.length; i++) {
        const x = A[i];
        const y = B[i];
        if (
            x.id !== y.id ||
            x.wholesaler !== y.wholesaler ||
            x.offered_quantity !== y.offered_quantity ||
            x.offered_unit_price !== y.offered_unit_price ||
            x.status !== y.status ||
            x.retailer_confirmed_at !==
            y.retailer_confirmed_at ||
            x.responded_at !== y.responded_at ||
            x.resulting_order_item !==
            y.resulting_order_item
        ) {
            return false;
        }
    }
    return true;
}

function areLineItemsEqual(
    a?: ProductRequestSummaryLineItem[],
    b?: ProductRequestSummaryLineItem[]
): boolean {
    const A = a ?? [];
    const B = b ?? [];
    if (A.length !== B.length) return false;

    for (let i = 0; i < A.length; i++) {
        const x = A[i];
        const y = B[i];

        if (
            x.id !== y.id ||
            x.request !== y.request ||
            x.product_id !== y.product_id ||
            x.product_title !== y.product_title ||
            x.requested_quantity !== y.requested_quantity ||
            x.urgency !== y.urgency ||
            x.urgency_display !== y.urgency_display ||
            x.note !== y.note ||
            x.status !== y.status ||
            x.status_display !== y.status_display ||
            x.offer_count !== y.offer_count ||
            x.total_offered_quantity !==
            y.total_offered_quantity ||
            x.confirmed_quantity !== y.confirmed_quantity ||
            x.created !== y.created ||
            x.updated !== y.updated
        ) {
            return false;
        }

        const xTargets = x.target_wholesaler_ids ?? [];
        const yTargets = y.target_wholesaler_ids ?? [];
        if (xTargets.length !== yTargets.length) return false;
        for (let j = 0; j < xTargets.length; j++) {
            if (xTargets[j] !== yTargets[j]) return false;
        }

        if (!areOffersEqual(x.offers, y.offers)) return false;
    }
    return true;
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
            x.request_number !== y.request_number ||
            x.entity !== y.entity ||
            x.entity_title !== y.entity_title ||
            x.urgency !== y.urgency ||
            x.urgency_display !== y.urgency_display ||
            x.note !== y.note ||
            x.status !== y.status ||
            x.status_display !== y.status_display ||
            x.total_line_count !== y.total_line_count ||
            x.fulfilled_line_count !== y.fulfilled_line_count ||
            x.pending_line_count !== y.pending_line_count ||
            x.expires_at !== y.expires_at ||
            x.fulfilled_at !== y.fulfilled_at ||
            x.cancelled_at !== y.cancelled_at ||
            x.created !== y.created ||
            x.updated !== y.updated ||
            !areLineItemsEqual(x.items, y.items)
        ) {
            return false;
        }
    }
    return true;
}

/* =========================================================
 * Normalization
 * ======================================================= */

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

    const priorById = new Map<
        string,
        ProductRequestSummaryLineItem
    >();
    const priorByProductId = new Map<
        string,
        ProductRequestSummaryLineItem
    >();
    for (const p of previous?.items ?? []) {
        if (p.id) priorById.set(p.id, p);
        if (p.product_id)
            priorByProductId.set(p.product_id, p);
    }

    const items: ProductRequestSummaryLineItem[] =
        Array.isArray(rawItems)
            ? rawItems.map((it: any) => {
                const lineId = it?.id
                    ? String(it.id)
                    : undefined;
                const productId = String(
                    it?.product_id ??
                    it?.product ??
                    it?.product?.id ??
                    ''
                );
                const prior =
                    (lineId && priorById.get(lineId)) ||
                    priorByProductId.get(productId);

                const rawTargets: any[] = Array.isArray(
                    it?.target_wholesalers
                )
                    ? it.target_wholesalers
                    : [];

                const rawTargetIds: string[] | undefined =
                    Array.isArray(it?.target_wholesaler_ids)
                        ? it.target_wholesaler_ids
                            .map((x: any) =>
                                x ? String(x) : null
                            )
                            .filter(
                                (x: any): x is string => !!x
                            )
                        : rawTargets.length > 0
                            ? rawTargets
                                .map((w: any) =>
                                    w?.id ? String(w.id) : null
                                )
                                .filter(
                                    (x: any): x is string => !!x
                                )
                            : undefined;

                const normalizedTargets:
                    | WholesalerProductRequestTargetWholesaler[]
                    | undefined =
                    rawTargets.length > 0
                        ? rawTargets
                            .filter((w: any) => w && w.id)
                            .map((w: any) => ({
                                id: String(w.id),
                                title: String(
                                    w.title ?? ''
                                ),
                            }))
                        : undefined;

                const rawOffers: any[] = Array.isArray(
                    it?.offers
                )
                    ? it.offers
                    : [];

                const offers: ProductRequestOffer[] =
                    rawOffers.map((o: any) => ({
                        id: String(o?.id ?? ''),
                        request_item: String(
                            o?.request_item ?? ''
                        ),
                        wholesaler: String(
                            o?.wholesaler ?? ''
                        ),
                        wholesaler_title: String(
                            o?.wholesaler_title ?? ''
                        ),
                        wholesaler_receipt:
                            o?.wholesaler_receipt ?? null,
                        wholesaler_receipt_title: String(
                            o?.wholesaler_receipt_title ?? ''
                        ),
                        offered_quantity: Number(
                            o?.offered_quantity ?? 0
                        ),
                        offered_unit_price:
                            o?.offered_unit_price ?? null,
                        batch: o?.batch ?? null,
                        expiry_date:
                            o?.expiry_date ?? null,
                        manufacture_date:
                            o?.manufacture_date ?? null,
                        is_placement: !!o?.is_placement,
                        status: String(o?.status ?? ''),
                        status_display: String(
                            o?.status_display ?? ''
                        ),
                        retailer_confirmed_at:
                            o?.retailer_confirmed_at ?? null,
                        retailer_response_note: String(
                            o?.retailer_response_note ?? ''
                        ),
                        responded_by_user:
                            o?.responded_by_user ?? null,
                        responded_by_user_name:
                            o?.responded_by_user_name ?? null,
                        responded_at:
                            o?.responded_at ?? null,
                        response_note: String(
                            o?.response_note ?? ''
                        ),
                        resulting_order_item:
                            o?.resulting_order_item ?? null,
                        created: String(o?.created ?? ts),
                        updated: String(o?.updated ?? ts),
                    }));

                return {
                    id: lineId,
                    request: it?.request
                        ? String(it.request)
                        : prior?.request,

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

                    urgency:
                        it?.urgency ?? prior?.urgency,
                    urgency_display:
                        it?.urgency_display ??
                        prior?.urgency_display ??
                        (it?.urgency
                            ? String(it.urgency)
                                .charAt(0)
                                .toUpperCase() +
                            String(it.urgency).slice(1)
                            : undefined),
                    note: it?.note ?? prior?.note,
                    status:
                        it?.status ?? prior?.status,
                    status_display:
                        it?.status_display ??
                        prior?.status_display,

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

                    offers: Array.isArray(it?.offers)
                        ? offers
                        : prior?.offers,

                    target_wholesaler_ids:
                        rawTargetIds ??
                        prior?.target_wholesaler_ids,
                    target_wholesalers:
                        normalizedTargets ??
                        prior?.target_wholesalers,

                    wholesalers: prior?.wholesalers,
                    wholesaler_titles:
                        prior?.wholesaler_titles,

                    created: String(it?.created ?? ts),
                    updated: String(it?.updated ?? ts),
                };
            })
            : previous?.items ?? [];

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
                ? raw.urgency.charAt(0).toUpperCase() +
                raw.urgency.slice(1)
                : 'Medium')
        ),
        note: String(raw?.note ?? ''),

        status: serverStatus,
        status_display: String(
            raw?.status_display ?? serverStatus
        ),

        total_line_count: Number(
            raw?.total_line_count ?? 0
        ),
        fulfilled_line_count: Number(
            raw?.fulfilled_line_count ?? 0
        ),
        pending_line_count: Number(
            raw?.pending_line_count ?? 0
        ),

        expires_at: raw?.expires_at ?? null,
        fulfilled_at: raw?.fulfilled_at ?? null,
        cancelled_at: raw?.cancelled_at ?? null,

        created: String(raw?.created ?? ts),
        updated: raw?.updated
            ? String(raw.updated)
            : undefined,
        cached_at: String(raw?.cached_at ?? ts),

        is_pending: false,
        draft_id:
            raw?.draft_id ?? previous?.draft_id ?? undefined,

        items,
    };
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

    tasks.push(
        AsyncStorage.setItem(
            REQUESTS_SYNCED_AT_KEY,
            new Date().toISOString()
        ).catch(() => null)
    );

    await Promise.allSettled(tasks);
}

async function readRequestsFromStorage(): Promise<
    ProductRequestSummary[]
> {
    try {
        const viaDb = await db.getProductRequests();
        const rows = Array.isArray(viaDb) ? viaDb : [];

        return rows.map((r: any) =>
            r?.items === undefined &&
                r?.items_preview !== undefined
                ? { ...r, items: r.items_preview }
                : r
        );
    } catch (err) {
        warn('readRequestsFromStorage', err);
        return [];
    }
}

async function readPendingOffersFromStorage(): Promise<
    PendingWholesalerOffer[]
> {
    try {
        const raw = await AsyncStorage.getItem(
            PENDING_OFFERS_KEY
        );
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        warn('readPendingOffersFromStorage', err);
        return [];
    }
}

async function writePendingOffersToStorage(
    offers: PendingWholesalerOffer[]
): Promise<void> {
    try {
        await AsyncStorage.setItem(
            PENDING_OFFERS_KEY,
            JSON.stringify(offers)
        );
    } catch (err) {
        warn('writePendingOffersToStorage', err);
    }
}

async function ensureSchema(): Promise<void> {
    try {
        const stored = await AsyncStorage.getItem(
            REQUESTS_SCHEMA_KEY
        );
        if (
            stored &&
            Number(stored) === CACHE_SCHEMA_VERSION
        ) {
            return;
        }
        await AsyncStorage.removeItem(REQUESTS_SYNCED_AT_KEY);
        await AsyncStorage.setItem(
            REQUESTS_SCHEMA_KEY,
            String(CACHE_SCHEMA_VERSION)
        );
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

    /* ---------------------------------------------------------
     * Resolve the WebSocket endpoint from the user's entity type.
     * ------------------------------------------------------- */
    const wsUrl = useMemo(
        () => resolveWsUrl(user?.entity_type, user?.roles),
        [user?.entity_type, user?.roles]
    );

    /* -------- Dev warning when entity_type is unusable -------- */
    useEffect(() => {
        if (!__DEV__) return;
        if (!user) return;
        if (wsUrl) return;
        warn(
            'user has no recognised entity_type — WS disabled. ' +
            'Expected one of: ' +
            [
                ...WHOLESALER_ENTITY_TYPES,
                ...RETAILER_ENTITY_TYPES,
            ].join(', ') +
            '. Saw:',
            {
                topLevel: user.entity_type,
                roles: user.roles?.map((r) => r.entity_type),
            }
        );
    }, [user, wsUrl]);

    /* -------- State -------- */
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
    const [queueRevision, setQueueRevision] = useState(0);

    const [pendingOffers, setPendingOffersState] = useState<
        PendingWholesalerOffer[]
    >([]);
    const pendingOffersRef = useRef<PendingWholesalerOffer[]>([]);

    const submitOfferApi = useApi<any>(async (payload: any) =>
        await wholesalersApi.createWholesalerOfferAction(
            payload
        )
    );

    const wsRef = useRef<WebSocket | null>(null);
    const requestsStateRef = useRef<ProductRequestSummary[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const wsGenerationRef = useRef(0);
    const wsReconnectAttemptRef = useRef(0);
    const pendingFlushIntervalRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const offersFlushLockRef = useRef(false);
    const isHydratedRef = useRef(false);

    const tokenRef = useRef<string | null>(token);
    useEffect(() => {
        tokenRef.current = token ?? null;
    }, [token]);

    /* Keep the resolved URL in a ref so the WS callbacks can read
     * it without re-creating the socket on every render. */
    const wsUrlRef = useRef<string | null>(wsUrl);
    useEffect(() => {
        wsUrlRef.current = wsUrl;
    }, [wsUrl]);

    useEffect(() => {
        requestsStateRef.current = requests;
    }, [requests]);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const prevOnlineRef = useRef(isOnline);

    /* -------- Pending offers setter -------- */

    const setPendingOffers = useCallback(
        (next: PendingWholesalerOffer[]) => {
            pendingOffersRef.current = next;
            setPendingOffersState(next);
        },
        []
    );

    /* -------- Derived -------- */

    const requestsById = useMemo(() => {
        const map: Record<string, ProductRequestSummary> = {};
        for (const r of requests) {
            const key = r.remote_id ?? r.draft_id;
            if (key) map[key] = r;
        }
        return map;
    }, [requests]);

    /* -------- Local patch -------- */

    const patchRequestLocally = useCallback(
        (
            remoteId: string,
            partial: Partial<ProductRequestSummary>
        ) => {
            if (!remoteId) return;

            setRequestsState((prev) => {
                let changed = false;
                const next = prev.map((r) => {
                    if (r.remote_id !== remoteId) return r;
                    changed = true;
                    return { ...r, ...partial };
                });
                if (!changed) return prev;
                requestsStateRef.current = next;
                void writeRequestsToStorage(next);
                return next;
            });
        },
        []
    );

    /* -------- Snapshot commit -------- */

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

            await writeRequestsToStorage(normalized);

            requestsStateRef.current = normalized;
            setRequestsState((prev) =>
                areRequestsEqual(prev, normalized)
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

    const commitSinglePatch = useCallback(
        async (patch: any) => {
            const remoteId = patch?.remote_id
                ? String(patch.remote_id)
                : null;
            const draftId = patch?.draft_id
                ? String(patch.draft_id)
                : null;
            if (!remoteId && !draftId) return;

            const nowStr = new Date().toISOString();
            const current = requestsStateRef.current;
            const idx = current.findIndex(
                (r) =>
                    (remoteId && r.remote_id === remoteId) ||
                    (draftId && r.draft_id === draftId)
            );

            let next: ProductRequestSummary[];
            if (idx >= 0) {
                next = current.map((r, i) =>
                    i === idx
                        ? {
                            ...r,
                            ...patch,
                            remote_id:
                                remoteId ?? r.remote_id,
                            draft_id:
                                draftId ?? r.draft_id,
                            items:
                                patch.items ?? r.items,
                        }
                        : r
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
        },
        []
    );

    /* -------- Flusher: pending offers -------- */

    const flushPendingOffers = useCallback(async () => {
        if (offersFlushLockRef.current) return;
        if (!token || !isOnlineRef.current) return;
        const queue = pendingOffersRef.current;
        if (queue.length === 0) return;

        offersFlushLockRef.current = true;
        const succeeded = new Set<string>();

        try {
            for (const entry of queue) {
                try {
                    const res =
                        await submitOfferApi.request({
                            request_id: entry.request_id,
                            line_id: entry.line_id,
                            offered_quantity:
                                entry.offered_quantity,
                            offered_unit_price:
                                entry.offered_unit_price,
                            note: entry.note ?? '',
                        });

                    const data = res?.data ?? res;
                    const isOk =
                        res?.ok === true ||
                        data?.response_code === 0;

                    if (isOk) {
                        succeeded.add(entry.id);
                    } else {
                        warn(
                            'flushPendingOffers — rejected',
                            entry.id,
                            data
                        );
                    }
                } catch (e) {
                    warn(
                        'flushPendingOffers — threw',
                        entry.id,
                        e
                    );
                }
            }

            if (succeeded.size > 0) {
                const next =
                    pendingOffersRef.current.filter(
                        (o) => !succeeded.has(o.id)
                    );
                setPendingOffers(next);
                setQueueRevision((r) => r + 1);
                await writePendingOffersToStorage(next);
            }
        } finally {
            offersFlushLockRef.current = false;
        }
    }, [
        token,
        submitOfferApi,
        setPendingOffers,
    ]);

    /* -------- Queue offer submission -------- */

    const queueOfferSubmission = useCallback(
        async (input: {
            requestId: string;
            lineId: string;
            offeredQuantity: number;
            offeredUnitPrice: number;
            note?: string;
        }) => {
            const nowStr = new Date().toISOString();
            const entry: PendingWholesalerOffer = {
                id: `offer-${input.lineId}-${Date.now()}`,
                request_id: input.requestId,
                line_id: input.lineId,
                offered_quantity: input.offeredQuantity,
                offered_unit_price: input.offeredUnitPrice,
                note: input.note,
                created_at: nowStr,
            };

            const next = [
                ...pendingOffersRef.current.filter(
                    (o) => o.line_id !== input.lineId
                ),
                entry,
            ];
            setPendingOffers(next);
            setQueueRevision((r) => r + 1);
            await writePendingOffersToStorage(next);

            if (isOnlineRef.current && token) {
                void flushPendingOffers();
            }
        },
        [token, flushPendingOffers, setPendingOffers]
    );

    /* -------- Public setter -------- */

    const setRequests = useCallback(
        async (data: ProductRequestSummary[]) => {
            await commitSnapshot(data, 'server');
        },
        [commitSnapshot]
    );

    /* -------- Hydrate -------- */

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await readRequestsFromStorage();

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

            isHydratedRef.current = true;

            const offers =
                await readPendingOffersFromStorage();
            setPendingOffers(offers);

            const syncedAt = await AsyncStorage.getItem(
                REQUESTS_SYNCED_AT_KEY
            );
            if (syncedAt) {
                setLastSyncedTime(
                    new Date(syncedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                );
            }

            return cached;
        } catch (e) {
            warn('hydrateFromLocalDB', e);
            isHydratedRef.current = true;
            return [];
        }
    }, [setPendingOffers]);

    /* -------- WebSocket -------- */

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

            const url = wsUrlRef.current;

            if (!currentToken || !url) {
                setIsLiveConnected(false);
                return;
            }

            const generation = ++wsGenerationRef.current;

            try {
                const ws = new WebSocket(
                    `${url}?token=${currentToken}`
                );
                wsRef.current = ws;

                log('WebSocket — connecting to', url);

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

                        console.log("Retailer view..", list)
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

                    const liveToken = tokenRef.current;
                    const liveUrl = wsUrlRef.current;
                    if (liveToken && liveUrl) {
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

                        reconnectTimeoutRef.current =
                            setTimeout(
                                () =>
                                    establishLiveWebSocketSync(
                                        liveToken
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

    /* -------- Manual reconnect -------- */

    const reconnectLiveSync = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            const t = tokenRef.current;
            if (t && wsUrlRef.current) {
                wsReconnectAttemptRef.current = 0;
                await flushPendingOffers();
                establishLiveWebSocketSync(t);
            }
        } catch (e) {
            warn('reconnectLiveSync threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        flushPendingOffers,
        establishLiveWebSocketSync,
    ]);

    const flushAll = useCallback(async () => {
        await flushPendingOffers();
    }, [flushPendingOffers]);

    /* -------- Debug -------- */

    const debugReadLocal = useCallback(async () => {
        const localRequests = await readRequestsFromStorage();
        if (__DEV__) {
            console.table(localRequests);
        }
        return { requests: localRequests };
    }, []);

    /* -------- Stable refs -------- */

    const actionsRef = useRef({
        hydrateFromLocalDB,
        establishLiveWebSocketSync,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            establishLiveWebSocketSync,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap.
     *
     * Re-runs when `token` OR `wsUrl` changes. On boot, `user`
     * populates asynchronously after decoding the stored token —
     * `wsUrl` is null on the first pass, gets resolved, and this
     * effect re-runs to open the socket.
     * ------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await ensureSchema();
            if (cancelled) return;

            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            if (token && wsUrl) {
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
                        void flushPendingOffers();
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
    }, [token, wsUrl]);

    /* -------- Network recovery -------- */

    useEffect(() => {
        const wasOnline = prevOnlineRef.current;
        prevOnlineRef.current = isOnline;

        if (!token) return;
        if (!wsUrl) return;
        if (isOnline && !wasOnline) {
            void flushPendingOffers();
            establishLiveWebSocketSync(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, wsUrl]);

    /* -------- Context value -------- */

    const value =
        useMemo<RetailerProductRequestsSyncContextType>(
            () => ({
                requests,
                requestsById,

                isSyncing:
                    !isLiveConnected &&
                    requests.length === 0,
                isManualRefreshing,
                isLiveConnected,
                lastSyncedTime,
                dataSource,

                pendingOffers,
                pendingOfferCount: pendingOffers.length,
                queueRevision,

                setRequests,
                patchRequestLocally,
                queueOfferSubmission,
                flushPendingOffers,
                flushAll,
                reconnectLiveSync,

                debugReadLocal,
            }),
            [
                requests,
                requestsById,
                isLiveConnected,
                isManualRefreshing,
                lastSyncedTime,
                dataSource,
                pendingOffers,
                queueRevision,
                setRequests,
                patchRequestLocally,
                queueOfferSubmission,
                flushPendingOffers,
                flushAll,
                reconnectLiveSync,
                debugReadLocal,
            ]
        );

    return (
        <RetailerProductRequestsSyncContext.Provider
            value={value}
        >
            {children}
        </RetailerProductRequestsSyncContext.Provider>
    );
};

/* =========================================================
 * Hook
 * ======================================================= */

export const useRetailerProductRequestsSync = () => {
    const ctx = useContext(
        RetailerProductRequestsSyncContext
    );
    if (!ctx) {
        throw new Error(
            'useRetailerProductRequestsSync must be used within a RetailerProductRequestsSyncProvider'
        );
    }
    return ctx;
};