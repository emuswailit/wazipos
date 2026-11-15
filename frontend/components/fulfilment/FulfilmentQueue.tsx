// components/fulfilment/FulfilmentQueue.tsx
//
// The seller's preparation queue: paid orders still to prepare, pack, hand
// over or dispatch. kind "retailer" = a wholesaler's retailer orders,
// "customer" = a shop's customer orders (kept separate). Wide screens show the
// selected order beside the list; phones open it in a sheet.

import fulfilmentApi, { linkOf, STAGE_LABELS, type FulfilmentKind, type FulfilmentQueueRow, type FulfilmentStage } from '@/api/fulfilmentApi';
import { apiError, isOk } from '@/api/deliveriesApi';
import { ShipmentTracker } from '@/components/deliveries/ShipmentTracker';
import {
    AdminBadgePill,
    AdminSheet,
    EmptyState,
    FilterChips,
    formatDateTime,
    SearchField,
    StatChip,
    useListTokens,
    type BadgeTone,
} from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { FulfilmentPanel } from './FulfilmentPanel';

type Filter = 'ALL' | FulfilmentStage | 'DONE';

const STAGE_TONE: Record<FulfilmentStage, BadgeTone> = {
    PENDING: 'warning',
    PREPARING: 'violet',
    PACKED: 'info',
    READY: 'primary',
    COLLECTED: 'success',
};

