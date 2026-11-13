// @/context/CustomerOrdersSyncContext.tsx

import { isTrueFlag, toFlagString } from '@/utils/flags';
import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { uploadPendingCustomerOrders } from '@/services/customerOrderUploader';
import { storageService } from '@/components/retailers/customerOrders/storageService';
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

interface CustomerOrdersSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    triggerManualFetch: () => Promise<void>;
    /** 🟢 ADDED: Standard refetch function for UI compatibility */
    refetch: () => Promise<void>;
    /** Fetch ALL orders for the current entity (not just the user's own). */
    fetchEntityOrders: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    lastSyncedTime: string;
    customerOrders: CustomerOrder[];
    localCustomerOrders: CustomerOrder[];
    queueRevision: number;
    /** Count of local orders whose `synced` flag is still 'FALSE'. */
    pendingRemoteSyncCount: number;
    /** Draft/remote ids of those pending orders (for debugging). */
    pendingRemoteSyncIds: string[];
    /** Drain the outbound queue now. */
    drainOutboundQueue: () => Promise<void>;
}

const CustomerOrdersSyncContext = createContext<
    CustomerOrdersSyncContextType | undefined
>(undefined);

const NATIVE_ORDERS_KEY = 'wazipos_customer_orders_sync_cache';
const NATIVE_ORDERS_SYNCED_AT = 'wazipos_customer_orders_sync_cache_synced_at';
/** Close codes the backend uses when the WebSocket login fails (chats/middleware.py). */
const WS_AUTH_CLOSE_CODES = [4001, 4002, 4003];
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
    isTrueFlag(v); // case-insensitive: the backend sends "true" / "True" strings

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
    if (__DEV__) console.log('[CustomerOrdersSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[CustomerOrdersSync]', ...args);
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

