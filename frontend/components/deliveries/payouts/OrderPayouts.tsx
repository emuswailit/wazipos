// components/deliveries/payouts/OrderPayouts.tsx
//
// Payouts: what buyers' single payments owe onward (backend payments/utils/order_payouts.py).
//   vendors          the goods amount (less commission) to the business payout
//                    account, once the goods are released to the delivery person
//                    (pickup orders: once collected);
//   delivery persons each delivery's pay to their personal payout account, on
//                    delivery to the buyer or to the courier's office;
//   couriers         their charge to the business payout account, once the goods
//                    are received at their dispatch office.
// Everyone sees what they are owed; WaziPOS admin can see everything and retry failures.

import deliveriesApi, { apiError, isOk, type OrderPayout } from '@/api/deliveriesApi';
import { SegmentedControl, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

type Filter = 'OPEN' | 'PAID' | 'PROBLEMS' | 'ALL';
const COLORS: Record<OrderPayout['status'], string> = {
    DUE: '#f59e0b',
    PROCESSING: '#3b82f6',
    PAID: '#10b981',
    FAILED: '#f43f5e',
    NO_ACCOUNT: '#f97316',
    SELLER_PAYS: '#94a3b8',
};

export default function OrderPayouts() {
    const { theme, border } = useListTokens();
    const { user } = useAuth() as any;
    const admin = isPlatformAdmin(user);
    const alert = useAlert();
    const [everyone, setEveryone] = useState(admin);
    const [filter, setFilter] = useState<Filter>('OPEN');
    const [rows, setRows] = useState<OrderPayout[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await deliveriesApi.getOrderPayouts(everyone ? { scope: 'ALL' } : {});
            setRows(isOk(res) ? res.data.payouts ?? [] : []);
        } finally {
            setRefreshing(false);
        }
    }, [everyone]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const shown = useMemo(
        () =>
            (rows ?? []).filter((r) =>
                filter === 'ALL' ? true : filter === 'PAID' ? r.status === 'PAID' : filter === 'PROBLEMS' ? ['FAILED', 'NO_ACCOUNT'].includes(r.status) : ['DUE', 'PROCESSING', 'NO_ACCOUNT'].includes(r.status),
            ),
        [rows, filter],
    );
    const owed = (rows ?? []).filter((r) => ['DUE', 'PROCESSING', 'NO_ACCOUNT'].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0);
    const paid = (rows ?? []).filter((r) => r.status === 'PAID').reduce((s, r) => s + Number(r.amount), 0);
    const noAccount = (rows ?? []).some((r) => r.status === 'NO_ACCOUNT');

    const retry = async (r: OrderPayout) => {
        const res: any = await deliveriesApi.retryOrderPayout(r.id);
        if (isOk(res)) void load();
        else alert('Not retried', apiError(res, 'Could not retry this payout.'), undefined, 'danger');
    };

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <View style={{ gap: 2 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Payouts</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    Buyers pay once. Sellers get the goods amount once the goods leave with the delivery person; riders get paid on delivery (to the buyer or the courier's office); couriers once the goods reach their dispatch office.
                </Text>
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                Owed {formatKES(String(owed))} · Paid {formatKES(String(paid))}
            </Text>
            {noAccount ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: '#f9731614', borderWidth: 1, borderColor: '#f9731655' }}>
                    <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        Some payouts wait for a payout account: they are paid automatically once one is added.
                    </Text>
                    <SheetButton label="Personal" variant="ghost" onPress={() => router.push('/myPayoutAccounts' as any)} />
                    <SheetButton label="Business" variant="ghost" onPress={() => router.push('/payoutAccounts?tab=payoutAccounts' as any)} />
                </View>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <SegmentedControl<Filter>
                    options={[{ key: 'OPEN', label: 'Owed' }, { key: 'PAID', label: 'Paid' }, { key: 'PROBLEMS', label: 'Problems' }, { key: 'ALL', label: 'All' }]}
                    value={filter}
                    onChange={setFilter}
                />
                {admin ? (
                    <SegmentedControl<'ME' | 'ALL'> options={[{ key: 'ALL', label: 'Everyone' }, { key: 'ME', label: 'Mine' }]} value={everyone ? 'ALL' : 'ME'} onChange={(k) => setEveryone(k === 'ALL')} />
                ) : null}
            </View>
            {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
            {rows && shown.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>Nothing here.</Text> : null}
            {shown.map((r) => (
                <View key={r.id} style={{ padding: 12, gap: 4, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${COLORS[r.status]}22` }}>
                            <Text style={{ color: COLORS[r.status], fontFamily: theme.font.bold, fontSize: 11 }}>{r.status_label}</Text>
                        </View>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>
                            {r.payee_kind_label}
                            {everyone && r.payee ? ` · ${r.payee}` : ''} · order {r.order_reference}
                        </Text>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(r.amount)}</Text>
                    </View>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        {[
                            r.seller && r.payee_kind !== 'VENDOR' ? `sold by ${r.seller}` : '',
                            Number(r.commission_amount) ? `${formatKES(r.gross_amount)} less ${formatKES(r.commission_amount)} commission` : '',
                            r.account ? `to ${r.account}` : '',
                            r.paid_at ? `paid ${new Date(r.paid_at).toLocaleString()}` : r.due_at ? `due since ${new Date(r.due_at).toLocaleString()}` : '',
                            r.psp_reference ? `ref ${r.psp_reference}` : '',
                            r.note,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </Text>
                    {admin && r.status === 'FAILED' ? (
                        <View style={{ flexDirection: 'row' }}>
                            <SheetButton label="Retry" icon="refresh" variant="secondary" onPress={() => void retry(r)} />
                        </View>
                    ) : null}
                </View>
            ))}
        </ScrollView>
    );
}
