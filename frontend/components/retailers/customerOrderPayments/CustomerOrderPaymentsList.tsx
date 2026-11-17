// components/retailers/customerOrderPayments/CustomerOrderPaymentsList.tsx
//
// Payments received on customer orders: live over WebSocket, kept on the
// device for offline use (useCustomerOrderPayments). Shared list kit: cards on
// phones, a table on wide screens; tapping a payment shows its details beside
// the list (wide screens) or in a sheet (phones).

import {
    AdminListView,
    AdminSheet,
    DetailsDock,
    FilterChips,
    formatDateTime,
    useListTokens,
    type AdminBadge,
    type AdminListConfig,
} from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { formatKES, PAYMENT_METHOD_FILTERS, PAYMENT_METHOD_ICONS, PAYMENT_METHOD_LABELS, type PaymentMethodFilter } from '../customerOrders/CustomerOrdersWebView';
import type { StatusFilter } from './PaymentsFilterSheet';
import { useCustomerOrderPayments, type CustomerOrderPaymentItem } from './useCustomerOrderPayments';

type Group = Exclude<StatusFilter, 'ALL'> | 'OTHER';

/** Group a raw provider status into the ones the screen shows. */
function statusGroup(status: string | null | undefined): Group {
    const s = String(status || '').toUpperCase();
    if (s === 'SUCCESS' || s === 'COMPLETED' || s === 'PAID') return 'SUCCESS';
    if (s === 'PENDING' || s === 'PROCESSING' || s === 'INITIATED' || s === '') return 'PENDING';
    if (s === 'FAILED' || s === 'CANCELLED' || s === 'REVERSED' || s === 'DECLINED') return 'FAILED';
    return 'OTHER';
}
const STATUS_BADGE: Record<Group, AdminBadge> = {
    SUCCESS: { label: 'Received', tone: 'success', icon: 'checkmark-circle' },
    PENDING: { label: 'Pending', tone: 'warning' },
    FAILED: { label: 'Failed', tone: 'danger' },
    OTHER: { label: 'Other', tone: 'neutral' },
};
const amountOf = (p: CustomerOrderPaymentItem) => {
    const n = parseFloat(String(p.amount ?? 0));
    return Number.isNaN(n) ? 0 : n;
};
const referenceOf = (p: CustomerOrderPaymentItem) => p.provider_reference_number || p.psp_reference_number || p.reference_number || '—';
const methodOf = (p: CustomerOrderPaymentItem) => {
    const m = String(p.payment_method_title || '').trim();
    return m ? m.charAt(0) + m.slice(1).toLowerCase() : p.telco || '—';
};
/** CASH / CREDIT / MOBILE MONEY (+ M-PESA, Airtel titles). */
function matchesMethod(p: CustomerOrderPaymentItem, filter: PaymentMethodFilter): boolean {
    if (filter === 'ALL') return true;
    const title = String(p.payment_method_title || '').trim().toUpperCase();
    if (filter === 'MOBILE MONEY') return title === 'MOBILE MONEY' || /MOBILE|M-?PESA|AIRTEL/.test(title);
    return title === filter;
}
function matchesQuery(p: CustomerOrderPaymentItem, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [p.order_number, p.customer_name, p.customer_phone, p.payment_method_title, p.reference_number, p.psp_reference_number, p.provider_reference_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
}
const ICON: Record<string, any> = { cash: 'cash-outline', credit: 'time-outline', 'mobile money': 'phone-portrait-outline' };

const config: AdminListConfig<CustomerOrderPaymentItem> = {
    title: 'Payments',
    noun: ['payment', 'payments'],
    icon: 'wallet-outline',
    searchPlaceholder: 'Search order, customer, phone, mobile money code…',
    emptyTitle: 'No payments yet',
    emptyMessage: 'Payments on customer orders appear here as they come in.',
    keyOf: (p, i) => String(p.id || p.reference_number || i),
    titleOf: (p) => p.customer_name || 'Walk-in customer',
    subtitleOf: (p) => [p.order_number, methodOf(p), referenceOf(p) !== '—' ? referenceOf(p) : null].filter(Boolean).join(' · '),
    avatarOf: (p) => ({ icon: ICON[methodOf(p).toLowerCase()] ?? 'wallet-outline' }),
    badgesOf: (p) => [STATUS_BADGE[statusGroup(p.status)]],
    metaOf: (p) => (p.created ? formatDateTime(p.created) : null),
    metaIcon: 'time-outline',
    metricOf: (p) => ({ value: `KES ${formatKES(amountOf(p))}`, label: methodOf(p), color: statusGroup(p.status) === 'SUCCESS' ? '#10b981' : undefined }),
    primaryColumn: { label: 'Customer', flex: 1.7 },
    columns: [
        { key: 'order', label: 'Order', flex: 1.2, render: (p) => p.order_number || '—' },
        { key: 'method', label: 'Method', flex: 1, render: methodOf },
        { key: 'ref', label: 'Reference', flex: 1.3, render: referenceOf },
        { key: 'status', label: 'Status', flex: 0.9, render: (p) => STATUS_BADGE[statusGroup(p.status)].label },
        { key: 'when', label: 'When', flex: 1.3, render: (p) => (p.created ? formatDateTime(p.created) : '—') },
        { key: 'amount', label: 'Amount', flex: 1, align: 'right', render: (p) => `KES ${formatKES(amountOf(p))}` },
    ],
};

export default function CustomerOrderPaymentsList() {
    const { token } = useAuth();
    const { width } = useWindowDimensions();
    const { payments, isConnected, isLoading, lastSynced, authRejected, isOnline, refresh } = useCustomerOrderPayments(token);

    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>('ALL');
    const [method, setMethod] = useState<PaymentMethodFilter>('ALL');
    const [open, setOpen] = useState<CustomerOrderPaymentItem | null>(null);

    const sorted = useMemo(() => [...payments].sort((a, b) => String(b.created).localeCompare(String(a.created))), [payments]);
    const visible = useMemo(
        () => sorted.filter((p) => (status === 'ALL' || statusGroup(p.status) === status) && matchesMethod(p, method) && matchesQuery(p, query.trim())),
        [sorted, status, method, query],
    );
    const paged = usePaged(visible, `${query}|${status}|${method}`);

    const sums = useMemo(() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const c: Record<string, number> = { ALL: payments.length };
        let today = 0;
        let pending = 0;
        for (const p of payments) {
            const g = statusGroup(p.status);
            c[g] = (c[g] ?? 0) + 1;
            if (g === 'SUCCESS' && Date.parse(String(p.created).replace(' ', 'T')) >= startOfDay.getTime()) today += amountOf(p);
            if (g === 'PENDING') pending += amountOf(p);
        }
        const shown = visible.filter((p) => statusGroup(p.status) === 'SUCCESS').reduce((s, p) => s + amountOf(p), 0);
        return { c, today, pending, shown };
    }, [payments, visible]);

    const methodCounts = useMemo(() => {
        const counts = {} as Record<PaymentMethodFilter, number>;
        for (const m of PAYMENT_METHOD_FILTERS) counts[m] = 0;
        for (const p of payments) {
            if (status !== 'ALL' && statusGroup(p.status) !== status) continue;
            if (!matchesQuery(p, query.trim())) continue;
            for (const m of PAYMENT_METHOD_FILTERS) if (matchesMethod(p, m)) counts[m] += 1;
        }
        return counts;
    }, [payments, status, query]);

    const sourceLabel = authRejected ? 'Sign in again' : !isOnline ? 'Offline · saved copy' : isConnected ? 'Live' : 'Saved on this device';

    return (
        <DetailsDock placeholder="Pick a payment to see its references here." pane={<PaymentSheet payment={open} onClose={() => setOpen(null)} />}>
            <AdminListView<CustomerOrderPaymentItem, StatusFilter>
                variant={width >= 768 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={refresh}
                refreshing={isLoading}
                sourceLabel={sourceLabel}
                sourceTone={isConnected ? 'server' : payments.length ? 'cache' : 'none'}
                lastSyncedTime={lastSynced ?? undefined}
                error={authRejected ? 'Your session has expired. Sign in again to see new payments.' : null}
                {...paged}
                onPressItem={setOpen}
                rowActions={(p) => [{ icon: 'eye-outline', label: 'View', onPress: () => setOpen(p), tone: 'primary' }]}
                stats={[
                    { label: 'Today', value: `KES ${formatKES(sums.today)}`, color: sums.today ? '#10b981' : undefined },
                    { label: 'Shown', value: `KES ${formatKES(sums.shown)}` },
                    { label: 'Pending', value: `KES ${formatKES(sums.pending)}`, color: sums.pending ? '#f59e0b' : undefined },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: sums.c.ALL },
                        { key: 'SUCCESS', label: 'Received', icon: 'checkmark-circle-outline', count: sums.c.SUCCESS ?? 0 },
                        { key: 'PENDING', label: 'Pending', icon: 'hourglass-outline', count: sums.c.PENDING ?? 0 },
                        { key: 'FAILED', label: 'Failed', icon: 'close-circle-outline', count: sums.c.FAILED ?? 0 },
                    ],
                    value: status,
                    onChange: setStatus,
                    allKey: 'ALL',
                }}
                toolbarLabel="Payment method"
                toolbarActive={method !== 'ALL'}
                onClearToolbar={() => setMethod('ALL')}
                toolbar={
                    <FilterChips<PaymentMethodFilter>
                        value={method}
                        onChange={setMethod}
                        options={PAYMENT_METHOD_FILTERS.map((m) => ({ key: m, label: PAYMENT_METHOD_LABELS[m], icon: PAYMENT_METHOD_ICONS[m], count: methodCounts[m] }))}
                    />
                }
            />
        </DetailsDock>
    );
}

