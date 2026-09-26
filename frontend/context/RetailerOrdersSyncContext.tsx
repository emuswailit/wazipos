// context/RetailerOrdersSyncContext.tsx

import wholesalersApi from '@/api/wholesalersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { RetailerOrder } from '@/databases/types';
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
import { Alert, Platform } from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */

export interface SyncUiState {
    syncing: boolean;
    offline: boolean;
    hasPending: boolean;
    pendingCount: number;
    showOfflineWarning: boolean;
    showPendingChip: boolean;
    showSyncing: boolean;
    lastSyncedTime: string;
    syncStatus:
    | 'idle'
    | 'pushing'
    | 'live'
    | 'offline'
    | 'error';
}

interface RetailerOrdersSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    isPushSyncing: boolean;
    pendingCount: number;
    syncStatus:
    | 'idle'
    | 'pushing'
    | 'live'
    | 'offline'
    | 'error';
    forceManualRefresh: () => Promise<void>;
    pushPending: () => Promise<void>;
    lastSyncedTime: string;
    retailerOrders: RetailerOrder[];
    addLocalOrder: (
        order: RetailerOrder
    ) => Promise<RetailerOrder>;
    updateLocalOrder: (
        order: RetailerOrder
    ) => Promise<void>;
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

const WS_URL =
    'wss://api.wazipos.co.ke/ws/wholesalers/orders/list/';

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

/** Push pending orders every 2 minutes. */
const PENDING_PUSH_INTERVAL_MS = 2 * 60 * 1000;

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

/* =========================================================
 * Queue predicate
 *
 * A row is eligible for remote push ONLY when ALL are true:
 *   - it has a non-empty draft_id, AND
 *   - synced === false, AND
 *   - it has no remote_id
 *
 * A non-empty remote_id is authoritative — the server
 * already knows about this row, so we never re-push it,
 * even if `synced` was somehow reset.
 * ======================================================= */

const hasDraftId = (
    record: Partial<RetailerOrder> | null | undefined
): boolean =>
    typeof record?.draft_id === 'string' &&
    (record.draft_id as string).trim() !== '';

const hasRemoteId = (
    record: Partial<RetailerOrder> | null | undefined
): boolean =>
    typeof record?.remote_id === 'string' &&
    (record.remote_id as string).trim() !== '';

const isSyncedFlag = (
    record: Partial<RetailerOrder> | null | undefined
): boolean =>
    record?.synced === true ||
    (record?.synced as any) === 'true';

const needsRemotePush = (
    record: RetailerOrder
): boolean => {
    if (!hasDraftId(record)) return false;
    if (isSyncedFlag(record)) return false;
    if (hasRemoteId(record)) return false;
    return true;
};

/* =========================================================
 * Draft id builder
 *
 * Format: "<user_id>:<entity_id>:<timestamp_ms>"
 * ======================================================= */

export function buildDraftId(
    userId: string | number | undefined,
    entityId: string | number | undefined
): string {
    const uid = userId != null ? String(userId) : 'anon';
    const eid =
        entityId != null && String(entityId).trim() !== ''
            ? String(entityId)
            : 'noentity';
    const ts = String(Date.now());
    return `${uid}:${eid}:${ts}`;
}

/* =========================================================
 * Helpers
 * ======================================================= */

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

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
        draft_id: String(raw.draft_id ?? ''),

        wholesaler: raw.wholesaler ?? null,
        wholesaler_title: raw.wholesaler_title ?? null,
        retailer: String(raw.retailer ?? ''),
        retailer_title: String(raw.retailer_title ?? ''),
        owner: String(raw.owner ?? ''),
        owner_title: String(raw.owner_title ?? ''),
        employee: String(raw.employee ?? ''),

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
        reference_number: String(
            raw.reference_number ?? ''
        ),
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
        synced: true,
        sync_error: null,
    };
}

/* =========================================================
 * Payload builder — matches CreateStaffRetailerOrder
 * ======================================================= */