/** Resolve a row's primary key from whichever field the server used. */
const extractRowId = (raw: any): string => {
    if (!raw) return '';
    return String(
        firstDefined(
            raw.id,
            raw.uuid,
            raw.pk,
            raw.remote_id,
            raw.order_id,
            raw.key,
            ''
        )
    );
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const CustomerOrdersSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [customerOrders, setCustomerOrders] = useState<
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

    const getOrdersApi = useApi(retailersApi.retailStaffAction);
    const getEntityOrdersApi = useApi(retailersApi.customerOrdersAdminAction);

    const wsRef = useRef<WebSocket | null>(null);
    const ordersStateRef = useRef<CustomerOrder[]>([]);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wsGenerationRef = useRef(0);
    const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        ordersStateRef.current = customerOrders;
    }, [customerOrders]);

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

            remote_id: extractRowId(order),
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
            is_paid: toFlagString(order.is_paid),
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
                if (dbInstance?.customerOrdersSyncCache) {
                    await dbInstance.customerOrdersSyncCache.clear();
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
    // Persistence — customerOrders cache
    // -----------------------------------------------------------------------
    const hydrateFromLocalDB = async () => {
        try {
            const cached: CustomerOrder[] =
                Platform.OS === 'web'
                    ? dbInstance?.customerOrdersSyncCache
                        ? await dbInstance.customerOrdersSyncCache.toArray()
                        : []
                    : JSON.parse(
                        (await AsyncStorage.getItem(
                            NATIVE_ORDERS_KEY
                        )) || '[]'
                    );

            if (Array.isArray(cached) && cached.length > 0) {
                setCustomerOrders(cached);
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
                dbInstance?.customerOrdersSyncCache
            ) {
                await dbInstance.customerOrdersSyncCache.clear();
                await dbInstance.customerOrdersSyncCache.bulkPut(data);
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
    // The local customer-orders store shared with the Customer Orders screen, the order
    // screen and the offline uploader (storageService), on web and native alike.
    const loadLocalCustomerOrders =
        async (): Promise<CustomerOrder[]> => {
            try {
                const raw = await storageService.getAllOrders();
                return Array.isArray(raw) ? (raw as any) : [];
            } catch (e) {
                warn('loadLocalCustomerOrders', e);
                return [];
            }
        };

    const saveLocalCustomerOrders = async (
        queue: CustomerOrder[]
    ) => {
        try {
            // Update rows in place. Never clear: other screens keep their rows in this store.
            await storageService.putOrders(queue as any[]);
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
    // Inbound HTTP — user's own orders (bootstrap + manual refresh only)
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
            setCustomerOrders(normalized);
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
    // Inbound HTTP — entity-wide orders (admin/staff context)
    // -----------------------------------------------------------------------
    const fetchEntityOrders = async () => {
        if (!token) return;
        const startedAt = Date.now();
        log('Inbound HTTP (entity orders) starting…');
        try {
            const res = await getEntityOrdersApi
                .request({
                    action: 'RetrieveEntityOrders',
                    page: 1,
                    page_size: 100,
                })
                .catch(() => null);

            if (!res?.ok) {
                warn(
                    'Entity orders fetch failed:',
                    res?.status,
                    res?.problem
                );
                return;
            }

            const data = extractOrdersArray(res);
            if (!Array.isArray(data)) {
                warn('Unexpected entity-orders shape:', res?.data);
                return;
            }

            const nowStr = new Date().toISOString();
            const normalized: CustomerOrder[] = data.map(
                (item: any) => normalizeOrder(item, nowStr)
            );

            await commitToStorage(normalized);
            setCustomerOrders(normalized);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );

            await reconcileLocalCustomerOrders(normalized);

            log(
                `Entity orders done — ${normalized.length} rows in ${Date.now() - startedAt
                }ms`
            );
        } catch (e) {
            warn('fetchEntityOrders', e);
        }
    };

    // -----------------------------------------------------------------------
    // Outbound drain — the poller's job
    // -----------------------------------------------------------------------
    /**
     * Outbound: upload orders created offline. Delegates to the shared uploader
     * (services/customerOrderUploader.ts) so only one upload runs at a time across the
     * app, then refreshes the local queue view.
     */
    const drainOutboundQueue = async () => {
        if (!token) return;
        setIsOutboundSyncing(true);
        try {
            const summary = await uploadPendingCustomerOrders();
            if (summary.uploaded || summary.failed) {
                log(
                    `Outbound upload — ${summary.uploaded} uploaded, ${summary.failed} failed, ${summary.remaining} pending`
                );
            }
            setLocalCustomerOrders(await loadLocalCustomerOrders());
        } catch (e) {
            warn('drainOutboundQueue', e);
        } finally {
            setIsOutboundSyncing(false);
        }
    };

    // -----------------------------------------------------------------------
    // WebSocket — inbound only
    // -----------------------------------------------------------------------
    const establishLiveWebSocketSync = (currentToken: string) => {
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

                    // { customer_orders: [...] } is the server's complete list: rebuild from it
                    // so orders the server no longer has disappear locally. Anything else is a
                    // partial update and is merged into the current list.
                    const isSnapshot = Array.isArray(parsed?.customer_orders);
                    const existingById = new Map<string, CustomerOrder>(
                        ordersStateRef.current.map((item) => [item.remote_id, item])
                    );
                    const currentMap = new Map<string, CustomerOrder>(
                        isSnapshot ? [] : existingById
                    );

                    incoming.forEach((raw: any) => {
                        const rid = extractRowId(raw);
                        if (!rid) {
                            warn(
                                'WS row skipped — no id field',
                                raw
                            );
                            return;
                        }

                        if (existingById.has(rid)) {
                            const ext = existingById.get(rid)!;
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
                    setCustomerOrders(updated);
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

            ws.onclose = (event) => {
                if (generation !== wsGenerationRef.current) return;
                setIsLiveConnected(false);
                wsRef.current = null;

                // 4001 no token, 4002 invalid, 4003 expired (chats/middleware.py).
                // Retrying with the same token can't succeed; this effect reconnects
                // when the token changes (e.g. after logging in again).
                if (WS_AUTH_CLOSE_CODES.includes(event?.code)) {
                    warn(`WS rejected the login (code ${event.code}) — not reconnecting until the token changes`);
                    return;
                }

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

    // 🟢 Standard refetch function for UI compatibility
    const refetch = async () => {
        await runRemoteOrdersSynchronizer();
        await fetchEntityOrders();
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
                setCustomerOrders([]);
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

    // Back online: reconnect straight away (the server pushes its full list on connect),
    // instead of waiting for a retry that may have given up or be far off.
    useEffect(() => {
        if (!isOnline || !token) return;
        const ws = wsRef.current;
        const live = ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
        if (!live) {
            log('Back online — reconnecting');
            establishLiveWebSocketSync(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    return (
        <CustomerOrdersSyncContext.Provider
            value={{
                isSyncing:
                    getOrdersApi.loading ||
                    getEntityOrdersApi.loading ||
                    isOutboundSyncing,
                isManualRefreshing,
                isLiveConnected,
                triggerManualFetch:
                    runRemoteOrdersSynchronizer,
                refetch, // 🟢 Added to Context Value
                fetchEntityOrders,
                forceManualRefresh,
                lastSyncedTime,
                customerOrders,
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
        </CustomerOrdersSyncContext.Provider>
    );
};

export const useCustomerOrdersSync = () => {
    const context = useContext(CustomerOrdersSyncContext);
    if (!context) {
        throw new Error(
            'useCustomerOrdersSync must be used within a CustomerOrdersSyncProvider'
        );
    }
    return context;
};
