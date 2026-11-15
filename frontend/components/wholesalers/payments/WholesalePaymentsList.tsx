// components/wholesalers/payments/WholesalePaymentsList.tsx
//
// Money received on retailer orders: every payment (M-Pesa, cash, bank…), its
// order and retailer, the platform commission and what is paid out.
// Shared list kit: cards on phones, a table on wide screens. Offline-first:
// opens from the copy saved on this device and refreshes when online and every
// minute while open (hooks/useCachedList).
//
// Backend: POST /wholesalers/retailers/orders/staff {action: GetRetailerOrderPayments}

import client from '@/api/client';
import { AdminListView, AdminSheet, formatDateTime, useListTokens, type AdminListConfig, type BadgeTone } from '@/components/common/listScreen';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

export interface WholesalePayment {
    id: string;
    retailer_order: string;
    retailer_order_reference: string;
    retailer_title: string;
    amount: string;
    commission_amount?: string;
    payout_amount?: string;
    currency?: string;
    is_settled?: string;
    payment_method: string | null;
    payment_method_title: string;
    provider_reference_number: string | null;
    pay_in_reference_number: string | null;
    pay_out_reference_number: string | null;
    telco: string | null;
    description: string | null;
    narrative: string | null;
    status: string;
    created: string;
    updated: string;
}

