// components/restaurants/owner/RestaurantOrders.tsx
//
// The kitchen / front-of-house board for the restaurant the user works in:
// new orders and table bookings, moved along RECEIVED -> Preparing -> Ready ->
// Served / Collected / dispatched. Delivery orders are handed to a delivery
// person from the Delivery section (paid + ready). Cash at the counter is
// recorded here. Refreshes every 15 s.

import diningApi, { errorText, isOk, SERVICE_META, STATUS_META, type FoodOrder } from '@/api/diningApi';
import { ShipmentTracker } from '@/components/deliveries/ShipmentTracker';
import { AdminListView, AdminSheet, SheetButton, useListTokens, type AdminListConfig } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { FoodStatusPill, kes, PaidPill, when } from '../shared';
import StaffWalkIn from '../walkin/StaffWalkIn';
import { useDiningKind } from '../diningKind';

type Filter = 'ALL' | 'RECEIVED' | 'PROCESSING' | 'READY' | 'OUT' | 'BOOKINGS' | 'DONE';

const config: AdminListConfig<FoodOrder> = {
    title: 'Restaurant orders',
    noun: ['order', 'orders'],
    icon: 'restaurant-outline',
    searchPlaceholder: 'Search reference, name, phone…',
    addLabel: 'Walk-in order',
    emptyTitle: 'No orders right now',
    emptyMessage: 'New orders and table bookings appear here as they come in.',
    keyOf: (o) => o.id,
    titleOf: (o) => o.customer_name || 'Guest',
    subtitleOf: (o) =>
        [SERVICE_META[o.service_type]?.label, o.table, o.reference, o.reservation_at ? `${when(o.reservation_at)} · ${o.party_size} ppl` : null].filter(Boolean).join(' · '),
    avatarOf: (o) => ({ icon: (SERVICE_META[o.service_type]?.icon as any) ?? 'restaurant-outline' }),
    badgesOf: (o) => [
        { label: STATUS_META[o.status]?.label ?? o.status, tone: STATUS_META[o.status]?.tone ?? 'neutral' },
        o.is_paid ? { label: 'Paid', tone: 'success' } : { label: 'Not paid', tone: 'warning' },
    ],
    metaOf: (o) => (o.created ? when(o.created) : null),
    metaIcon: 'time-outline',
    metricOf: (o) => ({ value: kes(o.total), label: `${o.items.reduce((s, i) => s + i.quantity, 0)} items` }),
    primaryColumn: { label: 'Customer', flex: 2 },
    columns: [
        { key: 'svc', label: 'Service', flex: 1.1, render: (o) => SERVICE_META[o.service_type]?.label ?? o.service_type },
        { key: 'when', label: 'For', flex: 1.4, render: (o) => (o.reservation_at ? `${when(o.reservation_at)} · ${o.party_size}` : 'Now') },
        { key: 'items', label: 'Items', flex: 2, render: (o) => o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ') || '—' },
        { key: 'status', label: 'Status', flex: 1, render: (o) => <FoodStatusPill order={o} /> },
        { key: 'paid', label: 'Payment', flex: 0.9, render: (o) => <PaidPill order={o} /> },
        { key: 'total', label: 'Total', flex: 0.9, align: 'right', render: (o) => kes(o.total) },
    ],
};

export default function RestaurantOrders() {
    const { Noun } = useDiningKind();
    const kindConfig = React.useMemo(() => ({ ...config, title: `${Noun} orders` }), [Noun]);
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;
    const [open, setOpen] = useState<FoodOrder[]>([]);
    const [done, setDone] = useState<FoodOrder[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [lastSynced, setLastSynced] = useState<string | undefined>();
    // Counter service: food and drinks for a walk-in customer on one pad.
    const [walkIn, setWalkIn] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [a, b]: any[] = await Promise.all([diningApi.restaurantOrders('open'), diningApi.restaurantOrders('done')]);
            if (isOk(a)) setOpen(a.data.food_orders ?? []);
            else setError(errorText(a, 'Could not load orders.'));
            if (isOk(b)) setDone(b.data.food_orders ?? []);
            if (isOk(a)) {
                setError(null);
                setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
            const t = setInterval(load, 15000);
            return () => clearInterval(t);
        }, [load]),
    );

    const counts = useMemo(
        () => ({
            RECEIVED: open.filter((o) => o.status === 'RECEIVED').length,
            PROCESSING: open.filter((o) => o.status === 'PROCESSING').length,
            READY: open.filter((o) => o.status === 'READY').length,
            OUT: open.filter((o) => ['DISPATCHED', 'ASSIGNED'].includes(o.status)).length,
            BOOKINGS: open.filter((o) => o.service_type === 'DINE_IN').length,
        }),
        [open],
    );

    const filtered = useMemo(() => {
        let base = filter === 'DONE' ? done : open;
        if (filter === 'OUT') base = open.filter((o) => ['DISPATCHED', 'ASSIGNED'].includes(o.status));
        else if (filter === 'BOOKINGS') base = open.filter((o) => o.service_type === 'DINE_IN');
        else if (!['ALL', 'DONE'].includes(filter)) base = open.filter((o) => o.status === filter);
        const q = query.trim().toLowerCase();
        return q ? base.filter((o) => `${o.reference} ${o.customer_name ?? ''} ${o.customer_phone ?? ''}`.toLowerCase().includes(q)) : base;
    }, [open, done, filter, query]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const selected = [...open, ...done].find((o) => o.id === selectedId) ?? null;

    const replace = (o: FoodOrder) => {
        const isOpen = ['RECEIVED', 'PROCESSING', 'READY', 'DISPATCHED', 'ASSIGNED'].includes(o.status);
        setOpen((prev) => (isOpen ? (prev.some((x) => x.id === o.id) ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev]) : prev.filter((x) => x.id !== o.id)));
        setDone((prev) => (isOpen ? prev.filter((x) => x.id !== o.id) : [o, ...prev.filter((x) => x.id !== o.id)]));
    };

    if (walkIn) return <StaffWalkIn onClose={() => { setWalkIn(false); void load(); }} onPlaced={() => void load()} />;

    return (
        <>
            <AdminListView<FoodOrder, Filter>
                variant={isLarge ? 'web' : 'mobile'}
                config={kindConfig}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel="Live · every 15 s"
                sourceTone="server"
                lastSyncedTime={lastSynced}
                error={error}
                items={filtered.slice(pageStart, pageEnd)}
                allItems={filtered}
                onOpenCreate={() => setWalkIn(true)}
                onPressItem={(o) => setSelectedId(o.id)}
                rowActions={(o) => [{ icon: 'open-outline', label: 'Open order', onPress: () => setSelectedId(o.id), tone: 'primary' }]}
                stats={[
                    { label: 'New', value: String(counts.RECEIVED), color: counts.RECEIVED ? '#3b82f6' : undefined },
                    { label: 'Preparing', value: String(counts.PROCESSING) },
                    { label: 'Ready', value: String(counts.READY), color: counts.READY ? '#10b981' : undefined },
                    { label: 'Bookings', value: String(counts.BOOKINGS) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All open', icon: 'apps-outline', count: open.length },
                        { key: 'RECEIVED', label: 'New', icon: 'notifications-outline', count: counts.RECEIVED },
                        { key: 'PROCESSING', label: 'Preparing', icon: 'flame-outline', count: counts.PROCESSING },
                        { key: 'READY', label: 'Ready', icon: 'checkmark-done-outline', count: counts.READY },
                        { key: 'OUT', label: 'Out for delivery', icon: 'bicycle-outline', count: counts.OUT },
                        { key: 'BOOKINGS', label: 'Table bookings', icon: 'calendar-outline', count: counts.BOOKINGS },
                        { key: 'DONE', label: 'Done', icon: 'archive-outline', count: done.length },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                }}
            />
            <OrderSheet order={selected} onClose={() => setSelectedId(null)} onChanged={replace} onReload={load} />
        </>
    );
}

/** One order: what's on it, what to do next. */
function OrderSheet({ order, onClose, onChanged, onReload }: { order: FoodOrder | null; onClose: () => void; onChanged: (o: FoodOrder) => void; onReload: () => void }) {
    const { theme, border } = useListTokens();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => setError(null), [order?.id]);
    if (!order) return null;

    const act = async (key: string, fn: () => Promise<any>) => {
        setBusy(key);
        setError(null);
        try {
            const res: any = await fn();
            if (isOk(res)) onChanged(res.data.food_order);
            else setError(errorText(res, 'That did not work.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };
    const move = (status: string, label: string, icon: any, variant: 'primary' | 'secondary' | 'danger' = 'primary') => (
        <SheetButton key={status} label={label} icon={icon} variant={variant} loading={busy === status} loadingLabel="Saving…" onPress={() => void act(status, () => diningApi.updateStatus(order.id, status))} />
    );

    const s = order.status;
    const svc = order.service_type;
    const unpaid = !order.is_paid && s !== 'CANCELLED';

    return (
        <AdminSheet visible onClose={onClose} title={`${order.customer_name || 'Guest'} · ${order.reference}`} subtitle={`${SERVICE_META[svc]?.label} · ${when(order.created)}`} icon={(SERVICE_META[svc]?.icon as any) ?? 'restaurant-outline'} width={600}>
            <View style={{ gap: 14 }}>
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    <FoodStatusPill order={order} />
                    <PaidPill order={order} />
                </View>
                {svc === 'DINE_IN' ? (
                    <View className="rounded-2xl p-3" style={{ backgroundColor: `${theme.primary}0d`, gap: 2 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Table for {order.party_size} · {when(order.reservation_at)}</Text>
                        {order.table ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Table {order.table}</Text> : null}
                    </View>
                ) : null}
                <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 5 }}>
                    {order.items.length ? (
                        order.items.map((i, k) => (
                            <View key={k} className="flex-row" style={{ gap: 8 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{i.quantity}×</Text>
                                <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 14 }}>{i.title}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{kes(i.line_total)}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No food ordered ahead — they'll order at the table.</Text>
                    )}
                    {Number(order.shipping_cost) > 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Delivery {kes(order.shipping_cost)}</Text> : null}
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5, marginTop: 4 }}>Total {kes(order.total)}</Text>
                </View>
                {(order.custom_recipes ?? []).map((r) => (
                    <View key={r.id} className="rounded-2xl p-3" style={{ gap: 3, backgroundColor: 'rgba(245,158,11,0.10)' }}>
                        <Text style={{ color: '#b45309', fontFamily: theme.font.bold, fontSize: 13 }}>Custom: {r.title} × {r.servings}</Text>
                        <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 18 }}>{r.instructions}</Text>
                    </View>
                ))}
                {order.notes ? (
                    <Text style={{ color: '#d97706', fontFamily: theme.font.bold, fontSize: 13 }}>Note: {order.notes}</Text>
                ) : null}
                {order.customer_phone ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Phone {order.customer_phone}</Text> : null}

                {/* Next steps */}
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {s === 'RECEIVED' ? move('PROCESSING', svc === 'DINE_IN' ? 'Confirm booking' : 'Accept & start', 'flame-outline') : null}
                    {s === 'PROCESSING' ? move('READY', svc === 'DINE_IN' ? 'Table / food ready' : 'Food ready', 'checkmark-done-outline') : null}
                    {s === 'READY' && svc === 'DINE_IN' ? move('SERVED', 'Served', 'restaurant-outline') : null}
                    {s === 'READY' && svc === 'PICKUP' ? move('COMPLETED', 'Collected', 'bag-check-outline') : null}
                    {s === 'SERVED' ? move('COMPLETED', 'Close the bill', 'receipt-outline') : null}
                    {['RECEIVED', 'PROCESSING'].includes(s) ? move('CANCELLED', 'Cancel', 'close-circle-outline', 'danger') : null}
                    {unpaid && Number(order.amount_due) > 0 ? (
                        <SheetButton label={`Took cash ${kes(order.amount_due)}`} icon="cash-outline" variant="secondary" loading={busy === 'cash'} loadingLabel="Saving…" onPress={() => void act('cash', () => diningApi.recordPayment(order.id))} />
                    ) : null}
                </View>
                {svc === 'DELIVERY' && s === 'RECEIVED' && !order.is_paid ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Delivery orders start once the customer has paid.</Text>
                ) : null}
                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}

                {/* Delivery: pick the delivery person once paid + ready */}
                {svc === 'DELIVERY' && order.has_delivery ? (
                    <View style={{ gap: 6 }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>DELIVERY</Text>
                        {s !== 'READY' && !order.shipment_status?.match(/CONFIRMED|IN_TRANSIT|DELIVERED/) ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Mark the food ready, then assign a delivery person here.</Text>
                        ) : null}
                        <ShipmentTracker link={{ food_order: order.id }} version={`${order.status}|${order.shipment_status ?? ''}`} viewer="wholesaler" paid={order.is_paid && s === 'READY'} onOrderChanged={onReload} />
                    </View>
                ) : null}
            </View>
        </AdminSheet>
    );
}
