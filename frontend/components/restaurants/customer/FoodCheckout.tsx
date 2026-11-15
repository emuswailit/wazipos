// components/restaurants/customer/FoodCheckout.tsx
//
// Checkout sheet: how the customer wants it —
//   Delivery  : pin where to deliver -> priced options -> pay now (mobile money)
//   Pickup    : order, pay now or at the counter
//   Dine in   : book a table (date, time, how many), optionally with food ahead
// then mobile-money payment (FoodPayment).

import { type DeliveryOption } from '@/api/deliveriesApi';
import diningApi, { errorText, isOk, SERVICE_META, type FoodOrder, type MenuItem, type ServiceType } from '@/api/diningApi';
import { AdminSheet, ChoiceChips, FormRow, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import LocationPinPicker from '@/components/common/LocationPinPicker';
import type { LatLng } from '@/components/common/locationPinShared';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { kes, type Cart } from '../shared';
import { FoodPayment } from './FoodPayment';

type Props = {
    visible: boolean;
    onClose: () => void;
    restaurant: { id: string; title: string };
    items: MenuItem[];
    cart: Cart;
    /** Opened from "Book a table" (nothing in the cart yet). */
    initialService?: ServiceType;
    onPlaced: (order: FoodOrder) => void;
};

const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function FoodCheckout({ visible, onClose, restaurant, items, cart, initialService, onPlaced }: Props) {
    const { theme, border } = useListTokens();
    const { user } = useAuth() as any;
    const lines = useMemo(() => items.filter((i) => cart[i.id]).map((i) => ({ item: i, qty: cart[i.id] })), [items, cart]);
    const itemsTotal = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);

    const [service, setService] = useState<ServiceType>(initialService ?? 'PICKUP');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    // dine in
    const [date, setDate] = useState(todayISO());
    const [time, setTime] = useState('19:00');
    const [party, setParty] = useState(2);
    // delivery
    const [pin, setPin] = useState<LatLng | null>(null);
    const [options, setOptions] = useState<DeliveryOption[] | null>(null);
    const [option, setOption] = useState<DeliveryOption | null>(null);
    const [optError, setOptError] = useState<string | null>(null);

    const [placing, setPlacing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [placed, setPlaced] = useState<FoodOrder | null>(null);

    useEffect(() => {
        if (!visible) return;
        setService(initialService ?? (lines.length ? 'PICKUP' : 'DINE_IN'));
        setName([user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || String(user?.name || ''));
        setPhone(String(user?.phone && user.phone !== 'None' ? user.phone : ''));
        setPlaced(null);
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Delivery options for the pinned spot.
    useEffect(() => {
        if (service !== 'DELIVERY' || !pin || !lines.length) {
            setOptions(null);
            setOption(null);
            return;
        }
        let alive = true;
        setOptError(null);
        setOptions(null);
        diningApi
            .getDeliveryOptions({ entity: restaurant.id, destination_latitude: pin.latitude, destination_longitude: pin.longitude, items: lines.map((l) => ({ menu_item: l.item.id, quantity: l.qty })) })
            .then((res: any) => {
                if (!alive) return;
                if (isOk(res)) {
                    const list: DeliveryOption[] = res.data.delivery.options ?? [];
                    setOptions(list);
                    setOption(list[0] ?? null);
                } else {
                    setOptions([]);
                    setOptError(errorText(res, 'No delivery options.'));
                }
            })
            .catch(() => alive && setOptError('Could not reach the server.'));
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [service, pin?.latitude, pin?.longitude, JSON.stringify(cart)]);

    const deliveryFee = service === 'DELIVERY' && option ? Number(option.total) : 0;
    const total = itemsTotal + deliveryFee;

    const place = async () => {
        setError(null);
        if (service !== 'DINE_IN' && !lines.length) return setError('Add something from the menu first.');
        if (!phone.trim()) return setError('Enter your phone so the restaurant can reach you.');
        if (service === 'DELIVERY' && (!pin || !option)) return setError('Pin where to deliver and pick a delivery option.');
        let reservation_at: string | undefined;
        if (service === 'DINE_IN') {
            if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return setError('Enter the time like 19:30.');
            const [h, m] = time.trim().split(':').map(Number);
            const [y, mo, d] = date.split('-').map(Number);
            const at = new Date(y, mo - 1, d, h, m);
            if (isNaN(at.getTime()) || at.getTime() < Date.now() - 5 * 60000) return setError('Pick a time from now on.');
            reservation_at = at.toISOString();
        }
        setPlacing(true);
        try {
            const res: any = await diningApi.placeOrder({
                entity: restaurant.id,
                service_type: service,
                items: lines.map((l) => ({ menu_item: l.item.id, quantity: l.qty })),
                notes: notes.trim(),
                customer_name: name.trim(),
                customer_phone: phone.trim(),
                order_channel: Platform.OS === 'web' ? 'WEB' : Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
                ...(service === 'DINE_IN' ? { reservation_at, party_size: party } : {}),
                ...(service === 'DELIVERY' && pin && option ? { delivery_option: option.key, destination_latitude: pin.latitude, destination_longitude: pin.longitude } : {}),
            });
            if (isOk(res)) {
                setPlaced(res.data.food_order);
                onPlaced(res.data.food_order);
            } else setError(errorText(res, 'Your order could not be placed.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setPlacing(false);
        }
    };

    const muted = { color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 } as const;

    return (
        <AdminSheet visible={visible} onClose={onClose} title={placed ? 'Order placed' : 'Your order'} subtitle={restaurant.title} icon="restaurant-outline" width={560}>
            {placed ? (
                <View style={{ gap: 14 }}>
                    <View className="flex-row items-center rounded-2xl p-3" style={{ gap: 10, backgroundColor: 'rgba(16,185,129,0.10)' }}>
                        <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                            {placed.service_type === 'DINE_IN' ? 'Table booked' : 'Order sent to the kitchen'} · {placed.reference}
                        </Text>
                    </View>
                    {placed.is_paid || Number(placed.amount_due) <= 0 ? (
                        <SheetButton label="Done" onPress={onClose} />
                    ) : (
                        <>
                            <Text style={muted}>
                                {placed.service_type === 'DELIVERY'
                                    ? 'Pay now so the kitchen can start — delivery orders are prepared once paid.'
                                    : 'Pay now with M-Pesa, or pay at the restaurant.'}
                            </Text>
                            <FoodPayment order={placed} onPaid={(o) => setPlaced(o)} />
                            {placed.service_type !== 'DELIVERY' ? <SheetButton label="I'll pay at the restaurant" variant="ghost" onPress={onClose} /> : null}
                        </>
                    )}
                </View>
            ) : (
                <View style={{ gap: 16 }}>
                    <ChoiceChips<ServiceType>
                        label="How do you want it?"
                        options={(Object.keys(SERVICE_META) as ServiceType[]).map((s) => ({ value: s, label: SERVICE_META[s].label, icon: SERVICE_META[s].icon as any }))}
                        value={service}
                        onChange={setService}
                        hint={SERVICE_META[service].hint}
                    />

                    {/* What's ordered */}
                    {lines.length ? (
                        <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 6 }}>
                            {lines.map((l) => (
                                <View key={l.item.id} className="flex-row items-center" style={{ gap: 8 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{l.qty}×</Text>
                                    <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>{l.item.title}</Text>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(Number(l.item.price) * l.qty)}</Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Text style={muted}>{service === 'DINE_IN' ? 'Just booking a table — you can order when you arrive, or add dishes from the menu first.' : 'Your order is empty — add dishes from the menu.'}</Text>
                    )}

                    {service === 'DINE_IN' ? (
                        <View style={{ gap: 10 }}>
                            <FormRow>
                                <DateField label="Date" value={date} onChangeText={setDate} />
                                <CustomTextField label="Time" value={time} onChangeText={setTime} placeholder="19:30" keyboardType="numbers-and-punctuation" />
                            </FormRow>
                            <View className="flex-row items-center justify-between">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>People</Text>
                                <Stepper value={party} onChange={(n) => setParty(Math.max(1, Math.min(50, n)))} />
                            </View>
                        </View>
                    ) : null}

                    {service === 'DELIVERY' ? (
                        <View style={{ gap: 8 }}>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>DELIVER TO</Text>
                            <LocationPinPicker value={pin} onChange={setPin} height={180} />
                            {pin && !options && !optError ? <ActivityIndicator color={theme.primary} /> : null}
                            {optError ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{optError}</Text> : null}
                            {(options ?? []).map((o) => {
                                const active = option?.key === o.key;
                                const via = o.legs.find((l) => l.kind !== 'TRANSIT')?.provider_title;
                                return (
                                    <Pressable key={o.key} onPress={() => setOption(o)} className="flex-row items-center rounded-xl p-2.5" style={{ gap: 8, borderWidth: 1.5, borderColor: active ? theme.primary : border }}>
                                        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? theme.primary : theme.textDark} />
                                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                                            {o.method === 'COURIER' ? 'Courier' : 'Rider'} · {via || 'delivery'} · {Number(o.legs[0]?.distance_km || 0).toLocaleString()} km
                                        </Text>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(o.total)}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ) : null}

                    <FormRow>
                        <CustomTextField label="Your name" value={name} onChangeText={setName} placeholder="Name for the order" />
                        <CustomTextField label="Phone" value={phone} onChangeText={setPhone} placeholder="0712345678" keyboardType="phone-pad" />
                    </FormRow>
                    <CustomTextField label="Notes for the restaurant" value={notes} onChangeText={setNotes} placeholder="Allergies, no onions, birthday table…" multiline />

                    <View className="rounded-2xl p-3" style={{ backgroundColor: `${theme.primary}0d`, gap: 4 }}>
                        {lines.length ? <Row label="Food" value={kes(itemsTotal)} /> : null}
                        {service === 'DELIVERY' ? <Row label="Delivery" value={option ? kes(deliveryFee) : '—'} /> : null}
                        <Row label="Total" value={kes(total)} strong />
                    </View>
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
                    <SheetButton
                        label={service === 'DINE_IN' ? (lines.length ? 'Book table & order' : 'Book table') : 'Place order'}
                        icon={service === 'DINE_IN' ? 'calendar-outline' : 'checkmark-circle-outline'}
                        loading={placing}
                        loadingLabel="Placing…"
                        onPress={() => void place()}
                    />
                </View>
            )}
        </AdminSheet>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    const { theme } = useListTokens();
    return (
        <View className="flex-row justify-between">
            <Text style={{ color: strong ? theme.text : theme.textDark, fontFamily: strong ? theme.font.bold : theme.font.medium, fontSize: strong ? 15 : 13 }}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: strong ? 15 : 13 }}>{value}</Text>
        </View>
    );
}

export function Stepper({ value, onChange, small }: { value: number; onChange: (n: number) => void; small?: boolean }) {
    const { theme, border } = useListTokens();
    const size = small ? 28 : 34;
    const btn = (icon: 'remove' | 'add', delta: number) => (
        <Pressable onPress={() => onChange(value + delta)} hitSlop={6} className="items-center justify-center rounded-full" style={{ width: size, height: size, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
            <Ionicons name={icon} size={small ? 15 : 17} color={theme.primary} />
        </Pressable>
    );
    return (
        <View className="flex-row items-center" style={{ gap: 10 }}>
            {btn('remove', -1)}
            <Text style={{ minWidth: 18, textAlign: 'center', color: theme.text, fontFamily: theme.font.bold, fontSize: small ? 13.5 : 15 }}>{value}</Text>
            {btn('add', 1)}
        </View>
    );
}
