// components/restaurants/owner/RestaurantSupplies.tsx
//
// The restaurant's own goods: food stock, cleaning materials, utilities (gas,
// charcoal…), packaging. Receive from the product catalogue (or by name), then
// record what's used, wasted or counted. Mobile first; works offline (saved on
// the device, synced when back online).

import diningApi, { isOk, SUPPLY_CATEGORIES, type CatalogueProduct, type Supply, type SupplyCategory, type SupplyMovement } from '@/api/diningApi';
import { AdminSheet, ChoiceChips, FilterChips, FormRow, SearchField, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { cacheGet, cacheSet, newDraftId, submitDining } from '@/services/diningOutbox';
import { onPendingOrdersChanged } from '@/services/pendingOrdersSignal';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { kes, when } from '../shared';

type Filter = 'ALL' | 'LOW' | SupplyCategory;
const UNITS = ['kg', 'g', 'litre', 'piece', 'packet', 'bag', 'tray', 'crate', 'roll', 'cylinder'];
const num = (v: string | number) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function RestaurantSupplies() {
    const { theme, border } = useListTokens();
    const { user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const key = `supplies:${user?.entity_id || 'none'}`;
    const [items, setItemsState] = useState<Supply[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [q, setQ] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [openId, setOpenId] = useState<string | null>(null);
    const [receiving, setReceiving] = useState(false);
    const onlineRef = useRef(isOnline);
    onlineRef.current = isOnline;

    const setItems = useCallback((next: Supply[]) => {
        setItemsState(next);
        void cacheSet(key, next);
    }, [key]);
    const load = useCallback(async () => {
        if (!onlineRef.current) return setLoading(false);
        const res: any = await diningApi.supplies().catch(() => null);
        if (isOk(res)) setItems(res.data.supplies ?? []);
        setLoading(false);
    }, [setItems]);
    useEffect(() => {
        void cacheGet<Supply[]>(key).then((c) => {
            if (c) setItemsState(c);
            void load();
        });
    }, [key, load]);
    useEffect(() => {
        if (isOnline) void load();
    }, [isOnline, load]);
    useEffect(() => onPendingOrdersChanged(() => void load()), [load]);

    const upsert = (s: Supply) => setItems(items.some((x) => x.id === s.id) ? items.map((x) => (x.id === s.id ? s : x)) : [...items, s]);
    const write = (action: string, payload: Record<string, any>, label: string) => submitDining(action, { draft_id: newDraftId(), ...payload }, label, onlineRef.current);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: items.length, LOW: items.filter((i) => i.is_low).length };
        for (const i of items) c[i.category] = (c[i.category] ?? 0) + 1;
        return c;
    }, [items]);
    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return items.filter((i) => (filter === 'ALL' || (filter === 'LOW' ? i.is_low : i.category === filter)) && (!s || `${i.title} ${i.supplier_name ?? ''}`.toLowerCase().includes(s)));
    }, [items, q, filter]);
    const worth = items.reduce((s, i) => s + Number(i.value || 0), 0);
    const selected = items.find((i) => i.id === openId) ?? null;

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 12, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.primary} />}
            >
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>Supplies</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {items.length} items · {kes(worth)} at cost{isOnline ? '' : ' · offline'}
                        </Text>
                    </View>
                    <SheetButton label="Receive" icon="download-outline" onPress={() => setReceiving(true)} />
                </View>
                <PendingSyncBanner kind="dining" />
                <SearchField value={q} onChangeText={setQ} placeholder="Search supplies…" variant="mobile" />
                <FilterChips<Filter>
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: counts.ALL },
                        { key: 'LOW', label: 'Running low', icon: 'alert-circle-outline', count: counts.LOW },
                        ...(Object.keys(SUPPLY_CATEGORIES) as SupplyCategory[]).map((c) => ({ key: c as Filter, label: SUPPLY_CATEGORIES[c].label, icon: SUPPLY_CATEGORIES[c].icon as any, count: counts[c] ?? 0 })),
                    ]}
                />
                {loading && !items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
                {!loading && !items.length ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 24 }}>
                        Nothing yet. Tap Receive when food stock, cleaning materials, gas or packaging comes in.
                    </Text>
                ) : null}
                {shown.map((i) => {
                    const meta = SUPPLY_CATEGORIES[i.category] ?? SUPPLY_CATEGORIES.OTHER;
                    return (
                        <Pressable key={i.id} onPress={() => setOpenId(i.id)} className="flex-row items-center rounded-2xl p-3" style={{ gap: 12, backgroundColor: theme.panel, borderWidth: 1, borderColor: i.is_low ? 'rgba(217,119,6,0.5)' : border }}>
                            <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: `${meta.color}1c` }}>
                                <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                            </View>
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>{i.title}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                    {[meta.label, i.expiry_date ? `exp ${i.expiry_date}` : null, i.supplier_name].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                            <View className="items-end">
                                <Text style={{ color: i.is_low ? '#d97706' : theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{num(i.quantity)} {i.unit}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{kes(i.value)}</Text>
                            </View>
                        </Pressable>
                    );
                })}
            </ScrollView>
            {selected ? <SupplySheet item={selected} write={write} onSaved={upsert} onClose={() => setOpenId(null)} online={isOnline} /> : null}
            {receiving ? <ReceiveSheet items={items} write={write} onSaved={(s) => s && upsert(s)} onClose={() => setReceiving(false)} online={isOnline} /> : null}
        </View>
    );
}

