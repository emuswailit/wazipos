// components/retailers/customerOrderPayments/useCustomerOrderPayments.ts
//
// The latest 50 customer order payments received by the user's business, live over
// WebSocket (backend: retailers.consumers.CustomerOrderPaymentsConsumer).
//
// - The server sends its complete list ({ customer_order_payments: [...] }) on connect and
//   whenever the business's orders/payments change; the local copy mirrors it exactly.
// - The last list is cached on the device, so the screen shows something offline.
// - Reconnects with backoff while online, and immediately when the device comes back
//   online; stops on login-failure close codes until the token changes.

import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://api.wazipos.co.ke/ws/retailers/orders/payments/list/';
const CACHE_KEY = 'wazipos_customer_order_payments_cache';
const WS_AUTH_CLOSE_CODES = [4001, 4002, 4003];
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

export interface CustomerOrderPaymentItem {
    id: string;
    customer_order_id: string | null;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    payment_method_title: string;
    telco: string | null;
    amount: string | number;
    transaction_charge: string | number | null;
    currency: string;
    status: string | null;
    description: string | null;
    narration: string | null;
    reference_number: string;
    psp_reference_number: string;
    provider_reference_number: string | null;
    is_validated: boolean;
    created: string;
    updated: string;
}

export function useCustomerOrderPayments(token: string | null | undefined) {
    const { isOnline } = useNetworkStatus();

    const [payments, setPayments] = useState<CustomerOrderPaymentItem[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [lastSynced, setLastSynced] = useState<string | null>(null);
    const [authRejected, setAuthRejected] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);
    const tokenRef = useRef(token);
    tokenRef.current = token;

    // Offline-first: show the last list we had.
    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(CACHE_KEY);
                const cached = raw ? JSON.parse(raw) : null;
                if (cached && Array.isArray(cached.payments)) {
                    setPayments(cached.payments);
                    setLastSynced(cached.syncedAt ?? null);
                }
            } catch { }
            setIsLoading(false);
        })();
    }, []);

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
                const res = JSON.parse(e.data);
                if (!Array.isArray(res?.customer_order_payments)) return;

                // Complete list from the server: mirror it exactly.
                const list: CustomerOrderPaymentItem[] = res.customer_order_payments;
                const syncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setPayments(list);
                setLastSynced(syncedAt);
                setIsLoading(false);
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ payments: list, syncedAt })).catch(() => { });
            } catch (err) {
                console.warn('[useCustomerOrderPayments] bad message', err);
            }
        };

        ws.onclose = (event) => {
            if (wsRef.current !== ws) return;
            wsRef.current = null;
            setIsConnected(false);
            if (WS_AUTH_CLOSE_CODES.includes(event?.code)) {
                setAuthRejected(true);
                return;
            }
            const delay = Math.min(RECONNECT_BASE_MS * 2 ** retryCountRef.current, RECONNECT_MAX_MS);
            retryCountRef.current += 1;
            retryTimerRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
            // onclose follows and schedules the reconnect.
        };
    }, []);

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

    /** Reconnect; the server sends the complete list again on every connect. */
    const refresh = useCallback(() => {
        if (tokenRef.current && isOnline) {
            setAuthRejected(false);
            retryCountRef.current = 0;
            connect();
        }
    }, [connect, isOnline]);

    return { payments, isConnected, isLoading, lastSynced, authRejected, isOnline, refresh };
}