type Filter = 'ALL' | 'SUCCESS' | 'PENDING' | 'FAILED';

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
    SUCCESS: { label: 'Received', tone: 'success' },
    COMPLETED: { label: 'Received', tone: 'success' },
    PENDING: { label: 'Pending', tone: 'warning' },
    FAILED: { label: 'Failed', tone: 'danger' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
const statusOf = (p: WholesalePayment) => {
    const s = String(p.status || '').toUpperCase();
    return s === 'COMPLETED' ? 'SUCCESS' : s;
};
const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const methodOf = (p: WholesalePayment) => {
    const m = String(p.payment_method_title || '').trim();
    return m ? m.charAt(0) + m.slice(1).toLowerCase() : p.telco || 'Payment';
};
const refOf = (p: WholesalePayment) => p.provider_reference_number || p.pay_in_reference_number || '';
const ICON: Record<string, any> = { 'mobile money': 'phone-portrait-outline', cash: 'cash-outline', card: 'card-outline', bank: 'business-outline' };

const config: AdminListConfig<WholesalePayment> = {
    title: 'Payments',
    noun: ['payment', 'payments'],
    icon: 'wallet-outline',
    searchPlaceholder: 'Search retailer, order, M-Pesa code…',
    emptyTitle: 'No payments yet',
    emptyMessage: 'Payments retailers make on their orders appear here.',
    keyOf: (p) => p.id,
    titleOf: (p) => p.retailer_title || 'Retailer',
    subtitleOf: (p) => [p.retailer_order_reference, methodOf(p), refOf(p)].filter(Boolean).join(' · '),
    avatarOf: (p) => ({ icon: ICON[methodOf(p).toLowerCase()] ?? 'wallet-outline' }),
    badgesOf: (p) => [STATUS[statusOf(p)] ?? { label: p.status, tone: 'neutral' }],
    metaOf: (p) => (p.created ? formatDateTime(p.created) : null),
    metaIcon: 'time-outline',
    metricOf: (p) => ({ value: kes(p.amount), label: Number(p.payout_amount) > 0 ? `${kes(p.payout_amount)} to you` : methodOf(p), color: statusOf(p) === 'SUCCESS' ? '#10b981' : undefined }),
    primaryColumn: { label: 'Retailer', flex: 1.7 },
    columns: [
        { key: 'order', label: 'Order', flex: 1.1, render: (p) => p.retailer_order_reference || '—' },
        { key: 'method', label: 'Method', flex: 0.9, render: methodOf },
        { key: 'ref', label: 'Reference', flex: 1.2, render: (p) => refOf(p) || '—' },
        { key: 'status', label: 'Status', flex: 0.8, render: (p) => STATUS[statusOf(p)]?.label ?? p.status },
        { key: 'when', label: 'When', flex: 1.2, render: (p) => (p.created ? formatDateTime(p.created) : '—') },
        { key: 'amount', label: 'Amount', flex: 1, align: 'right', render: (p) => kes(p.amount) },
    ],
};

export default function WholesalePaymentsList() {
    const { width } = useWindowDimensions();
    const list = useCachedList<WholesalePayment>({
        key: 'wholesaler_payments',
        fetch: () => client.post('/wholesalers/retailers/orders/staff', { action: 'GetRetailerOrderPayments' }),
        pick: (d) => d?.results ?? d?.payments ?? (Array.isArray(d) ? d : []),
        pollMs: 60000,
    });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [open, setOpen] = useState<WholesalePayment | null>(null);

    const sums = useMemo(() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const monthStart = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
        const c: Record<string, number> = { ALL: list.items.length };
        let today = 0;
        let month = 0;
        let pending = 0;
        for (const p of list.items) {
            const s = statusOf(p);
            c[s] = (c[s] ?? 0) + 1;
            const t = Date.parse(String(p.created).replace(' ', 'T'));
            if (s === 'SUCCESS') {
                if (t >= startOfDay.getTime()) today += Number(p.amount || 0);
                if (t >= monthStart.getTime()) month += Number(p.amount || 0);
            } else if (s === 'PENDING') pending += Number(p.amount || 0);
        }
        return { c, today, month, pending };
    }, [list.items]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((p) => filter === 'ALL' || statusOf(p) === filter)
            .filter((p) => !q || `${p.retailer_title} ${p.retailer_order_reference} ${refOf(p)} ${p.pay_out_reference_number ?? ''} ${methodOf(p)}`.toLowerCase().includes(q))
            .sort((a, b) => String(b.created).localeCompare(String(a.created)));
    }, [list.items, filter, query]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    return (
        <>
            <AdminListView<WholesalePayment, Filter>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={list.refresh}
                refreshing={list.refreshing}
                sourceLabel={list.sourceLabel}
                sourceTone={list.source}
                lastSyncedTime={list.lastSynced}
                error={list.error}
                {...paged}
                onPressItem={setOpen}
                rowActions={(p) => [{ icon: 'eye-outline', label: 'View', onPress: () => setOpen(p), tone: 'primary' }]}
                stats={[
                    { label: 'Today', value: kes(sums.today), color: sums.today ? '#10b981' : undefined },
                    { label: 'This month', value: kes(sums.month) },
                    { label: 'Pending', value: kes(sums.pending), color: sums.pending ? '#f59e0b' : undefined },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: sums.c.ALL },
                        { key: 'SUCCESS', label: 'Received', icon: 'checkmark-circle-outline', count: sums.c.SUCCESS ?? 0 },
                        { key: 'PENDING', label: 'Pending', icon: 'hourglass-outline', count: sums.c.PENDING ?? 0 },
                        { key: 'FAILED', label: 'Failed', icon: 'close-circle-outline', count: sums.c.FAILED ?? 0 },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
            />
            <PaymentSheet payment={open} onClose={() => setOpen(null)} />
        </>
    );
}

function PaymentSheet({ payment, onClose }: { payment: WholesalePayment | null; onClose: () => void }) {
    const { theme, border } = useListTokens();
    if (!payment) return null;
    const row = (label: string, value?: string | null) =>
        value ? (
            <View key={label} className="flex-row justify-between py-2" style={{ gap: 12, borderBottomWidth: 1, borderColor: border }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{label}</Text>
                <Text selectable className="flex-1 text-right" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
            </View>
        ) : null;
    const s = STATUS[statusOf(payment)] ?? { label: payment.status, tone: 'neutral' };
    return (
        <AdminSheet visible onClose={onClose} title={kes(payment.amount)} subtitle={`${payment.retailer_title} · ${s.label}`} icon="wallet-outline" width={520}>
            <View>
                {row('Order', payment.retailer_order_reference)}
                {row('Method', methodOf(payment))}
                {row('Network', payment.telco)}
                {row('Reference', refOf(payment))}
                {row('Commission', Number(payment.commission_amount) > 0 ? kes(payment.commission_amount) : null)}
                {row('Paid out to you', Number(payment.payout_amount) > 0 ? kes(payment.payout_amount) : null)}
                {row('Payout reference', payment.pay_out_reference_number)}
                {row('Settled', payment.is_settled ? (String(payment.is_settled) === 'true' ? 'Yes' : 'Not yet') : null)}
                {row('Note', payment.description || payment.narrative)}
                {row('Received', payment.created ? formatDateTime(payment.created) : null)}
            </View>
        </AdminSheet>
    );
}
