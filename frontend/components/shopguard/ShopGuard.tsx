// components/shopguard/ShopGuard.tsx
//
// Owner-away protection, for the shop's owner (super admin):
//   Overview     who's on shift now, sales while you're in vs away (per staff hour,
//                cash share), alerts, barcodes scanned that you don't stock
//   Staff        per person: hours, sales, per hour, cash share, sales when you're
//                away, cash short / over, unknown scans
//   Shifts       every clock-in / out with location check and the blind cash count
//   Commissions  set each employee's rate and monthly target; monthly statements; mark paid
//   Settings     alerts, geofence, idle time, cash variance, alert phone
// Backend: shopguard/services.py.

import { apiError, isOk } from '@/api/deliveriesApi';
import shopGuardApi, {
    type CommissionPlan,
    type CommissionStatement,
    type GuardSettings,
    type PresenceBucket,
    type Shift,
    type WatchReport,
} from '@/api/shopGuardApi';
import { SegmentedControl, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import InsuranceOffer from '@/components/insurance/InsuranceOffer';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';

type Tab = 'OVERVIEW' | 'STAFF' | 'SHIFTS' | 'COMMISSIONS' | 'SETTINGS';
type Range = 7 | 30;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fromFor = (days: number) => iso(new Date(Date.now() - (days - 1) * 86400000));
const money = (v: string | null | undefined) => formatKES(v ?? '0');
const thisMonth = () => new Date().toISOString().slice(0, 7);
const lastMonth = () => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().slice(0, 7);
};

export default function ShopGuard() {
    const { theme } = useListTokens();
    const { width } = useWindowDimensions();
    const [tab, setTab] = useState<Tab>('OVERVIEW');
    const [range, setRange] = useState<Range>(7);
    const [report, setReport] = useState<WatchReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await shopGuardApi.getWatchReport(fromFor(range), iso(new Date()));
            if (isOk(res)) {
                setReport(res.data.report);
                setError(null);
            } else setError(apiError(res, 'Could not load the report.'));
        } finally {
            setRefreshing(false);
        }
    }, [range]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ padding: 16, paddingBottom: 6, gap: 10, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
                <View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Shop guard</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        How your shop runs while you're away: shifts, cash counts, sales per hour, and goods that aren't yours.
                    </Text>
                </View>
                <SegmentedControl<Tab>
                    options={[
                        { key: 'OVERVIEW', label: 'Overview' },
                        { key: 'STAFF', label: 'Staff' },
                        { key: 'SHIFTS', label: 'Shifts' },
                        { key: 'COMMISSIONS', label: 'Commissions' },
                        { key: 'SETTINGS', label: 'Settings' },
                    ]}
                    value={tab}
                    onChange={setTab}
                    variant={width < 640 ? 'mobile' : 'web'}
                />
                {/* WaziPOS Cover: protect what shop guard watches over. */}
                {tab === 'OVERVIEW' ? (
                    <View style={{ flexDirection: width >= 900 ? 'row' : 'column', gap: 8 }}>
                        <View style={{ flex: width >= 900 ? 1 : undefined }}>
                            <InsuranceOffer product="TILL_GUARD" source="shop_guard" variant="strip" />
                        </View>
                        <View style={{ flex: width >= 900 ? 1 : undefined }}>
                            <InsuranceOffer product="DUKA_COVER" source="shop_guard" variant="strip" />
                        </View>
                    </View>
                ) : null}
                {tab === 'OVERVIEW' || tab === 'STAFF' || tab === 'SHIFTS' ? (
                    <SegmentedControl<'7' | '30'> options={[{ key: '7', label: 'Last 7 days' }, { key: '30', label: 'Last 30 days' }]} value={String(range) as '7' | '30'} onChange={(k) => setRange(Number(k) as Range)} />
                ) : null}
            </View>
            {error ? <Text style={{ marginHorizontal: 16, color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            {tab === 'OVERVIEW' ? <Overview report={report} refreshing={refreshing} onRefresh={load} /> : null}
            {tab === 'STAFF' ? <Staff report={report} refreshing={refreshing} onRefresh={load} /> : null}
            {tab === 'SHIFTS' ? <Shifts range={range} /> : null}
            {tab === 'COMMISSIONS' ? <Commissions /> : null}
            {tab === 'SETTINGS' ? <Settings /> : null}
        </View>
    );
}

/* ------------------------------------------------------------------ shared */

function Page({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
    const { theme } = useListTokens();
    return (
        <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 1080, width: '100%', alignSelf: 'center' }}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.primary} /> : undefined}
        >
            {children}
        </ScrollView>
    );
}

