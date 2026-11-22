// components/deliveries/CourierOfficePicker.tsx
//
// Long-haul delivery: the buyer picks which of the courier's offices they will
// collect from (e.g. the Posta or e-bee office nearest them, or another one).
// Shown under a selected courier option; picking an office re-prices the option
// (the option key becomes COURIER:<courier>:<office> — logistics/utils/deliveries.py).

import type { DeliveryOption } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/admin/kit';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export default function CourierOfficePicker({ option, onPick, busy }: { option: DeliveryOption; onPick: (officeId: string) => void; busy?: boolean }) {
    const { theme, border } = useListTokens();
    const offices = option.collection_points ?? [];
    if (option.method !== 'COURIER' || offices.length < 1) return null;
    const current = option.collection_point?.id;
    return (
        <View style={{ gap: 6, paddingLeft: 28, paddingTop: 4 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.4 }}>
                COLLECT FROM {String(option.courier_title || 'the courier').toUpperCase()} AT
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {offices.map((o) => {
                    const on = o.id === current;
                    return (
                        <Pressable
                            key={o.id}
                            disabled={busy || on}
                            onPress={() => onPick(o.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: on ? theme.primary : border, backgroundColor: on ? `${theme.primary}14` : 'transparent', opacity: busy && !on ? 0.6 : 1 }}
                        >
                            <Ionicons name={on ? 'location' : 'location-outline'} size={13} color={on ? theme.primary : theme.textDark} />
                            <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>
                                {o.title} · {Number(o.distance_km).toLocaleString()} km
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}
