// context/RetailerOrdersSyncContext.tsx

import { useAuth, UserProfile } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { RetailerOrder } from '@/databases/types';
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

export interface SyncUiState {
    syncing: boolean;
    offline: boolean;
    lastSyncedTime: string;
    syncStatus:
    | 'idle'
    | 'live'
    | 'offline'
    | 'error';
}

interface RetailerOrdersSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    syncStatus:
    | 'idle'
    | 'live'
    | 'offline'
    | 'error';
    forceManualRefresh: () => Promise<void>;
    lastSyncedTime: string;
    retailerOrders: RetailerOrder[];
    syncUiState: SyncUiState;
}

const RetailerOrdersSyncContext = createContext<
    RetailerOrdersSyncContextType | undefined
>(undefined);

/* =========================================================
 * Constants
 * ======================================================= */

const NATIVE_RETAILER_ORDERS_KEY =
    'wazipos_async_retailer_orders_registry';

const RETAILER_ORDERS_SYNCED_AT =
    'wazipos_async_retailer_orders_synced_at';

const DEXIE_META_SYNCED_AT_KEY = 'synced_at';

const WS_URL_FOR_RETAILER_ROLE =
    'wss://api.wazipos.co.ke/ws/requisitions/retailers/';

const WS_URL_FOR_WHOLESALER_ROLE =
    'wss://api.wazipos.co.ke/ws/requisitions/wholesalers/';

const RETAILER_ROLE_VALUE = 'GeneralRetailerSuperAdmin';
const WHOLESALER_ROLE_VALUE = 'GeneralWholesalerSuperAdmin';

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

/* =========================================================
 * Role → WS URL resolution
 * ======================================================= */

function resolveWsUrl(
    user: UserProfile | null | undefined
): string | null {
    const roles = user?.roles;

    if (!Array.isArray(roles) || roles.length === 0) {
        return null;
    }

    for (const role of roles) {
        const value = role?.value;

        if (value === RETAILER_ROLE_VALUE) {
            return WS_URL_FOR_RETAILER_ROLE;
        }
        if (value === WHOLESALER_ROLE_VALUE) {
            return WS_URL_FOR_WHOLESALER_ROLE;
        }
    }

    return null;
}

function endpointTag(url: string | null): string {
    if (!url) return 'none';
    if (url === WS_URL_FOR_RETAILER_ROLE) return 'retailers';
    if (url === WS_URL_FOR_WHOLESALER_ROLE) return 'wholesalers';
    return 'unknown';
}

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__)
        console.log('[RetailerOrdersSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__)
        console.warn('[RetailerOrdersSync]', ...args);
};

const wsLog = (tag: string, ...args: any[]) => {
    if (__DEV__)
        console.log(
            `[RetailerOrdersSync][WS:${tag}]`,
            ...args
        );
};
const wsWarn = (tag: string, ...args: any[]) => {
    if (__DEV__)
        console.warn(
            `[RetailerOrdersSync][WS:${tag}]`,
            ...args
        );
};

/* =========================================================
 * Helpers
 * ======================================================= */

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

