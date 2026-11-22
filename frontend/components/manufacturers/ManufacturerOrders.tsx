// components/manufacturers/ManufacturerOrders.tsx
//
// Manufacturer -> Orders: distributors' orders (placed remotely, or taken here by
// staff with "New order"). Open one to take payment, prepare -> pack -> ready,
// and hand over with the buyer's pickup code. Backend: manufacturers/staff.

import { manufacturerStaffApi, ORDER_STATUS_META, type ManufacturerLot, type DistributorOrder } from '@/api/manufacturersApi';
import { AdminFormSheet, AdminListView, ChoiceChips, DetailsDock, formatDate, FormSection, SegmentedControl, SheetButton, useListTokens, type AdminListConfig } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import OrderDetailsSheet, { errorText, ok } from './OrderDetailsSheet';

type Scope = 'OPEN' | 'DONE';

export const ordersConfig = (side: 'seller' | 'buyer'): AdminListConfig<DistributorOrder> => ({
    title: side === 'seller' ? 'Distributor orders' : 'Manufacturer orders',
    noun: ['order', 'orders'],
    icon: 'cube-outline',
    searchPlaceholder: side === 'seller' ? 'Search reference or distributor…' : 'Search reference or manufacturer…',
    addLabel: side === 'seller' ? 'New order' : undefined,
    emptyTitle: 'No orders',
    emptyMessage: side === 'seller' ? 'Orders distributors place with you appear here.' : 'Order from a manufacturer under Buy from manufacturers.',
    keyOf: (o) => o.id,
    titleOf: (o) => (side === 'seller' ? o.distributor_title : o.manufacturer_title),
    subtitleOf: (o) => `${o.reference_number} · ${o.items.length} product(s) · ${o.delivery_method === 'SELF' ? 'pickup' : 'delivery'}`,
    avatarOf: (o) => ({ label: side === 'seller' ? o.distributor_title : o.manufacturer_title }),
    badgesOf: (o) => [
        { label: ORDER_STATUS_META[o.status].label, tone: ORDER_STATUS_META[o.status].tone },
        ...(o.order_origin === 'STAFF' && side === 'seller' ? [{ label: 'Taken here', tone: 'neutral' as const }] : []),
    ],
    metaOf: (o) => formatDate(o.created),
    metaIcon: 'calendar-outline',
    metricOf: (o) => ({ value: formatKES(o.final_price_total), label: o.status === 'SUBMITTED' ? 'unpaid' : 'paid' }),
    primaryColumn: { label: side === 'seller' ? 'Distributor' : 'Manufacturer', flex: 1.8 },
    columns: [
        { key: 'ref', label: 'Reference', flex: 1, render: (o) => o.reference_number },
        { key: 'status', label: 'Status', flex: 1.1, render: (o) => ORDER_STATUS_META[o.status].label },
        { key: 'items', label: 'Products', flex: 0.7, align: 'right', render: (o) => String(o.items.length) },
        { key: 'total', label: 'Total', flex: 1, align: 'right', render: (o) => formatKES(o.final_price_total) },
        { key: 'how', label: 'Fulfilment', flex: 0.9, render: (o) => (o.delivery_method === 'SELF' ? 'Pickup' : 'Delivery') },
        { key: 'date', label: 'Placed', flex: 1, render: (o) => formatDate(o.created) },
    ],
});

