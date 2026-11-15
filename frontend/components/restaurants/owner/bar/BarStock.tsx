// components/restaurants/owner/bar/BarStock.tsx
//
// Drinks stock in bottles (+ tots in the open bottle). Receive bottles, count
// the stock (full bottles + tots left), record spills/breakage, and add / edit
// drinks — from the product catalogue or by name — with bottle size, tot size
// and prices for a bottle and a tot. All of it works offline.

import diningApi, { isOk, type CatalogueProduct, type Drink } from '@/api/diningApi';
import { AdminSheet, ChoiceChips, FormRow, SearchField, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SwitchField } from '@/components/common/SwitchField';
import { newDraftId } from '@/services/diningOutbox';
import { Ionicons } from '@expo/vector-icons';
import { Formik } from 'formik';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as Yup from 'yup';

import { kes } from '../../shared';
import { stockLabel, type BarData } from './useBarData';

export function BarStock({ bar }: { bar: BarData }) {
    const { theme, border } = useListTokens();
    const [q, setQ] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [form, setForm] = useState<Drink | 'new' | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const selected = bar.drinks.find((d) => d.id === openId) ?? null;
    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return bar.drinks.filter((d) => (!lowOnly || d.is_low) && (!s || `${d.title} ${d.category ?? ''}`.toLowerCase().includes(s)));
    }, [bar.drinks, q, lowOnly]);
    const worth = bar.drinks.reduce((s, d) => s + Math.max(0, Number(d.stock_bottles)) * Number(d.bottle_cost), 0);

    return (
        <>
            <ScrollView
                contentContainerStyle={{ padding: 12, gap: 10 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await bar.refresh(); setRefreshing(false); }} tintColor={theme.primary} />}
            >
                <View className="flex-row items-center" style={{ gap: 8 }}>
                    <View style={{ flex: 1 }}>
                        <SearchField value={q} onChangeText={setQ} placeholder="Search drinks…" variant="mobile" />
                    </View>
                    <SheetButton label="Add drink" icon="add" onPress={() => setForm('new')} />
                </View>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                    <Pressable onPress={() => setLowOnly((v) => !v)} className="flex-row items-center rounded-full px-3 h-8" style={{ gap: 5, borderWidth: 1, borderColor: lowOnly ? '#d97706' : border, backgroundColor: lowOnly ? 'rgba(217,119,6,0.10)' : 'transparent' }}>
                        <Ionicons name="alert-circle-outline" size={14} color={lowOnly ? '#d97706' : theme.textDark} />
                        <Text style={{ color: lowOnly ? '#d97706' : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>Low stock · {bar.drinks.filter((d) => d.is_low).length}</Text>
                    </Pressable>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{bar.drinks.length} drinks · stock at cost {kes(worth)}</Text>
                </View>
                {shown.map((d) => (
                    <Pressable key={d.id} onPress={() => setOpenId(d.id)} className="flex-row items-center rounded-2xl p-3" style={{ gap: 12, backgroundColor: theme.panel, borderWidth: 1, borderColor: d.is_low ? 'rgba(217,119,6,0.5)' : border }}>
                        <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: d.sells_tots ? 'rgba(124,58,237,0.12)' : `${theme.primary}14` }}>
                            <Ionicons name={d.sells_tots ? 'wine' : 'beer-outline'} size={20} color={d.sells_tots ? '#7c3aed' : theme.primary} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>{d.title}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                {d.volume_ml} ml · bottle {kes(d.bottle_price)}{d.sells_tots ? ` · tot ${d.tot_ml} ml ${kes(d.tot_price)}` : ''}
                            </Text>
                        </View>
                        <View className="items-end">
                            <Text style={{ color: d.is_low ? '#d97706' : theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{stockLabel(d)}</Text>
                            {!d.is_available ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>Hidden</Text> : null}
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
            {selected ? <DrinkSheet drink={selected} bar={bar} onClose={() => setOpenId(null)} onEdit={() => { setOpenId(null); setForm(selected); }} /> : null}
            {form ? <DrinkForm drink={form === 'new' ? null : form} bar={bar} onClose={() => setForm(null)} /> : null}
        </>
    );
}

/* ------------------------------------------------------------ receive / count / waste */

function DrinkSheet({ drink, bar, onClose, onEdit }: { drink: Drink; bar: BarData; onClose: () => void; onEdit: () => void }) {
    const { theme } = useListTokens();
    const [mode, setMode] = useState<'RECEIVE' | 'COUNT' | 'WASTE'>('RECEIVE');
    const [bottles, setBottles] = useState('');
    const [cost, setCost] = useState(String(Number(drink.bottle_cost) || ''));
    const [full, setFull] = useState(String(drink.full_bottles));
    const [tots, setTots] = useState(String(drink.open_bottle_tots ?? 0));
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const counted = Number(full || 0) + (drink.sells_tots && drink.tot_ml ? (Number(tots || 0) * drink.tot_ml) / drink.volume_ml : 0);

    const save = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const draft_id = newDraftId();
            let action = 'ReceiveDrinks';
            let payload: Record<string, any> = { drink: drink.id, draft_id };
            let local = Number(drink.stock_bottles);
            if (mode === 'RECEIVE') {
                payload = { ...payload, bottles, bottle_cost: cost, supplier: reason };
                local += Number(bottles || 0);
            } else if (mode === 'COUNT') {
                action = 'CountDrink';
                payload = { ...payload, counted_bottles: counted.toFixed(4), reason: reason || 'Stock count' };
                local = counted;
            } else {
                action = 'WasteDrink';
                payload = { ...payload, ...(drink.sells_tots && Number(tots) && !Number(bottles) ? { tots } : { bottles }), reason: reason || 'Spilled / broken' };
                local -= Number(bottles || 0) || (drink.tot_ml ? (Number(tots || 0) * drink.tot_ml) / drink.volume_ml : 0);
            }
            const r = await bar.write(action, payload, `${mode.toLowerCase()} ${drink.title}`);
            if (!r.ok) return setMsg({ text: r.error || 'Not saved.', ok: false });
            if (r.res?.data?.drink) bar.upsertDrink(r.res.data.drink);
            else {
                const stock = Math.max(0, local);
                const f = Math.floor(stock);
                bar.upsertDrink({ ...drink, stock_bottles: stock.toFixed(4), full_bottles: f, open_bottle_tots: drink.sells_tots && drink.tot_ml ? Math.floor(((stock - f) * drink.volume_ml) / drink.tot_ml) : null });
            }
            setMsg({ text: r.queued ? 'Saved offline — syncs when you’re back online.' : 'Saved.', ok: true });
            setBottles('');
            setReason('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AdminSheet visible onClose={onClose} title={drink.title} subtitle={`${stockLabel(drink)} · ${drink.volume_ml} ml`} icon={drink.sells_tots ? 'wine-outline' : 'beer-outline'} width={540}>
            <View style={{ gap: 14 }}>
                <ChoiceChips<'RECEIVE' | 'COUNT' | 'WASTE'>
                    options={[
                        { value: 'RECEIVE', label: 'Receive', icon: 'download-outline' },
                        { value: 'COUNT', label: 'Count', icon: 'calculator-outline' },
                        { value: 'WASTE', label: 'Spill / broken', icon: 'warning-outline' },
                    ]}
                    value={mode}
                    onChange={(m) => { setMode(m); setMsg(null); }}
                />
                {mode === 'RECEIVE' ? (
                    <View style={{ gap: 10 }}>
                        <FormRow>
                            <CustomTextField label="Bottles received" value={bottles} onChangeText={setBottles} keyboardType="decimal-pad" placeholder="e.g. 12" />
                            <CustomTextField label="Cost per bottle (KES)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
                        </FormRow>
                        <CustomTextField label="Supplier (optional)" value={reason} onChangeText={setReason} />
                    </View>
                ) : mode === 'COUNT' ? (
                    <View style={{ gap: 10 }}>
                        <FormRow>
                            <CustomTextField label="Full bottles" value={full} onChangeText={setFull} keyboardType="number-pad" />
                            {drink.sells_tots ? <CustomTextField label={`Tots left in the open bottle (of ${drink.tots_per_bottle})`} value={tots} onChangeText={setTots} keyboardType="number-pad" /> : null}
                        </FormRow>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            Counted {counted.toFixed(2)} bottles · was {Number(drink.stock_bottles).toFixed(2)} ({(counted - Number(drink.stock_bottles)).toFixed(2)})
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 10 }}>
                        <FormRow>
                            <CustomTextField label="Bottles" value={bottles} onChangeText={setBottles} keyboardType="decimal-pad" placeholder="0" />
                            {drink.sells_tots ? <CustomTextField label="…or tots" value={tots} onChangeText={setTots} keyboardType="number-pad" placeholder="0" /> : null}
                        </FormRow>
                        <CustomTextField label="What happened" value={reason} onChangeText={setReason} placeholder="e.g. Bottle broke" />
                    </View>
                )}
                {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    <SheetButton label="Save" icon="checkmark" loading={busy} loadingLabel="Saving…" onPress={() => void save()} />
                    <SheetButton label="Edit drink" icon="create-outline" variant="secondary" onPress={onEdit} />
                </View>
            </View>
        </AdminSheet>
    );
}

/* ------------------------------------------------------------ add / edit */

const SIZES = [250, 330, 350, 500, 750, 1000];
const TOTS = [25, 30, 35, 50];

const schema = Yup.object({
    title: Yup.string().trim().required('Name the drink'),
    volume_ml: Yup.number().typeError('ml').min(50).max(5000).required(),
    bottle_price: Yup.number().typeError('Enter a price').positive('Enter a price').required('Enter a price'),
    sells_tots: Yup.boolean(),
    tot_ml: Yup.number().when('sells_tots', { is: true, then: (s) => s.typeError('ml').min(10).required('Tot size'), otherwise: (s) => s.notRequired() }),
    tot_price: Yup.number().when('sells_tots', { is: true, then: (s) => s.typeError('Price').positive('Enter a price').required('Tot price'), otherwise: (s) => s.notRequired() }),
});

function DrinkForm({ drink, bar, onClose }: { drink: Drink | null; bar: BarData; onClose: () => void }) {
    const { theme, border } = useListTokens();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<CatalogueProduct[] | null>(null);
    const [product, setProduct] = useState<CatalogueProduct | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (search.trim().length < 2 || !bar.isOnline) {
            setResults(null);
            return;
        }
        const t = setTimeout(async () => {
            const res: any = await diningApi.searchCatalogue(search.trim()).catch(() => null);
            setResults(isOk(res) ? res.data.products ?? [] : []);
        }, 350);
        return () => clearTimeout(t);
    }, [search, bar.isOnline]);

    return (
        <Formik
            initialValues={{
                title: drink?.title ?? '',
                volume_ml: String(drink?.volume_ml ?? 750),
                bottle_price: drink ? String(Number(drink.bottle_price)) : '',
                bottle_cost: drink ? String(Number(drink.bottle_cost)) : '',
                sells_tots: drink?.sells_tots ?? false,
                tot_ml: String(drink?.tot_ml ?? 30),
                tot_price: drink ? String(Number(drink.tot_price) || '') : '',
                reorder_level: drink ? String(Number(drink.reorder_level)) : '2',
                is_available: drink?.is_available ?? true,
            }}
            validationSchema={schema}
            onSubmit={async (v) => {
                setError(null);
                const r = await bar.write('SaveDrink', { ...(drink ? { id: drink.id } : {}), ...(product ? { product: product.id, bar_code: product.bar_code } : {}), ...v }, `${drink ? 'Edit' : 'Add'} ${v.title}`);
                if (!r.ok) return setError(r.error || 'Not saved.');
                if (r.res?.data?.drink) bar.upsertDrink(r.res.data.drink);
                if (r.queued) setError('Saved offline — the drink appears once it syncs.');
                else onClose();
            }}
        >
            {(f) => {
                const tpb = f.values.sells_tots && Number(f.values.tot_ml) ? Math.floor(Number(f.values.volume_ml) / Number(f.values.tot_ml)) : 0;
                return (
                    <AdminSheet
                        visible
                        onClose={onClose}
                        title={drink ? 'Edit drink' : 'Add a drink'}
                        icon="wine-outline"
                        width={600}
                        footer={<SheetButton label={drink ? 'Save drink' : 'Add drink'} icon="checkmark" loading={f.isSubmitting} loadingLabel="Saving…" onPress={() => f.handleSubmit()} grow />}
                    >
                        <View style={{ gap: 14 }}>
                            {!drink ? (
                                <View style={{ gap: 6 }}>
                                    <SearchField value={search} onChangeText={setSearch} placeholder="Find in the product catalogue (online)…" variant="mobile" />
                                    {results === null && search.trim().length >= 2 && bar.isOnline ? <ActivityIndicator color={theme.primary} /> : null}
                                    {(results ?? []).slice(0, 8).map((p) => (
                                        <Pressable
                                            key={p.id}
                                            onPress={() => {
                                                setProduct(p);
                                                f.setFieldValue('title', p.title);
                                                setResults(null);
                                                setSearch('');
                                            }}
                                            className="flex-row items-center rounded-xl px-3 py-2"
                                            style={{ gap: 8, borderWidth: 1, borderColor: border }}
                                        >
                                            <Ionicons name="pricetag-outline" size={15} color={theme.textDark} />
                                            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>{p.title}</Text>
                                        </Pressable>
                                    ))}
                                    {product ? <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 12 }}>From the catalogue: {product.title}</Text> : null}
                                </View>
                            ) : null}
                            <CustomTextField name="title" label="Drink" required placeholder="e.g. Jameson 750 ml" />
                            <ChoiceChips<string>
                                label="Bottle size (ml)"
                                options={SIZES.map((s) => ({ value: String(s), label: s >= 1000 ? `${s / 1000} L` : `${s} ml` }))}
                                value={f.values.volume_ml}
                                onChange={(s) => f.setFieldValue('volume_ml', s)}
                            />
                            <FormRow>
                                <CustomTextField name="bottle_price" label="Bottle price (KES)" required keyboardType="decimal-pad" />
                                <CustomTextField name="bottle_cost" label="Cost per bottle" keyboardType="decimal-pad" placeholder="Optional" />
                            </FormRow>
                            <SwitchField name="sells_tots" label="Also sold by the tot" hint="Spirits like whisky, gin or vodka." />
                            {f.values.sells_tots ? (
                                <View style={{ gap: 10 }}>
                                    <ChoiceChips<string>
                                        label="Tot size"
                                        options={TOTS.map((t) => ({ value: String(t), label: `${t} ml` }))}
                                        value={f.values.tot_ml}
                                        onChange={(t) => f.setFieldValue('tot_ml', t)}
                                        hint={tpb ? `${tpb} tots per bottle` : undefined}
                                    />
                                    <CustomTextField name="tot_price" label="Tot price (KES)" required keyboardType="decimal-pad" />
                                    {tpb && Number(f.values.tot_price) ? (
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                            A bottle sold as tots brings {kes(tpb * Number(f.values.tot_price))} vs {kes(f.values.bottle_price)} as a bottle.
                                        </Text>
                                    ) : null}
                                </View>
                            ) : null}
                            <FormRow>
                                <CustomTextField name="reorder_level" label="Warn below (bottles)" keyboardType="decimal-pad" />
                                <View style={{ flex: 1, justifyContent: 'center' }}>
                                    <SwitchField name="is_available" label="On sale" />
                                </View>
                            </FormRow>
                            {error ? <Text style={{ color: error.startsWith('Saved offline') ? '#d97706' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
                        </View>
                    </AdminSheet>
                );
            }}
        </Formik>
    );
}
