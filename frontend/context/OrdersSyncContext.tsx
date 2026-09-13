// @/context/OrdersSyncContext.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { dbInstance } from '@/databases/db';
import {
    CustomerOrder,
    CustomerOrderItem,
} from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Platform } from 'react-native';

interface OrdersSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    lastSyncedTime: string;
    retailerOrders: CustomerOrder[];
    localCustomerOrders: CustomerOrder[];
    queueRevision: number;
    /** Count of local orders whose `synced` flag is still 'FALSE'. */
    pendingRemoteSyncCount: number;
    /** Draft/remote ids of those pending orders (for debugging). */
    pendingRemoteSyncIds: string[];
    /** Drain the outbound queue now. */
    drainOutboundQueue: () => Promise<void>;
}

const OrdersSyncContext = createContext<
    OrdersSyncContextType | undefined
>(undefined);

const NATIVE_ORDERS_KEY = 'wazipos_async_orders_registry';
const NATIVE_ORDERS_SYNCED_AT = 'wazipos_async_orders_synced_at';
const NATIVE_CUSTOMER_ORDERS_KEY =
    'wazipos_customer_orders_payload';
const WS_ORDERS_URL =
    'wss://api.wazipos.co.ke/ws/retailers/orders/list/';

const CACHE_SCHEMA_VERSION = 3;
const NATIVE_SCHEMA_KEY = 'wazipos_orders_cache_schema';

/** Outbound drain interval — every 2 minutes. */
const OUTBOUND_SYNC_POLL_INTERVAL_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

const deriveFulfillmentStatus = (o: any): string => {
    if (o.fulfillment_status) return String(o.fulfillment_status);
    if (toBool(o.is_delivered)) return 'DELIVERED';
    if (toBool(o.is_packed)) return 'PACKED';
    if (toBool(o.is_paid)) return 'PAID';
    return 'PENDING';
};

const extractOrdersArray = (payload: any): any[] | null => {
    const p = payload?.data ?? payload;
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.results)) return p.results;
    if (Array.isArray(p?.customer_orders)) return p.customer_orders;
    if (Array.isArray(p?.orders)) return p.orders;
    if (Array.isArray(p?.data?.results)) return p.data.results;
    if (Array.isArray(p?.data?.customer_orders))
        return p.data.customer_orders;
    return null;
};

const log = (...args: any[]) => {
    if (__DEV__) console.log('[OrdersSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[OrdersSync]', ...args);
};

/** Strip anything that isn't a UUID-ish string before sending. */
const sanitizeReceiptId = (raw: any): string => {
    if (raw === undefined || raw === null) return '';
    const s = String(raw);
    if (s === 'undefined' || s === 'null' || s.trim() === '') {
        return '';
    }
    return s;
};

const isPendingRemoteSync = (o: CustomerOrder): boolean =>
    o.synced === 'FALSE';