function Card({ children, tint }: { children: React.ReactNode; tint?: string }) {
    const { theme, border } = useListTokens();
    return <View style={{ padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: tint ? `${tint}66` : border, backgroundColor: tint ? `${tint}10` : theme.panel }}>{children}</View>;
}

function Line({ children, dim, bold, color }: { children: React.ReactNode; dim?: boolean; bold?: boolean; color?: string }) {
    const { theme } = useListTokens();
    return (
        <Text style={{ color: color ?? (dim ? theme.textDark : theme.text), fontFamily: bold ? theme.font.bold : theme.font.medium, fontSize: bold ? 14 : 12.5 }}>{children}</Text>
    );
}

/* ------------------------------------------------------------------ overview */

function Presence({ title, b, color }: { title: string; b: PresenceBucket; color: string }) {
    const { theme } = useListTokens();
    return (
        <View style={{ flexGrow: 1, flexBasis: 240 }}>
            <Card tint={color}>
                <Line bold color={color}>{title}</Line>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{b.per_staff_hour ? `${money(b.per_staff_hour)} / staff hour` : money(b.sales_total)}</Text>
                <Line dim>
                    {b.sales_count} sale(s) · {money(b.sales_total)} · {b.staff_hours} staff hours{b.cash_share != null ? ` · ${b.cash_share}% cash` : ''}
                </Line>
            </Card>
        </View>
    );
}

