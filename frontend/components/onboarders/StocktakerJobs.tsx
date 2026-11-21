// components/onboarders/StocktakerJobs.tsx
//
// Stock takes (stocktakers — an agent's onboarders): the counts you're booked on,
// and on the booked days, counting each item. The count is blind: you see what
// to count, never the system's figures. One count per item; if one is wrong,
// your agent removes it so it can be counted again.
// Backend: stocktakes/ (stocktaker endpoint) — checks the days on every request.

import { stocktakerApi, STATUS_META, type CountItem, type StockTake } from '@/api/stockTakesApi';
import { AdminSheet, formatDate, SearchField, SheetButton, useListTokens } from '@/components/admin/kit';
import { useAlert } from '@/components/common/AlertProvider';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';
const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    return res?.data?.response_message || res?.problem || fallback;
};

export default function StocktakerJobs() {
    const { theme, border, cardShadow } = useListTokens();
    const [jobs, setJobs] = useState<StockTake[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [open, setOpen] = useState<StockTake | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await stocktakerApi.jobs();
            if (ok(res)) {
                setJobs(res.data.stock_takes ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load your stock takes.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    if (open) return <CountScreen job={open} onBack={() => { setOpen(null); void load(); }} />;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <View style={{ gap: 2 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Stock takes</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    Count each item on the shelf. You'll be paid for the days you count.
                </Text>
            </View>
            {jobs === null && !error ? <ActivityIndicator color={theme.primary} /> : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            {jobs && jobs.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 20 }}>No stock takes booked for you yet.</Text>
            ) : null}
            {(jobs ?? []).map((j) => {
                const today = new Date().toISOString().slice(0, 10);
                const state = j.access_open ? { t: 'Open today', c: '#10b981' } : j.status === 'SCHEDULED' && today < j.starts_on ? { t: `Opens ${formatDate(j.starts_on)}`, c: '#f59e0b' } : { t: STATUS_META[j.status].label, c: theme.textDark };
                const me = j.stocktakers[0];
                return (
                    <Pressable
                        key={j.id}
                        disabled={!j.access_open}
                        onPress={() => setOpen(j)}
                        style={{ padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, opacity: j.access_open ? 1 : 0.8, ...cardShadow }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="clipboard-outline" size={18} color={theme.primary} />
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>{j.entity_title}</Text>
                            <Text style={{ color: state.c, fontFamily: theme.font.bold, fontSize: 12 }}>{state.t}</Text>
                        </View>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {formatDate(j.starts_on)} – {formatDate(j.ends_on)} · agent {j.agent_name || '—'}
                        </Text>
                        {me ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {me.days_worked ? `${me.days_worked} day(s) × KES ${Number(me.daily_rate).toLocaleString()} · ${me.payout_status === 'PAID' ? 'paid' : 'owed'}` : `KES ${Number(me.daily_rate).toLocaleString()} per day`}
                            </Text>
                        ) : null}
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

function CountScreen({ job, onBack }: { job: StockTake; onBack: () => void }) {
    const { theme, border, chipBg } = useListTokens();
    const alert = useAlert();
    const [q, setQ] = useState('');
    const [items, setItems] = useState<CountItem[] | null>(null);
    const [counting, setCounting] = useState<CountItem | null>(null);
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const res: any = await stocktakerApi.items(job.id, q.trim() || undefined);
        if (ok(res)) setItems(res.data.items ?? []);
        else {
            setItems([]);
            alert('No access', errorText(res, 'Could not load the items.'), undefined, 'danger');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.id, q]);
    useEffect(() => {
        const t = setTimeout(() => void load(), 300);
        return () => clearTimeout(t);
    }, [load]);

    const save = async () => {
        if (!counting) return;
        if (!(qty.trim() !== '' && Number(qty) >= 0)) return alert('Count', 'Enter the quantity you counted.');
        setSaving(true);
        try {
            const res: any = await stocktakerApi.count(job.id, counting.kind, counting.item, qty.trim(), note.trim() || undefined);
            if (ok(res)) {
                setItems((prev) => (prev ?? []).map((i) => (i.kind === counting.kind && i.item === counting.item ? { ...i, counted: true } : i)));
                setCounting(null);
            } else alert('Not recorded', errorText(res, 'Could not record the count.'), undefined, 'danger');
        } finally {
            setSaving(false);
        }
    };

    const done = (items ?? []).filter((i) => i.counted).length;
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ padding: 16, gap: 10, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
                <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="arrow-back" size={18} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold }}>All stock takes</Text>
                </Pressable>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>{job.entity_title}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    {done} of {items?.length ?? 0} counted · tap an item and enter what's on the shelf
                </Text>
                <SearchField variant="mobile" value={q} onChangeText={setQ} placeholder="Search items…" />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 6, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
                {items === null ? <ActivityIndicator color={theme.primary} /> : null}
                {(items ?? []).map((i) => (
                    <Pressable
                        key={`${i.kind}-${i.item}`}
                        disabled={i.counted}
                        onPress={() => { setQty(''); setNote(''); setCounting(i); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: i.counted ? chipBg : theme.panel }}
                    >
                        <Ionicons name={i.counted ? 'checkmark-circle' : i.kind === 'DRINK' ? 'wine-outline' : 'cube-outline'} size={18} color={i.counted ? '#10b981' : theme.textDark} />
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>{i.title}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{i.counted ? 'Counted' : i.unit}</Text>
                    </Pressable>
                ))}
            </ScrollView>
            <AdminSheet
                visible={!!counting}
                onClose={() => !saving && setCounting(null)}
                title={counting?.title ?? 'Count'}
                subtitle={`Count in ${counting?.unit ?? 'units'}`}
                icon="calculator-outline"
                width={420}
                footer={
                    <>
                        <SheetButton label="Cancel" variant="ghost" onPress={() => setCounting(null)} />
                        <SheetButton label="Save count" icon="checkmark" loading={saving} onPress={() => void save()} />
                    </>
                }
            >
                <View style={{ gap: 10 }}>
                    <TextInput
                        value={qty}
                        onChangeText={(t) => setQty(t.replace(/[^0-9.]/g, ''))}
                        placeholder="Quantity on the shelf"
                        placeholderTextColor={theme.textDark}
                        keyboardType="decimal-pad"
                        autoFocus
                        style={{ height: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}
                    />
                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Note (optional) — e.g. 3 damaged"
                        placeholderTextColor={theme.textDark}
                        style={{ height: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                    />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>You can't change a count once saved; ask your agent if it needs redoing.</Text>
                </View>
            </AdminSheet>
        </View>
    );
}
