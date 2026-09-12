import { useEffect, useState } from 'react';
import { storageService } from './storageService';
import { CustomerOrder } from './types';

export const useOrdersData = (token: string) => {
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastSynced, setLastSynced] = useState<string | null>(null);

    // Initial local DB cache load routine on mount
    useEffect(() => {
        storageService.getAllOrders().then(setOrders);
    }, []);

    useEffect(() => {
        if (!token) return;

        const wsUrl = `wss://api.wazipos.co.ke/ws/retailers/orders/list/?token=${token}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => setIsConnected(true);

        ws.onmessage = async (e) => {
            try {
                setIsRefreshing(true);
                const res = JSON.parse(e.data);

                let incoming: CustomerOrder[] = Array.isArray(res)
                    ? res
                    : res?.customer_orders
                        ? res.customer_orders
                        : res?.id
                            ? [res]
                            : [];

                if (incoming.length === 0) {
                    setIsRefreshing(false);
                    return;
                }

                console.log(`📥 [WebSocket Message] Stream received. Synchronizing payment status data frames...`);
                const mutated = await storageService.syncIncomingOrders(incoming);

                if (mutated || orders.length === 0) {
                    const freshData = await storageService.getAllOrders();

                    // Re-hydrate state view and tag modified fields with an explicit timestamp mutation marker
                    setOrders(freshData.map(o =>
                        incoming.some(i => i.draft_id === o.draft_id) ? { ...o, last_mutated_at: Date.now() } : o
                    ));

                    setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                }

                setTimeout(() => setIsRefreshing(false), 600);
            } catch (err) {
                console.error("🚨 [Sync Hook Error]:", err);
                setIsRefreshing(false);
            }
        };

        ws.onclose = () => setIsConnected(false);
        ws.onerror = () => setIsConnected(false);

        return () => ws.close();
    }, [token]);

    return { orders, isConnected, isRefreshing, lastSynced };
};
