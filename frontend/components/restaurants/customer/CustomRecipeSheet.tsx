// components/restaurants/customer/CustomRecipeSheet.tsx
//
// "Create your own dish": the customer picks ingredients from the restaurant's
// list (or types their own), writes brief instructions, chooses servings and
// how they'll eat it (dine in / pickup / delivery). The kitchen then prices it;
// the customer accepts the price in "My orders".

import diningApi, { errorText, isOk, SERVICE_META, type Ingredient, type ServiceType } from '@/api/diningApi';
import { AdminSheet, ChoiceChips, FormRow, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import LocationPinPicker from '@/components/common/LocationPinPicker';
import type { LatLng } from '@/components/common/locationPinShared';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { kes } from '../shared';
import { Stepper } from './FoodCheckout';

type Picked = { key: string; ingredient?: string; name: string; portions: number; price: number };

const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function CustomRecipeSheet({ visible, onClose, restaurant, onSent }: { visible: boolean; onClose: () => void; restaurant: { id: string; title: string }; onSent: () => void }) {
    const { theme, border, chipBg, inputBg } = useListTokens();
    const { user } = useAuth() as any;
    const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
    const [picked, setPicked] = useState<Picked[]>([]);
    const [custom, setCustom] = useState('');
    const [title, setTitle] = useState('');
    const [instructions, setInstructions] = useState('');
    const [servings, setServings] = useState(1);
    const [service, setService] = useState<ServiceType>('PICKUP');
    const [date, setDate] = useState(todayISO());
    const [time, setTime] = useState('19:00');
    const [party, setParty] = useState(2);
    const [pin, setPin] = useState<LatLng | null>(null);
    const [phone, setPhone] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setSent(false);
        setError(null);
        setPhone(String(user?.phone && user.phone !== 'None' ? user.phone : ''));
        diningApi.getIngredients(restaurant.id).then((res: any) => setIngredients(isOk(res) ? res.data.ingredients ?? [] : [])).catch(() => setIngredients([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, restaurant.id]);

    const sections = useMemo(() => {
        const map = new Map<string, Ingredient[]>();
        for (const i of ingredients ?? []) {
            const k = i.category || 'Ingredients';
            map.set(k, [...(map.get(k) ?? []), i]);
        }
        return Array.from(map.entries());
    }, [ingredients]);

    const toggle = (i: Ingredient) =>
        setPicked((p) => (p.some((x) => x.ingredient === i.id) ? p.filter((x) => x.ingredient !== i.id) : [...p, { key: i.id, ingredient: i.id, name: i.name, portions: 1, price: Number(i.price) }]));
    const addCustom = () => {
        const name = custom.trim();
        if (!name) return;
        setPicked((p) => [...p, { key: `custom-${Date.now()}`, name, portions: 1, price: 0 }]);
        setCustom('');
    };
    const estimate = picked.reduce((s, p) => s + p.price * p.portions, 0) * servings;

    const send = async () => {
        setError(null);
        if (!title.trim()) return setError('Give your dish a name.');
        if (!picked.length) return setError('Pick at least one ingredient.');
        if (!instructions.trim()) return setError('Tell the kitchen briefly how to prepare it.');
        if (service === 'DELIVERY' && !pin) return setError('Pin where to deliver.');
        let reservation_at: string | undefined;
        if (service === 'DINE_IN') {
            if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return setError('Enter the time like 19:30.');
            const [h, m] = time.trim().split(':').map(Number);
            const [y, mo, d] = date.split('-').map(Number);
            const at = new Date(y, mo - 1, d, h, m);
            if (isNaN(at.getTime()) || at.getTime() < Date.now()) return setError('Pick a time from now on.');
            reservation_at = at.toISOString();
        }
        setSending(true);
        try {
            const res: any = await diningApi.requestRecipe({
                entity: restaurant.id,
                title: title.trim(),
                instructions: instructions.trim(),
                servings,
                service_type: service,
                ingredients: picked.map((p) => ({ ...(p.ingredient ? { ingredient: p.ingredient } : { name: p.name }), portions: p.portions })),
                customer_phone: phone.trim(),
                ...(service === 'DINE_IN' ? { reservation_at, party_size: party } : {}),
                ...(service === 'DELIVERY' && pin ? { destination_latitude: pin.latitude, destination_longitude: pin.longitude } : {}),
            });
            if (isOk(res)) {
                setSent(true);
                setPicked([]);
                setTitle('');
                setInstructions('');
                onSent();
            } else setError(errorText(res, 'Your request could not be sent.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setSending(false);
        }
    };

    const label = (t: string) => <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>{t}</Text>;

    return (
        <AdminSheet visible={visible} onClose={onClose} title={sent ? 'Request sent' : 'Create your own dish'} subtitle={restaurant.title} icon="color-wand-outline" width={600}>
            {sent ? (
                <View style={{ gap: 12 }}>
                    <View className="flex-row items-center rounded-2xl p-3" style={{ gap: 10, backgroundColor: 'rgba(16,185,129,0.10)' }}>
                        <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                            The kitchen will price your dish. You'll get a notification — accept the price in My orders to order it.
                        </Text>
                    </View>
                    <SheetButton label="Done" onPress={onClose} />
                </View>
            ) : (
                <View style={{ gap: 16 }}>
                    <CustomTextField label="Name your dish" value={title} onChangeText={setTitle} placeholder="e.g. Grandma's chicken stew" />

                    {/* Ingredients */}
                    <View style={{ gap: 8 }}>
                        {label('INGREDIENTS')}
                        {ingredients === null ? <ActivityIndicator color={theme.primary} /> : null}
                        {ingredients && ingredients.length === 0 ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>This restaurant hasn't listed ingredients — type what you'd like below.</Text>
                        ) : null}
                        {sections.map(([cat, list]) => (
                            <View key={cat} style={{ gap: 6 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{cat}</Text>
                                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                                    {list.map((i) => {
                                        const on = picked.some((p) => p.ingredient === i.id);
                                        return (
                                            <Pressable key={i.id} onPress={() => toggle(i)} className="flex-row items-center rounded-full px-3 h-8" style={{ gap: 4, borderWidth: 1, borderColor: on ? theme.primary : border, backgroundColor: on ? `${theme.primary}14` : 'transparent' }}>
                                                {on ? <Ionicons name="checkmark" size={13} color={theme.primary} /> : null}
                                                <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{i.name}</Text>
                                                {Number(i.price) > 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>· {kes(i.price)}</Text> : null}
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <TextInput
                                value={custom}
                                onChangeText={setCustom}
                                onSubmitEditing={addCustom}
                                placeholder="Something else? e.g. coconut milk"
                                placeholderTextColor={theme.textDark}
                                className="flex-1 rounded-xl px-3 h-10"
                                style={{ borderWidth: 1, borderColor: border, backgroundColor: inputBg, color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}
                            />
                            <SheetButton label="Add" icon="add" variant="secondary" onPress={addCustom} />
                        </View>
                        {picked.length ? (
                            <View className="rounded-2xl p-3" style={{ backgroundColor: chipBg, gap: 8 }}>
                                {picked.map((p) => (
                                    <View key={p.key} className="flex-row items-center" style={{ gap: 8 }}>
                                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>
                                            {p.name} <Text style={{ color: theme.textDark, fontSize: 11 }}>{p.ingredient ? '' : '(your own)'}</Text>
                                        </Text>
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>portions</Text>
                                        <Stepper small value={p.portions} onChange={(n) => setPicked((all) => (n <= 0 ? all.filter((x) => x.key !== p.key) : all.map((x) => (x.key === p.key ? { ...x, portions: Math.min(20, n) } : x))))} />
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </View>

                    <CustomTextField label="How should it be prepared?" value={instructions} onChangeText={setInstructions} placeholder="e.g. Slow-cook the chicken with tomatoes and dhania, mild spice, serve with rice." multiline maxLength={1000} />

                    <View className="flex-row items-center justify-between">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>Servings</Text>
                        <Stepper value={servings} onChange={(n) => setServings(Math.max(1, Math.min(100, n)))} />
                    </View>

                    <ChoiceChips<ServiceType>
                        label="How will you eat it?"
                        options={(['DINE_IN', 'PICKUP', 'DELIVERY'] as ServiceType[]).map((s) => ({ value: s, label: SERVICE_META[s].label, icon: SERVICE_META[s].icon as any }))}
                        value={service}
                        onChange={setService}
                    />
                    {service === 'DINE_IN' ? (
                        <View style={{ gap: 10 }}>
                            <FormRow>
                                <DateField label="Date" value={date} onChangeText={setDate} />
                                <CustomTextField label="Time" value={time} onChangeText={setTime} placeholder="19:30" />
                            </FormRow>
                            <View className="flex-row items-center justify-between">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>People at the table</Text>
                                <Stepper value={party} onChange={(n) => setParty(Math.max(1, Math.min(50, n)))} />
                            </View>
                        </View>
                    ) : null}
                    {service === 'DELIVERY' ? (
                        <View style={{ gap: 6 }}>
                            {label('DELIVER TO')}
                            <LocationPinPicker value={pin} onChange={setPin} height={170} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>You'll pick a delivery option when you accept the price.</Text>
                        </View>
                    ) : null}
                    <CustomTextField label="Phone" value={phone} onChangeText={setPhone} placeholder="So the kitchen can ask questions" keyboardType="phone-pad" />

                    <View className="rounded-2xl p-3" style={{ backgroundColor: `${theme.primary}0d`, gap: 2 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Estimate {estimate > 0 ? kes(estimate) : '—'}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>The restaurant confirms the final price before you pay.</Text>
                    </View>
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
                    <SheetButton label="Send to the kitchen" icon="paper-plane-outline" loading={sending} loadingLabel="Sending…" onPress={() => void send()} />
                </View>
            )}
        </AdminSheet>
    );
}
