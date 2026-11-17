// components/restaurants/customer/FoodPayment.tsx
//
// Pay a food order by mobile money: STK push into the system till, then the
// status is checked every few seconds until the PIN is entered (or it fails).

import diningApi, { errorText, isOk, type FoodOrder } from '@/api/diningApi';
import { SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { kes } from '../shared';

export function FoodPayment({ order, onPaid }: { order: FoodOrder; onPaid: (o: FoodOrder) => void }) {
    const { theme } = useListTokens();
    const { user } = useAuth() as any;
    const [phone, setPhone] = useState<string>(String(user?.phone && user.phone !== 'None' ? user.phone : ''));
    const [ref, setRef] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => {
        if (timer.current) clearInterval(timer.current);
    }, []);

    const poll = (reference: string) => {
        if (timer.current) clearInterval(timer.current);
        let tries = 0;
        timer.current = setInterval(async () => {
            tries += 1;
            const res: any = await diningApi.refreshPayment(reference).catch(() => null);
            if (isOk(res)) {
                const p = res.data.payment;
                setStatus(p.status);
                if (p.status === 'SUCCESS') {
                    if (timer.current) clearInterval(timer.current);
                    onPaid(p.order);
                } else if (p.status === 'FAILED') {
                    if (timer.current) clearInterval(timer.current);
                    setError(p.description || 'The payment did not go through.');
                    setRef(null);
                }
            }
            if (tries > 45 && timer.current) {
                clearInterval(timer.current);
                setError('Still waiting for the payment. Check your mobile money messages, then refresh your orders.');
            }
        }, 4000);
    };

    const pay = async () => {
        setBusy(true);
        setError(null);
        try {
            const res: any = await diningApi.pay(order.id, phone.replace(/\s+/g, ''));
            if (isOk(res)) {
                setRef(res.data.payment.reference);
                setStatus('PENDING');
                poll(res.data.payment.reference);
            } else setError(errorText(res, 'Could not start the payment.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    if (ref && status === 'PENDING') {
        return (
            <View className="items-center rounded-2xl p-4" style={{ gap: 8, backgroundColor: `${theme.primary}0d` }}>
                <ActivityIndicator color={theme.primary} />
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Check your phone</Text>
                <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    Enter your mobile money PIN to pay {kes(order.amount_due)}. This updates by itself.
                </Text>
            </View>
        );
    }

    return (
        <View style={{ gap: 10 }}>
            <CustomTextField label="Mobile money number" value={phone} onChangeText={setPhone} placeholder="0712345678" keyboardType="phone-pad" />
            {error ? (
                <View className="flex-row items-center rounded-xl px-3 py-2" style={{ gap: 6, backgroundColor: 'rgba(244,63,94,0.10)' }}>
                    <Ionicons name="alert-circle" size={15} color="#f43f5e" />
                    <Text className="flex-1" style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text>
                </View>
            ) : null}
            <SheetButton label={`Pay ${kes(order.amount_due)}`} icon="phone-portrait-outline" loading={busy} loadingLabel="Sending prompt…" disabled={phone.trim().length < 9} onPress={() => void pay()} />
        </View>
    );
}
