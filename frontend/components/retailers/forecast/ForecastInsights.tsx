// components/retailers/forecast/ForecastInsights.tsx
//
// Forecasting → Profit & AI analyst.
//   · Profit & turnover for the next 28 days, from the forecast engine (each product's
//     most accurate model, Kenyan payday / holiday effects, bias correction): projected
//     profit and margin, profit at risk from stock-outs, slow stock, expiry write-offs,
//     turnover, GMROI and how accurate the forecasts have been.
//   · AI analyst: reads those numbers (plus anything the owner tells it) and returns a
//     prioritised action list and proposed demand adjustments, which the owner accepts
//     or dismisses. Accepted adjustments feed tomorrow's forecast run.
// The outlook is saved on the device for offline viewing.

import analyticsApi, { type AiAdjustment, type AiInsights, type ForecastAdjustment, type OutlookFlag, type OutlookProduct, type ProfitOutlook } from '@/api/analyticsApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SearchField } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, Check, Clock, Gauge, PackageX, RefreshCw, Sparkles, Target, TrendingUp, Wallet, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;
const AI = '#8b5cf6';
const KEY = 'wazipos_profit_outlook_v1';
const kes = (n: number | null | undefined) => (n == null ? '—' : `KES ${Math.round(n).toLocaleString('en-KE')}`);
const day = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—');

const FLAGS: Record<OutlookFlag, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
    STOCKOUT_SOON: { label: 'Runs out soon', tone: 'danger' },
    SLOW: { label: 'Slow mover', tone: 'warning' },
    EXPIRY_RISK: { label: 'Expiry risk', tone: 'danger' },
    THIN_MARGIN: { label: 'Thin margin', tone: 'warning' },
    LOW_CONFIDENCE: { label: 'Low accuracy', tone: 'info' },
};
const ACTION_LABEL: Record<string, string> = {
    REORDER: 'Reorder', REDUCE_ORDERS: 'Buy less', MARKDOWN: 'Mark down', PROMOTE: 'Promote', PRICE_REVIEW: 'Review price', HOLD: 'Hold', CHECK_DATA: 'Check data',
};

