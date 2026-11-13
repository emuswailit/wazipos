import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { storageService } from './storageService';
import { CustomerOrder } from './types';

const WS_URL = 'wss://api.wazipos.co.ke/ws/retailers/orders/list/';

/** Close codes the backend uses when the WebSocket login fails (chats/middleware.py). */
const WS_AUTH_CLOSE_CODES = [4001, 4002, 4003];
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

/**
 * Customer orders for the Customer Orders screen.
 *
 * Local storage is a mirror of the server: every full list the server pushes
 * (`{ customer_orders: [...] }`) replaces the local copy, and synced orders the server
 * no longer has are deleted. Orders still waiting to upload are kept.
 *
 * While online, the socket reconnects automatically; when the device comes back online
 * it reconnects straight away and the server pushes a fresh list.
 */
export const useOrdersData = (token: string) => {
    const { isOnline } = useNetworkStatus();

    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastSynced, setLastSynced] = useState<string | null>(null);
    /** Set when the server rejected the login; stops reconnecting until the token changes. */
    const [authRejected, setAuthRejected] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);
    const tokenRef = useRef(token);
    tokenRef.current = token;

    const reloadFromStorage = useCallback(async () => {
        try {
            setOrders(await storageService.getAllOrders());
        } catch (err) {
            console.error('[useOrdersData] reading local orders failed:', err);
        }
    }, []);

    // Show whatever is stored straight away (offline-first).
    useEffect(() => {
        reloadFromStorage();
    }, [reloadFromStorage]);

    const clearRetry = () => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    };

    const closeSocket = () => {
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws) {
            ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
            try {
                ws.close();
            } catch { }
        }
        setIsConnected(false);
    };

    const connect = useCallback(() => {
        clearRetry();
        closeSocket();
        const currentToken = tokenRef.current;
        if (!currentToken) return;

        const ws = new WebSocket(`${WS_URL}?token=${currentToken}`);
        wsRef.current = ws;

        ws.onopen = () => {
            retryCountRef.current = 0;
            setIsConnected(true);
        };

        ws.onmessage = async (e) => {
            try {
                setIsRefreshing(true);
                const res = JSON.parse(e.data);

                // { customer_orders: [...] } is the server's complete list -> mirror it.
                const isSnapshot = Array.isArray(res?.customer_orders);
                const incoming: CustomerOrder[] = isSnapshot
                    ? res.customer_orders
                    : Array.isArray(res)
                        ? res
                        : res?.id
                            ? [res]
                            : [];

                const changed = await storageService.syncIncomingOrders(incoming, { snapshot: isSnapshot });
                if (changed) await reloadFromStorage();
                setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            } catch (err) {
                console.error('🚨 [Sync Hook Error]:', err);
            } finally {
                setIsRefreshing(false);
            }
        };

        ws.onclose = (event) => {
            if (wsRef.current !== ws) return; // replaced by a newer socket
            wsRef.current = null;
            setIsConnected(false);

            if (WS_AUTH_CLOSE_CODES.includes(event?.code)) {
                setAuthRejected(true); // wait for a new token
                return;
            }
            // Reconnect with backoff: 2s, 4s, 8s ... up to 30s.
            const delay = Math.min(RECONNECT_BASE_MS * 2 ** retryCountRef.current, RECONNECT_MAX_MS);
            retryCountRef.current += 1;
            retryTimerRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
            // onclose follows and schedules the reconnect.
        };
    }, [reloadFromStorage]);

    // (Re)connect when logged in and online; disconnect when offline or logged out.
    useEffect(() => {
        setAuthRejected(false);
        retryCountRef.current = 0;
        if (token && isOnline) connect();
        else {
            clearRetry();
            closeSocket();
        }
        return () => {
            clearRetry();
            closeSocket();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, isOnline]);

    /**
     * Manual refresh: reconnect, which makes the server push its complete list again
     * (it sends one on every connect). Offline it just reloads local data.
     */
    const refetch = useCallback(async () => {
        await reloadFromStorage();
        if (tokenRef.current && isOnline) {
            setAuthRejected(false);
            retryCountRef.current = 0;
            connect();
        }
    }, [connect, isOnline, reloadFromStorage]);

    return { orders, isConnected, isRefreshing, lastSynced, refetch, isOnline, authRejected };
};
