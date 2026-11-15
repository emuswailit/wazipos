// components/deliveries/DeliveryOptionsPicker.tsx
//
// Buyer, before paying a retailer order: how to get it. Lists every option the
// server priced for the buyer's location — a delivery person straight to them,
// or a delivery person to a courier's office then the courier onward — with
// each leg's cost and the total, plus "I'll collect it". Choosing saves the
// option; its total becomes the order's delivery fee, paid with the order.

import deliveriesApi, { apiError, isOk, type DeliveryOption, type DeliveryOptionsResult } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/common/listScreen';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import type { RetailerOrder } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { formatKES } from '@/components/retailers/retailerRequisitions/primitives';

const PICKUP = 'PICKUP';

const LEG_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    LOCAL: 'bicycle-outline',
    HANDOVER: 'bicycle-outline',
    TRANSIT: 'bus-outline',
    LAST_MILE: 'walk-outline',
};

interface Props {
    order: RetailerOrder;
    /** False once a payment exists: the choice is then fixed. */
    editable: boolean;
}

export function DeliveryOptionsPicker({ order, editable }: Props) {
    const { theme, border, chipBg } = useListTokens();
    const { applyServerOrder } = useRetailerOrdersSync();
    const [data, setData] = useState<DeliveryOptionsResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res: any = await deliveriesApi.getRetailerOrderDeliveryOptions(order.remote_id);
            if (isOk(res)) {
                const result: DeliveryOptionsResult = res.data.delivery;
                setData(result);
                // Which option is the current choice (the server keeps the plan, not the key).
                if (result.chosen_method === PICKUP) setSelected(PICKUP);
                else if (result.chosen_method) {
                    const match = result.options.find((o) => o.method === result.chosen_method && Number(o.total) === Number(result.shipping_amount));
                    setSelected(match?.key ?? null);
                } else setSelected(null);
            } else {
                setLoadError(apiError(res, 'Could not load delivery options.'));
            }
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            setLoading(false);
        }
    }, [order.remote_id]);

    useEffect(() => {
        void load();
    }, [load]);

    const choose = async (key: string) => {
        if (!editable || saving) return;
        setSaving(key);
        setSaveError(null);
        try {
            const res: any = await deliveriesApi.chooseRetailerOrderDelivery(order.remote_id, key);
            if (isOk(res)) {
                setSelected(key);
                if (res.data?.retailer_order) await applyServerOrder(res.data.retailer_order);
            } else {
                setSaveError(apiError(res, 'Could not save your choice.'));
                if (/no longer available/i.test(apiError(res, ''))) void load();
            }
        } catch (e: any) {
            setSaveError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(null);
        }
    };

    const card = (key: string, active: boolean, children: React.ReactNode) => (
        <Pressable
            key={key}
            onPress={() => choose(key)}
            disabled={!editable || !!saving}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: !editable }}
            className="rounded-2xl p-3"
            style={{ borderWidth: 1.5, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}0d` : 'transparent', gap: 8, opacity: !editable && !active ? 0.5 : 1 }}
        >
            {children}
        </Pressable>
    );

    const radio = (active: boolean, key: string) =>
        saving === key ? (
            <ActivityIndicator size="small" color={theme.primary} />
        ) : (
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? theme.primary : theme.textDark} />
        );

    const renderOption = (opt: DeliveryOption) => {
        const active = selected === opt.key;
        const courier = opt.method === 'COURIER';
        const via = courier ? opt.legs.find((l) => l.kind === 'TRANSIT')?.provider_title : opt.legs[0]?.provider_title;
        return card(
            opt.key,
            active,
            <>
                <View className="flex-row items-center gap-2">
                    {radio(active, opt.key)}
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                            {courier ? `Courier · ${via || 'courier'}` : `Delivered to you · ${via || 'delivery'}`}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                            {courier ? 'Collect from the courier office nearest you' : 'Straight to your shop'}
                        </Text>
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>KES {formatKES(opt.total)}</Text>
                </View>
                <View style={{ gap: 4, paddingLeft: 28 }}>
                    {opt.legs.map((leg, i) => (
                        <View key={i} className="flex-row items-center gap-2">
                            <Ionicons name={LEG_ICONS[leg.kind] ?? 'navigate-outline'} size={14} color={theme.textDark} />
                            <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                                {leg.label}
                                {leg.to_title ? ` (${leg.to_title})` : ''} · {leg.provider_title} · {leg.mode_label.toLowerCase()} · {Number(leg.distance_km).toLocaleString()} km
                            </Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>KES {formatKES(leg.cost)}</Text>
                        </View>
                    ))}
                </View>
            </>,
        );
    };

    return (
        <View style={{ gap: 8 }}>
            <View className="flex-row items-center justify-between">
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>HOW DO YOU WANT IT?</Text>
                {data?.chargeable_weight_kg ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{Number(data.chargeable_weight_kg).toLocaleString()} kg</Text>
                ) : null}
            </View>

            {card(
                PICKUP,
                selected === PICKUP,
                <View className="flex-row items-center gap-2">
                    {radio(selected === PICKUP, PICKUP)}
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>I'll collect it</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>From {order.wholesaler_title || 'the wholesaler'}</Text>
                    </View>
                    <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 14 }}>Free</Text>
                </View>,
            )}

            {loading ? (
                <View className="flex-row items-center gap-2 py-2">
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Finding delivery options for your location…</Text>
                </View>
            ) : loadError ? (
                <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: chipBg }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>{loadError}</Text>
                </View>
            ) : data && data.options.length === 0 ? (
                <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: chipBg }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        No delivery to your location yet. You can collect the order.
                    </Text>
                </View>
            ) : (
                data?.options.map(renderOption)
            )}

            {saveError ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{saveError}</Text> : null}
            {!editable ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>The delivery choice is fixed once payment starts.</Text>
            ) : null}
        </View>
    );
}