type Write = (action: string, payload: Record<string, any>, label: string) => ReturnType<typeof submitDining>;

function SupplySheet({ item, write, onSaved, onClose, online }: { item: Supply; write: Write; onSaved: (s: Supply) => void; onClose: () => void; online: boolean }) {
    const { theme, border } = useListTokens();
    const [mode, setMode] = useState<'ISSUE' | 'WASTE' | 'RECEIVE' | 'COUNT'>('ISSUE');
    const [qty, setQty] = useState('');
    const [cost, setCost] = useState(String(Number(item.unit_cost) || ''));
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [history, setHistory] = useState<SupplyMovement[] | null>(null);

    useEffect(() => {
        if (!online) return;
        diningApi.supplyMovements(item.id).then((res: any) => setHistory(isOk(res) ? res.data.movements ?? [] : [])).catch(() => setHistory([]));
    }, [item.id, item.quantity, online]);

    const save = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const amount = Number(qty || 0);
            const [action, payload, local] =
                mode === 'RECEIVE'
                    ? ['ReceiveSupplies', { stock: item.id, quantity: qty, unit_cost: cost, supplier_name: reason }, Number(item.quantity) + amount]
                    : mode === 'COUNT'
                      ? ['CountSupplies', { stock: item.id, counted: qty, reason: reason || 'Stock count' }, amount]
                      : ['UseSupplies', { stock: item.id, kind: mode, quantity: qty, reason }, Number(item.quantity) - amount];
            const r = await write(action as string, payload as any, `${mode.toLowerCase()} ${item.title}`);
            if (!r.ok) return setMsg({ text: r.error || 'Not saved.', ok: false });
            onSaved(r.res?.data?.supply ?? { ...item, quantity: String(Math.max(0, local as number)) });
            setMsg({ text: r.queued ? 'Saved offline — syncs when you’re back online.' : 'Saved.', ok: true });
            setQty('');
            setReason('');
        } finally {
            setBusy(false);
        }
    };

    const KIND_LABEL: Record<string, string> = { RECEIVE: 'Received', ISSUE: 'Used', WASTE: 'Wasted', ADJUST: 'Counted' };

    return (
        <AdminSheet visible onClose={onClose} title={item.title} subtitle={`${num(item.quantity)} ${item.unit} on hand · ${kes(item.unit_cost)} / ${item.unit}`} icon="cube-outline" width={560}>
            <View style={{ gap: 14 }}>
                <ChoiceChips<'ISSUE' | 'WASTE' | 'RECEIVE' | 'COUNT'>
                    options={[
                        { value: 'ISSUE', label: 'Used', icon: 'restaurant-outline' },
                        { value: 'WASTE', label: 'Wasted', icon: 'trash-outline' },
                        { value: 'RECEIVE', label: 'Received', icon: 'download-outline' },
                        { value: 'COUNT', label: 'Count', icon: 'calculator-outline' },
                    ]}
                    value={mode}
                    onChange={(m) => { setMode(m); setMsg(null); }}
                />
                <FormRow>
                    <CustomTextField label={mode === 'COUNT' ? `Counted (${item.unit})` : `Quantity (${item.unit})`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
                    {mode === 'RECEIVE' ? <CustomTextField label={`Cost per ${item.unit}`} value={cost} onChangeText={setCost} keyboardType="decimal-pad" /> : null}
                </FormRow>
                <CustomTextField label={mode === 'RECEIVE' ? 'Supplier (optional)' : 'Note (optional)'} value={reason} onChangeText={setReason} placeholder={mode === 'ISSUE' ? 'e.g. Kitchen, lunch service' : mode === 'WASTE' ? 'e.g. Spoilt' : ''} />
                {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
                <SheetButton label="Save" icon="checkmark" loading={busy} loadingLabel="Saving…" disabled={!Number(qty) && mode !== 'COUNT'} onPress={() => void save()} />
                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>HISTORY</Text>
                    {!online ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Available when online.</Text> : history === null ? <ActivityIndicator color={theme.primary} /> : null}
                    {(history ?? []).slice(0, 20).map((m) => (
                        <View key={m.id} className="flex-row items-center py-1.5" style={{ gap: 8, borderBottomWidth: 1, borderColor: border }}>
                            <Text style={{ width: 74, color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11.5 }}>{KIND_LABEL[m.kind]}</Text>
                            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>{m.reason || '—'} · {when(m.created)}</Text>
                            <Text style={{ color: Number(m.quantity) < 0 ? '#f43f5e' : '#10b981', fontFamily: theme.font.bold, fontSize: 12.5 }}>{Number(m.quantity) > 0 ? '+' : ''}{num(m.quantity)}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </AdminSheet>
    );
}

function ReceiveSheet({ items, write, onSaved, onClose, online }: { items: Supply[]; write: Write; onSaved: (s: Supply | null) => void; onClose: () => void; online: boolean }) {
    const { theme, border } = useListTokens();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<CatalogueProduct[] | null>(null);
    const [product, setProduct] = useState<CatalogueProduct | null>(null);
    const [existing, setExisting] = useState<Supply | null>(null);
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<SupplyCategory>('FOOD');
    const [unit, setUnit] = useState('kg');
    const [qty, setQty] = useState('');
    const [cost, setCost] = useState('');
    const [supplier, setSupplier] = useState('');
    const [batch, setBatch] = useState('');
    const [expiry, setExpiry] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // Matches already in stock (offline-friendly) + the catalogue (online).
    const local = useMemo(() => {
        const s = search.trim().toLowerCase();
        return s.length < 2 ? [] : items.filter((i) => i.title.toLowerCase().includes(s)).slice(0, 5);
    }, [search, items]);
    useEffect(() => {
        if (search.trim().length < 2 || !online) return setResults(null);
        const t = setTimeout(async () => {
            const res: any = await diningApi.searchCatalogue(search.trim()).catch(() => null);
            setResults(isOk(res) ? res.data.products ?? [] : []);
        }, 350);
        return () => clearTimeout(t);
    }, [search, online]);

    const pickedName = existing?.title || product?.title || title;
    const save = async () => {
        setMsg(null);
        if (!pickedName.trim()) return setMsg({ text: 'Pick a product or type a name.', ok: false });
        if (!Number(qty)) return setMsg({ text: 'How much came in?', ok: false });
        setBusy(true);
        try {
            const r = await write(
                'ReceiveSupplies',
                {
                    ...(existing ? { stock: existing.id } : { ...(product ? { product: product.id } : {}), title: pickedName.trim(), category, unit }),
                    quantity: qty,
                    unit_cost: cost || '0',
                    supplier_name: supplier,
                    batch,
                    expiry_date: expiry,
                },
                `Receive ${pickedName}`,
            );
            if (!r.ok) return setMsg({ text: r.error || 'Not saved.', ok: false });
            onSaved(r.res?.data?.supply ?? (existing ? { ...existing, quantity: String(Number(existing.quantity) + Number(qty)) } : null));
            if (r.queued) setMsg({ text: 'Saved offline — syncs when you’re back online.', ok: true });
            else onClose();
        } finally {
            setBusy(false);
        }
    };

    const chip = (label: string, onPress: () => void, icon: any, key: string) => (
        <Pressable key={key} onPress={onPress} className="flex-row items-center rounded-xl px-3 py-2" style={{ gap: 8, borderWidth: 1, borderColor: border }}>
            <Ionicons name={icon} size={15} color={theme.textDark} />
            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>{label}</Text>
        </Pressable>
    );

    return (
        <AdminSheet visible onClose={onClose} title="Receive supplies" icon="download-outline" width={600} footer={<SheetButton label="Save" icon="checkmark" loading={busy} loadingLabel="Saving…" onPress={() => void save()} grow />}>
            <View style={{ gap: 14 }}>
                {pickedName && (existing || product) ? (
                    <View className="flex-row items-center rounded-xl px-3 py-2.5" style={{ gap: 8, backgroundColor: 'rgba(16,185,129,0.10)' }}>
                        <Ionicons name="checkmark-circle" size={17} color="#10b981" />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{pickedName}{existing ? ` · ${num(existing.quantity)} ${existing.unit} on hand` : ' · from the catalogue'}</Text>
                        <Pressable onPress={() => { setExisting(null); setProduct(null); }} hitSlop={8}><Ionicons name="close" size={17} color={theme.textDark} /></Pressable>
                    </View>
                ) : (
                    <View style={{ gap: 6 }}>
                        <SearchField value={search} onChangeText={setSearch} placeholder="Search your stock or the product catalogue…" variant="mobile" />
                        {local.map((i) => chip(`${i.title} · ${num(i.quantity)} ${i.unit}`, () => { setExisting(i); setSearch(''); }, 'cube-outline', `l-${i.id}`))}
                        {(results ?? []).slice(0, 6).map((p) => chip(p.title, () => { setProduct(p); setSearch(''); }, 'pricetag-outline', `p-${p.id}`))}
                        <CustomTextField label="…or type a name" value={title} onChangeText={setTitle} placeholder="e.g. Cooking gas 13 kg, Jik 750 ml, Rice 25 kg" />
                    </View>
                )}
                {!existing ? (
                    <>
                        <ChoiceChips<SupplyCategory>
                            label="Category"
                            options={(Object.keys(SUPPLY_CATEGORIES) as SupplyCategory[]).map((c) => ({ value: c, label: SUPPLY_CATEGORIES[c].label, icon: SUPPLY_CATEGORIES[c].icon as any }))}
                            value={category}
                            onChange={setCategory}
                        />
                        <ChoiceChips<string> label="Counted in" options={UNITS.map((u) => ({ value: u, label: u }))} value={unit} onChange={setUnit} />
                    </>
                ) : null}
                <FormRow>
                    <CustomTextField label={`Quantity (${existing?.unit ?? unit})`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
                    <CustomTextField label={`Cost per ${existing?.unit ?? unit}`} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="Optional" />
                </FormRow>
                <FormRow>
                    <CustomTextField label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Optional" />
                    <CustomTextField label="Batch" value={batch} onChangeText={setBatch} placeholder="Optional" />
                </FormRow>
                <DateField label="Expiry date" value={expiry} onChangeText={setExpiry} placeholder="Optional" />
                {msg ? <Text style={{ color: msg.ok ? '#d97706' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
            </View>
        </AdminSheet>
    );
}