const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function FulfilmentQueue({ kind }: { kind: FulfilmentKind }) {
    const { theme, border, cardShadow } = useListTokens();
    const { width } = useWindowDimensions();
    const wide = width >= 1100;

    const [open, setOpen] = useState<FulfilmentQueueRow[] | null>(null);
    const [done, setDone] = useState<FulfilmentQueueRow[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('ALL');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const [o, d]: any[] = await Promise.all([fulfilmentApi.getQueue(kind, 'open'), fulfilmentApi.getQueue(kind, 'done')]);
            if (isOk(o)) setOpen(o.data?.orders ?? []);
            else setError(apiError(o, 'Could not load the queue.'));
            if (isOk(d)) setDone(d.data?.orders ?? []);
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, [kind]);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const all = open ?? [];
    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: all.length, DONE: done.length };
        for (const r of all) c[r.stage] = (c[r.stage] ?? 0) + 1;
        return c;
    }, [all, done]);

    const rows = useMemo(() => {
        const base = filter === 'DONE' ? done : filter === 'ALL' ? all : all.filter((r) => r.stage === filter);
        const q = search.trim().toLowerCase();
        return q ? base.filter((r) => `${r.reference} ${r.buyer} ${r.buyer_phone ?? ''}`.toLowerCase().includes(q)) : base;
    }, [all, done, filter, search]);

    const selected = useMemo(() => [...all, ...done].find((r) => r.order_id === selectedId) ?? null, [all, done, selectedId]);

    const detail = selected ? <OrderDetail row={selected} onChanged={load} /> : null;

    const list = (
        <View style={{ gap: 8 }}>
            {open === null ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
            {open !== null && rows.length === 0 ? (
                <EmptyState
                    icon="cube-outline"
                    title={filter === 'DONE' ? 'Nothing handed over yet' : 'Nothing to prepare'}
                    message={filter === 'DONE' ? 'Collected and dispatched orders appear here.' : 'Paid orders appear here until they are collected or dispatched.'}
                />
            ) : null}
            {rows.map((r) => {
                const active = r.order_id === selectedId;
                return (
                    <Pressable
                        key={r.order_id}
                        onPress={() => setSelectedId(r.order_id)}
                        className="rounded-2xl p-3 flex-row items-center gap-3"
                        style={{ borderWidth: 1.5, borderColor: active ? theme.primary : border, backgroundColor: theme.panel }}
                    >
                        <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${theme.primary}12` }}>
                            <Ionicons name={r.fulfilment_method === 'DELIVERY' ? 'bicycle-outline' : 'storefront-outline'} size={19} color={theme.primary} />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>{r.buyer}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                                {[r.reference, `${r.items} item${r.items === 1 ? '' : 's'}`, r.created ? formatDateTime(r.created) : null].filter(Boolean).join(' · ')}
                            </Text>
                            <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                                <AdminBadgePill badge={{ label: STAGE_LABELS[r.stage], tone: STAGE_TONE[r.stage] }} />
                                <AdminBadgePill badge={{ label: r.fulfilment_method === 'DELIVERY' ? 'Delivery' : 'Pickup', tone: 'neutral' }} />
                                {r.shipment_status && r.shipment_status !== 'QUOTED' ? (
                                    <AdminBadgePill badge={{ label: r.shipment_status === 'DELIVERED' ? 'Delivered' : 'Dispatched', tone: 'success' }} />
                                ) : null}
                            </View>
                        </View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{kes(r.total)}</Text>
                    </Pressable>
                );
            })}
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View className="px-4 pt-4 pb-2" style={{ gap: 10 }}>
                <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
                    <View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>Fulfilment</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            Paid {kind === 'retailer' ? 'retailer' : 'customer'} orders: prepare, pack, then hand over or dispatch
                        </Text>
                    </View>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                        <StatChip label="To prepare" value={String((counts.PENDING ?? 0) + (counts.PREPARING ?? 0))} color="#f59e0b" />
                        <StatChip label="Packed" value={String(counts.PACKED ?? 0)} />
                        <StatChip label="Ready" value={String(counts.READY ?? 0)} color={theme.primary} />
                        <Pressable onPress={load} className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg" style={{ backgroundColor: theme.primary }}>
                            <Ionicons name="refresh" size={14} color="#fff" />
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>Refresh</Text>
                        </Pressable>
                    </View>
                </View>
                <SearchField value={search} onChangeText={setSearch} placeholder="Search reference, buyer, phone…" />
                <FilterChips<Filter>
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { key: 'ALL', label: 'All open', count: counts.ALL },
                        { key: 'PENDING', label: 'Waiting', count: counts.PENDING ?? 0, icon: 'time-outline' },
                        { key: 'PREPARING', label: 'Preparing', count: counts.PREPARING ?? 0, icon: 'construct-outline' },
                        { key: 'PACKED', label: 'Packed', count: counts.PACKED ?? 0, icon: 'cube-outline' },
                        { key: 'READY', label: 'Ready', count: counts.READY ?? 0, icon: 'checkmark-done-outline' },
                        { key: 'DONE', label: 'Handed over', count: counts.DONE, icon: 'checkmark-circle-outline' },
                    ]}
                />
                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
            </View>

            {wide ? (
                <View className="flex-1 flex-row px-4 pb-4" style={{ gap: 16 }}>
                    <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}>
                        {list}
                    </ScrollView>
                    <View className="rounded-2xl" style={{ width: 460, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, ...cardShadow }}>
                        {detail ? (
                            <ScrollView contentContainerStyle={{ padding: 14 }}>{detail}</ScrollView>
                        ) : (
                            <EmptyState icon="hand-right-outline" title="Pick an order" message="Its preparation steps show here." />
                        )}
                    </View>
                </View>
            ) : (
                <>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
                    >
                        {list}
                    </ScrollView>
                    <AdminSheet
                        visible={!!selected}
                        onClose={() => setSelectedId(null)}
                        title={selected?.buyer ?? 'Order'}
                        subtitle={selected?.reference}
                        icon="cube-outline"
                    >
                        {detail}
                    </AdminSheet>
                </>
            )}
        </View>
    );
}

function OrderDetail({ row, onChanged }: { row: FulfilmentQueueRow; onChanged: () => void }) {
    const { theme } = useListTokens();
    const link = linkOf(row.kind, row.order_id);
    const pickup = row.fulfilment_method === 'PICKUP';
    const version = `${row.stage}|${row.shipment_status ?? ''}|${row.order_status}`;
    return (
        <View style={{ gap: 12 }}>
            <View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{row.buyer}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {[row.reference, row.buyer_phone, `${row.items} item${row.items === 1 ? '' : 's'}`, kes(row.total)].filter(Boolean).join(' · ')}
                </Text>
            </View>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>PREPARATION</Text>
            <FulfilmentPanel key={row.order_id} link={link} viewer="seller" pickup={pickup} paid version={version} onChanged={onChanged} />
            {!pickup && (row.stage === 'READY' || (row.shipment_status && row.shipment_status !== 'QUOTED')) ? (
                <>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>DELIVERY</Text>
                    <ShipmentTracker key={`s-${row.order_id}`} link={link} version={version} viewer="wholesaler" paid onOrderChanged={onChanged} />
                </>
            ) : null}
        </View>
    );
}
