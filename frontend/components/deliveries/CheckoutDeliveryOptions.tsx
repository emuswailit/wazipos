// components/deliveries/CheckoutDeliveryOptions.tsx
//
// Shopper checkout (retailer -> customer): once the shopper shares their
// location, lists every way the shop can deliver to them — a delivery person
// straight to them, or via a courier to the office nearest them — with each
// leg's cost and the total. The chosen option key goes with the order; the
// server re-prices it and that total is the delivery fee paid with the order.

import deliveriesApi, { apiError, isOk, type DeliveryOption } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

interface Props {
    retailerId: string;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    lines: { receiptId: string; quantity: number }[];
    selectedKey: string | null;
    onSelect: (key: string | null, total: number | null) => void;
}

export function CheckoutDeliveryOptions({ retailerId, latitude, longitude, lines, selectedKey, onSelect }: Props) {
    const { theme, border, chipBg } = useListTokens();
    const [options, setOptions] = useState<DeliveryOption[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);
    // Re-price when the location or the cart changes.
    const cartKey = useMemo(() => lines.map((l) => `${l.receiptId}:${l.quantity}`).join('|'), [lines]);

    useEffect(() => {
        if (!hasPin || !retailerId || !lines.length) {
            setOptions(null);
            return;
        }
        let alive = true;
        setLoading(true);
        setError(null);
        const timer = setTimeout(async () => {
            try {
                const res: any = await deliveriesApi.getCustomerDeliveryOptions({
                    entity: retailerId,
                    destination_latitude: Number(latitude),
                    destination_longitude: Number(longitude),
                    order_items: lines.map((l) => ({ retailer_receipt: l.receiptId, purchased_quantity: l.quantity })),
                });
                if (!alive) return;
                if (isOk(res)) {
                    const next: DeliveryOption[] = res.data.delivery?.options ?? [];
                    setOptions(next);
                    // Keep the choice only if it's still offered (prices may have changed).
                    const still = next.find((o) => o.key === selectedKey);
                    onSelect(still ? still.key : null, still ? Number(still.total) : null);
                } else {
                    setOptions([]);
                    setError(apiError(res, 'Could not load delivery options.'));
                    onSelect(null, null);
                }
            } catch (e: any) {
                if (alive) setError(e?.message || 'Could not reach the server.');
            } finally {
                if (alive) setLoading(false);
            }
        }, 350);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retailerId, latitude, longitude, cartKey, hasPin]);

    if (!hasPin) {
        return (
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                Share your location to see delivery options and prices.
            </Text>
        );
    }
    if (loading && !options) {
        return (
            <View className="flex-row items-center gap-2 py-2">
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Finding delivery options…</Text>
            </View>
        );
    }
    if (error) return <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text>;
    if (options && options.length === 0) {
        return (
            <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: chipBg }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    This shop can't deliver to your location yet. Choose pickup instead.
                </Text>
            </View>
        );
    }

    // How far the shopper is, and what that distance allows (backend logistics tiers).
    const km = Number((options ?? [])[0]?.distance_km);
    const tier = !Number.isFinite(km)
        ? null
        : km < 5
          ? 'Walking delivery or a rider'
          : km <= 20
            ? 'A rider'
            : 'A rider or a long-haul courier';

    return (
        <View style={{ gap: 8 }}>
            {tier ? (
                <View className="flex-row items-center gap-1.5">
                    <Ionicons name="navigate-outline" size={14} color={theme.textDark} />
                    <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        You're {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away: {tier.toLowerCase()} can bring it.
                    </Text>
                </View>
            ) : null}
            {(options ?? []).map((opt) => {
                const active = selectedKey === opt.key;
                const courier = opt.method === 'COURIER';
                const via = courier ? opt.legs.find((l) => l.kind === 'TRANSIT')?.provider_title : opt.legs[0]?.provider_title;
                const icon = opt.group === 'WALK' ? 'walk-outline' : opt.group === 'COURIER' || courier ? 'airplane-outline' : 'bicycle-outline';
                return (
                    <Pressable
                        key={opt.key}
                        onPress={() => onSelect(opt.key, Number(opt.total))}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        className="rounded-2xl p-3"
                        style={{ borderWidth: 1.5, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}0d` : 'transparent', gap: 6 }}
                    >
                        <View className="flex-row items-center gap-2">
                            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? theme.primary : theme.textDark} />
                            <Ionicons name={icon as any} size={18} color={active ? theme.primary : theme.textDark} />
                            <View className="flex-1 min-w-0">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>
                                    {opt.group_label ?? (courier ? 'Courier' : 'Delivered to you')} · {via || (courier ? 'courier' : 'delivery')}
                                </Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                    {courier ? `Collect at ${opt.legs[opt.legs.length - 1]?.to_title ?? 'the office nearest you'}` : 'Straight to your location'}
                                </Text>
                            </View>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{kes(opt.total)}</Text>
                        </View>
                        {opt.legs.map((leg, i) => (
                            <View key={i} className="flex-row items-center gap-2" style={{ paddingLeft: 28 }}>
                                <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={2}>
                                    {leg.label} · {leg.provider_title} · {leg.mode_label.toLowerCase()} · {Number(leg.distance_km).toLocaleString()} km
                                </Text>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 11.5 }}>{kes(leg.cost)}</Text>
                            </View>
                        ))}
                    </Pressable>
                );
            })}
            {loading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>
    );
}