function buildOrderPayload(
    record: RetailerOrder,
    fallbackDraftId: string
) {
    const draftId =
        record.draft_id || fallbackDraftId;

    return {
        action: 'CreateStaffRetailerOrder' as const,
        retailer_order_details: {
            retailer_id: record.retailer,
            draft_id: draftId,
            order_terms: record.order_terms || 'CASH',
            order_type: 'NORMAL',
            payment_method_id: record.payment_method,
            mobile_money_phone:
                record.payment_method_title ===
                    'MOBILE MONEY'
                    ? (record as any).mobile_money_phone ??
                    null
                    : null,
            final_price_total: Number(
                record.final_price_total ?? 0
            ),
            order_items: (record.order_items ?? []).map(
                (item) => ({
                    wholesaler_receipt:
                        item.wholesaler_receipt,
                    purchased_quantity: String(
                        item.purchased_quantity
                    ),
                    discount_quantity: String(
                        item.discount_quantity ?? 0
                    ),
                    total_quantity: item.total_quantity,
                    unit_of_issue: 'LoosePackUnits',
                    loose_pack_unit: 'Piece',
                    item_price: Number(item.item_price),
                    item_net_price: Number(
                        item.item_net_price
                    ),
                    item_price_discount: Number(
                        item.item_price_discount ?? 0
                    ),
                    item_price_total: Number(
                        item.item_price_total
                    ),
                })
            ),
        },
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
            x.synced !== y.synced ||
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

    const currentUserId = String(user?.id ?? '');

    /**
     * The user's entity id — resolves through every plausible
     * field so the generated draft_id always has three parts.
     */
    const currentEntityId = String(
        (user as any)?.entity ??
        (user as any)?.entity_id ??
        (user as any)?.owner ??
        (user as any)?.roles?.[0]?.entity ??
        ''
    );

    const { isOnline } = useNetworkStatus();

    const [retailerOrders, setRetailerOrders] = useState<
        RetailerOrder[]
    >([]);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isPushSyncing, setIsPushSyncing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<
        'idle' | 'pushing' | 'live' | 'offline' | 'error'
    >('idle');

    const createOrderApi = useApi(
        wholesalersApi.wholesaleRetailerOrdersStaffAction
    );

    const wsRef = useRef<WebSocket | null>(null);
    const ordersStateRef = useRef<RetailerOrder[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const reconnectAttemptRef = useRef(0);
    const wsGenerationRef = useRef(0);
    const pushGuardRef = useRef(false);
    const pushIntervalRef =
        useRef<ReturnType<typeof setInterval> | null>(null);

    /* -------- Diagnostics -------- */
    useEffect(() => {
        if (__DEV__) {
            console.log(
                '[RetailerOrdersSync] currentUser',
                {
                    id: currentUserId,
                    entity: currentEntityId,
                }
            );
        }
    }, [currentUserId, currentEntityId]);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    useEffect(() => {
        ordersStateRef.current = retailerOrders;
    }, [retailerOrders]);

    /* ---------------------------------------------------------
     * Storage commit / read
     * ------------------------------------------------------- */
    const commitToStorage = useCallback(
        async (data: RetailerOrder[]) => {
            const tasks: Promise<any>[] = [];

            tasks.push(
                AsyncStorage.setItem(
                    NATIVE_RETAILER_ORDERS_KEY,
                    JSON.stringify(data)
                ).catch((err) =>
                    warn('AsyncStorage write failed:', err)
                )
            );

            tasks.push(
                AsyncStorage.setItem(
                    RETAILER_ORDERS_SYNCED_AT,
                    new Date().toISOString()
                ).catch(() => null)
            );

            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                try {
                    window.localStorage.setItem(
                        NATIVE_RETAILER_ORDERS_KEY,
                        JSON.stringify(data)
                    );
                    window.localStorage.setItem(
                        RETAILER_ORDERS_SYNCED_AT,
                        new Date().toISOString()
                    );
                } catch (err) {
                    warn('localStorage write failed:', err);
                }
            }

            if (dbInstance?.retailerOrders) {
                tasks.push(
                    (async () => {
                        try {
                            await dbInstance.transaction(
                                'rw',
                                dbInstance.retailerOrders,
                                async () => {
                                    await dbInstance.retailerOrders.clear();
                                    if (data.length === 0) return;

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
                            );
                        } catch (err) {
                            warn('Dexie write failed:', err);
                        }
                    })()
                );
            }

            await Promise.allSettled(tasks);
        },
        []
    );

    const readLocalRecords = useCallback(
        async (): Promise<RetailerOrder[]> => {
            const [asyncData, dexieData] = await Promise.all(
                [
                    AsyncStorage.getItem(
                        NATIVE_RETAILER_ORDERS_KEY
                    )
                        .then((raw) =>
                            raw ? JSON.parse(raw) : []
                        )
                        .catch(() => []),
                    (async () => {
                        try {
                            if (
                                dbInstance?.retailerOrders
                            ) {
                                return await dbInstance.retailerOrders.toArray();
                            }
                        } catch { }
                        return [];
                    })(),
                ]
            );

            let webData: RetailerOrder[] = [];
            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                try {
                    const raw =
                        window.localStorage.getItem(
                            NATIVE_RETAILER_ORDERS_KEY
                        );
                    webData = raw ? JSON.parse(raw) : [];
                } catch { }
            }

            const candidates = [
                { name: 'async', rows: asyncData },
                { name: 'web', rows: webData },
                { name: 'dexie', rows: dexieData },
            ];

            const chosen = candidates.reduce((best, current) =>
                current.rows.length > best.rows.length ||
                    (current.rows.length === best.rows.length &&
                        current.name === 'dexie')
                    ? current
                    : best
            );

            return chosen.rows;
        },
        []
    );

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await readLocalRecords();

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
            let raw: string | null = null;
            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                raw = window.localStorage.getItem(
                    RETAILER_ORDERS_SYNCED_AT
                );
            }
            if (!raw) {
                raw = await AsyncStorage.getItem(
                    RETAILER_ORDERS_SYNCED_AT
                );
            }
            if (raw) {
                setLastSyncedTime(
                    new Date(raw).toLocaleString([], {
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
     * Local mutations
     * ------------------------------------------------------- */
    const addLocalOrder = useCallback(
        async (
            order: RetailerOrder
        ): Promise<RetailerOrder> => {
            const nowIso = new Date().toISOString();

            const row: RetailerOrder = {
                ...order,
                cached_at: order.cached_at ?? nowIso,
                synced: false,
                sync_error: null,
            };

            const next = [row, ...ordersStateRef.current];

            await commitToStorage(next);
            ordersStateRef.current = next;
            setRetailerOrders((prev) =>
                areOrdersEqual(prev, next) ? prev : next
            );
            setLastSyncedTime(formatSyncTime());

            return row;
        },
        [commitToStorage]
    );

    const updateLocalOrder = useCallback(
        async (order: RetailerOrder): Promise<void> => {
            const nowIso = new Date().toISOString();
            const idx = ordersStateRef.current.findIndex(
                (r) =>
                    (order.remote_id &&
                        r.remote_id === order.remote_id) ||
                    (order.draft_id &&
                        r.draft_id === order.draft_id)
            );
            if (idx < 0) {
                warn(
                    'updateLocalOrder: no matching row',
                    order.remote_id,
                    order.draft_id
                );
                return;
            }

            const existing = ordersStateRef.current[idx];

            const next = [...ordersStateRef.current];
            next[idx] = {
                ...existing,
                ...order,
                id: existing.id,
                cached_at: nowIso,
                synced: false,
                sync_error: null,
            };

            await commitToStorage(next);
            ordersStateRef.current = next;
            setRetailerOrders((prev) =>
                areOrdersEqual(prev, next) ? prev : next
            );
            setLastSyncedTime(formatSyncTime());
        },
        [commitToStorage]
    );

    /* ---------------------------------------------------------
     * Push pending → remote
     * ------------------------------------------------------- */
    const pushPending = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;
        if (pushGuardRef.current) return;

        pushGuardRef.current = true;
        setIsPushSyncing(true);
        setIsSyncing(true);
        setSyncStatus('pushing');

        let succeeded = 0;
        let failed = 0;
        let firstFailure: any = null;
        let firstSuccess: any = null;

        try {
            const all = await readLocalRecords();
            const pending = all.filter(needsRemotePush);

            log('pushPending — candidates', {
                total: all.length,
                pending: pending.length,
                skipped: all
                    .filter((r) => !needsRemotePush(r))
                    .map((r) => ({
                        draft_id: r.draft_id,
                        remote_id: r.remote_id,
                        synced: r.synced,
                        title: r.retailer_title,
                    })),
            });

            if (pending.length === 0) return;

            let madeAChange = false;

            for (const record of pending) {
                if (!isOnlineRef.current) break;

                const fallbackDraftId = buildDraftId(
                    currentUserId,
                    currentEntityId
                );
                const draftId =
                    record.draft_id || fallbackDraftId;

                const body = buildOrderPayload(
                    record,
                    fallbackDraftId
                );

                console.log(
                    '================================================'
                );
                console.log(
                    '[RetailerOrdersSync] → REQUEST',
                    {
                        draft_id: draftId,
                        retailer_title:
                            record.retailer_title,
                        item_count:
                            record.order_items?.length ??
                            0,
                    }
                );
                console.log(
                    '[RetailerOrdersSync] → REQUEST BODY',
                    body
                );
                console.log(
                    '================================================'
                );

                let result: any = null;
                const startedAt = Date.now();
                try {
                    result =
                        await createOrderApi.request(body);
                } catch (e: any) {
                    result = {
                        status: 'error',
                        problem: 'exception',
                        data: {
                            message:
                                e?.message ||
                                'Request threw',
                        },
                    };
                }
                const elapsed = Date.now() - startedAt;

                console.log(
                    '================================================'
                );
                console.log(
                    '[RetailerOrdersSync] ← RESPONSE',
                    result
                );
                console.log(
                    '[RetailerOrdersSync] ← META',
                    {
                        draft_id: draftId,
                        elapsed_ms: elapsed,
                        status: result?.status,
                        ok: result?.ok,
                        problem: result?.problem,
                        response_code:
                            result?.data?.response_code,
                        response_message:
                            result?.data?.response_message,
                    }
                );
                console.log(
                    '================================================'
                );

                const isOk =
                    result?.ok &&
                    String(
                        result?.data?.response_code ?? ''
                    ) === '0';

                if (isOk) {
                    succeeded++;
                    madeAChange = true;

                    if (!firstSuccess) {
                        firstSuccess = {
                            draft_id: draftId,
                            response_message:
                                result?.data
                                    ?.response_message,
                            response: result,
                        };
                    }

                    const createdOrder =
                        result?.data?.retailer_order ??
                        result?.data?.data
                            ?.retailer_order ??
                        result?.data?.order ??
                        null;

                    const serverRemoteId =
                        createdOrder?.id != null
                            ? String(createdOrder.id)
                            : '';

                    if (!serverRemoteId) {
                        warn(
                            'success response has no retailer_order.id',
                            {
                                draft_id: draftId,
                                response_data:
                                    result?.data,
                            }
                        );
                    }

                    const idx = all.findIndex(
                        (r) => r.draft_id === draftId
                    );

                    if (idx >= 0) {
                        const nowIso =
                            new Date().toISOString();
                        const finalRemoteId =
                            serverRemoteId ||
                            all[idx].remote_id ||
                            '';

                        all[idx] = {
                            ...all[idx],
                            remote_id: finalRemoteId,
                            draft_id: draftId,
                            synced: true,
                            sync_error: null,
                            updated: nowIso,
                            cached_at: nowIso,
                        };

                        console.log(
                            '[RetailerOrdersSync] local row updated',
                            {
                                draft_id: draftId,
                                remote_id: finalRemoteId,
                                synced: true,
                                reference_number:
                                    all[idx]
                                        .reference_number,
                            }
                        );
                    } else {
                        warn(
                            'pushPending — no local row for draft_id',
                            draftId
                        );
                    }
                } else {
                    failed++;
                    madeAChange = true;

                    const failureMessage =
                        result?.data?.response_message ||
                        result?.data?.message ||
                        result?.problem ||
                        `Server rejected (response_code=${result?.data?.response_code})`;

                    if (!firstFailure) {
                        firstFailure = {
                            draft_id: draftId,
                            response_message:
                                result?.data
                                    ?.response_message,
                            response: result,
                        };
                    }

                    const idx = all.findIndex(
                        (r) => r.draft_id === draftId
                    );

                    if (idx >= 0) {
                        all[idx] = {
                            ...all[idx],
                            draft_id: draftId,
                            sync_error: failureMessage,
                        };
                    }
                }
            }

            if (madeAChange) {
                await commitToStorage(all);
                const verify = await readLocalRecords();
                ordersStateRef.current = verify;
                setRetailerOrders((prev) =>
                    areOrdersEqual(prev, verify)
                        ? prev
                        : verify
                );
                setLastSyncedTime(formatSyncTime());
            }

            const successMessage =
                firstSuccess?.response_message;
            const failureMessageAlert =
                firstFailure?.response_message;

            if (succeeded > 0 && failed === 0) {
                notify(
                    'Orders Synced',
                    successMessage ||
                    `${succeeded} order${succeeded === 1 ? '' : 's'
                    } synced to server.`
                );
            } else if (succeeded > 0 && failed > 0) {
                notify(
                    'Orders Partial Sync',
                    `${succeeded} succeeded · ${failed} failed.\n\n` +
                    (failureMessageAlert
                        ? `Last error: ${failureMessageAlert}\n\n`
                        : '') +
                    JSON.stringify(
                        firstFailure?.response?.data ??
                        firstFailure?.response,
                        null,
                        2
                    ).slice(0, 800)
                );
            } else if (failed > 0) {
                notify(
                    'Orders Sync Failed',
                    failureMessageAlert ||
                    `${failed} order${failed === 1 ? '' : 's'
                    } could not be synced.\n\nServer response:\n${JSON.stringify(
                        firstFailure?.response?.data ??
                        firstFailure?.response,
                        null,
                        2
                    ).slice(0, 800)}`
                );
            }
        } catch (err: any) {
            warn('pushPending outer error:', err);
            notify(
                'Sync Error',
                err?.message ||
                'Unexpected error during order sync.'
            );
        } finally {
            pushGuardRef.current = false;
            setIsPushSyncing(false);
            setIsSyncing(false);
            setSyncStatus(
                isOnlineRef.current
                    ? isLiveConnected
                        ? 'live'
                        : 'idle'
                    : 'offline'
            );
        }
    }, [
        token,
        createOrderApi,
        commitToStorage,
        readLocalRecords,
        currentUserId,
        currentEntityId,
        isLiveConnected,
    ]);

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
                return;
            }

            const generation = ++wsGenerationRef.current;

            try {
                const url = `${WS_URL}?token=${encodeURIComponent(
                    currentToken
                )}`;
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

                        const incoming =
                            parsed?.retailer_orders ??
                            parsed?.orders ??
                            parsed?.results ??
                            parsed?.data;

                        if (
                            !Array.isArray(incoming) ||
                            incoming.length === 0
                        ) {
                            log(
                                '  frame has no orders — ignoring'
                            );
                            return;
                        }

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

                        incoming.forEach((raw: any) => {
                            const rid = String(
                                firstDefined(
                                    raw.id,
                                    raw.key,
                                    ''
                                )
                            );
                            if (!rid) return;

                            const existing =
                                currentMap.get(rid);

                            // Never overwrite a local row still
                            // waiting to be pushed.
                            if (
                                existing &&
                                needsRemotePush(existing)
                            ) {
                                return;
                            }

                            const normalized =
                                normalizeOrder(
                                    raw,
                                    nowStr
                                );

                            normalized.id = existing?.id;

                            /**
                             * Draft id resolution, in priority:
                             *   1. remote row's draft_id
                             *   2. existing local row's draft_id
                             *   3. generate from user + entity + now
                             *
                             * Only generated when BOTH the remote
                             * and the local row lack a draft id.
                             */
                            const wasGenerated =
                                !normalized.draft_id &&
                                !existing?.draft_id;

                            const resolvedDraftId =
                                normalized.draft_id ||
                                existing?.draft_id ||
                                buildDraftId(
                                    currentUserId,
                                    currentEntityId
                                );

                            normalized.draft_id =
                                resolvedDraftId;
                            normalized.synced = true;

                            if (wasGenerated) {
                                log(
                                    'generated draft_id for incoming order',
                                    {
                                        rid,
                                        draft_id:
                                            resolvedDraftId,
                                    }
                                );
                            }

                            currentMap.set(rid, normalized);
                        });

                        const updated = Array.from(
                            currentMap.values()
                        );

                        await commitToStorage(updated);

                        ordersStateRef.current = updated;
                        setRetailerOrders((prev) =>
                            areOrdersEqual(prev, updated)
                                ? prev
                                : updated
                        );

                        setLastSyncedTime(formatSyncTime());
                    } catch (e) {
                        warn(
                            'WebSocket — message parse failed:',
                            e
                        );
                    } finally {
                        setIsSyncing(false);
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
                    setSyncStatus(
                        isOnlineRef.current
                            ? 'idle'
                            : 'offline'
                    );

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
            } catch (err) {
                warn(
                    'WebSocket — establishment threw:',
                    err
                );
            }
        },
        [
            commitToStorage,
            currentUserId,
            currentEntityId,
        ]
    );

    /* ---------------------------------------------------------
     * Manual refresh
     * ------------------------------------------------------- */
    const forceManualRefresh = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await pushPending();
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
        pushPending,
        establishLiveWebSocketSync,
    ]);

    /* ---------------------------------------------------------
     * Stable refs for bootstrap
     * ------------------------------------------------------- */
    const actionsRef = useRef({
        hydrateFromLocalDB,
        hydrateSyncedAt,
        establishLiveWebSocketSync,
        pushPending,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            hydrateSyncedAt,
            establishLiveWebSocketSync,
            pushPending,
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
                await actionsRef.current.pushPending();
                if (cancelled) return;

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
            if (pushIntervalRef.current) {
                clearInterval(pushIntervalRef.current);
                pushIntervalRef.current = null;
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
     * Online / offline transitions
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            (async () => {
                await actionsRef.current.pushPending();
                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
            })();
        } else {
            setSyncStatus('offline');
            setIsLiveConnected(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * 2-minute poll
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;

        if (pushIntervalRef.current) {
            clearInterval(pushIntervalRef.current);
            pushIntervalRef.current = null;
        }

        const tick = async () => {
            if (!isOnlineRef.current) {
                log('Poll tick — offline, skipping');
                return;
            }

            const pending =
                ordersStateRef.current.filter(
                    needsRemotePush
                );

            if (pending.length === 0) {
                log('Poll tick — nothing pending');
                return;
            }

            log(
                `Poll tick — pushing ${pending.length} pending order(s)`
            );

            try {
                await actionsRef.current.pushPending();
            } catch (e) {
                warn('Poll tick — pushPending threw:', e);
            }
        };

        log(
            `Arming retailer-orders push poll every ${PENDING_PUSH_INTERVAL_MS / 1000
            }s`
        );
        pushIntervalRef.current = setInterval(
            tick,
            PENDING_PUSH_INTERVAL_MS
        );

        return () => {
            if (pushIntervalRef.current) {
                clearInterval(pushIntervalRef.current);
                pushIntervalRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /* ---------------------------------------------------------
     * Derived — pending count + sync UI state
     * ------------------------------------------------------- */
    const pendingCount = useMemo(
        () =>
            retailerOrders.filter(needsRemotePush).length,
        [retailerOrders]
    );

    const syncUiState: SyncUiState = useMemo(() => {
        const syncing =
            isSyncing ||
            isPushSyncing ||
            isManualRefreshing;

        const offline = !isOnline;
        const hasPending = pendingCount > 0;

        return {
            syncing,
            offline,
            hasPending,
            pendingCount,
            showOfflineWarning: offline && hasPending,
            showPendingChip:
                !offline && hasPending && !syncing,
            showSyncing: syncing,
            lastSyncedTime,
            syncStatus,
        };
    }, [
        isSyncing,
        isPushSyncing,
        isManualRefreshing,
        isOnline,
        pendingCount,
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
            isPushSyncing,
            pendingCount,
            syncStatus,
            forceManualRefresh,
            pushPending,
            lastSyncedTime,
            retailerOrders,
            addLocalOrder,
            updateLocalOrder,
            syncUiState,
        }),
        [
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            pendingCount,
            syncStatus,
            forceManualRefresh,
            pushPending,
            lastSyncedTime,
            retailerOrders,
            addLocalOrder,
            updateLocalOrder,
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