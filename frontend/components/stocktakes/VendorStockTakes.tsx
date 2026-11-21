// components/stocktakes/VendorStockTakes.tsx
//
// A business's stock takes (its super admin): counts done by WaziPOS stocktakers,
// booked through the business's agent. Pay the agreed fee by mobile money (like
// the subscription), then review counted vs book stock and decide line by line
// — set stock to the count (a stock adjustment) or keep book stock. Nothing
// changes until you decide. Backend: stocktakes/ (vendor endpoint).

import { vendorStockTakesApi, STATUS_META, type CountLine, type StockTake } from '@/api/stockTakesApi';
import { AdminListView, AdminSheet, DetailsDock, formatDate, SheetButton, useListTokens } from '@/components/admin/kit';
import { stockTakesConfig } from '@/components/agents/AgentStockTakes';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, useWindowDimensions, View } from 'react-native';

import StockTakeReportView from './StockTakeReportView';

const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';
const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join('\n');
    return res?.data?.response_message || res?.problem || fallback;
};

const config = {
    ...stockTakesConfig,
    addLabel: undefined,
    emptyMessage: 'Ask your WaziPOS agent to book a stock take: an independent count of your stock against the system, with a report.',
    columns: stockTakesConfig.columns.filter((c) => c.key !== 'who'),
};

export default function VendorStockTakes() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [rows, setRows] = useState<StockTake[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<StockTake | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await vendorStockTakesApi.list();
            if (ok(res)) {
                setRows(res.data.stock_takes ?? []);
                setLoadError(null);
            } else setLoadError(errorText(res, 'Could not load stock takes.'));
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const items = query.trim() ? rows.filter((r) => r.entity_title.toLowerCase().includes(query.trim().toLowerCase())) : rows;

    return (
        <DetailsDock
            placeholder="Pick a stock take to see its report."
            pane={viewing ? <VendorStockTakeDetails stockTake={viewing} onClose={() => setViewing(null)} onChanged={() => void load()} /> : null}
        >
            <AdminListView<StockTake, string>
                variant={isLarge ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={loadError ? 'Not loaded' : 'Server'}
                sourceTone={loadError ? 'none' : 'server'}
                error={loadError}
                items={items}
                allItems={items}
                onPressItem={setViewing}
                stats={[
                    { label: 'Stock takes', value: rows.length.toLocaleString() },
                    { label: 'To review', value: rows.filter((r) => r.status === 'SUBMITTED').length.toLocaleString(), color: '#8b5cf6' },
                    { label: 'Unpaid', value: rows.filter((r) => !r.is_paid).length.toLocaleString(), color: '#f59e0b' },
                ]}
                page={1}
                pageSize={100 as any}
                totalItems={items.length}
                totalPages={1}
                pageStart={0}
                pageEnd={items.length}
                onPrev={() => {}}
                onNext={() => {}}
                onPageSizeChange={() => {}}
            />
        </DetailsDock>
    );
}

function VendorStockTakeDetails({ stockTake, onClose, onChanged }: { stockTake: StockTake; onClose: () => void; onChanged: () => void }) {
    const { theme, border } = useListTokens();
    const { user } = useAuth() as any;
    const alert = useAlert();
    const [st, setSt] = useState<StockTake>(stockTake);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [phone, setPhone] = useState(String(user?.phone && user.phone !== 'None' ? user.phone : ''));

    const reload = useCallback(async () => {
        const res: any = await vendorStockTakesApi.report(stockTake.id);
        if (ok(res)) setSt(res.data.stock_take);
        setLoading(false);
    }, [stockTake.id]);
    useEffect(() => { setLoading(true); void reload(); }, [reload]);

    const decide = async (key: string, fn: () => Promise<any>) => {
        setBusy(key);
        try {
            const res: any = await fn();
            if (ok(res)) {
                setSt(res.data.stock_take);
                const errs: string[] = res.data.stock_take?.errors ?? [];
                if (errs.length) alert('Some lines not applied', errs.join('\n'), undefined, 'danger');
                onChanged();
            } else alert('Not applied', errorText(res, 'Could not apply.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };

    const pay = async () => {
        if (!phone.trim()) return alert('Mobile money', 'Enter the number to pay from.');
        setBusy('pay');
        try {
            const res: any = await vendorStockTakesApi.pay(st.id, phone.trim());
            if (ok(res)) alert('Check your phone', `Enter your PIN to pay ${formatKES(st.fee)}. Refresh after paying.`, undefined, 'success');
            else alert('Payment not started', errorText(res, 'Could not start the payment.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };

    const reviewable = (st.status === 'SUBMITTED' || st.status === 'APPLIED') && st.is_paid;
    const pending = st.report?.summary.pending ?? 0;

    return (
        <AdminSheet
            visible
            onClose={onClose}
            title={`Stock take · ${formatDate(st.starts_on)}`}
            subtitle={`${STATUS_META[st.status].label} · fee ${formatKES(st.fee)} · ${st.is_paid ? 'paid' : 'not paid'}`}
            icon="clipboard-outline"
            width={720}
            footer={
                reviewable && pending ? (
                    <>
                        <SheetButton label="Keep book stock for all" variant="ghost" loading={busy === 'keep'} onPress={() => void decide('keep', () => vendorStockTakesApi.decideAll(st.id, 'KEEP'))} />
                        <SheetButton label="Apply all counts" icon="checkmark-done" loading={busy === 'apply'} onPress={() => void decide('apply', () => vendorStockTakesApi.decideAll(st.id, 'APPLY'))} />
                    </>
                ) : (
                    <SheetButton label="Close" variant="ghost" onPress={onClose} />
                )
            }
        >
            <View style={{ gap: 14 }}>
                {!st.is_paid ? (
                    <View style={{ gap: 6 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Pay for this stock take</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TextInput
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="Mobile money number"
                                placeholderTextColor={theme.textDark}
                                keyboardType="phone-pad"
                                style={{ flex: 1, height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                            />
                            <SheetButton label={`Pay ${formatKES(st.fee)}`} icon="phone-portrait-outline" loading={busy === 'pay'} onPress={() => void pay()} />
                        </View>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>The count results can be applied to your stock once paid.</Text>
                    </View>
                ) : null}
                {st.status === 'SCHEDULED' || st.status === 'COUNTING' ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        Counting runs {formatDate(st.starts_on)} – {formatDate(st.ends_on)}. The full report is ready once the agent submits the count.
                    </Text>
                ) : null}
                {loading ? <ActivityIndicator color={theme.primary} /> : null}
                {st.report ? (
                    <StockTakeReportView
                        report={st.report}
                        mode="vendor"
                        busyLine={busy}
                        onDecide={reviewable ? (l: CountLine, d) => void decide(l.id, () => vendorStockTakesApi.decideLines(st.id, [{ count: l.id, decision: d }])) : undefined}
                    />
                ) : null}
            </View>
        </AdminSheet>
    );
}
