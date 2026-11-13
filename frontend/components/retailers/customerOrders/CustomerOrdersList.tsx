// components/retailers/customerOrders/CustomerOrdersList.tsx
//
// Customer-orders view — shell.
//
// Owns data + filter state, dispatches to the Web or Mobile view.

import { useAuth } from '@/context/AuthContext';
import { CustomerOrder } from '@/databases/types';
import { uploadPendingCustomerOrders } from '@/services/customerOrderUploader';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';

import { CustomerOrdersMobileView } from './CustomerOrdersMobileView';
import {
    CustomerOrdersWebView,
    isPendingUpload,
    matchesPaymentMethod,
    orderAmount,
    PAYMENT_METHOD_FILTERS,
    toBool,
    type CustomerOrdersCounts,
    type CustomerOrdersViewProps,
    type PaymentMethodFilter,
} from './CustomerOrdersWebView';
import { InvoiceModal } from './InvoiceModal';
import { useOrdersData } from './useOrdersData';

const LARGE_SCREEN_MIN_WIDTH = 768;

/* =========================================================
 * Search
 * ======================================================= */

function matchesQuery(o: CustomerOrder, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();

    const haystacks = [
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.selected_payment_method_title,
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

    for (const h of haystacks) {
        if (h.includes(needle)) return true;
    }
    return false;
}

/* =========================================================
 * Ordering
 * ======================================================= */

/** When the order was placed (ms), for newest-first sorting. 0 if unknown (sorts last). */
function orderTimestamp(o: any): number {
    const raw = o?.created || o?.created_at || o?.updated || o?.cached_at;
    if (!raw) return 0;
    const s = String(raw);
    const t = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s).getTime();
    return Number.isNaN(t) ? 0 : t;
}

/* =========================================================
 * Shell
 * ======================================================= */

export default function CustomerOrdersList() {
    const { token, isLoading: isAuthLoading } = useAuth();
    const { width } = useWindowDimensions();
    // Paginated table only on wide web screens. Native apps (phones and tablets) and
    // narrow web always get the card list, which has no pagination.
    const isLarge = Platform.OS === 'web' && width >= LARGE_SCREEN_MIN_WIDTH;

    const {
        orders,
        isConnected,
        isRefreshing,
        lastSynced,
        refetch,
        isOnline,
        authRejected,
    } = useOrdersData(token);

    const [query, setQuery] = useState('');
    const [onlyUnpaid, setOnlyUnpaid] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethodFilter>('ALL');
    const [selected, setSelected] =
        useState<CustomerOrder | null>(null);

    const visible = useMemo(
        () =>
            orders
                .filter(
                    (o) =>
                        (!onlyUnpaid || !toBool(o.is_paid)) &&
                        matchesPaymentMethod(o, paymentMethod) &&
                        matchesQuery(o, query)
                )
                // Newest first on web and mobile. Storage order can't be trusted (web
                // keys mix numbers and UUIDs; native prepends in arrival order).
                .sort((a, b) => orderTimestamp(b) - orderTimestamp(a)),
        [orders, onlyUnpaid, paymentMethod, query]
    );

    const counts: CustomerOrdersCounts = useMemo(() => {
        // Per-method counts respect the paid/unpaid toggle and search, so each chip
        // shows how many orders you'd get by picking it.
        const byMethod = {} as Record<PaymentMethodFilter, number>;
        for (const m of PAYMENT_METHOD_FILTERS) byMethod[m] = 0;
        for (const o of orders) {
            if (onlyUnpaid && toBool(o.is_paid)) continue;
            if (!matchesQuery(o, query)) continue;
            for (const m of PAYMENT_METHOD_FILTERS) {
                if (matchesPaymentMethod(o, m)) byMethod[m] += 1;
            }
        }
        return {
            total: orders.length,
            visible: visible.length,
            unpaid: orders.filter((o) => !toBool(o.is_paid)).length,
            byMethod,
        };
    }, [orders, visible.length, onlyUnpaid, query]);

    const totalValue = useMemo(
        () =>
            visible.reduce(
                (sum, o) => sum + orderAmount(o),
                0
            ),
        [visible]
    );

    // 🟢 FIX: Safe wrapper for refetch to prevent "refetch is not a function" crash
    const onRefresh = useCallback(() => {
        if (typeof refetch === 'function') {
            refetch();
        } else {
            console.warn('[CustomerOrdersList] refetch is not a function. Check useOrdersData.');
        }
    }, [refetch]);

    const onView = useCallback((order: CustomerOrder) => {
        setSelected(order);
    }, []);

    const onQueryChange = useCallback((q: string) => {
        setQuery(q);
    }, []);

    const onToggleOnlyUnpaid = useCallback(() => {
        setOnlyUnpaid((v) => !v);
    }, []);

    const onCloseDetails = useCallback(() => {
        setSelected(null);
    }, []);

    // Orders created offline: how many are waiting, and how many the server rejected.
    const uploadCounts = useMemo(() => {
        let pending = 0;
        let failed = 0;
        for (const o of orders) {
            if (!isPendingUpload(o)) continue;
            pending += 1;
            if (String((o as any).sync_error || '').trim()) failed += 1;
        }
        return { pending, failed };
    }, [orders]);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState<string | null>(null);

    /** Retry uploading every pending order, then reload the list. */
    const onRetryUpload = useCallback(async () => {
        if (isUploading) return;
        setIsUploading(true);
        setUploadMessage(null);
        try {
            const summary = await uploadPendingCustomerOrders();
            setUploadMessage(
                summary.offline
                    ? "Couldn't reach the server. Orders will upload when you're back online."
                    : summary.uploaded
                        ? `${summary.uploaded} order(s) uploaded.${summary.remaining ? ` ${summary.remaining} still waiting.` : ''}`
                        : summary.failed
                            ? 'The server rejected the upload again. See the reason on each order.'
                            : null
            );
        } catch (e: any) {
            setUploadMessage(e?.message || 'Upload failed. Try again.');
        } finally {
            setIsUploading(false);
            onRefresh();
        }
    }, [isUploading, onRefresh]);

    if (isAuthLoading) {
        return (
            <View
                className="flex-1 justify-center items-center"
                style={{ backgroundColor: '#f8fafc' }}
            >
                <ActivityIndicator size="large" color="#007AFF" />
                <Text
                    className="mt-3"
                    style={{
                        color: '#64748b',
                        fontSize: 12,
                        fontWeight: '600',
                    }}
                >
                    Validating Session Registers...
                </Text>
            </View>
        );
    }

    const common: CustomerOrdersViewProps = {
        orders: visible,
        counts,
        query,
        onQueryChange,
        onlyUnpaid,
        onToggleOnlyUnpaid,
        paymentMethod,
        onPaymentMethodChange: setPaymentMethod,
        refreshing: isRefreshing,
        onRefresh,
        isConnected,
        lastSynced: lastSynced ?? '',
        totalValue,
        onView,
        onRetryUpload,
        isUploading,
    };

    return (
        <View className="flex-1">
            <SyncNotice
                isOnline={isOnline}
                isConnected={isConnected}
                authRejected={authRejected}
                lastSynced={lastSynced}
            />

            <PendingUploadsBar
                pending={uploadCounts.pending}
                failed={uploadCounts.failed}
                isOnline={isOnline}
                isUploading={isUploading}
                message={uploadMessage}
                onRetry={onRetryUpload}
            />

            {isLarge ? (
                <CustomerOrdersWebView {...common} />
            ) : (
                <CustomerOrdersMobileView {...common} />
            )}

            <InvoiceModal
                order={selected}
                onClose={onCloseDetails}
                onRefresh={onRefresh}
            />
        </View>
    );
}