function Overview({ report, refreshing, onRefresh }: { report: WatchReport | null; refreshing: boolean; onRefresh: () => void }) {
    const { theme, border } = useListTokens();
    if (!report) return <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />;
    const p = Number(report.owner_present.per_staff_hour || 0);
    const a = Number(report.owner_away.per_staff_hour || 0);
    const drop = p > 0 && a > 0 ? Math.round((1 - a / p) * 100) : null;
    return (
        <Page refreshing={refreshing} onRefresh={onRefresh}>
            <Card>
                <Line bold>On shift now</Line>
                {report.on_shift.length === 0 ? <Line dim>Nobody is clocked in.</Line> : null}
                {report.on_shift.map((s) => (
                    <Line key={s.id} dim>
                        {s.name}
                        {s.is_owner ? ' (you)' : ''} · since {new Date(s.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {s.in_inside === false ? ` · ${s.in_distance_m?.toLocaleString()} m from the shop` : s.in_inside == null ? ' · location not shared' : ''}
                    </Line>
                ))}
            </Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Presence title="While you're in" b={report.owner_present} color="#10b981" />
                <Presence title="While you're away" b={report.owner_away} color={drop != null && drop >= 25 ? '#f43f5e' : '#3b82f6'} />
            </View>
            {drop != null && drop >= 25 ? (
                <Card tint="#f43f5e">
                    <Line bold color="#f43f5e">Sales per staff hour are {drop}% lower when you're away.</Line>
                    <Line dim>Compare staff in the Staff tab, check cash counts, and book a surprise stock take to look for goods that aren't yours.</Line>
                </Card>
            ) : null}
            <Card>
                <Line bold>Alerts</Line>
                {report.alerts.length === 0 ? <Line dim>No alerts in this period.</Line> : null}
                {report.alerts.slice(0, 20).map((al) => (
                    <View key={al.id} style={{ flexDirection: 'row', gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: border }}>
                        <Ionicons name="alert-circle-outline" size={16} color="#f59e0b" />
                        <View style={{ flex: 1 }}>
                            <Line>{al.message}</Line>
                            <Line dim>{al.kind_label} · {new Date(al.created).toLocaleString()}</Line>
                        </View>
                    </View>
                ))}
            </Card>
            {report.unknown_scans.length ? (
                <Card tint="#f59e0b">
                    <Line bold>Barcodes scanned that you don't stock ({report.unknown_scans.length})</Line>
                    <Line dim>Scanned at the till but not in your stock: often goods that aren't yours.</Line>
                    {report.unknown_scans.slice(0, 15).map((u, i) => (
                        <Line key={`${u.barcode}-${i}`} dim>
                            {u.barcode} · {u.user ?? '—'} · {new Date(u.created).toLocaleString()}
                        </Line>
                    ))}
                </Card>
            ) : null}
            <Card>
                <Line bold>By day</Line>
                {report.days.map((d) => (
                    <Line key={d.date} dim>
                        {d.date} · {money(d.sales_total)} · {money(d.away_total)} while away · you in {d.owner_hours} h
                    </Line>
                ))}
            </Card>
        </Page>
    );
}

/* ------------------------------------------------------------------ staff */

function Staff({ report, refreshing, onRefresh }: { report: WatchReport | null; refreshing: boolean; onRefresh: () => void }) {
    const { theme } = useListTokens();
    if (!report) return <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />;
    const rates = report.people.map((p) => Number(p.per_hour || 0)).filter((x) => x > 0);
    const avg = rates.length ? rates.reduce((s, x) => s + x, 0) / rates.length : 0;
    return (
        <Page refreshing={refreshing} onRefresh={onRefresh}>
            {report.people.length === 0 ? <Line dim>No sales or shifts in this period.</Line> : null}
            {report.people.map((p) => {
                const low = avg > 0 && Number(p.per_hour || 0) > 0 && Number(p.per_hour) < avg * 0.6;
                const variance = Number(p.cash_variance);
                return (
                    <Card key={p.user ?? p.name} tint={low || variance < 0 || p.unknown_scans ? '#f59e0b' : undefined}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{p.name}</Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{money(p.sales_total)}</Text>
                        </View>
                        <Line dim>
                            {p.sales_count} sale(s) · {p.shifts} shift(s), {p.hours} h{p.per_hour ? ` · ${money(p.per_hour)} per hour` : ''}
                            {p.cash_share != null ? ` · ${p.cash_share}% cash` : ''}
                        </Line>
                        <Line dim>
                            {money(p.away_total)} while you were away · {money(p.present_total)} while you were in
                        </Line>
                        {low ? <Line color="#f59e0b">Sells {Math.round((1 - Number(p.per_hour) / avg) * 100)}% less per hour than the team average.</Line> : null}
                        {variance ? <Line color={variance < 0 ? '#f43f5e' : '#f59e0b'}>Cash {variance < 0 ? 'short' : 'over'} {money(String(Math.abs(variance)))} across shifts.</Line> : null}
                        {p.unknown_scans ? <Line color="#f59e0b">{p.unknown_scans} barcode(s) scanned that you don't stock.</Line> : null}
                    </Card>
                );
            })}
        </Page>
    );
}

/* ------------------------------------------------------------------ shifts */

function Shifts({ range }: { range: Range }) {
    const { theme, border } = useListTokens();
    const [rows, setRows] = useState<Shift[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await shopGuardApi.getShifts(fromFor(range), iso(new Date()));
            setRows(isOk(res) ? res.data.shifts ?? [] : []);
        } finally {
            setRefreshing(false);
        }
    }, [range]);
    useEffect(() => { void load(); }, [load]);
    return (
        <Page refreshing={refreshing} onRefresh={load}>
            {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
            {rows && rows.length === 0 ? <Line dim>No shifts in this period. Staff clock in from "My shift".</Line> : null}
            {(rows ?? []).map((s) => {
                const v = Number(s.cash_variance || 0);
                return (
                    <View key={s.id} style={{ padding: 12, gap: 3, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                                {s.name}
                                {s.is_owner ? ' (owner)' : ''}
                            </Text>
                            <Text style={{ color: s.status === 'OPEN' ? '#10b981' : theme.textDark, fontFamily: theme.font.bold, fontSize: 12 }}>{s.status === 'OPEN' ? 'On shift' : s.auto_closed ? 'Left open' : 'Closed'}</Text>
                        </View>
                        <Line dim>
                            {new Date(s.clock_in_at).toLocaleString()} – {s.clock_out_at ? new Date(s.clock_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                            {s.in_inside === false ? ` · clocked in ${s.in_distance_m?.toLocaleString()} m away` : s.in_inside == null ? ' · no location' : ' · at the shop'}
                        </Line>
                        {s.status === 'CLOSED' ? (
                            <Line dim>
                                {s.sales_count} sale(s) {money(s.sales_total)} · cash recorded {money(s.expected_cash)}
                                {s.counted_cash != null ? ` · counted ${money(s.counted_cash)}` : ' · not counted'}
                                {Number(s.non_cash_total) ? ` · other ${money(s.non_cash_total)}` : ''}
                            </Line>
                        ) : null}
                        {s.status === 'CLOSED' && s.counted_cash != null && v !== 0 ? (
                            <Line color={v < 0 ? '#f43f5e' : '#f59e0b'}>{v < 0 ? 'Short' : 'Over'} {money(String(Math.abs(v)))}</Line>
                        ) : null}
                        {s.note ? <Line dim>“{s.note}”</Line> : null}
                    </View>
                );
            })}
        </Page>
    );
}

/* ------------------------------------------------------------------ commissions */

function Commissions() {
    const { theme, border } = useListTokens();
    const alert = useAlert();
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [plans, setPlans] = useState<CommissionPlan[] | null>(null);
    const [period, setPeriod] = useState<'THIS' | 'LAST'>('LAST');
    const [rows, setRows] = useState<CommissionStatement[] | null>(null);
    const [edits, setEdits] = useState<Record<string, { rate: string; target: string }>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [paying, setPaying] = useState<string | null>(null);
    const month = period === 'THIS' ? thisMonth() : lastMonth();

    const load = useCallback(async () => {
        const [g, p, s]: any[] = await Promise.all([shopGuardApi.getSettings(), shopGuardApi.getCommissionPlans(), shopGuardApi.getCommissionStatements(month)]);
        if (isOk(g)) setEnabled(!!g.data.settings.commissions_enabled);
        if (isOk(p)) {
            const list: CommissionPlan[] = p.data.plans ?? [];
            setPlans(list);
            setEdits(Object.fromEntries(list.map((x) => [x.employee, { rate: String(Number(x.rate_percent)), target: String(Number(x.monthly_target)) }])));
        }
        setRows(isOk(s) ? s.data.statements ?? [] : []);
    }, [month]);
    useEffect(() => { void load(); }, [load]);

    // Follow the owner's payment prompt until it succeeds or fails.
    useEffect(() => {
        if (!paying) return;
        const t = setInterval(async () => {
            const res: any = await shopGuardApi.refreshCommissionPayment(paying);
            const st = isOk(res) ? res.data.payment.status : 'PENDING';
            if (st === 'SUCCESS' || st === 'DONE') {
                setPaying(null);
                alert('Paid in', 'Commission received. Each employee is being paid into their payout account.', undefined, 'success');
                void load();
            } else if (st === 'FAILED') {
                setPaying(null);
                alert('Payment failed', 'The payment prompt failed or was cancelled. Try again.', undefined, 'danger');
                void load();
            }
        }, 5000);
        return () => clearInterval(t);
    }, [paying, alert, load]);

    const toggleShop = async (v: boolean) => {
        setEnabled(v);
        const res: any = await shopGuardApi.saveSettings({ commissions_enabled: v });
        if (!isOk(res)) {
            setEnabled(!v);
            alert('Not saved', apiError(res, 'Could not change the setting.'), undefined, 'danger');
        }
    };
    const savePlan = async (pl: CommissionPlan, active: boolean) => {
        const e = edits[pl.employee];
        setBusy(pl.employee);
        try {
            const res: any = await shopGuardApi.saveCommissionPlan({ employee: pl.employee, rate_percent: e?.rate || '0', monthly_target: e?.target || '0', is_active: active });
            if (isOk(res)) void load();
            else alert('Not saved', apiError(res, 'Could not save the commission.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };
    const payAll = async () => {
        if (!phone.trim()) return alert('Phone', 'Enter the M-Pesa number to pay from.');
        setBusy('pay');
        try {
            const res: any = await shopGuardApi.payCommissions(month, phone.trim());
            if (isOk(res)) {
                setPaying(res.data.payment.reference);
                alert('Check your phone', `Enter your M-Pesa PIN to pay ${money(res.data.payment.amount)} for ${res.data.payment.employees} employee(s).`);
            } else alert('Not sent', apiError(res, 'Could not send the payment prompt.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };
    const box = { height: 38, minWidth: 80, flexGrow: 1, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium } as const;
    const owed = (rows ?? []).filter((r) => !r.payout_status && Number(r.amount) > 0);
    const owedTotal = owed.reduce((sum, r) => sum + Number(r.amount), 0);
    const statusLabel = (st: CommissionStatement) =>
        st.payout_status === 'PAID' ? 'Paid' : st.payout_status === 'FUNDED' ? 'Paying the employee…' : st.payout_status === 'AWAITING_PAYMENT' ? 'Waiting for your payment' : period === 'THIS' ? 'So far' : 'Owed';

    return (
        <Page>
            <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                        <Line bold>Pay staff commission</Line>
                        <Line dim>Optional. When on, each employee you switch on earns their % of the goods value of every paid sale they record on the till (delivery fees excluded), only above their monthly target if you set one.</Line>
                    </View>
                    {enabled === null ? <ActivityIndicator color={theme.primary} /> : <Switch value={enabled} onValueChange={(v) => void toggleShop(v)} />}
                </View>
            </Card>
            {enabled ? (
                <>
                    <Card>
                        <Line bold>Employees</Line>
                        <Line dim>Switch commission on or off per employee. It is paid into their own payout account, so each needs one.</Line>
                        {plans === null ? <ActivityIndicator color={theme.primary} /> : null}
                        {(plans ?? []).map((pl) => (
                            <View key={pl.employee} style={{ gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: border }}>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ flexBasis: 150, flexGrow: 2, color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{pl.name}</Text>
                                    <TextInput
                                        value={edits[pl.employee]?.rate ?? ''}
                                        onChangeText={(t) => setEdits((m) => ({ ...m, [pl.employee]: { ...(m[pl.employee] ?? { rate: '', target: '' }), rate: t.replace(/[^0-9.]/g, '') } }))}
                                        placeholder="% rate"
                                        placeholderTextColor={theme.textDark}
                                        keyboardType="decimal-pad"
                                        style={box}
                                    />
                                    <TextInput
                                        value={edits[pl.employee]?.target ?? ''}
                                        onChangeText={(t) => setEdits((m) => ({ ...m, [pl.employee]: { ...(m[pl.employee] ?? { rate: '', target: '' }), target: t.replace(/[^0-9.]/g, '') } }))}
                                        placeholder="Monthly target"
                                        placeholderTextColor={theme.textDark}
                                        keyboardType="decimal-pad"
                                        style={box}
                                    />
                                    <Switch value={pl.is_active} onValueChange={(v) => void savePlan(pl, v)} />
                                    <SheetButton label="Save" variant="secondary" loading={busy === pl.employee} onPress={() => void savePlan(pl, pl.is_active)} />
                                </View>
                                {pl.is_active && !pl.has_payout_account ? (
                                    <Line color="#f59e0b">No payout account yet: their commission waits until they add one (My payout accounts).</Line>
                                ) : null}
                            </View>
                        ))}
                    </Card>
                    <SegmentedControl<'THIS' | 'LAST'> options={[{ key: 'LAST', label: `Last month (${lastMonth()})` }, { key: 'THIS', label: `This month (${thisMonth()})` }]} value={period} onChange={setPeriod} />
                    {period === 'LAST' && owed.length ? (
                        <Card tint="#3b82f6">
                            <Line bold>Pay {money(String(owedTotal))} to {owed.length} employee(s)</Line>
                            <Line dim>One M-Pesa prompt for the total. WaziPOS then pays each employee into their payout account.</Line>
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <TextInput value={phone} onChangeText={setPhone} placeholder="M-Pesa number to pay from" placeholderTextColor={theme.textDark} keyboardType="phone-pad" style={{ ...box, flexGrow: 3 }} />
                                <SheetButton label={paying ? 'Waiting…' : 'Pay'} icon="phone-portrait-outline" loading={busy === 'pay' || !!paying} onPress={() => void payAll()} />
                            </View>
                        </Card>
                    ) : null}
                    {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
                    {rows && rows.length === 0 ? <Line dim>No commission earned in {month}.</Line> : null}
                    {(rows ?? []).map((st) => (
                        <Card key={st.employee} tint={st.payout_status === 'PAID' ? '#10b981' : undefined}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{st.name}</Text>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{money(st.amount)}</Text>
                            </View>
                            <Line dim>
                                {st.sales_count} sale(s) · {money(st.sales_total)} · {Number(st.rate_percent)}%{Number(st.monthly_target) ? ` above ${money(st.monthly_target)}` : ''} · {statusLabel(st)}
                                {st.paid_at ? ` ${new Date(st.paid_at).toLocaleDateString()}` : ''}
                            </Line>
                            {!st.has_payout_account ? <Line color="#f59e0b">No payout account: paid once they add one.</Line> : null}
                        </Card>
                    ))}
                </>
            ) : null}
        </Page>
    );
}

/* ------------------------------------------------------------------ settings */

function Settings() {
    const { theme, border } = useListTokens();
    const alert = useAlert();
    const [s, setS] = useState<GuardSettings | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        shopGuardApi.getSettings().then((res: any) => isOk(res) && setS(res.data.settings));
    }, []);
    if (!s) return <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />;
    const save = async () => {
        setSaving(true);
        try {
            const res: any = await shopGuardApi.saveSettings(s);
            if (isOk(res)) {
                setS(res.data.settings);
                alert('Saved', 'Shop guard settings updated.', undefined, 'success');
            } else alert('Not saved', apiError(res, 'Could not save.'), undefined, 'danger');
        } finally {
            setSaving(false);
        }
    };
    const num = (key: keyof GuardSettings, label: string, hint: string) => (
        <View style={{ gap: 3 }}>
            <Line bold>{label}</Line>
            <TextInput
                value={String(s[key] ?? '')}
                onChangeText={(t) => setS({ ...s, [key]: t.replace(/[^0-9.]/g, '') } as GuardSettings)}
                keyboardType="decimal-pad"
                style={{ height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
            />
            <Line dim>{hint}</Line>
        </View>
    );
    const toggle = (key: 'alerts_enabled' | 'commissions_enabled', label: string) => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{label}</Text>
            <Switch value={s[key]} onValueChange={(v) => setS({ ...s, [key]: v })} />
        </View>
    );
    return (
        <Page>
            {!s.shop_located ? (
                <Card tint="#f59e0b">
                    <Line>Your shop's location isn't set, so clock-ins can't be checked. Set it in your business profile.</Line>
                </Card>
            ) : null}
            <Card>
                {toggle('alerts_enabled', 'Send me alerts (push + SMS)')}
                {toggle('commissions_enabled', 'Pay staff commission on recorded sales')}
            </Card>
            <Card>
                {num('geofence_m', 'Shop radius (metres)', 'Clock-ins farther than this from the shop are flagged.')}
                {num('idle_alert_minutes', 'No-sale alert (minutes)', "Told if no sale is recorded this long while staff are on shift and you're away.")}
                {num('cash_variance_alert', 'Cash count alert (KES)', 'Told when a clock-out count is short or over by this much.')}
                {num('unknown_scan_alert', 'Unknown barcodes per day', "Told when one person scans this many barcodes you don't stock in a day.")}
                <View style={{ gap: 3 }}>
                    <Line bold>Extra alert phone</Line>
                    <TextInput
                        value={s.alert_phone}
                        onChangeText={(t) => setS({ ...s, alert_phone: t })}
                        keyboardType="phone-pad"
                        placeholder="e.g. 0712345678"
                        placeholderTextColor={theme.textDark}
                        style={{ height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                    />
                </View>
                <SheetButton label="Save settings" icon="checkmark" onPress={save} loading={saving} />
            </Card>
        </Page>
    );
}
