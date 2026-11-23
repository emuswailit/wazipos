// components/deliveries/MyDeliveries.tsx
//
// A delivery person's open legs (GetMyDeliveries), whoever employs them:
// where to go, what it pays, and the buttons to move each leg on
// (picked up -> handed to courier / delivered with the recipient's code).

import deliveriesApi, { apiError, isOk, MODE_LABELS, type MyDeliveryLeg } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { formatKES } from '@/components/retailers/retailerRequisitions/primitives';
import { LegActions } from './LegActions';
import DutyToggle from './DutyToggle';
import InsuranceOffer from '@/components/insurance/InsuranceOffer';

const KIND_TITLES: Record<string, string> = {
    LOCAL: 'Deliver to the shop',
    HANDOVER: "Take to the courier's office",
    TRANSIT: 'Courier transit',
    LAST_MILE: 'Last mile',
};

export default function MyDeliveries() {
    const { theme, border, cardBorder, chipBg } = useListTokens();
    const [legs, setLegs] = useState<MyDeliveryLeg[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res: any = await deliveriesApi.getMyDeliveries();
            if (isOk(res)) setLegs(res.data?.legs ?? []);
            else setError(apiError(res, 'Could not load your deliveries.'));
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

    const owed = (legs ?? []).reduce((sum, l) => sum + Number(l.cost || 0), 0);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>My deliveries</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    {legs ? `${legs.length} open · KES ${formatKES(owed)} when done` : 'Loading…'}
                </Text>
            </View>

            <DutyToggle />
            {/* WaziPOS Cover: accident cover for today's rides, a few shillings a day. */}
            <View style={{ marginTop: 10 }}>
                <InsuranceOffer product="RIDER_SHIELD" source="rider_duty" context={{ inputs: { plan: 'DAY' } }} />
            </View>
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
            {legs === null ? <ActivityIndicator color={theme.primary} /> : null}
            {legs && legs.length === 0 && !error ? (
                <View className="items-center rounded-2xl p-8" style={{ borderWidth: 1, borderColor: cardBorder, gap: 8 }}>
                    <Ionicons name="bicycle-outline" size={28} color={theme.primary} />
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Nothing to deliver</Text>
                    <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        Deliveries assigned to you show up here.
                    </Text>
                </View>
            ) : null}

            {(legs ?? []).map((leg) => (
                <View key={leg.id} className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 10, backgroundColor: theme.panel }}>
                    <View className="flex-row items-start gap-2">
                        <Ionicons name={leg.kind === 'HANDOVER' ? 'swap-horizontal' : 'navigate-outline'} size={20} color={theme.primary} />
                        <View className="flex-1 min-w-0">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{KIND_TITLES[leg.kind] ?? leg.kind}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {[leg.provider_title, MODE_LABELS[leg.mode], `${Number(leg.distance_km).toLocaleString()} km`].filter(Boolean).join(' · ')}
                            </Text>
                            {leg.destination_collection_point_title ? (
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 2 }}>To {leg.destination_collection_point_title}</Text>
                            ) : null}
                        </View>
                        <View className="items-end">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>KES {formatKES(leg.cost)}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{leg.status === 'PICKED_UP' ? 'Picked up' : 'Assigned'}</Text>
                        </View>
                    </View>
                    <View className="rounded-xl p-2.5" style={{ backgroundColor: chipBg }}>
                        <LegActions leg={leg} onChanged={() => void load()} />
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
