// components/restaurants/customer/RestaurantsHome.tsx
//
// The Restaurants tab. Everyone: discover restaurants (nearest first when the
// location is shared), open a menu, order for delivery / pickup or book a
// table, and follow "My orders". People working in a restaurant also get a
// shortcut to run it (orders board, menu, tables).

import diningApi, { errorText, isOk, SERVICE_META, type FoodOrder, type Restaurant } from '@/api/diningApi';
import { ShipmentTracker } from '@/components/deliveries/ShipmentTracker';
import { SearchField, SegmentedControl, SheetButton, useListTokens } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { FoodStatusPill, kes, PaidPill, when } from '../shared';
import { FoodPayment } from './FoodPayment';
import { MyCustomRecipes } from './MyCustomRecipes';
import { RestaurantMenuView } from './RestaurantMenuView';

type View_ = 'DISCOVER' | 'ORDERS';

export default function RestaurantsHome() {
    const { theme } = useListTokens();
    const { user } = useAuth() as any;
    const router = useRouter();
    const [tab, setTab] = useState<View_>('DISCOVER');
    const [open, setOpen] = useState<Restaurant | null>(null);
    const runsRestaurant = String(user?.entity_type || '') === 'Restaurant';

    if (open) {
        return (
            <RestaurantMenuView
                restaurant={open}
                onBack={() => setOpen(null)}
                onPlaced={() => {
                    /* the checkout sheet shows payment; "My orders" refreshes on focus */
                }}
            />
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View className="px-4 pt-4" style={{ gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
                <View className="flex-row items-end justify-between" style={{ gap: 8 }}>
                    <View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 26 }}>Restaurants</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>Order in, pick up, or book a table</Text>
                    </View>
                    {runsRestaurant ? (
                        <SheetButton label="Run my restaurant" icon="restaurant-outline" variant="secondary" onPress={() => router.push('/restaurantOrders' as any)} />
                    ) : null}
                </View>
                <SegmentedControl<View_>
                    value={tab}
                    onChange={setTab}
                    options={[
                        { key: 'DISCOVER', label: 'Discover' },
                        { key: 'ORDERS', label: 'My orders' },
                    ]}
                />
            </View>
            {tab === 'DISCOVER' ? <Discover onOpen={setOpen} /> : <MyOrders />}
        </View>
    );
}

/* ------------------------------------------------------------ discover */

function Discover({ onOpen }: { onOpen: (r: Restaurant) => void }) {
    const { theme, border, cardShadow } = useListTokens();
    const [q, setQ] = useState('');
    const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
    const [list, setList] = useState<Restaurant[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [locating, setLocating] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await diningApi.getRestaurants({ q: q.trim() || undefined, ...(here ?? {}) });
            if (isOk(res)) {
                setList(res.data.restaurants ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load restaurants.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, [q, here]);

    useEffect(() => {
        const t = setTimeout(() => void load(), 300);
        return () => clearTimeout(t);
    }, [load]);

    const nearMe = async () => {
        setLocating(true);
        try {
            const Location = await import('expo-location');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const p = await Location.getCurrentPositionAsync({});
                setHere({ latitude: p.coords.latitude, longitude: p.coords.longitude });
            }
        } catch {
            /* keep the alphabetical list */
        } finally {
            setLocating(false);
        }
    };

    return (
        <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <View className="flex-row items-center" style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <SearchField value={q} onChangeText={setQ} placeholder="Search restaurants…" />
                </View>
                <SheetButton label={here ? 'Near me ✓' : 'Near me'} icon="navigate-outline" variant="secondary" loading={locating} loadingLabel="…" onPress={() => void nearMe()} />
            </View>
            {list === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            {list && list.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 30 }}>No restaurants found yet.</Text>
            ) : null}
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                {(list ?? []).map((r) => (
                    <Pressable key={r.id} onPress={() => onOpen(r)} className="rounded-2xl p-4" style={{ flexGrow: 1, flexBasis: 280, gap: 8, backgroundColor: theme.panel, borderWidth: 1, borderColor: border, ...cardShadow }}>
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                            <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                                <Ionicons name="restaurant" size={20} color={theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>{r.title}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                    {[r.road, r.town].filter(Boolean).join(', ') || 'Location not set'}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={theme.textDark} />
                        </View>
                        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                            {r.distance_km != null ? <Tag icon="navigate-outline" text={`${r.distance_km.toFixed(1)} km`} /> : null}
                            <Tag icon="fast-food-outline" text={r.menu_items ? `${r.menu_items} dishes` : 'Menu coming soon'} />
                            {r.delivers ? <Tag icon="bicycle-outline" text="Delivers" /> : null}
                            <Tag icon="calendar-outline" text="Bookings" />
                        </View>
                    </Pressable>
                ))}
            </View>
        </ScrollView>
    );
}

function Tag({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ gap: 4, backgroundColor: chipBg }}>
            <Ionicons name={icon} size={12} color={theme.textDark} />
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{text}</Text>
        </View>
    );
}

