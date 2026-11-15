// components/restaurants/walkin/WalkInOrderView.tsx
//
// A walk-in order after it's placed: the food (kitchen status) and the drinks,
// what's due, and — for guests — paying each bill with M-Pesa.

import { STATUS_META } from '@/api/diningApi';
import qrMenuApi, { type GuestPayment, type WalkInOrder } from '@/api/qrMenuApi';
import { errorText, isOk } from '@/api/diningApi';
import { AdminBadgePill, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { kes } from '../shared';

type Bill = 'FOOD' | 'DRINKS';

export default function WalkInOrderView({
    order,
    mode,
    onChanged,
    defaultPhone,
}: {
    order: WalkInOrder;
    mode: 'guest' | 'staff';
    /** Called when a payment settles, so the caller reloads the order. */
    onChanged?: () => void;
    defaultPhone?: string;
}) {
    const { theme, border } = useListTokens();
    const [phone, setPhone] = useState(defaultPhone || order.food_order?.customer_phone || '');
    const [paying, setPaying] = useState<Bill | null>(null);
    const [payment, setPayment] = useState<GuestPayment | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Follow a pending M-Pesa prompt until it settles.
    useEffect(() => {
        if (payment?.status !== 'PENDING') return;
        timer.current = setInterval(async () => {
            const res: any = await qrMenuApi.refreshPayment(order.token, payment.reference).catch(() => null);
            if (isOk(res)) {
                const p: GuestPayment = res.data.payment;
                if (p.status !== 'PENDING') {
                    setPayment(p);
                    onChanged?.();
                }
            }
        }, 4000);
        return () => {
            if (timer.current) clearInterval(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payment?.reference, payment?.status, order.token]);

    const pay = async (bill: Bill) => {
        setError(null);
        if (phone.replace(/\D/g, '').length < 9) return setError('Enter the M-Pesa number to charge.');
        setPaying(bill);
        try {
            const res: any = await qrMenuApi.pay(order.token, bill, phone.trim());
            if (isOk(res)) setPayment(res.data.payment);
            else setError(errorText(res, 'The payment could not be started.'));
        } catch {
            setError('Could not reach the server. Check your connection.');
        } finally {
            setPaying(null);
        }
    };

    const food = order.food_order;
    const tab = order.tab;
    const foodDue = food && food.status !== 'CANCELLED' ? Number(food.amount_due) : 0;
    const tabDue = tab && tab.status !== 'CANCELLED' ? Number(tab.due) : 0;
    const card = { backgroundColor: theme.panel, borderWidth: 1, borderColor: border } as const;
    const line = (key: string, title: string, qty: number, amount: string) => (
        <View key={key} className="flex-row" style={{ gap: 8 }}>
            <Text style={{ width: 30, color: theme.textDark, fontFamily: theme.font.bold, fontSize: 13 }}>{qty}×</Text>
            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>{title}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(amount)}</Text>
        </View>
    );
    const paidPill = (paid: boolean) => <AdminBadgePill badge={paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Not paid', tone: 'warning' }} />;
    const waiting = payment?.status === 'PENDING';

    return (
        <View style={{ gap: 12 }}>
            {food ? (
                <View className="rounded-2xl p-4" style={{ ...card, gap: 10 }}>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                        <Ionicons name="restaurant-outline" size={18} color={theme.primary} />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Food · {food.reference}</Text>
                        <AdminBadgePill badge={{ label: STATUS_META[food.status]?.label ?? food.status, tone: STATUS_META[food.status]?.tone ?? 'neutral' }} />
                    </View>
                    <View style={{ gap: 6 }}>{food.items.map((i, n) => line(`f${n}`, i.title, i.quantity, i.line_total))}</View>
                    <View className="flex-row items-center justify-between" style={{ borderTopWidth: 1, borderColor: border, paddingTop: 10 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{kes(food.total)}</Text>
                        {food.status === 'CANCELLED' ? null : paidPill(foodDue <= 0)}
                    </View>
                    {mode === 'guest' && foodDue > 0 ? (
                        <SheetButton label={`Pay food with M-Pesa · ${kes(foodDue)}`} icon="phone-portrait-outline" loading={paying === 'FOOD'} loadingLabel="Sending prompt…" disabled={waiting || !!paying} onPress={() => void pay('FOOD')} />
                    ) : null}
                </View>
            ) : null}

            {tab ? (
                <View className="rounded-2xl p-4" style={{ ...card, gap: 10 }}>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                        <Ionicons name="wine-outline" size={18} color="#8b5cf6" />
                        <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Drinks · {tab.reference}</Text>
                        {tab.status === 'CANCELLED' ? <AdminBadgePill badge={{ label: 'Cancelled', tone: 'danger' }} /> : null}
                    </View>
                    <View style={{ gap: 6 }}>{tab.items.map((i) => line(i.id, i.title, i.quantity, i.line_total))}</View>
                    <View className="flex-row items-center justify-between" style={{ borderTopWidth: 1, borderColor: border, paddingTop: 10 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{kes(tab.total)}</Text>
                        {tab.status === 'CANCELLED' ? null : paidPill(tabDue <= 0)}
                    </View>
                    {mode === 'guest' && tabDue > 0 ? (
                        <SheetButton label={`Pay drinks with M-Pesa · ${kes(tabDue)}`} icon="phone-portrait-outline" loading={paying === 'DRINKS'} loadingLabel="Sending prompt…" disabled={waiting || !!paying} onPress={() => void pay('DRINKS')} />
                    ) : null}
                </View>
            ) : null}

            {mode === 'guest' && foodDue + tabDue > 0 ? (
                <View className="rounded-2xl p-4" style={{ ...card, gap: 10 }}>
                    <CustomTextField label="M-Pesa number to charge" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07…" />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {food && tab ? 'Food and drinks are paid separately. ' : ''}You can also pay your waiter.
                    </Text>
                </View>
            ) : null}

            {payment ? (
                <View className="flex-row items-center rounded-2xl p-3" style={{ gap: 10, backgroundColor: payment.status === 'SUCCESS' ? 'rgba(16,185,129,0.12)' : payment.status === 'FAILED' ? 'rgba(244,63,94,0.10)' : 'rgba(59,130,246,0.10)' }}>
                    <Ionicons
                        name={payment.status === 'SUCCESS' ? 'checkmark-circle' : payment.status === 'FAILED' ? 'close-circle' : 'time-outline'}
                        size={20}
                        color={payment.status === 'SUCCESS' ? '#10b981' : payment.status === 'FAILED' ? '#f43f5e' : '#3b82f6'}
                    />
                    <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                        {payment.status === 'PENDING' ? 'Check your phone and enter your M-Pesa PIN.' : payment.status === 'SUCCESS' ? 'Payment received. Thank you!' : payment.description || 'The payment did not go through. Try again.'}
                    </Text>
                </View>
            ) : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{error}</Text> : null}
        </View>
    );
}
