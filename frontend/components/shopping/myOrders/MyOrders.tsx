// components/shopping/myOrders/MyOrders.tsx
//
// A shopper's own orders (RetrieveOwnOrders): shop, total, payment, status,
// and — for delivery orders — live tracking with the delivery CODE they give
// whoever hands the goods over (ShipmentTracker, buyer view).

import retailersApi from '@/api/retailersApi';
import { ShipmentTracker } from '@/components/deliveries/ShipmentTracker';
import { FulfilmentPanel } from '@/components/fulfilment/FulfilmentPanel';
import { AdminBadgePill, formatDateTime, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

type OwnOrder = {
    id: string;
    order_number?: string | null;
    reference_number?: string | null;
    entity_title?: string | null;
    status?: string | null;
    is_paid?: string | boolean | null;
    order_price_total?: string | number | null;
    order_net_price_total?: string | number | null;
    shipping_cost?: string | number | null;
    delivery_method?: string | null;
    delivered_at?: string | null;
    created?: string | null;
    updated?: string | null;
};

const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const truthy = (v: unknown) => String(v).toLowerCase() === 'true';
const isDelivery = (o: OwnOrder) => ['DELIVERY', 'COURIER'].includes(String(o.delivery_method || '').toUpperCase());
const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

export default function MyOrders() {
    const { theme, border } = useListTokens();
    const [orders, setOrders] = useState<OwnOrder[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res: any = await retailersApi.clientOrdersAction({ action: 'RetrieveOwnOrders' });
            if (res?.ok) {
                const list = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
                setOrders(Array.isArray(list) ? list : []);
            } else setError(res?.data?.response_message || 'Could not load your orders.');
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>My orders</Text>
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
            {orders === null ? <ActivityIndicator color={theme.primary} /> : null}
            {orders && orders.length === 0 && !error ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                    No orders yet.
                </Text>
            ) : null}

            {(orders ?? []).map((o) => {
                const paid = truthy(o.is_paid);
                const delivery = isDelivery(o);
                const total = Number(o.order_net_price_total ?? o.order_price_total ?? 0) + Number(o.shipping_cost ?? 0);
                const expanded = open === o.id;
                return (
                    <View key={o.id} className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, backgroundColor: theme.panel, gap: 8 }}>
                        <Pressable onPress={() => setOpen(expanded ? null : o.id)} className="flex-row items-start gap-2">
                            <Ionicons name={delivery ? 'bicycle-outline' : 'storefront-outline'} size={20} color={theme.primary} />
                            <View className="flex-1 min-w-0">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{o.entity_title || 'Shop'}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {[o.order_number || o.reference_number, o.created ? formatDateTime(o.created) : null].filter(Boolean).join(' · ')}
                                </Text>
                                <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                                    <AdminBadgePill badge={paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Unpaid', tone: 'warning' }} />
                                    {o.status ? <AdminBadgePill badge={{ label: titleCase(o.status), tone: o.status === 'DELIVERED' ? 'success' : 'info' }} /> : null}
                                    <AdminBadgePill badge={{ label: delivery ? 'Delivery' : 'Pickup', tone: 'neutral' }} />
                                </View>
                            </View>
                            <View className="items-end">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{kes(total)}</Text>
                                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textDark} />
                            </View>
                        </Pressable>
                        {expanded && paid ? (
                            <FulfilmentPanel link={{ customer_order: o.id }} viewer="buyer" pickup={!delivery} paid={paid} version={`${o.updated ?? ''}|${o.status ?? ''}`} />
                        ) : null}
                        {expanded ? (
                            delivery ? (
                                <ShipmentTracker
                                    link={{ customer_order: o.id }}
                                    version={`${o.updated ?? ''}|${o.delivered_at ?? ''}`}
                                    viewer="retailer"
                                    paid={paid}
                                    onOrderChanged={load}
                                />
                            ) : (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                    Collect this order from {o.entity_title || 'the shop'}.
                                </Text>
                            )
                        ) : null}
                    </View>
                );
            })}
        </ScrollView>
    );
}
