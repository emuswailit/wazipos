import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { dbInstance } from '@/databases/db';
import { useApi } from '@/hooks/useApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface OrdersSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    lastSyncedTime: string;
    retailerOrders: any[];
}

const OrdersSyncContext = createContext<OrdersSyncContextType | undefined>(undefined);
const NATIVE_ORDERS_KEY = 'wazipos_async_orders_registry';

export const OrdersSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = useAuth();
    const [retailerOrders, setRetailerOrders] = useState<any[]>([]);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const getOrdersApi = useApi(retailersApi.retailerOrdersAction);

    const wsRef = useRef<WebSocket | null>(null);
    const ordersStateRef = useRef<any[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => { ordersStateRef.current = retailerOrders; }, [retailerOrders]);

    const hydrateFromLocalDB = async () => {
        try {
            const cached = Platform.OS === 'web'
                ? (dbInstance?.retailerOrders ? await dbInstance.retailerOrders.toArray() : [])
                : JSON.parse((await AsyncStorage.getItem(NATIVE_ORDERS_KEY)) || '[]');
            if (cached?.length > 0) {
                setRetailerOrders(cached);
                if (cached?.cached_at) setLastSyncedTime(new Date(cached.cached_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
            return cached;
        } catch (e) { return []; }
    };

    const normalizeOrder = (order: any, ts: string) => {
        return {
            id: String(order.id || order.key || ''),
            key: String(order.key || order.id || ''),
            order_number: order.order_number || order.code || '---',
            customer_name: order.customer_name || order.customer?.name || 'Walk-in Customer',
            total_amount: String(order.total_amount || order.total || '0.00'),
            payment_status: order.payment_status || 'UNPAID',
            fulfillment_status: order.fulfillment_status || 'PENDING',
            created_at: order.created_at || order.created || ts,
            cached_at: order.cached_at || ts,
            items: Array.isArray(order.items) ? order.items : []
        };
    };

    const commitToStorage = async (data: any[]) => {
        try {
            if (Platform.OS === 'web' && dbInstance?.retailerOrders) {
                await dbInstance.retailerOrders.clear();
                await dbInstance.retailerOrders.bulkPut(data);
            } else {
                await AsyncStorage.setItem(NATIVE_ORDERS_KEY, JSON.stringify(data));
            }
        } catch (err) { }
    };

    const runRemoteOrdersSynchronizer = async () => {
        if (!token) return;
        try {
            const res = await getOrdersApi.request({ action: "GetRetailerOrders" }).catch(() => null);
            const data = res?.data?.results || res?.data;
            if (res?.ok && Array.isArray(data)) {
                const nowStr = new Date().toISOString();
                const normalized = data.map((item: any) => normalizeOrder(item, nowStr));
                await commitToStorage(normalized);
                setRetailerOrders(normalized);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
        } catch (e) { }
    };

    const establishLiveWebSocketSync = (currentToken: string) => {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        if (wsRef.current) wsRef.current.close();
        if (!currentToken) return setIsLiveConnected(false);

        try {
            // 📡 Connects cleanly to your orders endpoint line
            const ws = new WebSocket(`wss://api.wazipos.co.ke/ws/retailers/orders/?token=${currentToken}`);
            wsRef.current = ws;

            ws.onopen = () => setIsLiveConnected(true);
            ws.onmessage = async (event) => {
                try {
                    const incoming = JSON.parse(event.data)?.orders;
                    if (!incoming || !Array.isArray(incoming)) return;

                    const nowStr = new Date().toISOString();
                    const currentMap = new Map(ordersStateRef.current.map(item => [item.id, item]));

                    incoming.forEach((raw: any) => {
                        const id = String(raw.id || raw.key || '');
                        if (!id) return;

                        if (currentMap.has(id)) {
                            const ext = currentMap.get(id)!;
                            currentMap.set(id, {
                                ...ext,
                                payment_status: raw.payment_status || ext.payment_status,
                                fulfillment_status: raw.fulfillment_status || ext.fulfillment_status,
                                total_amount: String(raw.total_amount || raw.total || ext.total_amount),
                                cached_at: nowStr
                            });
                        } else {
                            currentMap.set(id, normalizeOrder(raw, nowStr));
                        }
                    });

                    const updated = Array.from(currentMap.values());
                    setRetailerOrders(updated);
                    setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    await commitToStorage(updated);
                } catch (e) { }
            };

            ws.onclose = () => {
                setIsLiveConnected(false);
                wsRef.current = null;
                if (currentToken) reconnectTimeoutRef.current = setTimeout(() => establishLiveWebSocketSync(currentToken), 7000);
            };
            ws.onerror = () => { };
        } catch (err) { }
    };

    const forceManualRefresh = async () => {
        setIsManualRefreshing(true);
        try {
            if (Platform.OS === 'web' && dbInstance?.retailerOrders) await dbInstance.retailerOrders.clear();
            else await AsyncStorage.removeItem(NATIVE_ORDERS_KEY);
            setRetailerOrders([]);
            if (wsRef.current) wsRef.current.close();
            await runRemoteOrdersSynchronizer();
        } catch (e) { } finally { setIsManualRefreshing(false); }
    };

    useEffect(() => {
        const init = async () => {
            await hydrateFromLocalDB();
            if (token) {
                await runRemoteOrdersSynchronizer();
                establishLiveWebSocketSync(token);
            } else {
                setRetailerOrders([]);
                if (wsRef.current) wsRef.current.close();
            }
        };
        init();
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        };
    }, [token]);

    return (
        <OrdersSyncContext.Provider value={{ isSyncing: getOrdersApi.loading, isManualRefreshing, isLiveConnected, triggerManualFetch: runRemoteOrdersSynchronizer, forceManualRefresh, lastSyncedTime, retailerOrders }}>
            {children}
        </OrdersSyncContext.Provider>
    );
};

export const useOrdersSync = () => {
    const context = useContext(OrdersSyncContext);
    if (!context) throw new Error('useOrdersSync must be used within an OrdersSyncProvider');
    return context;
};
