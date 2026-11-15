// components/restaurants/owner/bar/BarTabs.tsx
//
// Open bar tabs: running bills per guest / table. Void a line (stock returns),
// add a round, take payment (cash, or M-Pesa prompt to the guest's phone),
// close when paid, or cancel an unpaid tab.

import diningApi, { errorText, isOk, type BarTab } from '@/api/diningApi';
import { AdminSheet, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { kes, when } from '../../shared';
import type { BarData } from './useBarData';

export function BarTabs({ bar, onAddRound }: { bar: BarData; onAddRound: (t: BarTab) => void }) {
    const { theme, border } = useListTokens();
    const [openId, setOpenId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const selected = bar.tabs.find((t) => t.id === openId) ?? null;

    return (
        <>
            <ScrollView
                contentContainerStyle={{ padding: 12, gap: 10 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await bar.refresh(); setRefreshing(false); }} tintColor={theme.primary} />}
            >
                {bar.tabs.length === 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 30 }}>No open tabs. Open one from Sell.</Text>
                ) : null}
                {bar.tabs.map((t) => (
                    <Pressable key={t.id} onPress={() => setOpenId(t.id)} className="flex-row items-center rounded-2xl p-3" style={{ gap: 12, backgroundColor: theme.panel, borderWidth: 1, borderColor: border }}>
                        <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                            <Ionicons name="wine-outline" size={20} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{t.customer_name || t.table || t.reference}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {t.items.filter((i) => !i.is_void).reduce((s, i) => s + i.quantity, 0)} drinks · opened {when(t.created)}
                            </Text>
                        </View>
                        <View className="items-end">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{kes(t.total)}</Text>
                            <Text style={{ color: Number(t.due) > 0 ? '#d97706' : '#10b981', fontFamily: theme.font.bold, fontSize: 11 }}>{Number(t.due) > 0 ? `Due ${kes(t.due)}` : 'Paid'}</Text>
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
            {selected ? (
                <TabSheet
                    tab={selected}
                    bar={bar}
                    onClose={() => setOpenId(null)}
                    onAddRound={() => {
                        setOpenId(null);
                        onAddRound(selected);
                    }}
                />
            ) : null}
        </>
    );
}

function TabSheet({ tab, bar, onClose, onAddRound }: { tab: BarTab; bar: BarData; onClose: () => void; onAddRound: () => void }) {
    const { theme, border } = useListTokens();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [phone, setPhone] = useState(tab.customer_phone ?? '');
    const [waitingRef, setWaitingRef] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

    const act = async (key: string, action: string, payload: Record<string, any>, label: string, needsOnline = false) => {
        setBusy(key);
        setError(null);
        try {
            if (needsOnline && !bar.isOnline) {
                setError('This needs a connection.');
                return;
            }
            const r = await bar.write(action, payload, label);
            if (!r.ok) return setError(r.error || 'That did not go through.');
            const t = r.res?.data?.tab ?? r.res?.data?.payment?.tab;
            if (t) bar.upsertTab(t);
            if (r.queued) setError('Saved offline — it syncs when you’re back online.');
            if (action === 'CloseBarTab' || action === 'CancelBarTab') onClose();
        } finally {
            setBusy(null);
        }
    };

    const mpesa = async () => {
        setBusy('mpesa');
        setError(null);
        try {
            const res: any = await diningApi.write('PayBarTab', { order: tab.id, mobile_money_phone: phone.trim() });
            if (!isOk(res)) return setError(errorText(res, 'Could not send the prompt.'));
            const ref = res.data.payment.reference;
            setWaitingRef(ref);
            let tries = 0;
            timer.current = setInterval(async () => {
                tries += 1;
                const r: any = await diningApi.refreshBarPayment(ref).catch(() => null);
                if (isOk(r)) {
                    bar.upsertTab(r.data.payment.tab);
                    if (r.data.payment.status !== 'PENDING') {
                        if (timer.current) clearInterval(timer.current);
                        setWaitingRef(null);
                        if (r.data.payment.status !== 'SUCCESS') setError(r.data.payment.description || 'The payment failed.');
                    }
                }
                if (tries > 45 && timer.current) {
                    clearInterval(timer.current);
                    setWaitingRef(null);
                }
            }, 4000);
        } finally {
            setBusy(null);
        }
    };

    const live = tab.items.filter((i) => !i.is_void);
    const due = Number(tab.due);

    return (
        <AdminSheet visible onClose={onClose} title={tab.customer_name || tab.table || 'Bar tab'} subtitle={`${tab.reference} · opened ${when(tab.created)}`} icon="wine-outline" width={560}>
            <View style={{ gap: 14 }}>
                <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 6 }}>
                    {tab.items.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>Nothing on this tab yet.</Text> : null}
                    {tab.items.map((i) => (
                        <View key={i.id} className="flex-row items-center" style={{ gap: 8, opacity: i.is_void ? 0.45 : 1 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{i.quantity}×</Text>
                            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13, textDecorationLine: i.is_void ? 'line-through' : 'none' }} numberOfLines={1}>{i.title}</Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(i.line_total)}</Text>
                            {!i.is_void && tab.status === 'OPEN' ? (
                                <Pressable hitSlop={8} onPress={() => void act(`void-${i.id}`, 'VoidBarItem', { item: i.id, reason: 'Voided at the bar' }, `Void ${i.title}`)}>
                                    {busy === `void-${i.id}` ? <ActivityIndicator size="small" /> : <Ionicons name="close-circle-outline" size={19} color="#f43f5e" />}
                                </Pressable>
                            ) : null}
                        </View>
                    ))}
                    <View className="flex-row justify-between mt-2">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Total</Text>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{kes(tab.total)}</Text>
                    </View>
                    {Number(tab.paid) > 0 ? <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 12.5 }}>Paid {kes(tab.paid)}{due > 0 ? ` · due ${kes(due)}` : ''}</Text> : null}
                </View>

                {tab.status === 'OPEN' ? <SheetButton label="Add a round" icon="add-circle-outline" variant="secondary" onPress={onAddRound} /> : null}

                {due > 0 && live.length ? (
                    <View style={{ gap: 8 }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>TAKE PAYMENT · {kes(due)}</Text>
                        <SheetButton label="Cash / card received" icon="cash-outline" loading={busy === 'cash'} loadingLabel="Saving…" onPress={() => void act('cash', 'PayBarTab', { order: tab.id }, `Cash for ${tab.reference}`)} />
                        {waitingRef ? (
                            <View className="flex-row items-center rounded-xl p-3" style={{ gap: 8, backgroundColor: `${theme.primary}0d` }}>
                                <ActivityIndicator color={theme.primary} />
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>Waiting for the guest's M-Pesa PIN…</Text>
                            </View>
                        ) : (
                            <View className="flex-row items-end" style={{ gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <CustomTextField label="Guest's M-Pesa number" value={phone} onChangeText={setPhone} placeholder="0712345678" keyboardType="phone-pad" />
                                </View>
                                <SheetButton label="Send prompt" icon="phone-portrait-outline" variant="secondary" loading={busy === 'mpesa'} loadingLabel="Sending…" disabled={phone.trim().length < 9 || !bar.isOnline} onPress={() => void mpesa()} />
                            </View>
                        )}
                    </View>
                ) : null}

                {error ? <Text style={{ color: error.startsWith('Saved offline') ? '#d97706' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}

                {tab.status === 'OPEN' ? (
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                        <SheetButton label="Close tab" icon="checkmark-done-outline" disabled={due > 0 && live.length > 0} loading={busy === 'close'} loadingLabel="Closing…" onPress={() => void act('close', 'CloseBarTab', { order: tab.id }, `Close ${tab.reference}`)} />
                        {Number(tab.paid) <= 0 ? (
                            <SheetButton label="Cancel tab" icon="trash-outline" variant="danger" loading={busy === 'cancel'} loadingLabel="Cancelling…" onPress={() => void act('cancel', 'CancelBarTab', { order: tab.id }, `Cancel ${tab.reference}`)} />
                        ) : null}
                    </View>
                ) : null}
            </View>
        </AdminSheet>
    );
}
