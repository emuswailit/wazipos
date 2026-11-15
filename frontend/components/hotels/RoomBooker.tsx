// components/hotels/RoomBooker.tsx
//
// Find and book a room at a hotel: pick the dates and how many guests, see
// which rooms are free and what the stay costs, then book. Used by
//   - guests, from the hotel's page in the Restaurants tab (mode "guest"), and
//   - hotel staff taking a walk-in or phone booking (mode "staff").
// Mobile first: one column of room cards; wider screens get a grid.

import { errorText, isOk } from '@/api/diningApi';
import hotelApi, { addDays, AMENITY_META, isoDate, nightsBetween, prettyDate, type HotelRoom, type HotelRooms, type RoomBooking } from '@/api/hotelApi';
import { AdminSheet, FormRow, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { kes } from '@/components/restaurants/shared';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

const newDraft = () => `rb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export default function RoomBooker({
    entity,
    mode,
    onBooked,
    onBack,
    backLabel,
}: {
    entity: string;
    mode: 'guest' | 'staff';
    onBooked: (b: RoomBooking) => void;
    onBack?: () => void;
    backLabel?: string;
}) {
    const { theme, border, chipBg } = useListTokens();
    const { user } = useAuth() as any;
    const { width } = useWindowDimensions();
    const cols = width >= 1100 ? 3 : width >= 700 ? 2 : 1;
    const today = isoDate(new Date());
    const [checkin, setCheckin] = useState(today);
    const [checkout, setCheckout] = useState(addDays(today, 1));
    const [guests, setGuests] = useState(1);
    const [data, setData] = useState<HotelRooms | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [picked, setPicked] = useState<HotelRoom | null>(null);
    const [name, setName] = useState(mode === 'guest' ? `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() : '');
    const [phone, setPhone] = useState(mode === 'guest' && user?.phone && user.phone !== 'None' ? String(user.phone) : '');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const draft = useRef(newDraft());

    const nights = nightsBetween(checkin, checkout);
    const datesOk = !!checkin && !!checkout && nights >= 1 && checkin >= today;

    const load = useCallback(async () => {
        if (!datesOk) return;
        setLoading(true);
        try {
            const res: any = await hotelApi.rooms(entity, checkin, checkout);
            if (isOk(res)) {
                setData(res.data.hotel_rooms);
                setError(null);
            } else setError(errorText(res, 'Could not load rooms.'));
        } catch {
            setError('Could not reach the server.');
        } finally {
            setLoading(false);
        }
    }, [entity, checkin, checkout, datesOk]);
    useEffect(() => {
        void load();
    }, [load]);

    // Keep check-out after check-in.
    const pickCheckin = (v: string) => {
        setCheckin(v);
        if (v && (!checkout || nightsBetween(v, checkout) < 1)) setCheckout(addDays(v, 1));
    };

    const book = async () => {
        if (!picked) return;
        setFormError(null);
        if (name.trim().length < 2) return setFormError(mode === 'guest' ? 'Whose name is the booking under?' : "Enter the guest's name.");
        if (phone.replace(/\D/g, '').length < 9) return setFormError(mode === 'guest' ? 'Enter a phone number the hotel can reach you on.' : "Enter the guest's phone number.");
        setBusy(true);
        try {
            const res: any = await hotelApi.book({ room: picked.id, checkin_date: checkin, checkout_date: checkout, guests, guest_name: name.trim(), guest_phone: phone.trim(), notes: notes.trim(), draft_id: draft.current });
            if (!isOk(res)) return setFormError(errorText(res, 'The room could not be booked.'));
            draft.current = newDraft();
            setPicked(null);
            onBooked(res.data.room_booking);
        } catch {
            setFormError('Could not reach the server. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const rooms = (data?.rooms ?? []).filter((r) => r.max_guests >= guests);
    const free = rooms.filter((r) => r.is_free !== false);
    const stepper = (
        <View style={{ gap: 6 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>Guests</Text>
            <View className="flex-row items-center" style={{ gap: 10, height: 44 }}>
                {(['remove', 'add'] as const).map((icon) => {
                    const next = guests + (icon === 'add' ? 1 : -1);
                    const off = next < 1 || next > 20;
                    return (
                        <React.Fragment key={icon}>
                            {icon === 'add' ? <Text style={{ minWidth: 22, textAlign: 'center', color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{guests}</Text> : null}
                            <Pressable onPress={() => setGuests(next)} disabled={off} hitSlop={6} accessibilityRole="button" accessibilityLabel={icon === 'add' ? 'One more guest' : 'One guest fewer'} className="items-center justify-center rounded-full" style={{ width: 38, height: 38, borderWidth: 1, borderColor: border, opacity: off ? 0.4 : 1 }}>
                                <Ionicons name={icon} size={18} color={theme.text} />
                            </Pressable>
                        </React.Fragment>
                    );
                })}
            </View>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 1200, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
                {onBack ? (
                    <Pressable onPress={onBack} hitSlop={8} className="flex-row items-center self-start" style={{ gap: 4 }} accessibilityRole="button">
                        <Ionicons name="chevron-back" size={16} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>{backLabel ?? 'Back'}</Text>
                    </Pressable>
                ) : null}
                <View style={{ gap: 2 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{mode === 'staff' ? 'New booking' : `Stay at ${data?.hotel.title ?? 'this hotel'}`}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        {datesOk ? `${prettyDate(checkin)} → ${prettyDate(checkout)} · ${nights} night${nights === 1 ? '' : 's'}` : 'Pick your dates'}
                    </Text>
                </View>

                <View className="rounded-2xl p-3" style={{ gap: 10, backgroundColor: theme.panel, borderWidth: 1, borderColor: border }}>
                    <FormRow>
                        <DateField label="Check-in" value={checkin} onChangeText={pickCheckin} />
                        <DateField label="Check-out" value={checkout} onChangeText={setCheckout} />
                    </FormRow>
                    {stepper}
                    {!datesOk ? (
                        <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>
                            {checkin < today ? "Check-in can't be in the past." : 'Check-out must be after check-in.'}
                        </Text>
                    ) : null}
                </View>

                {loading && !data ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
                {data && !rooms.length ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 20 }}>
                        {data.rooms.length ? `No room sleeps ${guests}. Try fewer guests per room.` : mode === 'staff' ? 'Add your rooms first (Rooms).' : 'This hotel hasn’t listed its rooms yet.'}
                    </Text>
                ) : null}
                {data && rooms.length && !free.length ? (
                    <Text style={{ color: '#d97706', fontFamily: theme.font.bold, fontSize: 13 }}>Every room is taken for these dates. Try other dates.</Text>
                ) : null}

                <View className="flex-row flex-wrap" style={{ margin: -6, opacity: loading ? 0.6 : 1 }}>
                    {rooms.map((r) => {
                        const taken = r.is_free === false;
                        return (
                            <View key={r.id} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                                <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.panel, borderWidth: 1, borderColor: border, opacity: taken ? 0.6 : 1 }}>
                                    {r.image_url ? (
                                        <Image source={{ uri: r.image_url }} style={{ width: '100%', height: 150, backgroundColor: border }} accessibilityIgnoresInvertColors />
                                    ) : (
                                        <View className="items-center justify-center" style={{ height: 90, backgroundColor: `${theme.primary}12` }}>
                                            <Ionicons name="bed-outline" size={30} color={theme.primary} />
                                        </View>
                                    )}
                                    <View className="p-3" style={{ gap: 8 }}>
                                        <View className="flex-row items-start" style={{ gap: 8 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={1}>{r.title}</Text>
                                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                                                    {[r.room_type, `Sleeps ${r.max_guests}`].filter(Boolean).join(' · ')}
                                                </Text>
                                            </View>
                                            <View className="items-end">
                                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{kes(r.price)}</Text>
                                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>per night</Text>
                                            </View>
                                        </View>
                                        {r.about ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={3}>{r.about}</Text> : null}
                                        {r.amenities.length ? (
                                            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                                                {r.amenities.map((a) => (
                                                    <View key={a} className="flex-row items-center rounded-full px-2.5 py-1" style={{ gap: 4, backgroundColor: chipBg }}>
                                                        <Ionicons name={AMENITY_META[a].icon as any} size={12} color={theme.textDark} />
                                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{AMENITY_META[a].label}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : null}
                                        <SheetButton
                                            label={taken ? 'Taken for these dates' : `Book · ${kes(Number(r.price) * Math.max(1, nights))} for ${nights} night${nights === 1 ? '' : 's'}`}
                                            icon={taken ? undefined : 'calendar-outline'}
                                            variant={taken ? 'secondary' : 'primary'}
                                            disabled={taken || !datesOk}
                                            onPress={() => { setFormError(null); setPicked(r); }}
                                        />
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            <AdminSheet
                visible={!!picked}
                onClose={() => setPicked(null)}
                title={picked ? `Book ${picked.title}` : 'Book'}
                subtitle={`${prettyDate(checkin)} → ${prettyDate(checkout)} · ${nights} night${nights === 1 ? '' : 's'} · ${guests} guest${guests === 1 ? '' : 's'}`}
                icon="bed-outline"
                width={520}
                footer={<SheetButton label={`Book · ${kes(Number(picked?.price ?? 0) * Math.max(1, nights))}`} icon="checkmark" loading={busy} loadingLabel="Booking…" onPress={() => void book()} grow />}
            >
                <View style={{ gap: 14 }}>
                    <FormRow>
                        <CustomTextField label={mode === 'guest' ? 'Name on the booking' : 'Guest name'} required value={name} onChangeText={setName} autoCapitalize="words" />
                        <CustomTextField label={mode === 'guest' ? 'Phone' : 'Guest phone'} required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07…" />
                    </FormRow>
                    <CustomTextField label="Requests" value={notes} onChangeText={setNotes} placeholder="e.g. Late arrival, ground floor" maxLength={300} />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {mode === 'guest'
                            ? `You can pay now with M-Pesa or at the hotel.${picked?.amenities.includes('free_cancellation') ? ' Free cancellation before check-in.' : ''}`
                            : 'The booking is confirmed straight away. Take payment now or at check-out.'}
                    </Text>
                    {formError ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{formError}</Text> : null}
                </View>
            </AdminSheet>
        </View>
    );
}