function PaymentSheet({ payment, onClose }: { payment: CustomerOrderPaymentItem | null; onClose: () => void }) {
    const { theme, border } = useListTokens();
    if (!payment) return null;
    const g = statusGroup(payment.status);
    const row = (label: string, value?: string | number | null) =>
        value !== null && value !== undefined && value !== '' ? (
            <View key={label} className="flex-row justify-between py-2" style={{ gap: 12, borderBottomWidth: 1, borderColor: border }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{label}</Text>
                <Text selectable className="flex-1 text-right" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{String(value)}</Text>
            </View>
        ) : null;
    return (
        <AdminSheet
            visible
            dockable
            onClose={onClose}
            title={`KES ${formatKES(amountOf(payment))}`}
            subtitle={`${payment.customer_name || 'Walk-in customer'} · ${STATUS_BADGE[g].label}`}
            icon="wallet-outline"
            width={520}
        >
            <View>
                {row('Order', payment.order_number)}
                {row('Customer phone', payment.customer_phone)}
                {row('Method', methodOf(payment))}
                {row('Network', payment.telco)}
                {row('Mobile money code', payment.provider_reference_number)}
                {row('Our reference', payment.reference_number)}
                {row('Gateway reference', payment.psp_reference_number)}
                {row('Charge', Number(payment.transaction_charge) > 0 ? `KES ${formatKES(Number(payment.transaction_charge))}` : null)}
                {row('Note', payment.description || payment.narration)}
                {row('Validated', payment.is_validated ? 'Yes' : 'Not yet')}
                {row('Received', payment.created ? formatDateTime(payment.created) : null)}
            </View>
        </AdminSheet>
    );
}
