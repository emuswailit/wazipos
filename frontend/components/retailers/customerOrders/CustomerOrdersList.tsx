// components/retailers/customerOrders/CustomerOrdersList.tsx
//
// Customer-orders view — shell.
//
// Owns data + filter state, dispatches to the Web or Mobile view.

import { DetailsDock } from '@/components/common/listScreen';
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

import {
    deliveryBadge,
    formatDate,
    formatKES,
    isPendingUpload,
    orderItemCount,
    orderRef,
    PAYMENT_METHOD_ICONS,
    PAYMENT_METHOD_LABELS,
    PaymentPill,
    StatusPill,
    UploadStatus,
    matchesPaymentMethod,
    orderAmount,
    PAYMENT_METHOD_FILTERS,
    toBool,
    type CustomerOrdersCounts,
    type PaymentMethodFilter,
} from './CustomerOrdersWebView';
import { AdminListView, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { usePaged } from '@/hooks/useCachedList';

type OrderFilter = PaymentMethodFilter | 'UNPAID';

const STATUS_TONE: Record<string, AdminBadge['tone']> = {
    DRAFT: 'neutral', PENDING: 'warning', PROCESSING: 'violet', PACKED: 'info', READY: 'primary',
    DISPATCHED: 'primary', DELIVERED: 'success', COLLECTED: 'success', COMPLETED: 'success', CANCELLED: 'danger',
};
const methodLabel = (o: CustomerOrder) => {
    const m = String(o.selected_payment_method_title || '').trim();
    return m ? m.charAt(0) + m.slice(1).toLowerCase() : '—';
};

/** Cards on phones, a table on wide screens (shared list kit). */
function buildConfig(onRetryUpload: () => void, isUploading: boolean): AdminListConfig<CustomerOrder> {
    return {
        title: 'Customer orders',
        noun: ['order', 'orders'],
        icon: 'receipt-outline',
        searchPlaceholder: 'Search order, customer, phone…',
        emptyTitle: 'No orders yet',
        emptyMessage: 'Sales from New Customer Order and orders customers place online appear here.',
        keyOf: (o, i) => String((o as any).remote_id || (o as any).id || (o as any).draft_id || i),
        titleOf: (o) => o.customer_name || 'Walk-in customer',
        subtitleOf: (o) => [orderRef(o), `${orderItemCount(o)} item${orderItemCount(o) === 1 ? '' : 's'}`, methodLabel(o)].filter(Boolean).join(' · '),
        avatarOf: (o) => ({ label: o.customer_name || 'W' }),
        badgesOf: (o) => {
            const st = String(o.status || '').toUpperCase();
            const b: AdminBadge[] = [
                toBool(o.is_paid) ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Not paid', tone: 'warning' },
                deliveryBadge(o),
            ];
            if (st) b.unshift({ label: st.charAt(0) + st.slice(1).toLowerCase(), tone: STATUS_TONE[st] ?? 'neutral' });
            if (isPendingUpload(o)) b.push({ label: (o as any).sync_error ? 'Upload failed' : 'Not uploaded', tone: (o as any).sync_error ? 'danger' : 'info', icon: 'cloud-upload-outline' });
            return b;
        },
        metaOf: (o) => formatDate((o as any).created),
        metaIcon: 'time-outline',
        metricOf: (o) => ({ value: `KES ${formatKES(orderAmount(o))}`, label: toBool(o.is_paid) ? 'paid' : 'due' }),
        primaryColumn: { label: 'Customer', flex: 2 },
        columns: [
            {
                key: 'order',
                label: 'Order',
                flex: 1.5,
                render: (o) => (isPendingUpload(o) ? <UploadStatus order={o} onRetry={onRetryUpload} retrying={isUploading} /> : orderRef(o)),
            },
            { key: 'items', label: 'Items', flex: 0.6, align: 'center', render: (o) => String(orderItemCount(o)) },
            { key: 'method', label: 'Method', flex: 1, render: methodLabel },
            { key: 'status', label: 'Status', flex: 1.1, render: (o) => <StatusPill status={o.status} size="sm" /> },
            { key: 'payment', label: 'Payment', flex: 0.9, render: (o) => <PaymentPill paid={toBool(o.is_paid)} compact /> },
            { key: 'delivery', label: 'Delivery', flex: 1, render: (o) => deliveryBadge(o).label },
            { key: 'when', label: 'Date', flex: 1, render: (o) => formatDate((o as any).created) },
            { key: 'amount', label: 'Amount', flex: 1, align: 'right', render: (o) => `KES ${formatKES(orderAmount(o))}` },
        ],
    };
}
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
    // One filter row: payment method, or only the unpaid ones.
    const [filter, setFilter] = useState<OrderFilter>('ALL');
    const onlyUnpaid = filter === 'UNPAID';
    const paymentMethod: PaymentMethodFilter = filter === 'UNPAID' ? 'ALL' : filter;
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

    const paged = usePaged(visible, `${query}|${filter}`);

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

    const config = buildConfig(onRetryUpload, isUploading);

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

            <DetailsDock
                placeholder="Pick an order to see its invoice here."
                pane={
                    <InvoiceModal
                        order={selected}
                        onClose={onCloseDetails}
                        onRefresh={onRefresh}
                    />
                }
            >
                <AdminListView<CustomerOrder, OrderFilter>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={config}
                    query={query}
                    setQuery={onQueryChange}
                    onRefresh={onRefresh}
                    refreshing={isRefreshing}
                    sourceLabel={!isOnline ? 'Offline · on this device' : isConnected ? 'Live sync' : 'Saved on this device'}
                    sourceTone={isConnected ? 'server' : 'cache'}
                    lastSyncedTime={lastSynced ?? undefined}
                    {...paged}
                    onPressItem={onView}
                    rowActions={(o) => [{ icon: 'document-text-outline', label: 'Invoice', onPress: () => onView(o), tone: 'primary' }]}
                    stats={[
                        { label: 'Orders', value: counts.total.toLocaleString() },
                        { label: 'Not paid', value: counts.unpaid.toLocaleString(), color: counts.unpaid ? '#f59e0b' : undefined },
                        { label: 'Value shown', value: `KES ${formatKES(totalValue)}` },
                    ]}
                    filters={{
                        options: [
                            ...PAYMENT_METHOD_FILTERS.map((m) => ({ key: m as OrderFilter, label: PAYMENT_METHOD_LABELS[m], icon: PAYMENT_METHOD_ICONS[m], count: counts.byMethod[m] })),
                            { key: 'UNPAID' as OrderFilter, label: 'Not paid', icon: 'alert-circle-outline' as const, count: counts.unpaid },
                        ],
                        value: filter,
                        onChange: setFilter,
                        allKey: 'ALL',
                    }}
                />
            </DetailsDock>

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