// components/deliveries/DeliveryPayouts.tsx
//
// Platform admins: delivery earnings owed (finished shipment legs), grouped by
// payee — a delivery person (their UserPayoutAccounts) or a delivery company /
// courier (its PayoutAccounts). Pay them through your usual channel, then
// "Mark paid" with the payment reference. (Automatic transfers from the system
// till can replace this once that payout API is confirmed.)

import deliveriesApi, { apiError, isOk, type PayableLeg } from '@/api/deliveriesApi';
import { SheetButton, formatDateTime, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { formatKES } from '@/components/retailers/retailerRequisitions/primitives';

interface Group {
    key: string;
    payee: string;
    account: PayableLeg['payee_account'];
    legs: PayableLeg[];
    total: number;
}

const accountLine = (a: PayableLeg['payee_account']) => {
    if (!a) return 'No payout account yet — ask them to add one';
    if (a.type === 'PAYBILL') return `Paybill ${a.business_number} · Acc ${a.number} · ${a.name}`;
    if (a.type === 'BANK') return `${a.bank ?? 'Bank'}${a.code ? ` (${a.code})` : ''} · ${a.number} · ${a.name}`;
    return `${a.type} · ${a.number} · ${a.name}`;
};

export default function DeliveryPayouts() {
    const { theme, border, chipBg } = useListTokens();
    const [settled, setSettled] = useState(false);
    const [legs, setLegs] = useState<PayableLeg[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res: any = await deliveriesApi.getDeliveryPayouts(settled);
            if (isOk(res)) setLegs(res.data.legs ?? []);
            else setError(apiError(res, 'Could not load delivery payouts.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, [settled]);

    useFocusEffect(
        useCallback(() => {
            setSelected(new Set());
            void load();
        }, [load]),
    );

    const groups = useMemo<Group[]>(() => {
        const map = new Map<string, Group>();
        for (const leg of legs ?? []) {
            const key = `${leg.payee ?? '?'}|${leg.payee_account?.number ?? ''}`;
            const g = map.get(key) ?? { key, payee: leg.payee ?? 'Unknown', account: leg.payee_account, legs: [], total: 0 };
            g.legs.push(leg);
            g.total += Number(leg.payout_amount || 0);
            map.set(key, g);
        }
        return [...map.values()].sort((a, b) => b.total - a.total);
    }, [legs]);

    const selectedTotal = (legs ?? []).filter((l) => selected.has(l.id)).reduce((s, l) => s + Number(l.payout_amount || 0), 0);
    const toggle = (ids: string[], on: boolean) =>
        setSelected((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
            return next;
        });

    const markPaid = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res: any = await deliveriesApi.markDeliveryPayoutPaid([...selected], reference.trim());
            if (isOk(res)) {
                setMessage({ ok: true, text: res.data?.response_message || 'Marked paid.' });
                setSelected(new Set());
                setReference('');
                void load();
            } else setMessage({ ok: false, text: apiError(res, 'Could not mark as paid.') });
        } catch (e: any) {
            setMessage({ ok: false, text: e?.message || 'Could not reach the server.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 960, width: '100%', alignSelf: 'center', paddingBottom: 140 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
            >
                <View className="flex-row items-end justify-between flex-wrap gap-2">
                    <View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>Delivery payouts</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                            {settled ? 'Already paid' : `KES ${formatKES(groups.reduce((s, g) => s + g.total, 0))} owed to ${groups.length} payee${groups.length === 1 ? '' : 's'}`}
                        </Text>
                    </View>
                    <View className="flex-row rounded-xl p-1" style={{ backgroundColor: chipBg }}>
                        {[false, true].map((v) => (
                            <Pressable key={String(v)} onPress={() => setSettled(v)} className="px-3 h-8 rounded-lg justify-center" style={{ backgroundColor: settled === v ? theme.panel : 'transparent' }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{v ? 'Paid' : 'To pay'}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
                {legs === null ? <ActivityIndicator color={theme.primary} /> : null}
                {legs && groups.length === 0 && !error ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                        {settled ? 'No paid delivery earnings yet.' : 'Nothing owed right now.'}
                    </Text>
                ) : null}

                {groups.map((g) => {
                    const ids = g.legs.map((l) => l.id);
                    const all = ids.every((id) => selected.has(id));
                    return (
                        <View key={g.key} className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, backgroundColor: theme.panel, gap: 8 }}>
                            <View className="flex-row items-start gap-2">
                                {!settled ? (
                                    <Pressable onPress={() => toggle(ids, !all)} hitSlop={8}>
                                        <Ionicons name={all ? 'checkbox' : 'square-outline'} size={20} color={all ? theme.primary : theme.textDark} />
                                    </Pressable>
                                ) : null}
                                <View className="flex-1 min-w-0">
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{g.payee}</Text>
                                    <Text style={{ color: g.account ? theme.textDark : '#f59e0b', fontFamily: theme.font.medium, fontSize: 12 }}>{accountLine(g.account)}</Text>
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>KES {formatKES(g.total)}</Text>
                            </View>
                            {g.legs.map((leg) => (
                                <Pressable
                                    key={leg.id}
                                    disabled={settled}
                                    onPress={() => toggle([leg.id], !selected.has(leg.id))}
                                    className="flex-row items-center gap-2 rounded-xl px-2.5 py-2"
                                    style={{ backgroundColor: chipBg }}
                                >
                                    {!settled ? (
                                        <Ionicons name={selected.has(leg.id) ? 'checkbox' : 'square-outline'} size={17} color={selected.has(leg.id) ? theme.primary : theme.textDark} />
                                    ) : null}
                                    <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                                        Order {leg.order_reference ?? '—'} · {leg.kind.toLowerCase().replace('_', ' ')} · {Number(leg.distance_km).toLocaleString()} km
                                        {leg.completed_at ? ` · done ${formatDateTime(leg.completed_at)}` : ''}
                                        {settled && leg.pay_out_reference_number ? ` · ref ${leg.pay_out_reference_number}` : ''}
                                    </Text>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>KES {formatKES(leg.payout_amount)}</Text>
                                </Pressable>
                            ))}
                        </View>
                    );
                })}
            </ScrollView>

            {/* Pinned: mark the selection paid */}
            {!settled && selected.size > 0 ? (
                <View className="absolute left-0 right-0 bottom-0 px-4 pt-3 pb-4" style={{ backgroundColor: theme.panel, borderTopWidth: 1, borderTopColor: border, gap: 8 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                        {selected.size} selected · KES {formatKES(selectedTotal)}
                    </Text>
                    <TextInput
                        value={reference}
                        onChangeText={setReference}
                        placeholder="Payment reference (e.g. M-Pesa or bank ref)"
                        placeholderTextColor={theme.textDark}
                        className="rounded-xl px-3"
                        style={{ height: 42, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                    />
                    <SheetButton label="Mark paid" icon="checkmark-done" onPress={markPaid} loading={saving} disabled={!reference.trim()} grow />
                    {message ? <Text style={{ color: message.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{message.text}</Text> : null}
                </View>
            ) : null}
        </View>
    );
}
