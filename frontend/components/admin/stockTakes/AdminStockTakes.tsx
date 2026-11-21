// components/admin/stockTakes/AdminStockTakes.tsx
//
// Admin -> Stock takes: every stock take booked by agents (fee, paid, status),
// and stocktakers' dues — days worked x daily rate — to pay to their payout
// accounts, then mark paid with the payment reference. Backend: stocktakes/ (admin).

import { adminStockTakesApi, type StockTake, type StocktakerDue } from '@/api/stockTakesApi';
import { AdminListView, formatDate, SegmentedControl, SheetButton, textOr, useListTokens, type AdminListConfig } from '@/components/admin/kit';
import { stockTakesConfig } from '@/components/agents/AgentStockTakes';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

type Tab = 'TAKES' | 'DUES';
const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';

const takesConfig: AdminListConfig<StockTake> = {
    ...stockTakesConfig,
    addLabel: undefined,
    subtitleOf: (st) => `${formatDate(st.starts_on)} – ${formatDate(st.ends_on)} · agent ${st.agent_name || '—'}`,
    columns: [{ key: 'agent', label: 'Agent', flex: 1.3, render: (st) => textOr(st.agent_name) }, ...stockTakesConfig.columns],
};

export default function AdminStockTakes() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const { theme, border, chipBg } = useListTokens();
    const alert = useAlert();
    const [tab, setTab] = useState<Tab>('DUES');
    const [takes, setTakes] = useState<StockTake[]>([]);
    const [dues, setDues] = useState<StocktakerDue[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [reference, setReference] = useState('');
    const [paying, setPaying] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [a, b]: any[] = await Promise.all([adminStockTakesApi.list(), adminStockTakesApi.dues()]);
            if (ok(a)) setTakes(a.data.stock_takes ?? []);
            if (ok(b)) setDues(b.data.dues ?? []);
            setError(ok(a) && ok(b) ? null : 'Could not load stock takes.');
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const q = query.trim().toLowerCase();
    const takeRows = useMemo(() => (q ? takes.filter((t) => `${t.entity_title} ${t.agent_name}`.toLowerCase().includes(q)) : takes), [takes, q]);
    const dueRows = useMemo(() => (q ? dues.filter((d) => `${d.name} ${d.entity_title}`.toLowerCase().includes(q)) : dues), [dues, q]);
    const owed = dues.filter((d) => d.payout_status === 'PENDING');
    const pickedTotal = owed.filter((d) => picked.has(d.id)).reduce((s, d) => s + Number(d.amount_due), 0);

    const toggle = (id: string) => setPicked((p) => {
        const n = new Set(p);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
    });

    const duesConfig: AdminListConfig<StocktakerDue> = {
        title: 'Stocktaker dues',
        noun: ['due', 'dues'],
        icon: 'wallet-outline',
        searchPlaceholder: 'Search stocktaker or business…',
        emptyMessage: 'Dues appear when a stock take is submitted: days worked × the daily rate.',
        keyOf: (d) => d.id,
        titleOf: (d) => d.name,
        subtitleOf: (d) => `${d.entity_title} · ${formatDate(d.starts_on)} · ${d.days_worked} day(s) × ${formatKES(d.daily_rate)}`,
        avatarOf: (d) => ({ label: d.name }),
        badgesOf: (d) => [
            d.payout_status === 'PAID' ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Owed', tone: 'warning' },
            ...(d.payout_account ? [] : [{ label: 'No payout account', tone: 'danger' as const, icon: 'alert-circle' as const }]),
        ],
        metricOf: (d) => ({ value: formatKES(d.amount_due), label: 'due' }),
        primaryColumn: { label: 'Stocktaker', flex: 1.6 },
        columns: [
            { key: 'pick', label: '', flex: 0.4, render: (d) => (d.payout_status === 'PENDING' ? <Check on={picked.has(d.id)} onPress={() => toggle(d.id)} /> : null) },
            { key: 'biz', label: 'Business', flex: 1.5, render: (d) => d.entity_title },
            { key: 'days', label: 'Days', flex: 0.6, align: 'right', render: (d) => String(d.days_worked) },
            { key: 'due', label: 'Due', flex: 1, align: 'right', render: (d) => formatKES(d.amount_due) },
            { key: 'acct', label: 'Pay to', flex: 1.8, render: (d) => (d.payout_account ? `${d.payout_account.type} ${d.payout_account.number}${d.payout_account.verified ? '' : ' (unverified)'}` : '—') },
            { key: 'status', label: 'Status', flex: 0.9, render: (d) => (d.payout_status === 'PAID' ? `Paid ${d.payout_reference || ''}` : 'Owed') },
        ],
    };

    const markPaid = async () => {
        const ids = owed.filter((d) => picked.has(d.id)).map((d) => d.id);
        if (!ids.length) return alert('Pick dues', 'Tick the dues you have paid.');
        setPaying(true);
        try {
            const res: any = await adminStockTakesApi.markPaid(ids, reference.trim() || undefined);
            if (ok(res)) {
                setPicked(new Set());
                setReference('');
                alert('Marked paid', `${ids.length} due(s), ${formatKES(pickedTotal)}.`, undefined, 'success');
                void load();
            } else alert('Not marked paid', res?.data?.errors?.join?.(' ') || 'Try again.', undefined, 'danger');
        } finally {
            setPaying(false);
        }
    };

    const header = (
        <View style={{ gap: 10, marginBottom: 8 }}>
            <SegmentedControl<Tab>
                value={tab}
                onChange={setTab}
                options={[
                    { key: 'DUES', label: `Stocktaker dues${owed.length ? ` (${owed.length})` : ''}` },
                    { key: 'TAKES', label: 'Stock takes' },
                ]}
            />
            {tab === 'DUES' && picked.size ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: chipBg, flexWrap: 'wrap' }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>{picked.size} picked · {formatKES(pickedTotal)}</Text>
                    <TextInput
                        value={reference}
                        onChangeText={setReference}
                        placeholder="Payment reference (optional)"
                        placeholderTextColor={theme.textDark}
                        style={{ flex: 1, minWidth: 160, height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                    />
                    <SheetButton label="Mark paid" icon="checkmark-done" loading={paying} onPress={() => void markPaid()} />
                </View>
            ) : null}
        </View>
    );

    const common = {
        variant: (isLarge ? 'web' : 'mobile') as 'web' | 'mobile',
        query,
        setQuery,
        onRefresh: load,
        refreshing,
        sourceLabel: error ? 'Not loaded' : 'Server',
        sourceTone: (error ? 'none' : 'server') as 'none' | 'server',
        error,
        header,
        page: 1,
        pageSize: 100 as any,
        totalPages: 1,
        pageStart: 0,
        onPrev: () => {},
        onNext: () => {},
        onPageSizeChange: () => {},
    };

    return tab === 'DUES' ? (
        <AdminListView<StocktakerDue, string>
            {...common}
            config={duesConfig}
            items={dueRows}
            allItems={dueRows}
            totalItems={dueRows.length}
            pageEnd={dueRows.length}
            onPressItem={(d) => d.payout_status === 'PENDING' && toggle(d.id)}
            stats={[
                { label: 'Owed', value: formatKES(owed.reduce((s, d) => s + Number(d.amount_due), 0)), color: '#f59e0b' },
                { label: 'Stocktakers owed', value: new Set(owed.map((d) => d.onboarder)).size.toLocaleString() },
                { label: 'Paid out', value: formatKES(dues.filter((d) => d.payout_status === 'PAID').reduce((s, d) => s + Number(d.amount_due), 0)), color: '#10b981' },
            ]}
        />
    ) : (
        <AdminListView<StockTake, string>
            {...common}
            config={takesConfig}
            items={takeRows}
            allItems={takeRows}
            totalItems={takeRows.length}
            pageEnd={takeRows.length}
            onPressItem={() => {}}
            stats={[
                { label: 'Stock takes', value: takes.length.toLocaleString() },
                { label: 'Fees paid', value: formatKES(takes.filter((t) => t.is_paid).reduce((s, t) => s + Number(t.fee || 0), 0)), color: '#10b981' },
                { label: 'Unpaid', value: takes.filter((t) => !t.is_paid && t.status !== 'CANCELLED').length.toLocaleString(), color: '#f59e0b' },
            ]}
        />
    );
}

function Check({ on, onPress }: { on: boolean; onPress: () => void }) {
    const { theme } = useListTokens();
    return (
        <Pressable onPress={onPress} hitSlop={8}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.primary : theme.textDark} />
        </Pressable>
    );
}
