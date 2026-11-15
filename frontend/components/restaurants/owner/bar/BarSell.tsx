// components/restaurants/owner/bar/BarSell.tsx
//
// Ring up drinks: tap "Bottle" or "Tot" on a drink, adjust quantities, then
//   • Cash sale  — paid now and closed (works offline: saved and synced later)
//   • Open tab   — a running bill for a table / guest (online)
//   • Add round  — when adding to an existing tab
// Stock goes down at once (tots take a fraction of a bottle).

import { errorText, type BarLine, type BarTab, type Drink, type SaleUnit } from '@/api/diningApi';
import { SearchField, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Stepper } from '../../customer/FoodCheckout';
import { kes } from '../../shared';
import { stockLabel, type BarData } from './useBarData';

type Cart = Record<string, number>; // `${drinkId}:${unit}` -> qty

export function BarSell({ bar, target, onDone }: { bar: BarData; target: BarTab | null; onDone: (msg: string) => void }) {
    const { theme, border, cardShadow } = useListTokens();
    const { width } = useWindowDimensions();
    const [q, setQ] = useState('');
    const [cart, setCart] = useState<Cart>({});
    const [guest, setGuest] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return bar.drinks.filter((d) => d.is_available && (!s || `${d.title} ${d.category ?? ''} ${d.bar_code ?? ''}`.toLowerCase().includes(s)));
    }, [bar.drinks, q]);

    const lines: (BarLine & { d: Drink; price: number })[] = Object.entries(cart)
        .map(([k, qty]) => {
            const [id, unit] = k.split(':') as [string, SaleUnit];
            const d = bar.drinks.find((x) => x.id === id);
            return d ? { drink: id, unit, quantity: qty, d, price: Number(unit === 'TOT' ? d.tot_price : d.bottle_price) } : null;
        })
        .filter(Boolean) as any;
    const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const add = (d: Drink, unit: SaleUnit) => setCart((c) => ({ ...c, [`${d.id}:${unit}`]: (c[`${d.id}:${unit}`] ?? 0) + 1 }));
    const setQty = (key: string, n: number) =>
        setCart((c) => {
            const next = { ...c };
            if (n <= 0) delete next[key];
            else next[key] = Math.min(200, n);
            return next;
        });
    const items = lines.map(({ drink, unit, quantity }) => ({ drink, unit, quantity }));

    const go = async (kind: 'cash' | 'tab' | 'round') => {
        setBusy(kind);
        setError(null);
        try {
            const action = kind === 'round' ? 'AddToBarTab' : 'OpenBarTab';
            const payload =
                kind === 'round'
                    ? { order: target!.id, items }
                    : { items, customer_name: guest.trim(), ...(kind === 'cash' ? { pay_cash: true, close: true } : {}) };
            const label = kind === 'cash' ? `Cash sale ${kes(total)}` : kind === 'tab' ? `Tab for ${guest || 'guest'}` : `Round on ${target?.customer_name || target?.reference}`;
            if (kind === 'tab' && !bar.isOnline) {
                setError('Opening a tab needs a connection. Offline, use Cash sale.');
                return;
            }
            const r = await bar.write(action, payload, label);
            if (!r.ok) {
                setError(r.error || errorText(r.res, 'That did not go through.'));
                return;
            }
            bar.applyLocalSale(items);
            if (r.res?.data?.tab) bar.upsertTab(r.res.data.tab);
            setCart({});
            setGuest('');
            onDone(r.queued ? 'Saved offline — it syncs when you’re back online.' : kind === 'cash' ? 'Cash sale recorded.' : kind === 'tab' ? 'Tab opened.' : 'Round added.');
        } finally {
            setBusy(null);
        }
    };

    const cols = width >= 1100 ? 4 : width >= 700 ? 3 : 2;

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: lines.length ? 260 : 24 }} keyboardShouldPersistTaps="handled">
                {target ? (
                    <View className="flex-row items-center rounded-2xl px-3 py-2.5" style={{ gap: 8, backgroundColor: `${theme.primary}12` }}>
                        <Ionicons name="receipt-outline" size={17} color={theme.primary} />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                            Adding a round to {target.customer_name || target.table || target.reference}
                        </Text>
                    </View>
                ) : null}
                <SearchField value={q} onChangeText={setQ} placeholder="Search drinks…" variant="mobile" />
                {bar.drinks.length === 0 && !bar.loading ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 24 }}>No drinks yet — add them under Stock.</Text>
                ) : null}
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                    {shown.map((d) => {
                        const out = Number(d.stock_bottles) <= 0;
                        return (
                            <View key={d.id} className="rounded-2xl p-3" style={{ width: `${100 / cols - 2}%` as any, flexGrow: 1, gap: 8, backgroundColor: theme.panel, borderWidth: 1, borderColor: border, opacity: out ? 0.55 : 1, ...cardShadow }}>
                                <View style={{ gap: 2 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={2}>{d.title}</Text>
                                    <Text style={{ color: d.is_low ? '#d97706' : theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                                        {stockLabel(d)} · {d.volume_ml} ml
                                    </Text>
                                </View>
                                <View style={{ gap: 6 }}>
                                    <Pressable disabled={out} onPress={() => add(d, 'BOTTLE')} className="flex-row items-center justify-between rounded-xl px-2.5 h-9" style={{ backgroundColor: theme.primary }}>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>Bottle</Text>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>{kes(d.bottle_price)}</Text>
                                    </Pressable>
                                    {d.sells_tots ? (
                                        <Pressable disabled={out} onPress={() => add(d, 'TOT')} className="flex-row items-center justify-between rounded-xl px-2.5 h-9" style={{ borderWidth: 1.5, borderColor: theme.primary }}>
                                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Tot {d.tot_ml} ml</Text>
                                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{kes(d.tot_price)}</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {lines.length ? (
                <View className="absolute left-0 right-0 bottom-0 rounded-t-3xl p-4" style={{ gap: 10, backgroundColor: theme.panel, borderTopWidth: 1, borderColor: border, ...cardShadow }}>
                    <ScrollView style={{ maxHeight: 120 }}>
                        {lines.map((l) => (
                            <View key={`${l.drink}:${l.unit}`} className="flex-row items-center py-1" style={{ gap: 8 }}>
                                <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>
                                    {l.d.title} <Text style={{ color: theme.textDark, fontSize: 11 }}>{l.unit === 'TOT' ? `tot ${l.d.tot_ml} ml` : 'bottle'}</Text>
                                </Text>
                                <Stepper small value={l.quantity} onChange={(n) => setQty(`${l.drink}:${l.unit}`, n)} />
                                <Text style={{ width: 82, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(l.price * l.quantity)}</Text>
                            </View>
                        ))}
                    </ScrollView>
                    {!target ? <CustomTextField label="Guest / table (optional)" value={guest} onChangeText={setGuest} placeholder="e.g. Table 4, Otieno" /> : null}
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                        {target ? (
                            <SheetButton label={`Add round · ${kes(total)}`} icon="add-circle-outline" loading={busy === 'round'} loadingLabel="Adding…" onPress={() => void go('round')} grow />
                        ) : (
                            <>
                                <SheetButton label={`Cash sale · ${kes(total)}`} icon="cash-outline" loading={busy === 'cash'} loadingLabel="Saving…" onPress={() => void go('cash')} grow />
                                <SheetButton label="Open tab" icon="receipt-outline" variant="secondary" loading={busy === 'tab'} loadingLabel="Opening…" onPress={() => void go('tab')} grow />
                            </>
                        )}
                    </View>
                </View>
            ) : null}
        </View>
    );
}