export default function ManufacturerOrders() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [scope, setScope] = useState<Scope>('OPEN');
    const [rows, setRows] = useState<DistributorOrder[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<DistributorOrder | null>(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await manufacturerStaffApi.orders(scope);
            if (ok(res)) {
                setRows(res.data.orders ?? []);
                setLoadError(null);
            } else setLoadError(errorText(res, 'Could not load orders.'));
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, [scope]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((o) => `${o.reference_number} ${o.distributor_title}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);
    const upsert = (o: DistributorOrder) => setRows((prev) => (prev.some((x) => x.id === o.id) ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev]));

    return (
        <>
            <DetailsDock
                placeholder="Pick an order to work on it."
                pane={viewing ? <OrderDetailsSheet order={viewing} role="seller" onClose={() => setViewing(null)} onChanged={upsert} /> : null}
            >
                <AdminListView<DistributorOrder, string>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={ordersConfig('seller')}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={load}
                    refreshing={refreshing}
                    sourceLabel={loadError ? 'Not loaded' : 'Server'}
                    sourceTone={loadError ? 'none' : 'server'}
                    error={loadError}
                    header={<View style={{ marginBottom: 8 }}><SegmentedControl<Scope> value={scope} onChange={setScope} options={[{ key: 'OPEN', label: 'Open' }, { key: 'DONE', label: 'Done' }]} /></View>}
                    items={items}
                    allItems={items}
                    onOpenCreate={() => setCreating(true)}
                    onPressItem={setViewing}
                    stats={[
                        { label: 'Orders', value: rows.length.toLocaleString() },
                        { label: 'Awaiting payment', value: rows.filter((o) => o.status === 'SUBMITTED').length.toLocaleString(), color: '#f59e0b' },
                        { label: 'To prepare', value: rows.filter((o) => ['PAID', 'PREPARING', 'PACKED'].includes(o.status)).length.toLocaleString(), color: '#3b82f6' },
                        { label: 'Ready', value: rows.filter((o) => o.status === 'READY').length.toLocaleString(), color: '#8b5cf6' },
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
            <StaffOrderSheet visible={creating} onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); upsert(o); setViewing(o); }} />
        </>
    );
}

/* ------------------------------------------------------------------ staff order */

interface Line { lot: ManufacturerLot; quantity: string; discount: string }

function StaffOrderSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (o: DistributorOrder) => void }) {
    const { theme, border, chipBg } = useListTokens();
    const alert = useAlert();
    const [wq, setWq] = useState('');
    const [distributors, setDistributors] = useState<{ id: string; title: string; town: string | null }[]>([]);
    const [distributor, setDistributor] = useState<{ id: string; title: string } | null>(null);
    const [lq, setLq] = useState('');
    const [stock, setStock] = useState<ManufacturerLot[]>([]);
    const [lines, setLines] = useState<Line[]>([]);
    const [terms, setTerms] = useState<'CASH' | 'CREDIT'>('CASH');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState(() => `so-${Date.now()}`);

    useEffect(() => {
        if (!visible) return;
        setDistributor(null); setLines([]); setError(null); setWq(''); setLq(''); setDraft(`so-${Date.now()}`);
        void (async () => {
            const res: any = await manufacturerStaffApi.stock('IN_STOCK');
            if (ok(res)) setStock(res.data.stock ?? []);
        })();
    }, [visible]);
    useEffect(() => {
        if (!visible || wq.trim().length < 2) return setDistributors([]);
        const t = setTimeout(async () => {
            const res: any = await manufacturerStaffApi.searchDistributors(wq.trim());
            if (ok(res)) setDistributors(res.data.distributors ?? []);
        }, 300);
        return () => clearTimeout(t);
    }, [wq, visible]);

    const picks = useMemo(() => {
        const q = lq.trim().toLowerCase();
        if (!q) return [];
        return stock.filter((l) => l.title.toLowerCase().includes(q) && !lines.some((x) => x.lot.id === l.id)).slice(0, 8);
    }, [lq, stock, lines]);
    const total = lines.reduce((s, l) => s + Number(l.lot.final_unit_price) * Number(l.quantity || 0) - Number(l.discount || 0), 0);

    const submit = async () => {
        if (!distributor) return setError('Pick the distributor');
        if (!lines.length) return setError('Add at least one product');
        setSaving(true);
        setError(null);
        try {
            const res: any = await manufacturerStaffApi.createOrder({
                distributor: distributor.id,
                order_terms: terms,
                draft_id: draft,
                items: lines.map((l) => ({ batch_id: l.lot.id, quantity: Number(l.quantity), ...(l.discount ? { discount: l.discount } : {}) })),
            });
            if (ok(res)) onCreated(res.data.order);
            else setError(errorText(res, 'Could not create the order.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const field = (value: string, onChange: (t: string) => void, placeholder: string, extra: any = {}) => (
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.textDark}
            style={{ height: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium, ...extra.style }} {...extra} />
    );

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title="New order" subtitle="Taken by your staff for a distributor" icon="cart-outline" submitLabel={`Create · ${formatKES(total)}`} submitting={saving} onSubmit={() => void submit()} error={error} width={640}>
            <FormSection title="Distributor">
                {distributor ? (
                    <Pressable onPress={() => setDistributor(null)} style={{ padding: 10, borderRadius: 10, backgroundColor: chipBg }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>{distributor.title} · change</Text>
                    </Pressable>
                ) : (
                    <>
                        {field(wq, setWq, 'Search distributors by name or town…')}
                        {distributors.map((w) => (
                            <Pressable key={w.id} onPress={() => setDistributor(w)} style={{ paddingVertical: 8 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium }}>{w.title}{w.town ? ` · ${w.town}` : ''}</Text>
                            </Pressable>
                        ))}
                    </>
                )}
                <ChoiceChips<'CASH' | 'CREDIT'> label="Terms" options={[{ value: 'CASH', label: 'Cash' }, { value: 'CREDIT', label: 'Credit' }]} value={terms} onChange={setTerms} />
            </FormSection>
            <FormSection title="Products" hint="Price is the lot's price after any running discount; add a counter discount if agreed (never below cost).">
                {field(lq, setLq, 'Search your stock…')}
                {picks.map((l) => (
                    <Pressable key={l.id} onPress={() => { setLines((x) => [...x, { lot: l, quantity: '1', discount: '' }]); setLq(''); }} style={{ paddingVertical: 8 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.medium }}>{l.title} · {formatKES(l.final_unit_price)} · {l.current_quantity} {l.unit_of_issue} left</Text>
                    </Pressable>
                ))}
                {lines.map((l, idx) => (
                    <View key={l.lot.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: border }}>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>{l.lot.title}</Text>
                        {field(l.quantity, (t) => setLines((x) => x.map((y, j) => (j === idx ? { ...y, quantity: t.replace(/[^0-9]/g, '') } : y))), 'Qty', { keyboardType: 'number-pad', style: { width: 64, textAlign: 'center' } })}
                        {field(l.discount, (t) => setLines((x) => x.map((y, j) => (j === idx ? { ...y, discount: t.replace(/[^0-9.]/g, '') } : y))), 'Disc.', { keyboardType: 'decimal-pad', style: { width: 80, textAlign: 'right' } })}
                        <SheetButton label="" icon="trash-outline" variant="ghost" onPress={() => setLines((x) => x.filter((_, j) => j !== idx))} />
                    </View>
                ))}
            </FormSection>
        </AdminFormSheet>
    );
}