const describePending = (list: CustomerOrder[]): string => {
    if (!list.length) return 'none';
    return list
        .map(
            (o) =>
                `${o.draft_id || o.remote_id || '?'} → ${o.order_number || '—'
                } (${o.total_amount || '0.00'})`
        )
        .join(', ');
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const OrdersSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();
    const currentUserId = String((user as any)?.id ?? '');

    const [retailerOrders, setRetailerOrders] = useState<
        CustomerOrder[]
    >([]);
    const [localCustomerOrders, setLocalCustomerOrders] = useState<
        CustomerOrder[]
    >([]);
    const [queueRevision, setQueueRevision] = useState(0);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isOutboundSyncing, setIsOutboundSyncing] = useState(false);

    const getOrdersApi = useApi(retailersApi.retailerOrdersAction);
    const submitOrderApi = useApi(retailersApi.retailStaffAction);

    const wsRef = useRef<WebSocket | null>(null);
    const ordersStateRef = useRef<CustomerOrder[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const wsGenerationRef = useRef(0);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const outboundGuardRef = useRef(false);

    useEffect(() => {
        ordersStateRef.current = retailerOrders;
    }, [retailerOrders]);

    // -----------------------------------------------------------------------
    // Outbound queue — derived from localCustomerOrders
    // -----------------------------------------------------------------------
    const pendingOrders = useMemo(
        () => localCustomerOrders.filter(isPendingRemoteSync),
        [localCustomerOrders]
    );

    useEffect(() => {
        if (pendingOrders.length === 0) {
            log('Outbound queue: empty (all local orders synced)');
            return;
        }
        log(
            `Outbound queue: ${pendingOrders.length} order(s) pending remote sync`
        );
        log(`  → ${describePending(pendingOrders)}`);
    }, [pendingOrders]);

    // -----------------------------------------------------------------------
    // Normalize
    // -----------------------------------------------------------------------
    const normalizeOrder = (
        order: any,
        ts: string
    ): CustomerOrder => {
        const total = firstDefined(
            order.order_price_total,
            order.order_net_price_total,
            order.total_amount,
            order.total,
            '0.00'
        );

        const items: CustomerOrderItem[] = Array.isArray(
            order.order_items
        )
            ? order.order_items
            : Array.isArray(order.items)
                ? order.items
                : [];

        return {
            cached_at: String(firstDefined(order.cached_at, ts)),

            remote_id: String(
                firstDefined(order.id, order.key, '')
            ),
            remote_key: order.key
                ? String(order.key)
                : undefined,
            draft_id: order.draft_id ?? null,

            synced: order.synced,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            dueDate: order.dueDate,
            deliveryMethod: order.deliveryMethod,
            shippingCost: order.shippingCost,
            selectedPaymentMethodId:
                order.selectedPaymentMethodId,
            paymentAccountNumber: order.paymentAccountNumber,
            customerOrderItems: order.customerOrderItems,

            status: String(order.status ?? ''),
            reference_number: order.reference_number ?? null,
            psp_reference_number: String(
                order.psp_reference_number ?? ''
            ),
            provider_reference_number:
                order.provider_reference_number ?? null,
            employee: order.employee ?? null,
            order_number: String(
                firstDefined(
                    order.order_number,
                    order.code,
                    '---'
                )
            ),
            order_type: String(order.order_type ?? ''),
            payment_account_number: String(
                order.payment_account_number ?? ''
            ),
            order_price_discount_total: Number(
                order.order_price_discount_total ?? 0
            ),
            order_net_price_total: String(
                order.order_net_price_total ?? '0.00'
            ),
            order_origin: String(order.order_origin ?? ''),
            order_price_total: String(
                order.order_price_total ?? '0.00'
            ),
            order_tax_total: Number(order.order_tax_total ?? 0),
            shipping_cost: String(order.shipping_cost ?? '0.00'),
            is_quoted: String(order.is_quoted ?? 'false'),
            is_paid: String(order.is_paid ?? 'false'),
            paid_at: String(order.paid_at ?? ''),
            due_date: String(order.due_date ?? ''),
            is_delivered: String(order.is_delivered ?? 'false'),
            is_delivered_string: String(
                order.is_delivered_string ?? ''
            ),
            is_packed_string: String(
                order.is_packed_string ?? ''
            ),
            delivered_at: String(order.delivered_at ?? ''),
            delivered_by: order.delivered_by ?? null,
            is_packed: String(order.is_packed ?? 'false'),
            packed_at: String(order.packed_at ?? ''),
            packed_by: order.packed_by ?? null,
            is_received: String(order.is_received ?? 'false'),
            received_at: String(order.received_at ?? ''),
            received_by: order.received_by ?? null,
            delivery_method: String(order.delivery_method ?? ''),
            customer: order.customer ?? null,
            coupon: order.coupon ?? null,
            entity: String(order.entity ?? ''),
            entity_title: String(order.entity_title ?? ''),
            vendor: String(order.vendor ?? ''),
            user: String(order.user ?? ''),
            phone: String(order.phone ?? ''),
            email: String(order.email ?? ''),
            bodaboda_latitude: order.bodaboda_latitude ?? null,
            bodaboda_longitude: order.bodaboda_longitude ?? null,
            origin_latitude: order.origin_latitude ?? null,
            origin_longitude: order.origin_longitude ?? null,
            destination_latitude:
                order.destination_latitude ?? null,
            destination_longitude:
                order.destination_longitude ?? null,
            created: String(
                firstDefined(
                    order.created_at,
                    order.created,
                    ts
                )
            ),
            updated: String(order.updated ?? ''),
            owner: String(order.owner ?? ''),
            customer_name: String(
                firstDefined(
                    order.customer_name,
                    order.customer?.name,
                    'Walk-in Customer'
                )
            ),
            customer_phone: String(order.customer_phone ?? ''),
            recipient_name: order.recipient_name ?? null,
            recipient_phone: order.recipient_phone ?? null,
            selected_payment_method: String(
                order.selected_payment_method ?? ''
            ),
            selected_payment_method_title: String(
                order.selected_payment_method_title ?? ''
            ),
            payment_status: String(
                firstDefined(order.payment_status, 'UNPAID')
            ),
            payment_description: String(
                order.payment_description ?? ''
            ),
            order_items: items,
            images: Array.isArray(order.images)
                ? order.images
                : [],
            shipping_address: order.shipping_address ?? null,
            origin_point: order.origin_point ?? null,
            destination_point: order.destination_point ?? null,
            farness: String(order.farness ?? '0.00'),
            bodaboda: order.bodaboda ?? null,
            bodaboda_title: String(order.bodaboda_title ?? ''),
            bodaboda_farness: String(
                order.bodaboda_farness ?? ''
            ),
            city_name: order.city_name ?? null,

            total_amount: String(total),
            fulfillment_status: deriveFulfillmentStatus(order),
            updated_at: order.updated
                ? String(order.updated)
                : undefined,
        };
    };

    // -----------------------------------------------------------------------
    // Cache version gate
    // -----------------------------------------------------------------------
    const ensureCacheSchema = async () => {
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
                ) {
                    return;
                }
                if (dbInstance?.retailerOrders) {
                    await dbInstance.retailerOrders.clear();
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
                await AsyncStorage.removeItem(NATIVE_ORDERS_KEY);
                await AsyncStorage.removeItem(
                    NATIVE_ORDERS_SYNCED_AT
                );
                await AsyncStorage.setItem(
                    NATIVE_SCHEMA_KEY,
                    String(CACHE_SCHEMA_VERSION)
                );
            }
        } catch (e) {
            warn('ensureCacheSchema', e);
        }
    };

    // -----------------------------------------------------------------------
    // Persistence — retailerOrders cache
    // -----------------------------------------------------------------------
    const hydrateFromLocalDB = async () => {
        try {
            const cached: CustomerOrder[] =
                Platform.OS === 'web'
                    ? dbInstance?.retailerOrders
                        ? await dbInstance.retailerOrders.toArray()
                        : []
                    : JSON.parse(
                        (await AsyncStorage.getItem(
                            NATIVE_ORDERS_KEY
                        )) || '[]'
                    );

            if (Array.isArray(cached) && cached.length > 0) {
                setRetailerOrders(cached);
                log(`Hydrated ${cached.length} cached orders`);
            }

            const syncedAt =
                Platform.OS === 'web'
                    ? null
                    : await AsyncStorage.getItem(
                        NATIVE_ORDERS_SYNCED_AT
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
            return [];
        }
    };

    const commitToStorage = async (data: CustomerOrder[]) => {
        try {
            if (
                Platform.OS === 'web' &&
                dbInstance?.retailerOrders
            ) {
                await dbInstance.retailerOrders.clear();
                await dbInstance.retailerOrders.bulkPut(data);
            } else {
                await AsyncStorage.setItem(
                    NATIVE_ORDERS_KEY,
                    JSON.stringify(data)
                );
                await AsyncStorage.setItem(
                    NATIVE_ORDERS_SYNCED_AT,
                    new Date().toISOString()
                );
            }
        } catch (err) {
            warn('commitToStorage', err);
        }
    };

    // -----------------------------------------------------------------------
    // Persistence — local customer-orders queue
    // -----------------------------------------------------------------------
    const loadLocalCustomerOrders =
        async (): Promise<CustomerOrder[]> => {
            try {
                const raw =
                    Platform.OS === 'web' &&
                        dbInstance?.customerOrders
                        ? await dbInstance.customerOrders.toArray()
                        : JSON.parse(
                            (await AsyncStorage.getItem(
                                NATIVE_CUSTOMER_ORDERS_KEY
                            )) || '[]'
                        );
                return Array.isArray(raw) ? raw : [];
            } catch (e) {
                warn('loadLocalCustomerOrders', e);
                return [];
            }
        };

    const saveLocalCustomerOrders = async (
        queue: CustomerOrder[]
    ) => {
        try {
            if (
                Platform.OS === 'web' &&
                dbInstance?.customerOrders
            ) {
                await dbInstance.customerOrders.clear();
                await dbInstance.customerOrders.bulkPut(queue);
            } else {
                await AsyncStorage.setItem(
                    NATIVE_CUSTOMER_ORDERS_KEY,
                    JSON.stringify(queue)
                );
            }
        } catch (e) {
            warn('saveLocalCustomerOrders', e);
        }
    };

    /**
     * Inbound: reconcile the local queue with server-authoritative
     * data. Only runs on bootstrap / manual refresh / WS push.
     */
    const reconcileLocalCustomerOrders = async (
        remoteOrders: CustomerOrder[]
    ) => {
        if (
            !Array.isArray(remoteOrders) ||
            remoteOrders.length === 0
        ) {
            return;
        }

        try {
            const localQueue = await loadLocalCustomerOrders();
            if (!localQueue.length) {
                setLocalCustomerOrders(localQueue);
                return;
            }

            const byRemoteId = new Map<string, CustomerOrder>();
            const byDraftId = new Map<string, CustomerOrder>();
            const byOrderNumber = new Map<string, CustomerOrder>();

            remoteOrders.forEach((ro) => {
                const rid = ro.remote_id
                    ? String(ro.remote_id)
                    : '';
                const rdraft = ro.draft_id
                    ? String(ro.draft_id)
                    : '';
                const rnum = ro.order_number
                    ? String(ro.order_number)
                    : '';

                if (rid) byRemoteId.set(rid, ro);
                if (rdraft) byDraftId.set(rdraft, ro);
                if (rnum) byOrderNumber.set(rnum, ro);
            });

            let changed = false;
            const next = localQueue.map((lo) => {
                const match =
                    byRemoteId.get(String(lo.remote_id)) ||
                    byDraftId.get(String(lo.draft_id)) ||
                    byOrderNumber.get(
                        String(lo.order_number || '')
                    ) ||
                    null;

                if (!match) return lo;

                const patched: CustomerOrder = { ...lo };

                if (
                    match.order_number &&
                    match.order_number !== '---' &&
                    match.order_number !== lo.order_number
                ) {
                    patched.order_number = match.order_number;
                }

                if (
                    match.payment_status &&
                    match.payment_status !== lo.payment_status
                ) {
                    patched.payment_status = match.payment_status;
                }

                const remoteTotal = firstDefined(
                    match.total_amount,
                    match.order_price_total,
                    match.order_net_price_total
                );
                if (
                    remoteTotal !== undefined &&
                    String(remoteTotal) !== String(lo.total_amount)
                ) {
                    patched.total_amount = String(remoteTotal);
                }

                if (
                    match.remote_id &&
                    patched.remote_id !== match.remote_id
                ) {
                    patched.remote_id = String(match.remote_id);
                }

                // Server has it → clear the local pending flag.
                if (
                    patched.synced === 'FALSE' &&
                    patched.remote_id
                ) {
                    patched.synced = 'TRUE';
                }

                const diff =
                    patched.order_number !== lo.order_number ||
                    patched.payment_status !== lo.payment_status ||
                    patched.total_amount !== lo.total_amount ||
                    patched.remote_id !== lo.remote_id ||
                    patched.synced !== lo.synced;

                if (diff) changed = true;
                return patched;
            });

            if (changed) {
                await saveLocalCustomerOrders(next);
                log(
                    `Reconciled local queue (${next.length} rows)`
                );
            }

            setLocalCustomerOrders(next);
            setQueueRevision((r) => r + 1);
        } catch (e) {
            warn('reconcileLocalCustomerOrders', e);
        }
    };

    const hydrateLocalCustomerOrders = async () => {
        const queue = await loadLocalCustomerOrders();
        setLocalCustomerOrders(queue);
    };

    // -----------------------------------------------------------------------
    // Inbound HTTP — bootstrap + manual refresh only
    // -----------------------------------------------------------------------
    const runRemoteOrdersSynchronizer = async () => {
        if (!token) return;
        const startedAt = Date.now();
        log('Inbound HTTP fetch starting…');
        try {
            const res = await getOrdersApi
                .request({ action: 'RetrieveOwnOrders' })
                .catch(() => null);

            if (!res?.ok) {
                warn(
                    'Inbound HTTP failed:',
                    res?.status,
                    res?.problem
                );
                return;
            }

            const data = extractOrdersArray(res);
            if (!Array.isArray(data)) {
                warn(
                    'Unexpected HTTP orders shape:',
                    res?.data
                );
                return;
            }

            const nowStr = new Date().toISOString();
            const normalized: CustomerOrder[] = data.map(
                (item: any) => normalizeOrder(item, nowStr)
            );

            await commitToStorage(normalized);
            setRetailerOrders(normalized);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );

            await reconcileLocalCustomerOrders(normalized);

            log(
                `Inbound HTTP done — ${normalized.length} server orders in ${Date.now() - startedAt
                }ms`
            );
        } catch (e) {
            warn('runRemoteOrdersSynchronizer', e);
        }
    };

    // -----------------------------------------------------------------------
    // Outbound drain — the poller's job
    // -----------------------------------------------------------------------
    const drainOutboundQueue = async () => {
        if (!token) return;
        if (outboundGuardRef.current) return;

        const queue = await loadLocalCustomerOrders();
        const pending = queue.filter(isPendingRemoteSync);
        if (pending.length === 0) {
            return;
        }

        outboundGuardRef.current = true;
        setIsOutboundSyncing(true);

        log(
            `Outbound drain starting — ${pending.length} order(s)`
        );

        let succeeded = 0;
        let failed = 0;

        try {
            for (const order of pending) {
                const items = (
                    order.customerOrderItems ?? []
                ).map((i) => ({
                    retailer_receipt: sanitizeReceiptId(
                        i.retailer_receipt
                    ),
                    purchased_quantity: Number(
                        i.purchased_quantity ?? 0
                    ),
                    unit_selling_price: String(
                        i.unit_selling_price ?? '0.00'
                    ),
                    final_unit_selling_price: String(
                        i.final_unit_selling_price ??
                        i.unit_selling_price ??
                        '0.00'
                    ),
                    item_discount: String(
                        i.item_discount ?? '0.00'
                    ),
                }));

                const cleanItems = items.filter(
                    (i) => i.retailer_receipt !== ''
                );

                if (cleanItems.length === 0) {
                    warn(
                        `  ✗ ${order.draft_id} — no valid retailer_receipt`
                    );
                    failed++;
                    continue;
                }

                const res = await submitOrderApi
                    .request({
                        action: 'CreateCustomerOrder',
                        customer_order_details: {
                            city_name: '',
                            customer_name: order.customerName,
                            customer_phone: order.customerPhone,
                            destination_latitude: 0,
                            destination_longitude: 0,
                            draft_id: order.draft_id,
                            farness: '',
                            order_channel:
                                Platform.OS === 'web'
                                    ? 'WEB'
                                    : 'ANDROID',
                            order_origin:
                                Platform.OS === 'web'
                                    ? 'WEB'
                                    : Platform.OS.toUpperCase(),
                            delivery_method:
                                order.deliveryMethod,
                            shipping_amount: '0.00',
                            payment_method:
                                order.selectedPaymentMethodId,
                            payment_account_number:
                                order.paymentAccountNumber,
                            credit_due_date: order.dueDate,
                            vendor_session_id: null,
                            order_items: cleanItems,
                        },
                    })
                    .catch(() => null);

                if (res?.ok && !res?.data?.errors) {
                    const serverUuid = String(
                        res?.data?.data?.id ||
                        res?.data?.id ||
                        ''
                    );

                    succeeded++;
                    log(
                        `  ✓ ${order.draft_id} → ${serverUuid}`
                    );

                    // Update the persisted queue row.
                    if (
                        Platform.OS === 'web' &&
                        dbInstance?.customerOrders
                    ) {
                        const target =
                            await dbInstance.customerOrders
                                .where('draft_id')
                                .equals(order.draft_id)
                                .first();
                        if (target?.id != null) {
                            await dbInstance.customerOrders.update(
                                target.id,
                                {
                                    synced: 'TRUE',
                                    remote_id: serverUuid,
                                }
                            );
                        }
                    } else {
                        const raw = await AsyncStorage.getItem(
                            NATIVE_CUSTOMER_ORDERS_KEY
                        );
                        const fullList: CustomerOrder[] = raw
                            ? JSON.parse(raw)
                            : [];
                        const match = fullList.find(
                            (x) =>
                                x.draft_id === order.draft_id
                        );
                        if (match) {
                            match.synced = 'TRUE';
                            match.remote_id = serverUuid;
                        }
                        await AsyncStorage.setItem(
                            NATIVE_CUSTOMER_ORDERS_KEY,
                            JSON.stringify(fullList)
                        );
                    }
                } else {
                    failed++;
                    warn(
                        `  ✗ ${order.draft_id} — ${res?.data?.message ||
                        res?.problem ||
                        'unknown error'
                        }`
                    );
                }
            }

            // Refresh in-memory queue so the pending count updates.
            await hydrateLocalCustomerOrders();

            log(
                `Outbound drain done — ${succeeded} ok, ${failed} failed`
            );
        } catch (e) {
            warn('drainOutboundQueue', e);
        } finally {
            outboundGuardRef.current = false;
            setIsOutboundSyncing(false);
        }
    };

    // -----------------------------------------------------------------------
    // WebSocket — inbound only
    // -----------------------------------------------------------------------
    const establishLiveWebSocketSync = (
        currentToken: string
    ) => {
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
                `${WS_ORDERS_URL}?token=${currentToken}`
            );
            wsRef.current = ws;

            ws.onopen = () => {
                if (generation !== wsGenerationRef.current) return;
                setIsLiveConnected(true);
                log('WS connected');
            };

            ws.onmessage = async (event) => {
                if (generation !== wsGenerationRef.current) return;
                try {
                    const parsed = JSON.parse(event.data);
                    const incoming = extractOrdersArray(parsed);
                    if (!Array.isArray(incoming)) return;

                    log(`WS push — ${incoming.length} orders`);

                    const nowStr = new Date().toISOString();
                    const currentMap = new Map<
                        string,
                        CustomerOrder
                    >(
                        ordersStateRef.current.map((item) => [
                            item.remote_id,
                            item,
                        ])
                    );

                    incoming.forEach((raw: any) => {
                        const rid = String(
                            firstDefined(raw.id, raw.key, '')
                        );
                        if (!rid) return;

                        if (currentMap.has(rid)) {
                            const ext = currentMap.get(rid)!;
                            const mergedRaw = {
                                ...ext,
                                ...raw,
                            };
                            const normalized = normalizeOrder(
                                mergedRaw,
                                nowStr
                            );
                            normalized.id = ext.id;
                            normalized.cached_at = nowStr;
                            currentMap.set(rid, normalized);
                        } else {
                            currentMap.set(
                                rid,
                                normalizeOrder(raw, nowStr)
                            );
                        }
                    });

                    const updated = Array.from(
                        currentMap.values()
                    );
                    setRetailerOrders(updated);
                    setLastSyncedTime(
                        new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })
                    );
                    await commitToStorage(updated);

                    await reconcileLocalCustomerOrders(updated);
                } catch (e) {
                    warn('ws.onmessage', e);
                }
            };

            ws.onclose = () => {
                if (generation !== wsGenerationRef.current) return;
                setIsLiveConnected(false);
                wsRef.current = null;
                log(`WS closed — reconnecting in 7s`);
                if (currentToken) {
                    reconnectTimeoutRef.current = setTimeout(
                        () =>
                            establishLiveWebSocketSync(
                                currentToken
                            ),
                        7000
                    );
                }
            };

            ws.onerror = () => {
                warn('WS error');
            };
        } catch (err) {
            warn('establishLiveWebSocketSync', err);
        }
    };

    // -----------------------------------------------------------------------
    // Manual refresh — inbound + outbound
    // -----------------------------------------------------------------------
    const forceManualRefresh = async () => {
        setIsManualRefreshing(true);
        log('Manual refresh starting…');
        try {
            await drainOutboundQueue();
            await runRemoteOrdersSynchronizer();

            if (token) establishLiveWebSocketSync(token);

            log('Manual refresh complete');
        } catch (e) {
            warn('forceManualRefresh', e);
        } finally {
            setIsManualRefreshing(false);
        }
    };

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            log('Bootstrap starting…');
            await ensureCacheSchema();
            await hydrateFromLocalDB();
            await hydrateLocalCustomerOrders();

            if (cancelled) return;

            if (token) {
                // Inbound: HTTP once (catch up any WS misses).
                await runRemoteOrdersSynchronizer();
                if (cancelled) return;

                // Inbound: live WebSocket.
                establishLiveWebSocketSync(token);
                if (cancelled) return;

                // Outbound: drain once, then poll every 2 min.
                await drainOutboundQueue();
                if (cancelled) return;

                if (pollIntervalRef.current)
                    clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    log('Outbound poll tick — 2 min elapsed');
                    drainOutboundQueue();
                }, OUTBOUND_SYNC_POLL_INTERVAL_MS);

                log(
                    'Bootstrap complete — inbound via WS, outbound every 2 min'
                );
            } else {
                setRetailerOrders([]);
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
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.onerror = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    return (
        <OrdersSyncContext.Provider
            value={{
                isSyncing:
                    getOrdersApi.loading || isOutboundSyncing,
                isManualRefreshing,
                isLiveConnected,
                triggerManualFetch:
                    runRemoteOrdersSynchronizer,
                forceManualRefresh,
                lastSyncedTime,
                retailerOrders,
                localCustomerOrders,
                queueRevision,
                pendingRemoteSyncCount: pendingOrders.length,
                pendingRemoteSyncIds: pendingOrders.map(
                    (o) => o.remote_id || o.draft_id || ''
                ),
                drainOutboundQueue,
            }}
        >
            {children}
        </OrdersSyncContext.Provider>
    );
};

export const useOrdersSync = () => {
    const context = useContext(OrdersSyncContext);
    if (!context) {
        throw new Error(
            'useOrdersSync must be used within an OrdersSyncProvider'
        );
    }
    return context;
};