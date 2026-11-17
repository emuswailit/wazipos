// components/hotels/RoomPayment.tsx
//
// Pay for a stay by mobile money: a mobile money prompt into the system till, then
// the status is checked every few seconds until the PIN is entered (or it
// fails). Used by guests, and by hotel staff charging a guest's phone.

import { errorText, isOk } from '@/api/diningApi';
import hotelApi, { type RoomBooking } from '@/api/hotelApi';
import { SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { kes } from '@/components/restaurants/shared';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export function RoomPayment({ booking, defaultPhone, onPaid, label }: { booking: RoomBooking; defaultPhone?: string; onPaid: (b: RoomBooking) => void; label?: string }) {
    const { theme } = useListTokens();
    const [phone, setPhone] = useState(defaultPhone || '');
    const [ref, setRef] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
    };
    useEffect(() => stop, []);

    const poll = (reference: string) => {
        stop();
        let tries = 0;
        timer.current = setInterval(async () => {
            tries += 1;
            const res: any = await hotelApi.refreshPayment(reference).catch(() => null);
            if (isOk(res)) {
                const p = res.data.payment;
                if (p.status === 'SUCCESS') {
                    stop();
                    setRef(null);
                    onPaid(p.booking);
                } else if (p.status === 'FAILED') {
                    stop();
                    setRef(null);
                    setError(p.description || 'The payment did not go through.');
                }
            }
            if (tries > 45) {
                stop();
                setRef(null);
                setError('Still waiting for the payment. Check the mobile money messages, then refresh.');
            }
        }, 4000);
    };

    const pay = async () => {
        setBusy(true);
        setError(null);
        try {
            const res: any = await hotelApi.pay(booking.id, phone.replace(/\s+/g, ''));
            if (isOk(res)) {
                setRef(res.data.payment.reference);
                poll(res.data.payment.reference);
            } else setError(errorText(res, 'Could not start the payment.'));
        } catch {
            setError('Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    if (ref) {
        return (
            <View className="items-center rounded-2xl p-4" style={{ gap: 8, backgroundColor: `${theme.primary}0d` }}>
                <ActivityIndicator color={theme.primary} />
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Check the phone</Text>
                <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    Enter the mobile money PIN to pay {kes(booking.amount_due)}. This updates by itself.
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
            <SheetButton label={label ?? `Pay ${kes(booking.amount_due)} with mobile money`} icon="phone-portrait-outline" loading={busy} loadingLabel="Sending prompt…" disabled={phone.replace(/\D/g, '').length < 9} onPress={() => void pay()} />
        </View>
    );
}
