// components/manufacturers/ManufacturerMarketplace.tsx
//
// Distributor -> Buy from manufacturers: find manufacturers you may buy from (near
// you, or anywhere — by name or by a product they stock), open one, add to cart
// and order remotely. Pay by mobile money from the order (OrderDetailsSheet),
// collect with your pickup code, then receive into your stock.
// Backend: manufacturers/buy DiscoverManufacturers / GetCatalogue / PlaceOrder.

import { CheckoutBar, InlineNotice, QtyStepper, softShadow } from '@/components/ui/pos';
import { distributorBuyApi, type ManufacturerLot, type ManufacturerSummary, type DistributorOrder } from '@/api/manufacturersApi';
import { AdminSheet, ChoiceChips, formatDate, SearchField, SegmentedControl, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import type { DeliveryOption } from '@/api/deliveriesApi';
import DeliveryOptionList from '@/components/deliveries/DeliveryOptionList';

import OrderDetailsSheet, { errorText, ok } from './OrderDetailsSheet';

type Mode = 'ADJACENT' | 'ALL';

export default function ManufacturerMarketplace() {
    const { theme, border, cardShadow } = useListTokens();
    const [mode, setMode] = useState<Mode>('ALL');
    const [search, setSearch] = useState('');
    const [product, setProduct] = useState('');
    const [rows, setRows] = useState<ManufacturerSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [open, setOpen] = useState<ManufacturerSummary | null>(null);
    const [placed, setPlaced] = useState<DistributorOrder | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await distributorBuyApi.discover({ mode, search: search.trim() || undefined, product: product.trim() || undefined, radius_km: 50 });
            if (ok(res)) {
                setRows(res.data.manufacturers ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load manufacturers.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, [mode, search, product]);
    useEffect(() => {
        const t = setTimeout(() => void load(), 300);
        return () => clearTimeout(t);
    }, [load]);

    if (open) return <Catalogue manufacturer={open} onBack={() => setOpen(null)} onPlaced={(o) => { setOpen(null); setPlaced(o); }} />;

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 960, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
            >
                <View style={{ gap: 2 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Buy from manufacturers</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>Order stock remotely, pay by mobile money, collect with your pickup code.</Text>
                </View>
                <SegmentedControl<Mode> value={mode} onChange={setMode} options={[{ key: 'ALL', label: 'All manufacturers' }, { key: 'ADJACENT', label: 'Near me (50 km)' }]} />
                <SearchField variant="mobile" value={search} onChangeText={setSearch} placeholder="Manufacturer name or town…" />
                <SearchField variant="mobile" value={product} onChangeText={setProduct} placeholder="Who stocks… (product or barcode)" />
                {rows === null && !error ? <ActivityIndicator color={theme.primary} /> : null}
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                {rows && rows.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 20 }}>No manufacturers found.</Text> : null}
                <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                    {(rows ?? []).map((d) => (
                        <Pressable key={d.id} onPress={() => setOpen(d)} style={{ flexGrow: 1, flexBasis: 280, padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, ...cardShadow }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.primary}14` }}>
                                    <Ionicons name="business" size={20} color={theme.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>{d.title}</Text>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                        {[d.road, d.town].filter(Boolean).join(', ') || 'Location not set'}{d.distance_km != null ? ` · ${d.distance_km.toFixed(1)} km` : ''}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={theme.textDark} />
                            </View>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {d.products_in_stock} product(s) in stock{d.matches.length ? ` · has ${d.matches.slice(0, 3).join(', ')}` : ''}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>
            {placed ? <OrderDetailsSheet order={placed} role="buyer" onClose={() => setPlaced(null)} onChanged={setPlaced} /> : null}
        </View>
    );
}

interface CartLine { lot: ManufacturerLot; quantity: number }

function Catalogue({ manufacturer, onBack, onPlaced }: { manufacturer: ManufacturerSummary; onBack: () => void; onPlaced: (o: DistributorOrder) => void }) {
    const { theme, border, chipBg } = useListTokens();
    const [q, setQ] = useState('');
    const [lots, setLots] = useState<ManufacturerLot[] | null>(null);
    const [cart, setCart] = useState<Record<string, CartLine>>({});
    const [checkout, setCheckout] = useState(false);
    const [notes, setNotes] = useState('');
    const [placing, setPlacing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [method, setMethod] = useState<'SELF' | 'COURIER'>('SELF');
    const [options, setOptions] = useState<DeliveryOption[] | null>(null);
    const [option, setOption] = useState<DeliveryOption | null>(null);
    const [optionsBusy, setOptionsBusy] = useState(false);
    const draft = useRef(`wo-${Date.now()}`);

    useEffect(() => {
        const t = setTimeout(async () => {
            const res: any = await distributorBuyApi.catalogue(manufacturer.id, q.trim() || undefined);
            setLots(ok(res) ? res.data.data.batches ?? [] : []);
        }, 250);
        return () => clearTimeout(t);
    }, [manufacturer.id, q]);

    const setQty = (lot: ManufacturerLot, qty: number) =>
        setCart((c) => {
            const n = { ...c };
            const clamped = Math.max(0, Math.min(qty, lot.current_quantity));
            if (clamped <= 0) delete n[lot.id];
            else n[lot.id] = { lot, quantity: clamped };
            return n;
        });
    const lines = Object.values(cart);
    const total = useMemo(() => lines.reduce((s, l) => s + Number(l.lot.final_unit_price) * l.quantity, 0), [lines]);
    const free = (l: CartLine) => (l.lot.quantity_discount ? Math.floor(l.quantity / l.lot.quantity_discount.limit_quantity) * l.lot.quantity_discount.awarded_quantity : 0);

    // Delivery: priced options for this cart and distance (walking / rider / courier).
    const cartItems = () => lines.map((l) => ({ batch_id: l.lot.id, quantity: l.quantity }));
    const loadOptions = async (office?: string, keepCourier?: string) => {
        setOptionsBusy(true);
        setError(null);
        try {
            const res: any = await distributorBuyApi.deliveryOptions(manufacturer.id, cartItems(), office);
            if (!ok(res)) {
                setOptions([]);
                setOption(null);
                return setError(errorText(res, 'No delivery options.'));
            }
            const next: DeliveryOption[] = res.data.data.options ?? [];
            setOptions(next);
            setOption((cur) => next.find((o) => o.key === cur?.key) ?? (keepCourier ? next.find((o) => o.courier === keepCourier) ?? null : null));
        } finally {
            setOptionsBusy(false);
        }
    };
    useEffect(() => {
        if (checkout && method === 'COURIER') void loadOptions();
        if (method === 'SELF') setOption(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkout, method]);

    const place = async () => {
        if (method === 'COURIER' && !option) return setError('Choose how it should be delivered');
        setPlacing(true);
        setError(null);
        try {
            const res: any = await distributorBuyApi.placeOrder({
                manufacturer: manufacturer.id,
                items: lines.map((l) => ({ batch_id: l.lot.id, quantity: l.quantity })),
                delivery_method: method,
                ...(method === 'COURIER' && option ? { delivery_option: option.key } : {}),
                notes: notes.trim() || undefined,
                draft_id: draft.current,
            });
            if (ok(res)) {
                draft.current = `wo-${Date.now()}`;
                setCheckout(false);
                onPlaced(res.data.order);
            } else setError(errorText(res, 'Could not place the order.'));
        } finally {
            setPlacing(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ padding: 16, gap: 10, maxWidth: 960, width: '100%', alignSelf: 'center' }}>
                <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="arrow-back" size={18} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold }}>All manufacturers</Text>
                </Pressable>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>{manufacturer.title}</Text>
                <SearchField variant="mobile" value={q} onChangeText={setQ} placeholder="Search products…" />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 10, maxWidth: 960, width: '100%', alignSelf: 'center' }}>
                {lots === null ? <ActivityIndicator color={theme.primary} /> : null}
                {lots && lots.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>Nothing in stock matches.</Text> : null}
                {(lots ?? []).map((l) => {
                    const qty = cart[l.id]?.quantity ?? 0;
                    const offer = Number(l.discount_unit_price) > 0;
                    return (
                        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: qty ? theme.primary : border, backgroundColor: theme.panel, ...softShadow }}>
                            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 16 }}>{String(l.title || '?').trim().charAt(0).toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }} numberOfLines={1}>{l.title}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                                    {formatKES(l.final_unit_price)} / {l.unit_of_issue.toLowerCase()}{offer ? ` (was ${formatKES(l.unit_price)})` : ''}
                                    {' · '}{l.current_quantity} left{l.expiry_date ? ` · exp ${formatDate(l.expiry_date)}` : ''}
                                </Text>
                                {l.quantity_discount ? <Text style={{ color: '#8b5cf6', fontFamily: theme.font.bold, fontSize: 11.5 }}>Buy {l.quantity_discount.limit_quantity}, get {l.quantity_discount.awarded_quantity} free</Text> : null}
                            </View>
                            {qty ? (
                                <QtyStepper value={String(qty)} onChangeText={(t) => setQty(l, Number(t.replace(/[^0-9]/g, '') || 0))} onStep={(d) => setQty(l, qty + d)} />
                            ) : (
                                <SheetButton label="Add" icon="add" variant="secondary" onPress={() => setQty(l, 1)} />
                            )}
                        </View>
                    );
                })}
            </ScrollView>
            {lines.length ? (
                <CheckoutBar
                    caption={`${lines.length} ${lines.length === 1 ? 'product' : 'products'} · Total`}
                    total={total}
                    actionLabel="Review order"
                    onPress={() => setCheckout(true)}
                />
            ) : null}
            <AdminSheet
                visible={checkout}
                onClose={() => !placing && setCheckout(false)}
                title={`Order from ${manufacturer.title}`}
                subtitle={`${formatKES(total)}${option ? ` + ${formatKES(option.total)} delivery` : ''}`}
                icon="cart-outline"
                width={560}
                footer={
                    <>
                        <SheetButton label="Back" variant="ghost" onPress={() => setCheckout(false)} />
                        <SheetButton label="Place order" icon="checkmark" loading={placing} onPress={() => void place()} />
                    </>
                }
            >
                <View style={{ gap: 10 }}>
                    <View style={{ borderRadius: 16, backgroundColor: theme.surfaceAlt, padding: 12, gap: 10 }}>
                        {lines.map((l) => (
                            <View key={l.lot.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ minWidth: 30, height: 26, paddingHorizontal: 6, borderRadius: 8, backgroundColor: theme.panel, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{l.quantity}×</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }} numberOfLines={1}>{l.lot.title}</Text>
                                    {free(l) ? <Text style={{ color: '#8b5cf6', fontFamily: theme.font.bold, fontSize: 11.5 }}>+{free(l)} free</Text> : null}
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{formatKES(Number(l.lot.final_unit_price) * l.quantity)}</Text>
                            </View>
                        ))}
                    </View>
                    <ChoiceChips<'SELF' | 'COURIER'>
                        label="How you'll get it"
                        options={[{ value: 'SELF', label: 'Collect (pickup)', icon: 'walk-outline' }, { value: 'COURIER', label: 'Deliver to me', icon: 'bicycle-outline' }]}
                        value={method}
                        onChange={setMethod}
                    />
                    {method === 'COURIER' ? (
                        options === null || optionsBusy && !options.length ? (
                            <ActivityIndicator color={theme.primary} />
                        ) : options.length ? (
                            <DeliveryOptionList
                                options={options}
                                selectedKey={option?.key ?? null}
                                onSelect={setOption}
                                busy={optionsBusy}
                                onPickOffice={(o, office) => void loadOptions(office, o.courier)}
                            />
                        ) : (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>This manufacturer has no delivery for your location; choose pickup.</Text>
                        )
                    ) : null}
                    <TextInput value={notes} onChangeText={setNotes} placeholder="Note to the manufacturer (optional)" placeholderTextColor={theme.textDark}
                        style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium, fontSize: 15, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) }} />
                    <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.primarySoft }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>
                            {method === 'COURIER'
                                ? "Prices and delivery are confirmed by the system when you place the order. You pay both by mobile money; once ready, the manufacturer sends it with one of their delivery persons or a rider (or to the courier office), and you give your delivery code on arrival."
                                : "Prices are confirmed by the manufacturer's system when you place the order. Next you pay by mobile money; once paid they prepare it and you collect with your pickup code."}
                        </Text>
                    </View>
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                </View>
            </AdminSheet>
        </View>
    );
}
