// components/restaurants/walkin/PublicMenuScreen.tsx
//
// The page a restaurant's QR code opens — no sign-in. Guests see the food menu
// and the drinks list, order from their table (as many rounds as they like),
// follow each order and pay with M-Pesa (or pay the waiter). Orders are
// remembered on the phone, so reopening the page (or scanning again) shows them.

import { errorText, isOk } from '@/api/diningApi';
import qrMenuApi, { newOrderToken, type WalkInMenu, type WalkInOrder } from '@/api/qrMenuApi';
import { SheetButton, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import OrderPad, { type OrderPadInput } from './OrderPad';
import WalkInOrderView from './WalkInOrderView';

const storeKey = (entity: string) => `qr_menu_orders:${entity}`;
const CLOSED = ['COMPLETED', 'CANCELLED', 'DELIVERED'];

/** Finished = nothing left to follow: food done / cancelled and drinks paid / cancelled. */
function isFinished(o: WalkInOrder) {
    const foodDone = !o.food_order || (CLOSED.includes(o.food_order.status) && (o.food_order.is_paid || o.food_order.status === 'CANCELLED'));
    const tabDone = !o.tab || o.tab.status !== 'OPEN' || o.tab.is_paid;
    return foodDone && tabDone;
}

async function readTokens(entity: string): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(storeKey(entity));
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.map(String) : [];
    } catch {
        return [];
    }
}
const writeTokens = (entity: string, tokens: string[]) => AsyncStorage.setItem(storeKey(entity), JSON.stringify(tokens.slice(-10))).catch(() => undefined);

export default function PublicMenuScreen({ entity, table }: { entity: string; table?: string | null }) {
    const { theme, border } = useListTokens();
    const [menu, setMenu] = useState<WalkInMenu | null>(null);
    const [orders, setOrders] = useState<WalkInOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    // One token per attempt: a retry after a dropped connection can't place the order twice.
    const attempt = useRef(newOrderToken());

    const loadMenu = useCallback(async () => {
        setError(null);
        try {
            const res: any = await qrMenuApi.menu(entity, table);
            if (isOk(res)) setMenu(res.data.menu);
            else setError(errorText(res, 'This menu could not be opened.'));
        } catch {
            setError('Could not reach the restaurant’s menu. Check your connection.');
        } finally {
            setLoading(false);
        }
    }, [entity, table]);

    /** Reload the orders remembered on this phone (drops any the restaurant no longer has). */
    const loadOrders = useCallback(async () => {
        const tokens = await readTokens(entity);
        if (!tokens.length) return setOrders([]);
        const results = await Promise.all(tokens.map((t) => qrMenuApi.order(t).catch(() => null)));
        const found: WalkInOrder[] = [];
        const keep: string[] = [];
        results.forEach((res: any, i) => {
            if (isOk(res)) {
                found.push(res.data.order);
                keep.push(tokens[i]);
            } else if (!res?.ok || res?.status >= 500) keep.push(tokens[i]); // offline / server trouble: keep it
        });
        if (keep.length !== tokens.length) void writeTokens(entity, keep);
        if (found.length || keep.length === 0) setOrders(found);
    }, [entity]);

    useEffect(() => {
        void loadMenu();
        void loadOrders();
    }, [loadMenu, loadOrders]);

    // Follow the orders while any is open.
    const open = orders.filter((o) => !isFinished(o));
    const following = open.length > 0;
    useEffect(() => {
        if (!following) return;
        const t = setInterval(() => void loadOrders(), 15000);
        return () => clearInterval(t);
    }, [following, loadOrders]);

    const place = async (input: OrderPadInput): Promise<string | null> => {
        try {
            const res: any = await qrMenuApi.place(entity, { ...input, token: attempt.current });
            if (!isOk(res)) return errorText(res, 'Your order could not be sent. Please try again.');
            attempt.current = newOrderToken();
            const placed: WalkInOrder = res.data.order;
            setOrders((prev) => [...prev.filter((o) => o.token !== placed.token), placed]);
            setAdding(false);
            const tokens = await readTokens(entity);
            void writeTokens(entity, [...tokens.filter((t) => t !== placed.token), placed.token]);
            void loadMenu();
            return null;
        } catch {
            return 'Could not reach the restaurant. Check your connection and try again.';
        }
    };

    const startNew = () => {
        setOrders([]);
        setAdding(false);
        void writeTokens(entity, []);
    };

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.primary} />
            </View>
        );
    }
    if (!menu) {
        return (
            <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
                <Ionicons name="qr-code-outline" size={36} color={theme.textDark} />
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, textAlign: 'center' }}>{error || 'This menu could not be opened.'}</Text>
                <SheetButton label="Try again" icon="refresh" onPress={() => { setLoading(true); void loadMenu(); }} />
            </View>
        );
    }

    const showOrders = orders.length > 0 && !adding;
    const table_title = menu.table?.title || orders[0]?.table;
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View className="flex-row items-center px-4 py-3" style={{ gap: 12, borderBottomWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                <View className="items-center justify-center" style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${theme.primary}18` }}>
                    <Ionicons name="restaurant" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }} numberOfLines={1}>{menu.restaurant.title}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                        {[menu.table?.title, [menu.restaurant.building, menu.restaurant.road, menu.restaurant.town].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Order from your table'}
                    </Text>
                </View>
            </View>
            {showOrders ? (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
                    <View style={{ gap: 4 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>{following ? 'Order sent' : 'Thank you!'}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                            {following ? `We’re on it${table_title ? ` — it will come to ${table_title}` : ''}. This page updates as your order moves.` : 'Everything here is complete.'}
                        </Text>
                    </View>
                    {[...orders].reverse().map((o) => (
                        <WalkInOrderView key={o.token} order={o} mode="guest" onChanged={() => void loadOrders()} />
                    ))}
                    <SheetButton label="Order something else" icon="add" variant="secondary" onPress={() => setAdding(true)} />
                    {!following ? <SheetButton label="Clear and start again" icon="refresh" variant="ghost" onPress={startNew} /> : null}
                </ScrollView>
            ) : (
                <OrderPad menu={menu} mode="guest" onPlace={place} onCancel={orders.length ? () => setAdding(false) : undefined} />
            )}
        </View>
    );
}