/* ------------------------------------------------------------ my orders */

function MyOrders() {
    const { theme, border } = useListTokens();
    const [orders, setOrders] = useState<FoodOrder[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    const load = useCallback(async () => {
        setRefreshing(true);
        setTick((t) => t + 1);
        try {
            const res: any = await diningApi.myOrders();
            if (isOk(res)) {
                setOrders(res.data.food_orders ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load your orders.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
            const t = setInterval(load, 20000); // follow the kitchen
            return () => clearInterval(t);
        }, [load]),
    );

    const replace = (o: FoodOrder) => setOrders((prev) => (prev ?? []).map((x) => (x.id === o.id ? o : x)));

    return (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 900, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}>
            {orders === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            <MyCustomRecipes version={tick} onOrdered={load} />
            {orders && orders.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 30 }}>No food orders or bookings yet.</Text>
            ) : null}
            {(orders ?? []).map((o) => {
                const expanded = openId === o.id;
                const svc = SERVICE_META[o.service_type];
                return (
                    <View key={o.id} className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, backgroundColor: theme.panel, gap: 10 }}>
                        <Pressable onPress={() => setOpenId(expanded ? null : o.id)} className="flex-row items-start" style={{ gap: 10 }}>
                            <Ionicons name={svc?.icon as any} size={20} color={theme.primary} />
                            <View style={{ flex: 1, gap: 3 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{o.restaurant_title}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {[svc?.label, o.reference, o.reservation_at ? `${when(o.reservation_at)} · ${o.party_size} people` : when(o.created)].filter(Boolean).join(' · ')}
                                </Text>
                                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                                    <FoodStatusPill order={o} />
                                    <PaidPill order={o} />
                                </View>
                            </View>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{kes(o.total)}</Text>
                        </Pressable>
                        {expanded ? (
                            <View style={{ gap: 10 }}>
                                {o.items.map((i, k) => (
                                    <Text key={k} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                        {i.quantity}× {i.title} — {kes(i.line_total)}
                                    </Text>
                                ))}
                                {o.table ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Table {o.table}</Text> : null}
                                {o.has_delivery ? (
                                    <ShipmentTracker link={{ food_order: o.id }} version={`${o.status}|${o.shipment_status ?? ''}`} viewer="retailer" paid={o.is_paid} onOrderChanged={load} />
                                ) : null}
                                {!o.is_paid && o.status !== 'CANCELLED' && Number(o.amount_due) > 0 ? <FoodPayment order={o} onPaid={replace} /> : null}
                                {o.status === 'RECEIVED' && !o.is_paid ? (
                                    <SheetButton
                                        label="Cancel order"
                                        variant="ghost"
                                        onPress={async () => {
                                            const res: any = await diningApi.cancelMyOrder(o.id);
                                            if (isOk(res)) replace(res.data.food_order);
                                        }}
                                    />
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                );
            })}
        </ScrollView>
    );
}
