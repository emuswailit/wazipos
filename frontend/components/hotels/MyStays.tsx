// components/hotels/MyStays.tsx
//
// A guest's hotel bookings: dates, room, status, paying with mobile money and
// cancelling before check-in.

import { errorText, isOk } from '@/api/diningApi';
import hotelApi, { prettyDate, STAY_META, type RoomBooking } from '@/api/hotelApi';
import { AdminBadgePill, SheetButton, useListTokens } from '@/components/common/listScreen';
import { kes } from '@/components/restaurants/shared';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { RoomPayment } from './RoomPayment';

export function StayCard({ booking, expanded, onToggle, onChanged }: { booking: RoomBooking; expanded: boolean; onToggle?: () => void; onChanged: (b: RoomBooking) => void }) {
    const { theme, border } = useListTokens();
    const { user } = useAuth() as any;
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const live = ['BOOKED', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status);
    const due = Number(booking.amount_due);
    const canCancel = ['BOOKED', 'CONFIRMED'].includes(booking.status) && (Number(booking.paid) <= 0 || booking.free_cancellation);

    return (
        <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, backgroundColor: theme.panel, gap: 10 }}>
            <Pressable onPress={onToggle} disabled={!onToggle} className="flex-row items-start" style={{ gap: 10 }} accessibilityRole="button">
                <Ionicons name="bed-outline" size={20} color={theme.primary} />
                <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{booking.hotel_title}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {[booking.room_title, `${prettyDate(booking.checkin_date)} → ${prettyDate(booking.checkout_date)}`, `${booking.nights} night${booking.nights === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                    </Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                        <AdminBadgePill badge={{ label: STAY_META[booking.status]?.label === 'New' ? 'Booked' : STAY_META[booking.status]?.label ?? booking.status_label, tone: STAY_META[booking.status]?.tone ?? 'neutral' }} />
                        {live ? <AdminBadgePill badge={booking.is_paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Not paid', tone: 'warning' }} /> : null}
                    </View>
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{kes(booking.total)}</Text>
            </Pressable>
            {expanded ? (
                <View style={{ gap: 10 }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {booking.reference} · {booking.guests} guest{booking.guests === 1 ? '' : 's'} · {kes(booking.nightly_rate)} a night{booking.notes ? ` · ${booking.notes}` : ''}
                    </Text>
                    {live && due > 0 ? (
                        <>
                            <RoomPayment booking={booking} defaultPhone={user?.phone && user.phone !== 'None' ? String(user.phone) : booking.guest_phone ?? ''} onPaid={onChanged} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>You can also pay at the hotel.</Text>
                        </>
                    ) : null}
                    {canCancel ? (
                        <SheetButton
                            label="Cancel booking"
                            variant="ghost"
                            loading={busy}
                            onPress={async () => {
                                setBusy(true);
                                setError(null);
                                const res: any = await hotelApi.cancelMyBooking(booking.id).catch(() => null);
                                setBusy(false);
                                if (isOk(res)) onChanged(res.data.room_booking);
                                else setError(errorText(res, 'The booking could not be cancelled.'));
                            }}
                        />
                    ) : null}
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
                </View>
            ) : null}
        </View>
    );
}

export function MyStays() {
    const { theme } = useListTokens();
    const [stays, setStays] = useState<RoomBooking[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await hotelApi.myBookings();
            if (isOk(res)) {
                setStays(res.data.room_bookings ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load your stays.'));
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
    const replace = (b: RoomBooking) => setStays((prev) => (prev ?? []).map((x) => (x.id === b.id ? b : x)));

    return (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 900, width: '100%', alignSelf: 'center' }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}>
            {stays === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            {stays && stays.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 30 }}>No hotel stays yet. Open a hotel in Discover to book a room.</Text>
            ) : null}
            {(stays ?? []).map((b) => (
                <StayCard key={b.id} booking={b} expanded={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} onChanged={replace} />
            ))}
        </ScrollView>
    );
}