/* =========================================================
 * Pending uploads bar
 *
 * Shown while orders created offline are waiting to upload. Highlights orders the
 * server rejected and offers a Retry (which uploads every pending order).
 * ======================================================= */

function PendingUploadsBar({
    pending,
    failed,
    isOnline,
    isUploading,
    message,
    onRetry,
}: {
    pending: number;
    failed: number;
    isOnline: boolean;
    isUploading: boolean;
    message: string | null;
    onRetry: () => void;
}) {
    const { theme } = useAuth();
    if (pending === 0 && !message) return null;

    const hasFailed = failed > 0;
    const fg = hasFailed ? '#be123c' : '#b45309';
    const bg = hasFailed ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)';
    const border = hasFailed ? 'rgba(244,63,94,0.3)' : 'rgba(245,158,11,0.3)';

    const summary =
        pending === 0
            ? ''
            : `${pending} order${pending === 1 ? '' : 's'} waiting to upload` +
            (hasFailed ? ` · ${failed} failed` : '') +
            (!isOnline ? ' (offline)' : '');

    return (
        <View className="px-4 py-2.5 border-b flex-row items-center gap-3 flex-wrap" style={{ backgroundColor: bg, borderBottomColor: border }}>
            <View className="flex-1 min-w-[180px]">
                {summary ? (
                    <Text style={{ color: fg, fontFamily: theme.font.bold, fontSize: 12 }}>{summary}</Text>
                ) : null}
                {message ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: summary ? 2 : 0 }}>
                        {message}
                    </Text>
                ) : null}
            </View>
            {pending > 0 && isOnline ? (
                <Pressable
                    onPress={onRetry}
                    disabled={isUploading}
                    accessibilityRole="button"
                    accessibilityLabel="Retry uploading orders"
                    className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg"
                    style={{
                        backgroundColor: fg,
                        opacity: isUploading ? 0.6 : 1,
                        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                    }}
                >
                    {isUploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={14} color="#fff" />}
                    <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12 }}>
                        {isUploading ? 'Uploading…' : 'Retry upload'}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Sync notice
 *
 * Warns that the list may not match the server: offline (data may have changed
 * remotely since the last sync), reconnecting, or the login was rejected.
 * Hidden while the live connection is up.
 * ======================================================= */

function SyncNotice({
    isOnline,
    isConnected,
    authRejected,
    lastSynced,
}: {
    isOnline: boolean;
    isConnected: boolean;
    authRejected: boolean;
    lastSynced: string | null;
}) {
    const { theme } = useAuth();
    if (isOnline && isConnected) return null;

    const since = lastSynced ? ` since ${lastSynced}` : '';
    const notice = !isOnline
        ? {
            bg: 'rgba(244,63,94,0.10)', fg: '#be123c', border: 'rgba(244,63,94,0.35)',
            text: `You're offline. These orders may have changed on the server${since}. They'll update automatically when you're back online.`,
        }
        : authRejected
            ? {
                bg: 'rgba(244,63,94,0.10)', fg: '#be123c', border: 'rgba(244,63,94,0.35)',
                text: `Your session has expired, so orders can't sync. Log in again to see the latest orders.`,
            }
            : {
                bg: 'rgba(245,158,11,0.10)', fg: '#b45309', border: 'rgba(245,158,11,0.35)',
                text: `Reconnecting… orders may be out of date${since}.`,
            };

    return (
        <View
            accessibilityRole="alert"
            className="px-4 py-2.5 border-b"
            style={{ backgroundColor: notice.bg, borderBottomColor: notice.border }}
        >
            <Text style={{ color: notice.fg, fontFamily: theme.font.bold, fontSize: 12 }}>{notice.text}</Text>
        </View>
    );
}