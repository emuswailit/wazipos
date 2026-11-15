// components/restaurants/customer/RestaurantMenuView.tsx
//
// One restaurant's menu: sections, dishes with photos and prices, +/- to build
// an order, a sticky cart bar, and "Book a table" for dining in.

import diningApi, { errorText, isOk, type FoodOrder, type MenuItem, type Restaurant, type ServiceType } from '@/api/diningApi';
import { FilterChips, SheetButton, useListTokens } from '@/components/common/listScreen';
import ImageWithFallback from '@/components/common/ImageWithFallback';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { kes, type Cart } from '../shared';
import { CustomRecipeSheet } from './CustomRecipeSheet';
import { FoodCheckout, Stepper } from './FoodCheckout';

export function RestaurantMenuView({ restaurant, onBack, onPlaced }: { restaurant: Restaurant; onBack: () => void; onPlaced: (o: FoodOrder) => void }) {
    const { theme, border, cardShadow } = useListTokens();
    const [items, setItems] = useState<MenuItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [section, setSection] = useState('ALL');
    const [cart, setCart] = useState<Cart>({});
    const [checkout, setCheckout] = useState<ServiceType | null>(null);
    const [recipeOpen, setRecipeOpen] = useState(false);
    const [quotedCount, setQuotedCount] = useState(0);
    useEffect(() => {
        diningApi
            .myRecipes()
            .then((res: any) => setQuotedCount(isOk(res) ? (res.data.recipes ?? []).filter((r: any) => r.restaurant === restaurant.id && r.status === 'QUOTED').length : 0))
            .catch(() => setQuotedCount(0));
    }, [restaurant.id, checkout]);

    useEffect(() => {
        let alive = true;
        diningApi
            .getMenu(restaurant.id)
            .then((res: any) => {
                if (!alive) return;
                if (isOk(res)) setItems(res.data.menu.items ?? []);
                else setError(errorText(res, 'Could not load the menu.'));
            })
            .catch(() => alive && setError('Could not reach the server.'));
        return () => {
            alive = false;
        };
    }, [restaurant.id]);

    const sections = useMemo(() => {
        const seen = new Map<string, number>();
        for (const i of items ?? []) {
            const k = i.category || 'Menu';
            seen.set(k, (seen.get(k) ?? 0) + 1);
        }
        return Array.from(seen.entries());
    }, [items]);
    const shown = (items ?? []).filter((i) => section === 'ALL' || (i.category || 'Menu') === section);
    const count = Object.values(cart).reduce((s, n) => s + n, 0);
    const total = (items ?? []).reduce((s, i) => s + (cart[i.id] ?? 0) * Number(i.price), 0);
    const setQty = (id: string, n: number) =>
        setCart((c) => {
            const next = { ...c };
            if (n <= 0) delete next[id];
            else next[id] = Math.min(50, n);
            return next;
        });

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
                <Pressable onPress={onBack} hitSlop={8} className="flex-row items-center self-start" style={{ gap: 4 }}>
                    <Ionicons name="chevron-back" size={16} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Restaurants</Text>
                </Pressable>
                <View className="flex-row items-start" style={{ gap: 12 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>{restaurant.title}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                            {[restaurant.building, restaurant.road, restaurant.town].filter(Boolean).join(', ')}
                            {restaurant.distance_km != null ? ` · ${restaurant.distance_km.toFixed(1)} km away` : ''}
                        </Text>
                    </View>
                    <View style={{ gap: 6 }}>
                        <SheetButton label="Book a table" icon="calendar-outline" variant="secondary" onPress={() => setCheckout('DINE_IN')} />
                        <SheetButton label="Create your own" icon="color-wand-outline" variant="secondary" onPress={() => setRecipeOpen(true)} />
                    </View>
                </View>

                {quotedCount ? (
                    <Pressable onPress={() => setCheckout('PICKUP')} className="flex-row items-center rounded-2xl p-3" style={{ gap: 10, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)' }}>
                        <Ionicons name="color-wand" size={18} color="#d97706" />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                            {quotedCount} custom dish{quotedCount === 1 ? ' is' : 'es are'} priced — add {quotedCount === 1 ? 'it' : 'them'} to an order
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="#d97706" />
                    </Pressable>
                ) : null}

                {sections.length > 1 ? (
                    <FilterChips<string>
                        value={section}
                        onChange={setSection}
                        options={[{ key: 'ALL', label: 'All', count: items?.length ?? 0 }, ...sections.map(([k, n]) => ({ key: k, label: k, count: n }))]}
                    />
                ) : null}

                {items === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
                {items && items.length === 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 30 }}>
                        This restaurant hasn't put its menu online yet. You can still book a table, or create your own dish.
                    </Text>
                ) : null}

                <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                    {shown.map((i) => {
                        const qty = cart[i.id] ?? 0;
                        return (
                            <View key={i.id} className="flex-row rounded-2xl p-3" style={{ flexGrow: 1, flexBasis: 320, gap: 12, backgroundColor: theme.panel, borderWidth: 1, borderColor: qty ? theme.primary : border, ...cardShadow }}>
                                <View style={{ width: 84, height: 84, borderRadius: 14, overflow: 'hidden', backgroundColor: `${theme.primary}10` }}>
                                    {i.image_url ? (
                                        <ImageWithFallback uri={i.image_url} width={84} height={84} borderRadius={14} fallback="🍽" fallbackSize={28} />
                                    ) : (
                                        <View className="flex-1 items-center justify-center">
                                            <Ionicons name="fast-food-outline" size={28} color={theme.primary} />
                                        </View>
                                    )}
                                </View>
                                <View style={{ flex: 1, gap: 3 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>{i.title}</Text>
                                    {i.description ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>{i.description}</Text> : null}
                                    {i.preparation_minutes ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>~{i.preparation_minutes} min</Text> : null}
                                    <View className="flex-row items-center justify-between mt-1">
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{kes(i.price)}</Text>
                                        {qty ? (
                                            <Stepper small value={qty} onChange={(n) => setQty(i.id, n)} />
                                        ) : (
                                            <Pressable onPress={() => setQty(i.id, 1)} className="flex-row items-center rounded-full px-3 h-8" style={{ gap: 4, backgroundColor: theme.primary }}>
                                                <Ionicons name="add" size={15} color="#fff" />
                                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12.5 }}>Add</Text>
                                            </Pressable>
                                        )}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {count > 0 ? (
                <View className="absolute left-0 right-0 px-4" style={{ bottom: 16 }}>
                    <Pressable
                        onPress={() => setCheckout('PICKUP')}
                        className="flex-row items-center justify-between rounded-2xl px-4 h-14 self-center w-full"
                        style={{ maxWidth: 720, backgroundColor: theme.primary, ...cardShadow }}
                    >
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>{count}</Text>
                            </View>
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>View order</Text>
                        </View>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{kes(total)}</Text>
                    </Pressable>
                </View>
            ) : null}

            <CustomRecipeSheet visible={recipeOpen} onClose={() => setRecipeOpen(false)} restaurant={restaurant} onSent={() => {}} />

            <FoodCheckout
                visible={checkout !== null}
                onClose={() => setCheckout(null)}
                restaurant={restaurant}
                items={items ?? []}
                cart={cart}
                initialService={checkout ?? undefined}
                onPlaced={(o) => {
                    setCart({});
                    onPlaced(o);
                }}
            />
        </View>
    );
}
