// components/shopguard/MyShift.tsx
//
// Staff: clock in when you start (your location is checked against the shop's),
// clock out when you finish by counting the cash drawer. The count is blind: you
// don't see what the system expects until you've entered what you counted.
// Also your sales commission this month and last month (if the owner set one).

import { apiError, isOk } from '@/api/deliveriesApi';
import shopGuardApi, { type CommissionStatement, type Shift } from '@/api/shopGuardApi';
import { SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

async function here(): Promise<{ latitude: number; longitude: number } | null> {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return null;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
        return null;
    }
}

const since = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return `${Math.floor(mins / 60)} h ${mins % 60} min`;
};

export default function MyShift() {
    const { theme, border, chipBg } = useListTokens();
    const [shift, setShift] = useState<Shift | null>(null);
    const [canClock, setCanClock] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [float_, setFloat] = useState('');
    const [counted, setCounted] = useState('');
    const [note, setNote] = useState('');
    const [closed, setClosed] = useState<Shift | null>(null);
    const [commission, setCommission] = useState<CommissionStatement[]>([]);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [s, c]: any[] = await Promise.all([shopGuardApi.getMyShift(), shopGuardApi.getMyCommission()]);
            if (isOk(s)) {
                setShift(s.data.data.shift);
                setCanClock(!!s.data.data.can_clock_in);
            }
            if (isOk(c)) setCommission(c.data.statements ?? []);
        } finally {
            setLoaded(true);
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const clockIn = async () => {
        setBusy(true);
        setError(null);
        try {
            const at = await here();
            const res: any = await shopGuardApi.clockIn({ ...(at ?? {}), ...(float_.trim() ? { opening_float: float_.trim() } : {}) });
            if (isOk(res)) {
                setShift(res.data.shift);
                setClosed(null);
                setFloat('');
            } else setError(apiError(res, 'Could not clock in.'));
        } finally {
            setBusy(false);
        }
    };

    const clockOut = async () => {
        if (!shift?.is_owner && counted.trim() === '') return setError('Count the cash in the drawer and enter it.');
        setBusy(true);
        setError(null);
        try {
            const at = await here();
            const res: any = await shopGuardApi.clockOut({ ...(at ?? {}), ...(counted.trim() ? { counted_cash: counted.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
            if (isOk(res)) {
                setClosed(res.data.shift);
                setShift(null);
                setCounted('');
                setNote('');
            } else setError(apiError(res, 'Could not clock out.'));
        } finally {
            setBusy(false);
        }
    };

    const input = (value: string, onChange: (t: string) => void, placeholder: string, numeric = true) => (
        <TextInput
            value={value}
            onChangeText={(t) => onChange(numeric ? t.replace(/[^0-9.]/g, '') : t)}
            placeholder={placeholder}
            placeholderTextColor={theme.textDark}
            keyboardType={numeric ? 'decimal-pad' : 'default'}
            style={{ height: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.bold, fontSize: numeric ? 17 : 14 }}
        />
    );
    const variance = closed?.cash_variance != null ? Number(closed.cash_variance) : null;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 620, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>My shift</Text>
            {!loaded ? <ActivityIndicator color={theme.primary} /> : null}
            {loaded && !canClock ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>Only the shop's staff clock in here.</Text>
            ) : null}

            {loaded && canClock && shift ? (
                <View style={{ padding: 14, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: '#10b98155', backgroundColor: '#10b98110' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="time-outline" size={20} color="#10b981" />
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>On shift for {since(shift.clock_in_at)}</Text>
                    </View>
                    {shift.in_inside === false ? (
                        <Text style={{ color: '#f59e0b', fontFamily: theme.font.medium, fontSize: 12 }}>You clocked in {shift.in_distance_m?.toLocaleString()} m from the shop; the owner was told.</Text>
                    ) : null}
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>Finishing? Count the cash in the drawer first.</Text>
                    {input(counted, setCounted, shift.is_owner ? 'Cash counted (optional)' : 'Cash you counted (KES)')}
                    {input(note, setNote, 'Note (optional)', false)}
                    <SheetButton label="Clock out" icon="log-out-outline" onPress={clockOut} loading={busy} grow />
                </View>
            ) : null}

            {loaded && canClock && !shift ? (
                <View style={{ padding: 14, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Not on shift</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        Clock in when you start. Your location is checked against the shop's.
                    </Text>
                    {input(float_, setFloat, 'Cash already in the drawer (float), if any')}
                    <SheetButton label="Clock in" icon="log-in-outline" onPress={clockIn} loading={busy} grow />
                </View>
            ) : null}

            {closed ? (
                <View style={{ padding: 14, gap: 4, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: chipBg }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Shift closed</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {closed.sales_count ?? 0} sale(s) · {formatKES(closed.sales_total ?? '0')} · cash recorded {formatKES(closed.expected_cash ?? '0')}
                        {closed.counted_cash != null ? ` · you counted ${formatKES(closed.counted_cash)}` : ''}
                    </Text>
                    {variance !== null && closed.counted_cash != null ? (
                        <Text style={{ color: variance === 0 ? '#10b981' : variance < 0 ? '#f43f5e' : '#f59e0b', fontFamily: theme.font.bold, fontSize: 13 }}>
                            {variance === 0 ? 'Cash balances' : `${variance < 0 ? 'Short' : 'Over'} by ${formatKES(String(Math.abs(variance)))}`}
                        </Text>
                    ) : null}
                </View>
            ) : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}

            {commission.some((c) => Number(c.rate_percent) > 0 || Number(c.sales_total) > 0) ? (
                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, marginTop: 6 }}>My commission</Text>
                    {commission.map((c) => (
                        <View key={c.period} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{c.period}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {c.sales_count} sale(s) · {formatKES(c.sales_total)} · {Number(c.rate_percent)}%
                                    {Number(c.monthly_target) ? ` above ${formatKES(c.monthly_target)}` : ''}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{formatKES(c.amount)}</Text>
                                <Text style={{ color: c.paid ? '#10b981' : theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{c.paid ? 'Paid' : 'So far'}</Text>
                            </View>
                        </View>
                    ))}
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        Every sale you record on the till counts. Sales not on the till don't.
                    </Text>
                    {commission.length && !commission[0].has_payout_account ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: '#f59e0b14' }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>Add a payout account so your commission can be paid to you.</Text>
                            <SheetButton label="Add" variant="secondary" onPress={() => router.push('/myPayoutAccounts' as any)} />
                        </View>
                    ) : null}
                </View>
            ) : null}
        </ScrollView>
    );
}
