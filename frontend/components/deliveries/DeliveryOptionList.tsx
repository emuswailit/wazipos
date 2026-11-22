// components/deliveries/DeliveryOptionList.tsx
//
// A buyer configuring delivery: every way for this distance — a walking delivery
// person (short distances), a rider (bicycle / motorbike, in town), a car / van /
// lorry (the seller's fleet or a partner's), or a long-haul courier (pick the
// office to collect from) — each priced by the seller's system.
// The seller decides at dispatch which of their people (or riders) takes the
// in-town part; the price shown is what the buyer pays.

import type { DeliveryOption } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import CourierOfficePicker from './CourierOfficePicker';

/** What a delivery price is based on: chargeable weight (actual or packaging volume), goods' value, courier days. */
export function priceBasis(opt: { chargeable_weight_kg?: string; cargo_value?: string; lead_time_days?: number }): string {
    const parts: string[] = [];
    if (opt.chargeable_weight_kg) parts.push(`${Number(opt.chargeable_weight_kg).toLocaleString()} kg`);
    if (opt.cargo_value && Number(opt.cargo_value) > 0) parts.push(`goods KES ${Number(opt.cargo_value).toLocaleString()}`);
    if (opt.lead_time_days != null) parts.push(`${opt.lead_time_days} day${opt.lead_time_days === 1 ? '' : 's'}`);
    return parts.join(' · ');
}

export default function DeliveryOptionList({
    options,
    selectedKey,
    onSelect,
    onPickOffice,
    busy,
}: {
    options: DeliveryOption[];
    selectedKey: string | null;
    onSelect: (opt: DeliveryOption) => void;
    onPickOffice: (opt: DeliveryOption, officeId: string) => void;
    busy?: boolean;
}) {
    const { theme, border } = useListTokens();
    const km = options[0]?.distance_km ? Number(options[0].distance_km) : null;
    return (
        <View style={{ gap: 8 }}>
            {km != null ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {km.toFixed(1)} km by road. {km < 5 ? 'Walking delivery, a rider or a vehicle can bring it.' : km <= 20 ? 'A rider or a vehicle can bring it.' : 'A vehicle, a rider (where they go that far), or a long-haul courier to an office near you.'}
                </Text>
            ) : null}
            {options.map((opt) => {
                const active = selectedKey === opt.key;
                const courier = opt.method === 'COURIER';
                const icon = opt.group === 'WALK' ? 'walk-outline' : opt.group === 'VEHICLE' ? 'car-outline' : courier ? 'bus-outline' : 'bicycle-outline';
                return (
                    <Pressable
                        key={opt.key}
                        onPress={() => onSelect(opt)}
                        style={{ padding: 12, gap: 6, borderRadius: 14, borderWidth: 1.5, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}0d` : 'transparent' }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? theme.primary : theme.textDark} />
                            <Ionicons name={icon as any} size={18} color={active ? theme.primary : theme.textDark} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>
                                    {opt.group_label ?? (courier ? 'Courier' : 'Delivered to you')}
                                    {courier ? ` · ${opt.courier_title ?? ''}` : ''}
                                </Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                    {courier ? `Collect at ${opt.collection_point?.title ?? 'the office nearest you'}` : 'Straight to your premises'}
                                    {priceBasis(opt) ? ` · ${priceBasis(opt)}` : ''}
                                </Text>
                            </View>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(opt.total)}</Text>
                        </View>
                        {active ? <CourierOfficePicker option={opt} busy={busy} onPick={(id) => onPickOffice(opt, id)} /> : null}
                    </Pressable>
                );
            })}
        </View>
    );
}
