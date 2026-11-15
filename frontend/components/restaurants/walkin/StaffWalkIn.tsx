// components/restaurants/walkin/StaffWalkIn.tsx
//
// Counter service: staff take a walk-in customer's food and drinks on one pad.
// Food lands on the orders board (kitchen), drinks on a bar tab; payment is
// taken there (any method) once the customer is ready.

import { errorText, isOk } from '@/api/diningApi';
import qrMenuApi, { newOrderToken, type WalkInMenu, type WalkInOrder } from '@/api/qrMenuApi';
import { SheetButton, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import OrderPad, { type OrderPadInput } from './OrderPad';
import WalkInOrderView from './WalkInOrderView';

export default function StaffWalkIn({ onClose, onPlaced }: { onClose: () => void; onPlaced?: () => void }) {
    const { theme, border } = useListTokens();
    const [menu, setMenu] = useState<WalkInMenu | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<WalkInOrder | null>(null);
    const attempt = useRef(newOrderToken());

    useEffect(() => {
        qrMenuApi
            .staffMenu()
            .then((res: any) => (isOk(res) ? setMenu(res.data.menu) : setError(errorText(res, 'Could not load the menu.'))))
            .catch(() => setError('Could not reach the server.'));
    }, []);

    const place = async (input: OrderPadInput): Promise<string | null> => {
        try {
            const res: any = await qrMenuApi.staffPlace({ ...input, token: attempt.current });
            if (!isOk(res)) return errorText(res, 'The order could not be placed.');
            attempt.current = newOrderToken();
            setOrder(res.data.order);
            onPlaced?.();
            return null;
        } catch {
            return 'Could not reach the server. Try again.';
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View className="flex-row items-center px-3 py-2.5" style={{ gap: 10, borderBottomWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to orders" className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: border }}>
                    <Ionicons name="arrow-back" size={20} color={theme.text} />
                </Pressable>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Walk-in order</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>{menu?.restaurant.title ?? 'Food and drinks'}</Text>
                </View>
            </View>
            {order ? (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>Order placed{order.table ? ` · ${order.table}` : ''}</Text>
                    <WalkInOrderView order={order} mode="staff" />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {[order.food_order ? 'Food is on the orders board — open it there to take payment.' : null, order.tab ? 'Drinks are on a bar tab — take payment in Bar.' : null].filter(Boolean).join(' ')}
                    </Text>
                    <SheetButton label="New walk-in order" icon="add" onPress={() => setOrder(null)} />
                    <SheetButton label="Back to orders" variant="secondary" onPress={onClose} />
                </ScrollView>
            ) : menu ? (
                <OrderPad menu={menu} mode="staff" onPlace={place} />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, textAlign: 'center' }}>{error}</Text> : <ActivityIndicator color={theme.primary} />}
                </View>
            )}
        </View>
    );
}