export default function ForecastInsights() {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const { isOnline } = useNetworkStatus();
    const [outlook, setOutlook] = useState<ProfitOutlook | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [flag, setFlag] = useState<OutlookFlag | ''>('');
    const [q, setQ] = useState('');
    const [notes, setNotes] = useState('');
    const [insights, setInsights] = useState<AiInsights | null>(null);
    const [thinking, setThinking] = useState(false);
    const [adjustments, setAdjustments] = useState<ForecastAdjustment[]>([]);
    const [handled, setHandled] = useState<Set<string>>(new Set());
    const cols = width >= 1100 ? 4 : width >= 640 ? 3 : 2;

    const load = useCallback(async () => {
        const raw = await AsyncStorage.getItem(KEY).catch(() => null);
        if (raw && !outlook) setOutlook(JSON.parse(raw));
        if (!isOnline) return;
        setRefreshing(true);
        const [a, b]: any[] = await Promise.all([analyticsApi.getProfitOutlookAction().catch(() => null), analyticsApi.listForecastAdjustmentsAction().catch(() => null)]);
        setRefreshing(false);
        if (isServerOk(a)) {
            setOutlook(a.data.outlook);
            setError(null);
            AsyncStorage.setItem(KEY, JSON.stringify(a.data.outlook)).catch(() => undefined);
        } else setError(describeResponse(a, 'Could not load the outlook.').message);
        if (isServerOk(b)) setAdjustments(b.data.adjustments);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);
    useEffect(() => {
        void load();
    }, [load]);

    const analyse = async (refresh = false) => {
        if (!isOnline) return toast.show({ tone: 'offline', title: "You're offline", message: 'The AI analyst needs a connection.' });
        setThinking(true);
        const res: any = await analyticsApi.getAiInsightsAction(notes.trim() || undefined, refresh).catch(() => null);
        setThinking(false);
        if (isServerOk(res)) {
            setInsights(res.data.insights);
            setHandled(new Set());
        } else toast.fromResponse(res, 'The AI analyst couldn’t run just now.');
    };

    const accept = async (a: AiAdjustment) => {
        const res: any = await analyticsApi.applyForecastAdjustmentAction({ ...a, source: 'AI' }).catch(() => null);
        if (isServerOk(res)) {
            setHandled((h) => new Set(h).add(a.product_id + a.starts_on));
            setAdjustments((x) => [res.data.adjustment, ...x]);
            toast.success('Adjustment saved', 'Tomorrow’s forecast includes it; the accuracy check shows if it helped.');
        } else toast.fromResponse(res, 'Not saved.');
    };

    const remove = async (id: string) => {
        const res: any = await analyticsApi.removeForecastAdjustmentAction(id).catch(() => null);
        if (isServerOk(res)) setAdjustments((x) => x.filter((a) => a.id !== id));
        else toast.fromResponse(res, 'Not removed.');
    };

    const products = useMemo(() => {
        const list = outlook?.products ?? [];
        const s = q.trim().toLowerCase();
        return list.filter((p) => (!flag || p.flags.includes(flag)) && (!s || String(p.title ?? '').toLowerCase().includes(s)));
    }, [outlook, flag, q]);
    const t = outlook?.totals;

    return (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16, maxWidth: 1240, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={theme.primary} />}>
            {!isOnline ? <OfflineNotice title="Offline" message="Showing the outlook saved on this device." /> : null}
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            {!outlook ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
            {outlook?.note ? <InlineNotice tone="info" message={outlook.note} /> : null}

            {t && outlook?.products.length ? (
                <>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        Next {outlook.horizon_days} days · forecast run {day(outlook.run_date)} · each product uses its most accurate model, with payday and holiday effects
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                        <Kpi cols={cols} icon={Wallet} label="Projected gross profit" value={kes(t.projected_profit)} sub={t.margin_pct != null ? `${t.margin_pct}% margin on ${kes(t.projected_revenue)}` : undefined} color={theme.success} />
                        <Kpi cols={cols} icon={AlertTriangle} label="Profit at risk (stock-outs)" value={kes(t.profit_at_risk)} sub={`${t.stockouts_soon} products run out within the lead time`} color={theme.danger} />
                        <Kpi cols={cols} icon={TrendingUp} label="Stock turnover" value={t.turnover_per_year != null ? `${t.turnover_per_year}× / year` : '—'} sub={`${kes(t.inventory_at_cost)} in stock at cost`} color={theme.primary} />
                        <Kpi cols={cols} icon={Target} label="Forecast accuracy" value={t.forecast_accuracy_pct != null ? `${t.forecast_accuracy_pct}%` : 'Building…'} sub="Weighted by sales, from the backtest" color={AI} />
                        <Kpi cols={cols} icon={Clock} label="Slow stock (90+ days)" value={kes(t.slow_stock_value)} sub="Cash tied up beyond 90 days of sales" color={theme.warning} />
                        <Kpi cols={cols} icon={PackageX} label="Expiry write-off risk" value={kes(t.expiry_write_off_risk)} sub="Expected to expire before it sells" color={theme.danger} />
                    </View>

                    {/* AI analyst */}
                    <View style={{ borderRadius: 22, padding: 16, gap: 12, borderWidth: 1.5, borderColor: `${AI}55`, backgroundColor: `${AI}0d` }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: AI, alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={20} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>AI analyst</Text>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>Reads these numbers and tells you what to do this week to protect profit and keep stock turning.</Text>
                            </View>
                        </View>
                        <CustomTextField value={notes} onChangeText={setNotes} multiline numberOfLines={2} placeholder="Anything coming up? e.g. “Schools open on the 6th”, “Supplier X out of stock”, “Road works outside for 2 weeks”" />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable onPress={() => void analyse(false)} disabled={thinking} style={{ flex: 1, height: 48, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: AI, opacity: thinking ? 0.6 : 1, ...pointer }}>
                                {thinking ? <ActivityIndicator color="#fff" /> : <Sparkles size={17} color="#fff" />}
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>{thinking ? 'Analysing…' : 'Analyse my stock'}</Text>
                            </Pressable>
                            {insights ? <SoftButton label="Fresh" icon={RefreshCw} tone="neutral" onPress={() => void analyse(true)} /> : null}
                        </View>

                        {insights ? (
                            <View style={{ gap: 12 }}>
                                <View style={{ padding: 14, borderRadius: 16, backgroundColor: theme.panel, gap: 6 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{insights.headline}</Text>
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 20 }}>{insights.summary}</Text>
                                </View>
                                {insights.actions.map((a, i) => (
                                    <View key={`${a.product_id}-${a.action}-${i}`} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, backgroundColor: theme.panel }}>
                                        <View style={{ width: 6, borderRadius: 3, backgroundColor: a.priority === 'HIGH' ? theme.danger : a.priority === 'MEDIUM' ? theme.warning : theme.border }} />
                                        <View style={{ flex: 1, gap: 4 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <Text style={{ color: AI, fontFamily: theme.font.bold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{ACTION_LABEL[a.action] ?? a.action}</Text>
                                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{a.title}</Text>
                                            </View>
                                            <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13, lineHeight: 19 }}>{a.reason}</Text>
                                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                                                {[
                                                    a.action === 'REORDER' && a.figures.reorder_qty ? `Order ${a.figures.reorder_qty}` : null,
                                                    a.figures.on_hand != null ? `${a.figures.on_hand} in stock` : null,
                                                    a.figures.stockout_on ? `runs out ${day(a.figures.stockout_on)}` : null,
                                                    a.figures.profit_at_risk ? `${kes(a.figures.profit_at_risk)} profit at risk` : null,
                                                    a.figures.expiry_write_off_risk ? `${kes(a.figures.expiry_write_off_risk)} may expire` : null,
                                                    a.figures.margin_pct != null ? `${a.figures.margin_pct}% margin` : null,
                                                ].filter(Boolean).join(' · ')}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                                {insights.adjustments.filter((a) => !handled.has(a.product_id + a.starts_on)).length ? (
                                    <View style={{ gap: 8 }}>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Suggested forecast adjustments</Text>
                                        {insights.adjustments.filter((a) => !handled.has(a.product_id + a.starts_on)).map((a) => (
                                            <View key={a.product_id + a.starts_on} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: theme.panel }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{a.title} {a.pct > 0 ? '+' : ''}{a.pct}%</Text>
                                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>{day(a.starts_on)} – {day(a.ends_on)} · {a.reason}</Text>
                                                </View>
                                                <Pressable onPress={() => void accept(a)} accessibilityLabel="Accept" style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.success, alignItems: 'center', justifyContent: 'center', ...pointer }}>
                                                    <Check size={17} color="#fff" />
                                                </Pressable>
                                                <Pressable onPress={() => setHandled((h) => new Set(h).add(a.product_id + a.starts_on))} accessibilityLabel="Dismiss" style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center', ...pointer }}>
                                                    <X size={17} color={theme.text} />
                                                </Pressable>
                                            </View>
                                        ))}
                                    </View>
                                ) : null}
                                {insights.risks.length ? (
                                    <View style={{ gap: 4 }}>
                                        {insights.risks.map((r) => (
                                            <Text key={r} style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13 }}>⚠ {r}</Text>
                                        ))}
                                    </View>
                                ) : null}
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11 }}>
                                    The figures are WaziPOS's own forecasts and your stock data; the AI only chooses what to act on. {insights.cached ? 'Saved analysis from earlier today.' : ''}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {adjustments.length ? (
                        <View style={{ gap: 8 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Active adjustments</Text>
                            {adjustments.map((a) => (
                                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border }}>
                                    <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                                        {a.title} {a.pct > 0 ? '+' : ''}{a.pct}% · {day(a.starts_on)} – {day(a.ends_on)} · {a.source === 'AI' ? 'AI' : 'you'}: {a.reason}
                                    </Text>
                                    <Pressable onPress={() => void remove(a.id)} accessibilityLabel="Remove" style={pointer}>
                                        <X size={16} color={theme.textMuted} />
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {/* Products */}
                    <View style={{ gap: 10 }}>
                        <SearchField variant="mobile" value={q} onChangeText={setQ} placeholder="Search products…" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {(['', 'STOCKOUT_SOON', 'SLOW', 'EXPIRY_RISK', 'THIN_MARGIN', 'LOW_CONFIDENCE'] as (OutlookFlag | '')[]).map((f) => {
                                const on = flag === f;
                                const n = f ? (outlook.products.filter((p) => p.flags.includes(f)).length) : outlook.products.length;
                                return (
                                    <Pressable key={f || 'all'} onPress={() => setFlag(f)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel, justifyContent: 'center', ...pointer }}>
                                        <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{f ? FLAGS[f].label : 'All'} · {n}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        {products.slice(0, 200).map((p) => (
                            <ProductRow key={p.product_id} p={p} />
                        ))}
                    </View>
                </>
            ) : null}
        </ScrollView>
    );
}

function Kpi({ icon: Icon, label, value, sub, color, cols }: { icon: any; label: string; value: string; sub?: string; color: string; cols: number }) {
    const { theme } = useAuth();
    return (
        <View style={{ width: `${100 / cols}%` as any, padding: 5 }}>
            <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, gap: 6, minHeight: 112 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${color}1a`, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={color} />
                </View>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 11.5 }}>{label}</Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>{value}</Text>
                {sub ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11 }} numberOfLines={2}>{sub}</Text> : null}
            </View>
        </View>
    );
}

function ProductRow({ p }: { p: OutlookProduct }) {
    const { theme } = useAuth();
    return (
        <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ flex: 1, minWidth: 160, color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }} numberOfLines={1}>{p.title}</Text>
                {p.flags.map((f) => (
                    <StatusPill key={f} tone={FLAGS[f].tone} label={FLAGS[f].label} />
                ))}
                {p.adjusted ? <StatusPill tone="info" label="Adjusted" /> : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <Mini label="Forecast 28d" value={`${p.forecast_units}`} />
                <Mini label="In stock" value={`${p.on_hand}`} />
                <Mini label="Cover" value={p.days_of_cover != null ? `${p.days_of_cover} d` : '—'} />
                <Mini label="Reorder" value={p.reorder_qty ? `${p.reorder_qty}` : '—'} />
                <Mini label="Profit 28d" value={kes(p.projected_profit)} />
                <Mini label="Margin" value={p.margin_pct != null ? `${p.margin_pct}%` : '—'} />
                <Mini label="Turns / yr" value={p.turnover_per_year != null ? `${p.turnover_per_year}` : '—'} />
                <Mini label="GMROI" value={p.gmroi != null ? `${p.gmroi}` : '—'} />
                <Mini label="Accuracy" value={p.accuracy_pct != null ? `${p.accuracy_pct}%` : 'new'} />
            </View>
            {p.stockout_on ? <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12 }}>Runs out around {day(p.stockout_on)} · {kes(p.profit_at_risk)} profit at risk</Text> : null}
            {p.expiry_write_off_risk > 0 ? <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12 }}>{kes(p.expiry_write_off_risk)} expected to expire unsold</Text> : null}
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11 }}>
                <Gauge size={11} color={theme.textMuted} /> model: {p.model?.replace('+adj', ' + adjustment') ?? '—'}
            </Text>
        </View>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{value}</Text>
        </View>
    );
}
