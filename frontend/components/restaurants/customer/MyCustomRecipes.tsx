// components/restaurants/customer/MyCustomRecipes.tsx
//
// The customer's custom dish requests: waiting for the kitchen, priced (accept
// — for delivery, pick a priced option — then pay), ordered, declined.

import type { DeliveryOption } from '@/api/deliveriesApi';
import diningApi, { errorText, isOk, RECIPE_STATUS_META, SERVICE_META, type CustomRecipe, type FoodOrder } from '@/api/diningApi';
import { AdminBadgePill, SheetButton, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { kes, when } from '../shared';
import { FoodPayment } from './FoodPayment';

export function MyCustomRecipes({ version, onOrdered }: { version: number; onOrdered: () => void }) {
    const { theme } = useListTokens();
    const [recipes, setRecipes] = useState<CustomRecipe[] | null>(null);
    // Accepted in this session and still being paid: keep the card open.
    const [pinned, setPinned] = useState<Set<string>>(new Set());

    const load = async () => {
        const res: any = await diningApi.myRecipes().catch(() => null);
        if (isOk(res)) setRecipes(res.data.recipes ?? []);
    };
    useEffect(() => {
        void load();
    }, [version]);

    const active = (recipes ?? []).filter((r) => pinned.has(r.id) || ['REQUESTED', 'QUOTED'].includes(r.status) || (r.status === 'DECLINED' && r.created && Date.now() - Date.parse(r.created) < 3 * 86400000));
    if (!active.length) return null;
    return (
        <View style={{ gap: 8 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>YOUR CUSTOM DISHES</Text>
            {active.map((r) => (
                <RecipeCard
                    key={r.id}
                    recipe={r}
                    onChanged={load}
                    onAccepted={() => setPinned((p) => new Set(p).add(r.id))}
                    onOrdered={() => {
                        setPinned((p) => {
                            const n = new Set(p);
                            n.delete(r.id);
                            return n;
                        });
                        onOrdered();
                    }}
                />
            ))}
        </View>
    );
}

function RecipeCard({ recipe: r, onChanged, onAccepted, onOrdered }: { recipe: CustomRecipe; onChanged: () => void; onAccepted: () => void; onOrdered: () => void }) {
    const { theme, border } = useListTokens();
    const [open, setOpen] = useState(r.status === 'QUOTED');
    const [options, setOptions] = useState<DeliveryOption[] | null>(null);
    const [option, setOption] = useState<DeliveryOption | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<FoodOrder | null>(null);
    const meta = RECIPE_STATUS_META[r.status];

    useEffect(() => {
        if (!open || r.status !== 'QUOTED' || r.service_type !== 'DELIVERY' || options) return;
        diningApi.recipeDeliveryOptions(r.id).then((res: any) => {
            if (isOk(res)) {
                const list = res.data.delivery.options ?? [];
                setOptions(list);
                setOption(list[0] ?? null);
            } else {
                setOptions([]);
                setError(errorText(res, 'No delivery options.'));
            }
        });
    }, [open, r.id, r.status, r.service_type, options]);

    const accept = async () => {
        setBusy(true);
        setError(null);
        try {
            const res: any = await diningApi.acceptQuote(r.id, option?.key);
            if (isOk(res)) {
                onAccepted();
                setOrder(res.data.accepted.food_order);
            }
            else setError(errorText(res, 'Could not accept.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    const total = Number(r.quoted_price || 0) + (r.service_type === 'DELIVERY' && option ? Number(option.total) : 0);

    return (
        <View className="rounded-2xl p-3" style={{ borderWidth: 1.5, borderColor: r.status === 'QUOTED' ? '#f59e0b' : border, backgroundColor: theme.panel, gap: 10 }}>
            <Pressable onPress={() => setOpen((o) => !o)} className="flex-row items-start" style={{ gap: 10 }}>
                <Ionicons name="color-wand-outline" size={20} color={theme.primary} />
                <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{r.title} × {r.servings}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {[r.restaurant_title, SERVICE_META[r.service_type]?.label, r.reservation_at ? when(r.reservation_at) : null].filter(Boolean).join(' · ')}
                    </Text>
                    <AdminBadgePill badge={{ label: meta.label, tone: meta.tone }} />
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{r.quoted_price ? kes(r.quoted_price) : `~${kes(r.estimate)}`}</Text>
            </Pressable>
            {open ? (
                <View style={{ gap: 8 }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {r.ingredients.map((i) => `${i.name}${i.portions > 1 ? ` ×${i.portions}` : ''}`).join(', ')}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, fontStyle: 'italic' }}>“{r.instructions}”</Text>
                    {r.restaurant_note ? <Text style={{ color: r.status === 'DECLINED' ? '#f43f5e' : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>Kitchen: {r.restaurant_note}</Text> : null}
                    {r.status === 'QUOTED' && !order ? (
                        <View style={{ gap: 8 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                                Priced at {kes(r.quoted_price)}{r.ready_in_minutes ? ` · ready in about ${r.ready_in_minutes} min` : ''}
                            </Text>
                            {r.service_type === 'DELIVERY' ? (
                                options === null ? (
                                    <ActivityIndicator color={theme.primary} />
                                ) : (
                                    options.map((o) => {
                                        const on = option?.key === o.key;
                                        return (
                                            <Pressable key={o.key} onPress={() => setOption(o)} className="flex-row items-center rounded-xl p-2.5" style={{ gap: 8, borderWidth: 1.5, borderColor: on ? theme.primary : border }}>
                                                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? theme.primary : theme.textDark} />
                                                <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>
                                                    {o.method === 'COURIER' ? 'Courier' : 'Rider'} · {o.legs.find((l) => l.kind !== 'TRANSIT')?.provider_title ?? 'delivery'}
                                                </Text>
                                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{kes(o.total)}</Text>
                                            </Pressable>
                                        );
                                    })
                                )
                            ) : null}
                            <SheetButton
                                label={`Accept & order · ${kes(total)}`}
                                icon="checkmark-circle-outline"
                                loading={busy}
                                loadingLabel="Ordering…"
                                disabled={r.service_type === 'DELIVERY' && !option}
                                onPress={() => void accept()}
                            />
                        </View>
                    ) : null}
                    {order ? (
                        <View style={{ gap: 8 }}>
                            <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 13 }}>Ordered · {order.reference}. Pay now{order.service_type === 'DELIVERY' ? ' so the kitchen can start' : ' or at the restaurant'}.</Text>
                            <FoodPayment order={order} onPaid={() => { onChanged(); onOrdered(); }} />
                            {order.service_type !== 'DELIVERY' ? <SheetButton label="I'll pay at the restaurant" variant="ghost" onPress={() => { onChanged(); onOrdered(); }} /> : null}
                        </View>
                    ) : null}
                    {['REQUESTED', 'QUOTED'].includes(r.status) && !order ? (
                        <SheetButton
                            label="Cancel request"
                            variant="ghost"
                            onPress={async () => {
                                const res: any = await diningApi.cancelRecipe(r.id);
                                if (isOk(res)) onChanged();
                            }}
                        />
                    ) : null}
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
                </View>
            ) : null}
        </View>
    );
}