function formatSyncTime() {
    return new Date().toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/* =========================================================
 * Frame extraction
 *
 * Server may emit any of:
 *   { "retailer-requisitions": [...] }        ← current shape
 *   { "retailer_orders": [...] }
 *   { "orders": [...] }
 *   { "results": [...] }
 *   { "data": [...] }
 *   { "data": { "retailer-requisitions": [...] } }
 *   [...]
 * ======================================================= */

const FRAME_KEYS = [
    'retailer-requisitions',
    'retailer_requisitions',
    'retailer-orders',
    'retailer_orders',
    'retailerOrders',
    'requisitions',
    'orders',
    'results',
    'items',
    'data',
];

function extractOrdersFromFrame(parsed: any): any[] | null {
    if (!parsed) return null;

    // Top-level array
    if (Array.isArray(parsed)) return parsed;

    if (typeof parsed !== 'object') return null;

    // Direct known keys
    for (const k of FRAME_KEYS) {
        const v = (parsed as any)[k];
        if (Array.isArray(v)) return v;
    }

    // One level of wrapping
    for (const wrapper of ['data', 'payload', 'body']) {
        const w = (parsed as any)[wrapper];
        if (w && typeof w === 'object' && !Array.isArray(w)) {
            for (const k of FRAME_KEYS) {
                const v = (w as any)[k];
                if (Array.isArray(v)) return v;
            }
        }
    }

    // Last resort: first array-valued property
    for (const v of Object.values(parsed)) {
        if (Array.isArray(v)) return v;
    }

    return null;
}

/* =========================================================
 * Wire-field change detection
 * ======================================================= */

function orderWireFieldsChanged(
    a: RetailerOrder,
    b: RetailerOrder
): boolean {
    if (
        a.remote_id !== b.remote_id ||
        a.draft_id !== b.draft_id ||
        a.wholesaler !== b.wholesaler ||
        a.wholesaler_title !== b.wholesaler_title ||
        a.retailer !== b.retailer ||
        a.retailer_title !== b.retailer_title ||
        a.owner !== b.owner ||
        a.owner_title !== b.owner_title ||
        a.employee !== b.employee ||
        a.title !== b.title ||
        a.payment_method !== b.payment_method ||
        a.payment_method_title !== b.payment_method_title ||
        a.order_origin !== b.order_origin ||
        a.order_terms !== b.order_terms ||
        a.document_number !== b.document_number ||
        a.document_number_display !== b.document_number_display ||
        a.reference_number !== b.reference_number ||
        a.provider_reference_number !== b.provider_reference_number ||
        a.psp_reference_number !== b.psp_reference_number ||
        a.telco !== b.telco ||
        a.status !== b.status ||
        a.shipping_amount !== b.shipping_amount ||
        a.order_discount_total !== b.order_discount_total ||
        a.order_gross_price_total !== b.order_gross_price_total ||
        a.order_tax_total !== b.order_tax_total ||
        a.final_price !== b.final_price ||
        a.final_price_total !== b.final_price_total ||
        a.is_paid !== b.is_paid ||
        a.is_delivered !== b.is_delivered ||
        a.is_processed !== b.is_processed ||
        a.is_packed !== b.is_packed ||
        a.is_received !== b.is_received ||
        a.is_approved !== b.is_approved ||
        a.is_dispatched !== b.is_dispatched ||
        a.is_committed !== b.is_committed ||
        a.paid_at !== b.paid_at ||
        a.delivered_at !== b.delivered_at ||
        a.delivered_by !== b.delivered_by ||
        a.processed_at !== b.processed_at ||
        a.processed_by !== b.processed_by ||
        a.packed_at !== b.packed_at ||
        a.packed_by !== b.packed_by ||
        a.received_at !== b.received_at ||
        a.received_by !== b.received_by ||
        a.approved_at !== b.approved_at ||
        a.approved_by !== b.approved_by ||
        a.dispatched_at !== b.dispatched_at ||
        a.dispatched_by !== b.dispatched_by ||
        a.committed_at !== b.committed_at ||
        a.cancelled_at !== b.cancelled_at ||
        a.commit_type !== b.commit_type ||
        a.commit_type_display !== b.commit_type_display ||
        a.committed_by_entity !== b.committed_by_entity ||
        a.committed_by_title !== b.committed_by_title ||
        a.committed_by_user !== b.committed_by_user ||
        a.commit_note !== b.commit_note ||
        a.delivery_method !== b.delivery_method ||
        a.actual_lead_time_days !== b.actual_lead_time_days ||
        a.description !== b.description ||
        a.retailer_postal_town !== b.retailer_postal_town ||
        a.retailer_postal_code !== b.retailer_postal_code ||
        a.retailer_postal_address !== b.retailer_postal_address ||
        a.retailer_phone !== b.retailer_phone ||
        a.retailer_email !== b.retailer_email ||
        a.wholesaler_postal_town !== b.wholesaler_postal_town ||
        a.wholesaler_postal_code !== b.wholesaler_postal_code ||
        a.wholesaler_postal_address !== b.wholesaler_postal_address ||
        a.wholesaler_phone !== b.wholesaler_phone ||
        a.wholesaler_email !== b.wholesaler_email ||
        a.created !== b.created ||
        a.updated !== b.updated
    ) {
        return true;
    }

    const pa = a.payment_summary ?? {
        paid_total: 0,
        balance_due: 0,
        is_paid: false,
    };
    const pb = b.payment_summary ?? {
        paid_total: 0,
        balance_due: 0,
        is_paid: false,
    };
    if (
        pa.paid_total !== pb.paid_total ||
        pa.balance_due !== pb.balance_due ||
        pa.is_paid !== pb.is_paid
    ) {
        return true;
    }

    const ia = a.order_items ?? [];
    const ib = b.order_items ?? [];
    if (ia.length !== ib.length) return true;

    for (let i = 0; i < ia.length; i++) {
        const x = ia[i];
        const y = ib[i];
        if (
            x.remote_id !== y.remote_id ||
            x.updated !== y.updated ||
            x.purchased_quantity !== y.purchased_quantity ||
            x.discount_quantity !== y.discount_quantity ||
            x.total_quantity !== y.total_quantity ||
            x.unit_quantity !== y.unit_quantity ||
            x.item_price !== y.item_price ||
            x.item_price_total !== y.item_price_total ||
            x.item_net_price !== y.item_net_price ||
            x.is_received !== y.is_received ||
            x.is_issued !== y.is_issued
        ) {
            return true;
        }
    }

    return false;
}

/* =========================================================
 * Normalize incoming WS order → RetailerOrder
 * ======================================================= */

function normalizeOrder(
    raw: any,
    ts: string
): RetailerOrder {
    return {
        remote_id: String(
            firstDefined(raw.id, raw.key, '')
        ),
        draft_id: raw.draft_id ?? null,

        wholesaler: raw.wholesaler ?? null,
        wholesaler_title: raw.wholesaler_title ?? null,
        retailer: String(raw.retailer ?? ''),
        retailer_title: String(raw.retailer_title ?? ''),
        owner: String(raw.owner ?? ''),
        owner_title: String(raw.owner_title ?? ''),
        employee: raw.employee ?? null,

        title: String(raw.title ?? ''),

        payment_method: raw.payment_method ?? null,
        payment_method_title: String(
            raw.payment_method_title ?? ''
        ),

        order_origin: String(raw.order_origin ?? ''),
        order_terms: String(raw.order_terms ?? ''),

        document_number: raw.document_number ?? null,
        document_number_display: String(
            raw.document_number_display ?? 'N/A'
        ),
        reference_number: raw.reference_number ?? null,
        provider_reference_number:
            raw.provider_reference_number ?? null,
        psp_reference_number: String(
            raw.psp_reference_number ?? ''
        ),
        telco: String(raw.telco ?? ''),

        status: String(raw.status ?? ''),

        shipping_amount: String(
            raw.shipping_amount ?? '0.00'
        ),
        order_discount_total: String(
            raw.order_discount_total ?? '0.00'
        ),
        order_gross_price_total: String(
            raw.order_gross_price_total ?? '0.00'
        ),
        order_tax_total: String(
            raw.order_tax_total ?? '0.00'
        ),
        final_price: String(raw.final_price ?? '0.00'),
        final_price_total: String(
            raw.final_price_total ?? '0.00'
        ),

        is_paid: String(raw.is_paid ?? 'false'),
        is_delivered: String(
            raw.is_delivered ?? 'false'
        ),
        is_processed: String(
            raw.is_processed ?? 'false'
        ),
        is_packed: String(raw.is_packed ?? 'false'),
        is_received: String(
            raw.is_received ?? 'false'
        ),
        is_approved: String(
            raw.is_approved ?? 'false'
        ),
        is_dispatched: String(
            raw.is_dispatched ?? 'false'
        ),
        is_committed: String(
            raw.is_committed ?? 'false'
        ),

        paid_at: raw.paid_at ?? null,
        delivered_at: raw.delivered_at ?? null,
        delivered_by: raw.delivered_by ?? null,
        processed_at: raw.processed_at ?? null,
        processed_by: raw.processed_by ?? null,
        packed_at: raw.packed_at ?? null,
        packed_by: raw.packed_by ?? null,
        received_at: raw.received_at ?? null,
        received_by: raw.received_by ?? null,
        approved_at: raw.approved_at ?? null,
        approved_by: raw.approved_by ?? null,
        dispatched_at: raw.dispatched_at ?? null,
        dispatched_by: raw.dispatched_by ?? null,
        committed_at: raw.committed_at ?? null,
        cancelled_at: raw.cancelled_at ?? null,

        commit_type: raw.commit_type ?? null,
        commit_type_display:
            raw.commit_type_display ?? null,
        committed_by_entity:
            raw.committed_by_entity ?? null,
        committed_by_title:
            raw.committed_by_title ?? null,
        committed_by_user:
            raw.committed_by_user ?? null,
        commit_note: String(raw.commit_note ?? ''),

        delivery_method: String(
            raw.delivery_method ?? ''
        ),
        actual_lead_time_days:
            raw.actual_lead_time_days ?? null,

        payment_summary: raw.payment_summary ?? {
            paid_total: 0,
            balance_due: 0,
            is_paid: false,
        },

        description: raw.description ?? null,

        order_items: Array.isArray(raw.order_items)
            ? raw.order_items
            : [],

        retailer_postal_town:
            raw.retailer_postal_town ?? null,
        retailer_postal_code:
            raw.retailer_postal_code ?? null,
        retailer_postal_address:
            raw.retailer_postal_address ?? null,
        retailer_phone: raw.retailer_phone ?? null,
        retailer_email: raw.retailer_email ?? null,

        wholesaler_postal_town:
            raw.wholesaler_postal_town ?? null,
        wholesaler_postal_code:
            raw.wholesaler_postal_code ?? null,
        wholesaler_postal_address:
            raw.wholesaler_postal_address ?? null,
        wholesaler_phone: raw.wholesaler_phone ?? null,
        wholesaler_email: raw.wholesaler_email ?? null,

        created: String(firstDefined(raw.created, ts)),
        updated: String(firstDefined(raw.updated, ts)),

        cached_at: ts,
    };
}

/* =========================================================
 * Array equality
 * ======================================================= */

function areOrdersEqual(
    a: RetailerOrder[],
    b: RetailerOrder[]
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
            x.final_price_total !== y.final_price_total ||
            x.updated !== y.updated
        ) {
            return false;
        }
    }
    return true;
}

