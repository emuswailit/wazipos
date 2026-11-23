// components/restaurants/forecast/KitchenForecast.tsx
//
// Restaurants & hotels → Forecasting. Kitchen supplies (food, gas, cleaning,
// packaging) and the bar, forecast from each item's own usage with the same engine
// as the shops (best of seven models per item, the business's payday / holiday
// pattern): daily use, days of cover, run-out date, what to buy for the next
// delivery, waste — and for drinks, projected bar profit. Plus the AI analyst.
// Saved on the device for offline viewing.

import analyticsApi, { type KitchenFlag, type KitchenInsights, type KitchenItem, type KitchenOutlook } from '@/api/analyticsApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SearchField, SegmentedControl } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosHeader, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, ChefHat, Martini, ShoppingBasket, Sparkles, Target, Trash2, Wallet } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;
const AI = '#8b5cf6';
const KEY = 'wazipos_kitchen_outlook_v1';
const kes = (n: number | null | undefined) => (n == null ? '—' : `KES ${Math.round(n).toLocaleString('en-KE')}`);
const day = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—');
const qty = (n: number, unit: string) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}`;

const FLAGS: Record<KitchenFlag, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
    RUNS_OUT_SOON: { label: 'Runs out before next delivery', tone: 'danger' },
    BELOW_REORDER_LEVEL: { label: 'Below reorder level', tone: 'warning' },
    HIGH_WASTE: { label: 'High waste', tone: 'danger' },
    SLOW: { label: 'Slow', tone: 'warning' },
    LOW_CONFIDENCE: { label: 'Low accuracy', tone: 'info' },
    EXPIRES_BEFORE_USED: { label: 'Expires before used', tone: 'danger' },
};
const ACTION: Record<string, string> = { RESTOCK: 'Restock', BUY_LESS: 'Buy less', CUT_WASTE: 'Cut waste', USE_FIRST: 'Use first', PROMOTE: 'Promote', PRICE_REVIEW: 'Review price', CHECK_DATA: 'Check data' };

export default function KitchenForecast({ noun = 'restaurant' }: { noun?: string }) {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const { isOnline } = useNetworkStatus();
    const [o, setO] = useState<KitchenOutlook | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState<'SUPPLY' | 'DRINK'>('SUPPLY');
    const [flag, setFlag] = useState<KitchenFlag | ''>('');
    const [q, setQ] = useState('');
    const [notes, setNotes] = useState('');
    const [ai, setAi] = useState<KitchenInsights | null>(null);
    const [thinking, setThinking] = useState(false);
    const cols = width >= 1100 ? 3 : width >= 640 ? 3 : 2;

    const load = useCallback(async () => {
        const raw = await AsyncStorage.getItem(KEY).catch(() => null);
        if (raw) setO((cur) => cur ?? JSON.parse(raw));
        if (!isOnline) return;
        setRefreshing(true);
        const res: any = await analyticsApi.getKitchenOutlookAction().catch(() => null);
        setRefreshing(false);
        if (isServerOk(res)) {
            setO(res.data.outlook);
            setError(null);
            AsyncStorage.setItem(KEY, JSON.stringify(res.data.outlook)).catch(() => undefined);
        } else setError(describeResponse(res, 'Could not load forecasts.').message);
    }, [isOnline]);
    useEffect(() => {
        void load();
    }, [load]);

    const analyse = async () => {
        if (!isOnline) return toast.show({ tone: 'offline', title: "You're offline", message: 'The AI analyst needs a connection.' });
        setThinking(true);
        const res: any = await analyticsApi.getKitchenInsightsAction(notes.trim() || undefined).catch(() => null);
        setThinking(false);
        if (isServerOk(res)) setAi(res.data.insights);
        else toast.fromResponse(res, 'The AI analyst couldn’t run just now.');
    };

    const items = useMemo(() => {
        const list = (tab === 'SUPPLY' ? o?.supplies : o?.drinks) ?? [];
        const s = q.trim().toLowerCase();
        return list.filter((i) => (!flag || i.flags.includes(flag)) && (!s || i.title.toLowerCase().includes(s)));
    }, [o, tab, flag, q]);
    const t = o?.totals;

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16, maxWidth: 1240, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={theme.primary} />}>
            <PosHeader icon={ChefHat} title="Forecasting" subtitle={`What your ${noun} will use and sell in the next 28 days`} />
            {!isOnline ? <OfflineNotice title="Offline" message="Showing forecasts saved on this device." /> : null}
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            {!o && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}

            {t ? (
                <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                        <Kpi cols={cols} icon={AlertTriangle} color={theme.danger} label="Run out before next delivery" value={String(t.running_out_soon)} sub={`of ${t.items} items · deliveries in ~${o!.lead_time_days} days`} />
                        <Kpi cols={cols} icon={ShoppingBasket} color={theme.primary} label="Buy for the next 10 days" value={kes(t.restock_cost_next_10_days)} sub="Everything below, at your last cost" />
                        <Kpi cols={cols} icon={Trash2} color={theme.warning} label="Wasted last 30 days" value={kes(t.waste_value_30)} sub="Spoilt, spilt or broken" />
                        <Kpi cols={cols} icon={Martini} color="#ec4899" label="Bar profit, next 28 days" value={kes(t.bar_projected_profit)} sub={`on ${kes(t.bar_projected_revenue)} of drinks (bottle prices)`} />
                        <Kpi cols={cols} icon={Target} color={AI} label="Forecast accuracy" value={t.forecast_accuracy_pct != null ? `${t.forecast_accuracy_pct}%` : 'Building…'} sub="Checked against the last 14 days" />
                        <Kpi cols={cols} icon={Wallet} color={theme.success} label="Payday effect" value={t.payday_effect_pct != null ? `${t.payday_effect_pct > 0 ? '+' : ''}${t.payday_effect_pct}%` : '—'} sub="Busier at month end — already in the forecast" />
                    </View>

                    {/* AI analyst */}
                    <View style={{ borderRadius: 22, padding: 16, gap: 12, borderWidth: 1.5, borderColor: `${AI}55`, backgroundColor: `${AI}0d` }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: AI, alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={20} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>AI analyst</Text>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>What to buy, what to use first and where waste and margins need work.</Text>
                            </View>
                        </View>
                        <CustomTextField value={notes} onChangeText={setNotes} multiline numberOfLines={2} placeholder="Coming up? e.g. “Wedding of 200 on Saturday”, “Conference all next week”, “Gas supplier closed till Monday”" />
                        <Pressable onPress={() => void analyse()} disabled={thinking} style={{ height: 48, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: AI, opacity: thinking ? 0.6 : 1, ...pointer }}>
                            {thinking ? <ActivityIndicator color="#fff" /> : <Sparkles size={17} color="#fff" />}
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>{thinking ? 'Analysing…' : 'Analyse kitchen & bar'}</Text>
                        </Pressable>
                        {ai ? (
                            <View style={{ gap: 10 }}>
                                <View style={{ padding: 14, borderRadius: 16, backgroundColor: theme.panel, gap: 6 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{ai.headline}</Text>
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 20 }}>{ai.summary}</Text>
                                </View>
                                {ai.actions.map((a, i) => (
                                    <View key={`${a.item_id}-${i}`} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, backgroundColor: theme.panel }}>
                                        <View style={{ width: 6, borderRadius: 3, backgroundColor: a.priority === 'HIGH' ? theme.danger : a.priority === 'MEDIUM' ? theme.warning : theme.border }} />
                                        <View style={{ flex: 1, gap: 4 }}>
                                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                                                <Text style={{ color: AI, fontSize: 12 }}>{(ACTION[a.action] ?? a.action).toUpperCase()}  </Text>
                                                {a.title}
                                            </Text>
                                            <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13, lineHeight: 19 }}>{a.reason}</Text>
                                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                                                {[
                                                    a.figures.reorder_qty ? `Buy ${qty(Number(a.figures.reorder_qty), String(a.figures.unit ?? ''))} (${kes(a.figures.reorder_cost)})` : null,
                                                    a.figures.runs_out_on ? `runs out ${day(a.figures.runs_out_on)}` : null,
                                                    a.figures.waste_value_30 ? `${kes(a.figures.waste_value_30)} wasted in 30 days` : null,
                                                    a.figures.margin_pct != null ? `${a.figures.margin_pct}% margin` : null,
                                                ].filter(Boolean).join(' · ')}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                                {ai.risks.map((r) => (
                                    <Text key={r} style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13 }}>⚠ {r}</Text>
                                ))}
                            </View>
                        ) : null}
                    </View>

                    {/* Items */}
                    <SegmentedControl<'SUPPLY' | 'DRINK'> variant="mobile" value={tab} onChange={(v) => { setTab(v); setFlag(''); }} options={[{ key: 'SUPPLY', label: `Supplies · ${o!.supplies.length}` }, { key: 'DRINK', label: `Bar · ${o!.drinks.length}` }]} />
                    <SearchField variant="mobile" value={q} onChangeText={setQ} placeholder={tab === 'SUPPLY' ? 'Search supplies…' : 'Search drinks…'} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {(['', 'RUNS_OUT_SOON', 'BELOW_REORDER_LEVEL', 'HIGH_WASTE', 'EXPIRES_BEFORE_USED', 'SLOW', 'LOW_CONFIDENCE'] as (KitchenFlag | '')[]).map((f) => {
                            const list = (tab === 'SUPPLY' ? o!.supplies : o!.drinks) ?? [];
                            const n = f ? list.filter((i) => i.flags.includes(f)).length : list.length;
                            if (f && !n) return null;
                            const on = flag === f;
                            return (
                                <Pressable key={f || 'all'} onPress={() => setFlag(f)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel, justifyContent: 'center', ...pointer }}>
                                    <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{f ? FLAGS[f].label : 'All'} · {n}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    {!items.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, textAlign: 'center', paddingVertical: 24 }}>{tab === 'SUPPLY' ? 'No supplies match.' : 'No drinks match.'}</Text> : null}
                    {items.slice(0, 200).map((i) => (
                        <ItemRow key={i.id} i={i} />
                    ))}
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

function ItemRow({ i }: { i: KitchenItem }) {
    const { theme } = useAuth();
    return (
        <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: i.flags.includes('RUNS_OUT_SOON') ? theme.danger : theme.border, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ flex: 1, minWidth: 160, color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }} numberOfLines={1}>{i.title}</Text>
                {i.flags.map((f) => (
                    <StatusPill key={f} tone={FLAGS[f].tone} label={FLAGS[f].label} />
                ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <Mini label="In stock" value={qty(i.on_hand, i.unit)} />
                <Mini label={i.kind === 'DRINK' ? 'Sells a day' : 'Uses a day'} value={qty(i.avg_daily, i.unit)} />
                <Mini label="Next 28 days" value={qty(i.forecast_28, i.unit)} />
                <Mini label="Lasts" value={i.days_of_cover != null ? `${i.days_of_cover} days` : '—'} />
                <Mini label="Buy now" value={i.reorder_qty ? `${qty(i.reorder_qty, i.unit)} · ${kes(i.reorder_cost)}` : '—'} />
                {i.kind === 'DRINK' ? <Mini label="Profit 28d" value={kes(i.projected_profit)} /> : <Mini label="Wasted 30d" value={i.wasted_last_30 ? `${qty(i.wasted_last_30, i.unit)} · ${kes(i.waste_value_30)}` : '—'} />}
                <Mini label="Accuracy" value={i.accuracy_pct != null ? `${i.accuracy_pct}%` : 'new'} />
            </View>
            {i.runs_out_on ? <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12 }}>Runs out around {day(i.runs_out_on)}</Text> : null}
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

/** Forecast per stock item id (supplies and drinks), for inline hints on the stock lists. Offline-saved. */
export function useKitchenHints(): Record<string, KitchenItem> {
    const { isOnline } = useNetworkStatus();
    const [map, setMap] = useState<Record<string, KitchenItem>>({});
    useEffect(() => {
        let live = true;
        const toMap = (o: KitchenOutlook | null) => Object.fromEntries([...(o?.supplies ?? []), ...(o?.drinks ?? [])].map((i) => [i.id, i]));
        (async () => {
            const raw = await AsyncStorage.getItem(KEY).catch(() => null);
            if (raw && live) {
                try {
                    setMap(toMap(JSON.parse(raw)));
                } catch {
                    /* stale copy */
                }
            }
            if (!isOnline) return;
            const res: any = await analyticsApi.getKitchenOutlookAction().catch(() => null);
            if (live && isServerOk(res)) {
                setMap(toMap(res.data.outlook));
                AsyncStorage.setItem(KEY, JSON.stringify(res.data.outlook)).catch(() => undefined);
            }
        })();
        return () => {
            live = false;
        };
    }, [isOnline]);
    return map;
}

/** "Lasts ~6 days · runs out ~1 Dec · buy 1.7 kg" */
export function kitchenHintText(h?: KitchenItem): string | null {
    if (!h || (!h.avg_daily && !h.on_hand)) return null;
    const parts = [
        h.days_of_cover != null ? (h.days_of_cover > 60 ? 'Lasts 60+ days' : `Lasts ~${Math.round(h.days_of_cover)} days`) : null,
        h.runs_out_on ? `runs out ~${day(h.runs_out_on)}` : null,
        h.reorder_qty ? `buy ${qty(h.reorder_qty, h.unit)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
}
