// components/restaurants/walkin/OrderPad.tsx
//
// One order pad for walk-in customers: the food menu and the drinks list
// (bottles and tots), a running total, and a short checkout. Used by
//   - guests on the public page a restaurant's QR code opens (mode "guest"), and
//   - staff serving at the counter (mode "staff").
// Mobile first: a single column with a sticky total; wide screens get a grid.

import type { MenuItem } from '@/api/diningApi';
import type { DrinkUnit, MenuDrink, WalkInMenu, WalkInOrderInput, WalkInService } from '@/api/qrMenuApi';
import { AdminSheet, ChoiceChips, FormRow, SearchField, SegmentedControl, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { kes } from '../shared';

type Section = 'FOOD' | 'DRINKS';
/** Cart key: f:<menu item> · b:<drink> (bottle) · t:<drink> (tot). */
type Cart = Record<string, number>;
export type OrderPadInput = Omit<WalkInOrderInput, 'token'>;

const MAX_GUEST = 20;
const nice = (s?: string | null) => {
    const t = String(s || '').trim();
    return t && t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

function Stepper({ value, onChange, max, disabled }: { value: number; onChange: (n: number) => void; max: number; disabled?: boolean }) {
    const { theme, border } = useListTokens();
    if (disabled) {
        return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Finished</Text>;
    }
    if (!value) {
        return (
            <Pressable
                onPress={() => onChange(1)}
                accessibilityRole="button"
                accessibilityLabel="Add"
                className="flex-row items-center rounded-full px-3"
                style={{ height: 36, gap: 4, borderWidth: 1, borderColor: theme.primary }}
            >
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Add</Text>
            </Pressable>
        );
    }
    const btn = (icon: 'remove' | 'add', next: number, label: string, off = false) => (
        <Pressable
            onPress={() => onChange(next)}
            disabled={off}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="items-center justify-center rounded-full"
            style={{ width: 36, height: 36, backgroundColor: icon === 'add' ? theme.primary : 'transparent', borderWidth: icon === 'add' ? 0 : 1, borderColor: border, opacity: off ? 0.4 : 1 }}
        >
            <Ionicons name={icon} size={18} color={icon === 'add' ? '#fff' : theme.text} />
        </Pressable>
    );
    return (
        <View className="flex-row items-center" style={{ gap: 8 }}>
            {btn('remove', value - 1, 'One less')}
            <Text style={{ minWidth: 20, textAlign: 'center', color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{value}</Text>
            {btn('add', value + 1, 'One more', value >= max)}
        </View>
    );
}

export default function OrderPad({
    menu,
    mode,
    onPlace,
    onCancel,
}: {
    menu: WalkInMenu;
    mode: 'guest' | 'staff';
    /** Places the order; resolves to an error message, or null when placed. */
    onPlace: (input: OrderPadInput) => Promise<string | null>;
    onCancel?: () => void;
}) {
    const { theme, border } = useListTokens();
    const { width } = useWindowDimensions();
    const cols = width >= 1100 ? 3 : width >= 700 ? 2 : 1;
    const hasFood = menu.items.length > 0;
    const hasDrinks = menu.drinks.length > 0;
    const [section, setSection] = useState<Section>(hasFood ? 'FOOD' : 'DRINKS');
    const [q, setQ] = useState('');
    const [cart, setCart] = useState<Cart>({});
    const [reviewing, setReviewing] = useState(false);
    const [service, setService] = useState<WalkInService>('DINE_IN');
    const [table, setTable] = useState<string | null>(menu.table?.id ?? null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const max = mode === 'guest' ? MAX_GUEST : 200;

    const set = (key: string, n: number) =>
        setCart((c) => {
            const next = { ...c };
            if (n <= 0) delete next[key];
            else next[key] = Math.min(n, max);
            return next;
        });

    const foodById = useMemo(() => Object.fromEntries(menu.items.map((i) => [i.id, i])), [menu.items]);
    const drinkById = useMemo(() => Object.fromEntries(menu.drinks.map((d) => [d.id, d])), [menu.drinks]);

    /** Cart lines with titles and prices, for the review and the total. */
    const lines = useMemo(
        () =>
            Object.entries(cart)
                .map(([key, qty]) => {
                    const [kind, id] = [key[0], key.slice(2)];
                    if (kind === 'f') {
                        const item: MenuItem | undefined = foodById[id];
                        return item ? { key, qty, title: nice(item.title), price: Number(item.price) } : null;
                    }
                    const drink: MenuDrink | undefined = drinkById[id];
                    if (!drink) return null;
                    return kind === 't'
                        ? { key, qty, title: `${nice(drink.title)} · tot`, price: Number(drink.tot_price) }
                        : { key, qty, title: `${nice(drink.title)} · bottle`, price: Number(drink.bottle_price) };
                })
                .filter(Boolean) as { key: string; qty: number; title: string; price: number }[],
        [cart, foodById, drinkById],
    );
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

    const s = q.trim().toLowerCase();
    const food = useMemo(() => {
        const groups: Record<string, MenuItem[]> = {};
        for (const i of menu.items) {
            if (s && !`${i.title} ${i.description ?? ''} ${i.category ?? ''}`.toLowerCase().includes(s)) continue;
            (groups[nice(i.category) || 'Menu'] ??= []).push(i);
        }
        return Object.entries(groups);
    }, [menu.items, s]);
    const drinks = useMemo(() => {
        const groups: Record<string, MenuDrink[]> = {};
        for (const d of menu.drinks) {
            if (s && !`${d.title} ${d.category ?? ''}`.toLowerCase().includes(s)) continue;
            (groups[nice(d.category) || 'Drinks'] ??= []).push(d);
        }
        return Object.entries(groups);
    }, [menu.drinks, s]);

    const place = async () => {
        setError(null);
        if (mode === 'guest') {
            if (name.trim().length < 2) return setError('Tell us your name so we can bring your order.');
            if (phone.replace(/\D/g, '').length < 9) return setError('Enter your phone number.');
        }
        const items: OrderPadInput['items'] = [];
        const drinkLines: OrderPadInput['drinks'] = [];
        for (const [key, qty] of Object.entries(cart)) {
            const id = key.slice(2);
            if (key[0] === 'f') items.push({ menu_item: id, quantity: qty });
            else drinkLines.push({ drink: id, unit: (key[0] === 't' ? 'TOT' : 'BOTTLE') as DrinkUnit, quantity: qty });
        }
        setBusy(true);
        try {
            const err = await onPlace({ table, service, customer_name: name.trim(), customer_phone: phone.trim(), notes: notes.trim(), items, drinks: drinkLines });
            if (err) setError(err);
            else {
                setCart({});
                setReviewing(false);
            }
        } finally {
            setBusy(false);
        }
    };

    const card = { backgroundColor: theme.panel, borderWidth: 1, borderColor: border } as const;
    const cell = { width: cols === 1 ? ('100%' as const) : (`${100 / cols}%` as any), padding: 5 };
    const heading = (label: string) => (
        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 5, marginTop: 8 }}>{label}</Text>
    );

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 11, paddingBottom: count ? 96 : 24, maxWidth: 1200, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
                <View style={{ gap: 10, paddingHorizontal: 5 }}>
                    {hasFood && hasDrinks ? (
                        <SegmentedControl<Section>
                            variant="mobile"
                            value={section}
                            onChange={setSection}
                            options={[
                                { key: 'FOOD', label: `Food (${menu.items.length})` },
                                { key: 'DRINKS', label: `Drinks (${menu.drinks.length})` },
                            ]}
                        />
                    ) : null}
                    <SearchField value={q} onChangeText={setQ} placeholder={section === 'FOOD' ? 'Search the menu…' : 'Search drinks…'} variant="mobile" />
                </View>

                {!hasFood && !hasDrinks ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 32 }}>The menu isn’t ready yet. Please ask a waiter.</Text>
                ) : null}

                {section === 'FOOD'
                    ? food.map(([group, items]) => (
                          <View key={group}>
                              {heading(group)}
                              <View className="flex-row flex-wrap">
                                  {items.map((i) => (
                                      <View key={i.id} style={cell}>
                                          <View className="flex-row rounded-2xl p-3" style={{ ...card, gap: 12, minHeight: 92 }}>
                                              {i.image_url ? (
                                                  <Image source={{ uri: i.image_url }} style={{ width: 68, height: 68, borderRadius: 12, backgroundColor: border }} accessibilityIgnoresInvertColors />
                                              ) : (
                                                  <View className="items-center justify-center" style={{ width: 68, height: 68, borderRadius: 12, backgroundColor: `${theme.primary}14` }}>
                                                      <Ionicons name="restaurant-outline" size={24} color={theme.primary} />
                                                  </View>
                                              )}
                                              <View style={{ flex: 1, gap: 3 }}>
                                                  <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>{nice(i.title)}</Text>
                                                  {i.description ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>{i.description}</Text> : null}
                                                  <View className="flex-row items-center justify-between" style={{ marginTop: 'auto', paddingTop: 4 }}>
                                                      <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{kes(i.price)}</Text>
                                                      <Stepper value={cart[`f:${i.id}`] ?? 0} onChange={(n) => set(`f:${i.id}`, n)} max={max} />
                                                  </View>
                                              </View>
                                          </View>
                                      </View>
                                  ))}
                              </View>
                          </View>
                      ))
                    : drinks.map(([group, list]) => (
                          <View key={group}>
                              {heading(group)}
                              <View className="flex-row flex-wrap">
                                  {list.map((d) => (
                                      <View key={d.id} style={cell}>
                                          <View className="rounded-2xl p-3" style={{ ...card, gap: 10 }}>
                                              <View className="flex-row items-center" style={{ gap: 10 }}>
                                                  <View className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#8b5cf61c' }}>
                                                      <Ionicons name="wine-outline" size={20} color="#8b5cf6" />
                                                  </View>
                                                  <View style={{ flex: 1 }}>
                                                      <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>{nice(d.title)}</Text>
                                                      <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{d.volume_ml} ml</Text>
                                                  </View>
                                              </View>
                                              <View className="flex-row items-center justify-between">
                                                  <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                                                      Bottle · <Text style={{ fontFamily: theme.font.bold }}>{kes(d.bottle_price)}</Text>
                                                  </Text>
                                                  <Stepper value={cart[`b:${d.id}`] ?? 0} onChange={(n) => set(`b:${d.id}`, n)} max={max} disabled={!d.bottle_available} />
                                              </View>
                                              {d.sells_tots ? (
                                                  <View className="flex-row items-center justify-between">
                                                      <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                                                          Tot{d.tot_ml ? ` (${d.tot_ml} ml)` : ''} · <Text style={{ fontFamily: theme.font.bold }}>{kes(d.tot_price)}</Text>
                                                      </Text>
                                                      <Stepper value={cart[`t:${d.id}`] ?? 0} onChange={(n) => set(`t:${d.id}`, n)} max={max} disabled={!d.tot_available} />
                                                  </View>
                                              ) : null}
                                          </View>
                                      </View>
                                  ))}
                              </View>
                          </View>
                      ))}
                {s && (section === 'FOOD' ? !food.length : !drinks.length) ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 24 }}>Nothing matches “{q.trim()}”.</Text>
                ) : null}
            </ScrollView>

            {/* Running total */}
            {count ? (
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: theme.background, borderTopWidth: 1, borderColor: border }}>
                    <Pressable
                        onPress={() => { setError(null); setReviewing(true); }}
                        accessibilityRole="button"
                        className="flex-row items-center justify-between rounded-2xl px-4"
                        style={{ height: 54, backgroundColor: theme.primary, maxWidth: 640, width: '100%', alignSelf: 'center' }}
                    >
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{count} {count === 1 ? 'item' : 'items'} · {kes(total)}</Text>
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>Review order</Text>
                            <Ionicons name="arrow-forward" size={18} color="#fff" />
                        </View>
                    </Pressable>
                </View>
            ) : onCancel ? (
                <View style={{ padding: 12 }}>
                    <SheetButton label="Close" variant="secondary" onPress={onCancel} />
                </View>
            ) : null}

            <AdminSheet
                visible={reviewing}
                onClose={() => setReviewing(false)}
                title="Your order"
                subtitle={[menu.restaurant.title, menu.table?.title].filter(Boolean).join(' · ')}
                icon="receipt-outline"
                width={560}
                footer={<SheetButton label={`Place order · ${kes(total)}`} icon="checkmark" loading={busy} loadingLabel="Sending…" disabled={!count} onPress={() => void place()} grow />}
            >
                <View style={{ gap: 14 }}>
                    <View style={{ gap: 8 }}>
                        {lines.map((l) => (
                            <View key={l.key} className="flex-row items-center" style={{ gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>{l.title}</Text>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{kes(l.price)} each · {kes(l.price * l.qty)}</Text>
                                </View>
                                <Stepper value={l.qty} onChange={(n) => set(l.key, n)} max={max} />
                            </View>
                        ))}
                    </View>
                    <ChoiceChips<WalkInService>
                        label="How would you like it?"
                        options={[
                            { value: 'DINE_IN', label: 'Eat here', icon: 'restaurant-outline' },
                            { value: 'PICKUP', label: 'Take away', icon: 'bag-handle-outline' },
                        ]}
                        value={service}
                        onChange={setService}
                    />
                    {mode === 'staff' && menu.tables?.length ? (
                        <ChoiceChips<string>
                            label="Table"
                            options={[{ value: '', label: 'No table' }, ...menu.tables.filter((t) => t.is_available).map((t) => ({ value: t.id, label: t.title }))]}
                            value={table ?? ''}
                            onChange={(v) => setTable(v || null)}
                        />
                    ) : null}
                    <FormRow>
                        <CustomTextField label={mode === 'guest' ? 'Your name' : 'Customer name'} required={mode === 'guest'} value={name} onChangeText={setName} placeholder={mode === 'guest' ? 'e.g. Amina' : 'Optional'} autoCapitalize="words" />
                        <CustomTextField label={mode === 'guest' ? 'Your phone' : 'Customer phone'} required={mode === 'guest'} value={phone} onChangeText={setPhone} placeholder="07…" keyboardType="phone-pad" />
                    </FormRow>
                    <CustomTextField label="Anything we should know?" value={notes} onChangeText={setNotes} placeholder="e.g. No onions, extra cold" maxLength={280} />
                    {mode === 'guest' ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            After ordering you can pay with M-Pesa on this page, or pay your waiter.
                        </Text>
                    ) : null}
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{error}</Text> : null}
                </View>
            </AdminSheet>
        </View>
    );
}