/* =========================================================
 * Provider
 * ======================================================= */

export const RetailerOrdersSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();

    const wsUrl = useMemo(
        () => resolveWsUrl(user),
        [user]
    );

    const wsTag = useMemo(
        () => endpointTag(wsUrl),
        [wsUrl]
    );

    const matchedRoleValue = useMemo(() => {
        const roles = user?.roles;
        if (!Array.isArray(roles)) return null;
        for (const role of roles) {
            if (
                role?.value === RETAILER_ROLE_VALUE ||
                role?.value === WHOLESALER_ROLE_VALUE
            ) {
                return role.value;
            }
        }
        return null;
    }, [user]);

    const { isOnline } = useNetworkStatus();

    const [retailerOrders, setRetailerOrders] = useState<
        RetailerOrder[]
    >([]);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<
        'idle' | 'live' | 'offline' | 'error'
    >('idle');

    const wsRef = useRef<WebSocket | null>(null);
    const ordersStateRef = useRef<RetailerOrder[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const reconnectAttemptRef = useRef(0);
    const wsGenerationRef = useRef(0);

    /* ---------------------------------------------------------
     * Diagnostics
     * ------------------------------------------------------- */
    useEffect(() => {
        console.log(
            '[RetailerOrdersSync] currentUser (raw) →',
            user
        );

        console.log(
            '[RetailerOrdersSync] currentUser.roles →',
            user?.roles ?? '(none)'
        );

        console.log(
            '[RetailerOrdersSync] resolved identifiers →',
            {
                matchedRoleValue,
                wsTag,
                wsUrl,
                storage:
                    Platform.OS === 'web'
                        ? 'Dexie (IndexedDB)'
                        : 'AsyncStorage',
            }
        );
    }, [user, matchedRoleValue, wsTag, wsUrl]);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    useEffect(() => {
        ordersStateRef.current = retailerOrders;
    }, [retailerOrders]);

    /* ---------------------------------------------------------
     * Storage commit
     *
     *   Web    → Dexie (IndexedDB) only.
     *   Native → AsyncStorage only.
     * ------------------------------------------------------- */
    const commitToStorage = useCallback(
        async (data: RetailerOrder[]) => {
            const nowIso = new Date().toISOString();

            console.log(
                '[RetailerOrdersSync][STORAGE:WRITE] →',
                {
                    platform: Platform.OS,
                    target:
                        Platform.OS === 'web'
                            ? 'Dexie'
                            : 'AsyncStorage',
                    count: data.length,
                    sampleRemoteIds: data
                        .slice(0, 3)
                        .map((o) => o.remote_id),
                    timestamp: nowIso,
                }
            );

            /* ==================== WEB ==================== */
            if (Platform.OS === 'web') {
                if (!dbInstance?.retailerOrders) {
                    console.warn(
                        '[RetailerOrdersSync][STORAGE:WRITE] Dexie table missing'
                    );
                    return;
                }

                try {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.retailerOrders,
                        dbInstance.retailerOrdersMeta,
                        async () => {
                            await dbInstance.retailerOrders.clear();

                            if (data.length > 0) {
                                const rows = data.map(
                                    (row) => {
                                        if (
                                            row.id ===
                                            undefined ||
                                            row.id === null
                                        ) {
                                            const {
                                                id,
                                                ...rest
                                            } = row;
                                            return rest;
                                        }
                                        return row;
                                    }
                                );

                                await dbInstance.retailerOrders.bulkPut(
                                    rows
                                );
                            }

                            await dbInstance.retailerOrdersMeta.put(
                                {
                                    key: DEXIE_META_SYNCED_AT_KEY,
                                    value: nowIso,
                                }
                            );
                        }
                    );

                    // Read back to confirm
                    const verify =
                        await dbInstance.retailerOrders.count();

                    console.log(
                        '[RetailerOrdersSync][STORAGE:WRITE] ✓ Dexie committed',
                        {
                            written: data.length,
                            rowsInTable: verify,
                        }
                    );
                } catch (err) {
                    console.warn(
                        '[RetailerOrdersSync][STORAGE:WRITE] ✗ Dexie failed:',
                        err
                    );
                }
                return;
            }

            /* =================== NATIVE =================== */
            try {
                await AsyncStorage.setItem(
                    NATIVE_RETAILER_ORDERS_KEY,
                    JSON.stringify(data)
                );
                await AsyncStorage.setItem(
                    RETAILER_ORDERS_SYNCED_AT,
                    nowIso
                );

                console.log(
                    '[RetailerOrdersSync][STORAGE:WRITE] ✓ AsyncStorage committed',
                    {
                        key: NATIVE_RETAILER_ORDERS_KEY,
                        written: data.length,
                    }
                );
            } catch (err) {
                console.warn(
                    '[RetailerOrdersSync][STORAGE:WRITE] ✗ AsyncStorage failed:',
                    err
                );
            }
        },
        []
    );

    /* ---------------------------------------------------------
     * Storage read
     *
     *   Web    → Dexie only.
     *   Native → AsyncStorage only.
     * ------------------------------------------------------- */
    const readLocalRecords = useCallback(
        async (): Promise<RetailerOrder[]> => {
            /* ==================== WEB ==================== */
            if (Platform.OS === 'web') {
                try {
                    if (dbInstance?.retailerOrders) {
                        const rows =
                            await dbInstance.retailerOrders.toArray();

                        console.log(
                            '[RetailerOrdersSync][STORAGE:READ] ← Dexie',
                            {
                                count: rows.length,
                                sampleRemoteIds: rows
                                    .slice(0, 3)
                                    .map(
                                        (o: any) =>
                                            o.remote_id
                                    ),
                            }
                        );

                        return rows;
                    }
                } catch (err) {
                    console.warn(
                        '[RetailerOrdersSync][STORAGE:READ] ✗ Dexie failed:',
                        err
                    );
                }
                return [];
            }

            /* =================== NATIVE =================== */
            try {
                const raw = await AsyncStorage.getItem(
                    NATIVE_RETAILER_ORDERS_KEY
                );
                const parsed = raw ? JSON.parse(raw) : [];

                console.log(
                    '[RetailerOrdersSync][STORAGE:READ] ← AsyncStorage',
                    {
                        key: NATIVE_RETAILER_ORDERS_KEY,
                        count: Array.isArray(parsed)
                            ? parsed.length
                            : 0,
                        sampleRemoteIds: Array.isArray(parsed)
                            ? parsed
                                .slice(0, 3)
                                .map(
                                    (o: any) =>
                                        o.remote_id
                                )
                            : [],
                    }
                );

                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                console.warn(
                    '[RetailerOrdersSync][STORAGE:READ] ✗ AsyncStorage failed:',
                    err
                );
                return [];
            }
        },
        []
    );

    const hydrateFromLocalDB = useCallback(async () => {
        console.log(
            '[RetailerOrdersSync][HYDRATE] start'
        );
        try {
            const cached = await readLocalRecords();

            console.log(
                '[RetailerOrdersSync][HYDRATE] result',
                {
                    count: cached?.length ?? 0,
                }
            );

            if (cached?.length > 0) {
                ordersStateRef.current = cached;
                setRetailerOrders((prev) =>
                    areOrdersEqual(prev, cached)
                        ? prev
                        : cached
                );
                return cached;
            }
            return cached;
        } catch (e) {
            warn('hydrateFromLocalDB threw:', e);
            return [];
        }
    }, [readLocalRecords]);

    const hydrateSyncedAt = useCallback(async () => {
        try {
            let iso: string | null = null;

            if (Platform.OS === 'web') {
                if (dbInstance?.retailerOrdersMeta) {
                    const row =
                        await dbInstance.retailerOrdersMeta.get(
                            DEXIE_META_SYNCED_AT_KEY
                        );
                    iso = row?.value ?? null;
                }
            } else {
                iso = await AsyncStorage.getItem(
                    RETAILER_ORDERS_SYNCED_AT
                );
            }

            console.log(
                '[RetailerOrdersSync][HYDRATE] synced-at',
                { iso }
            );

            if (iso) {
                setLastSyncedTime(
                    new Date(iso).toLocaleString([], {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                );
            }
        } catch { }
    }, []);

    /* ---------------------------------------------------------
     * WebSocket — read-only mirror of the server's feed.
     * ------------------------------------------------------- */
    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            const tag = wsTag;

            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }

            if (!currentToken || !isOnlineRef.current) {
                setIsLiveConnected(false);
                setSyncStatus(
                    isOnlineRef.current
                        ? 'idle'
                        : 'offline'
                );
                wsLog(
                    tag,
                    'skip connect — token or online missing',
                    {
                        hasToken: !!currentToken,
                        isOnline: isOnlineRef.current,
                    }
                );
                return;
            }

            if (!wsUrl) {
                wsWarn(
                    tag,
                    'no role-matched endpoint; skipping connect',
                    {
                        roles: user?.roles?.map(
                            (r) => r?.value
                        ),
                    }
                );
                setIsLiveConnected(false);
                setSyncStatus('idle');
                return;
            }

            const generation = ++wsGenerationRef.current;

            try {
                const url = `${wsUrl}?token=${encodeURIComponent(
                    currentToken
                )}`;
                wsLog(tag, 'connecting', {
                    url: wsUrl,
                    matchedRoleValue,
                });

                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onopen = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    setIsLiveConnected(true);
                    setSyncStatus('live');
                    reconnectAttemptRef.current = 0;
                    wsLog(tag, 'connected', wsUrl);
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

                        wsLog(tag, 'RAW →', parsed);

                        wsLog(tag, 'envelope keys →', {
                            keys: parsed &&
                                typeof parsed === 'object'
                                ? Object.keys(parsed)
                                : typeof parsed,
                            frame_size:
                                typeof event.data ===
                                    'string'
                                    ? event.data.length
                                    : '(non-string)',
                        });

                        const incoming =
                            extractOrdersFromFrame(parsed);

                        if (
                            !incoming ||
                            incoming.length === 0
                        ) {
                            wsLog(
                                tag,
                                'frame has no orders — ignoring',
                                {
                                    keys:
                                        parsed &&
                                            typeof parsed ===
                                            'object'
                                            ? Object.keys(parsed)
                                            : typeof parsed,
                                    isArray:
                                        Array.isArray(parsed),
                                }
                            );
                            return;
                        }

                        wsLog(tag, 'frame resolved', {
                            count: incoming.length,
                        });

                        setIsSyncing(true);

                        const nowStr =
                            new Date().toISOString();

                        const currentMap = new Map<
                            string,
                            RetailerOrder
                        >(
                            ordersStateRef.current.map(
                                (item) => [
                                    item.remote_id,
                                    item,
                                ]
                            )
                        );

                        let inserted = 0;
                        let updated = 0;
                        let kept = 0;

                        for (const raw of incoming) {
                            const rid = String(
                                firstDefined(
                                    raw.id,
                                    raw.key,
                                    ''
                                )
                            );
                            if (!rid) continue;

                            const normalizedRemote =
                                normalizeOrder(
                                    raw,
                                    nowStr
                                );
                            normalizedRemote.remote_id = rid;

                            const local =
                                currentMap.get(rid);

                            if (!local) {
                                currentMap.set(
                                    rid,
                                    normalizedRemote
                                );
                                inserted++;
                                continue;
                            }

                            const merged: RetailerOrder = {
                                ...local,
                                ...normalizedRemote,
                                id: local.id,
                                cached_at: nowStr,
                            };

                            if (
                                orderWireFieldsChanged(
                                    local,
                                    merged
                                )
                            ) {
                                currentMap.set(rid, merged);
                                updated++;
                            } else {
                                kept++;
                            }
                        }

                        const nextList = Array.from(
                            currentMap.values()
                        );

                        wsLog(tag, 'frame reconciled', {
                            incoming: incoming.length,
                            inserted,
                            updated,
                            kept,
                            total: nextList.length,
                        });

                        if (inserted === 0 && updated === 0) {
                            setLastSyncedTime(
                                formatSyncTime()
                            );
                            return;
                        }

                        await commitToStorage(nextList);

                        ordersStateRef.current = nextList;
                        setRetailerOrders((prev) =>
                            areOrdersEqual(prev, nextList)
                                ? prev
                                : nextList
                        );

                        console.log(
                            '[RetailerOrdersSync][STATE] setRetailerOrders →',
                            {
                                count: nextList.length,
                            }
                        );

                        setLastSyncedTime(formatSyncTime());
                    } catch (e) {
                        wsWarn(
                            tag,
                            'message parse failed:',
                            e
                        );
                    } finally {
                        setIsSyncing(false);
                    }
                };

                ws.onclose = (ev) => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    setIsLiveConnected(false);
                    wsRef.current = null;
                    setSyncStatus(
                        isOnlineRef.current
                            ? 'idle'
                            : 'offline'
                    );

                    wsWarn(tag, 'closed', {
                        code: (ev as any)?.code,
                        reason: (ev as any)?.reason,
                        wasClean: (ev as any)?.wasClean,
                    });

                    if (
                        currentToken &&
                        isOnlineRef.current
                    ) {
                        const attempt =
                            reconnectAttemptRef.current++;
                        const delay = Math.min(
                            WS_RECONNECT_BASE_MS *
                            2 ** attempt,
                            WS_RECONNECT_MAX_MS
                        );
                        wsLog(
                            tag,
                            `reconnect scheduled in ${delay}ms (attempt ${attempt + 1
                            })`
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

                ws.onerror = (ev) => {
                    wsWarn(tag, 'error', ev);
                };
            } catch (err) {
                wsWarn(
                    tag,
                    'establishment threw:',
                    err
                );
            }
        },
        [
            commitToStorage,
            wsUrl,
            wsTag,
            matchedRoleValue,
            user,
        ]
    );

    /* ---------------------------------------------------------
     * Manual refresh
     * ------------------------------------------------------- */
    const forceManualRefresh = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await hydrateFromLocalDB();
            if (token) {
                reconnectAttemptRef.current = 0;
                establishLiveWebSocketSync(token);
            }
        } catch (e) {
            warn('Manual refresh threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        token,
        hydrateFromLocalDB,
        establishLiveWebSocketSync,
    ]);

    /* ---------------------------------------------------------
     * Stable refs for bootstrap
     * ------------------------------------------------------- */
    const actionsRef = useRef({
        hydrateFromLocalDB,
        hydrateSyncedAt,
        establishLiveWebSocketSync,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            hydrateSyncedAt,
            establishLiveWebSocketSync,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap
     * ------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            await actionsRef.current.hydrateSyncedAt();
            if (cancelled) return;

            if (token) {
                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
            }
        };

        init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /* ---------------------------------------------------------
     * React to role change — reconnect on a new endpoint.
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;
        if (!isOnline) return;

        reconnectAttemptRef.current = 0;
        actionsRef.current.establishLiveWebSocketSync(token);

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsUrl, token, isOnline]);

    /* ---------------------------------------------------------
     * Online / offline transitions
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            actionsRef.current.establishLiveWebSocketSync(
                token
            );
        } else {
            setSyncStatus('offline');
            setIsLiveConnected(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Derived — sync UI state
     * ------------------------------------------------------- */
    const syncUiState: SyncUiState = useMemo(() => {
        const syncing = isSyncing || isManualRefreshing;
        const offline = !isOnline;

        return {
            syncing,
            offline,
            lastSyncedTime,
            syncStatus,
        };
    }, [
        isSyncing,
        isManualRefreshing,
        isOnline,
        lastSyncedTime,
        syncStatus,
    ]);

    /* ---------------------------------------------------------
     * Memoized context value
     * ------------------------------------------------------- */
    const value = useMemo<RetailerOrdersSyncContextType>(
        () => ({
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            syncStatus,
            forceManualRefresh,
            lastSyncedTime,
            retailerOrders,
            syncUiState,
        }),
        [
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            syncStatus,
            forceManualRefresh,
            lastSyncedTime,
            retailerOrders,
            syncUiState,
        ]
    );

    return (
        <RetailerOrdersSyncContext.Provider value={value}>
            {children}
        </RetailerOrdersSyncContext.Provider>
    );
};

/* =========================================================
 * Hook
 * ======================================================= */

export const useRetailerOrdersSync = () => {
    const context = useContext(
        RetailerOrdersSyncContext
    );
    if (!context) {
        throw new Error(
            'useRetailerOrdersSync must be used within a RetailerOrdersSyncProvider'
        );
    }
    return context;
};