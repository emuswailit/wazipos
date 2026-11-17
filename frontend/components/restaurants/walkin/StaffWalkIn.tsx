// components/restaurants/walkin/StaffWalkIn.tsx
//
// The restaurant POS: staff take a walk-in customer's food and drinks on one
// pad, then take payment on the spot — cash (or card / bank), or one mobile money
// prompt to the customer's phone for the whole bill — like New Customer Order
// in a shop. Food lands on the orders board (kitchen), drinks on a bar tab.
// "Pay later" leaves the order unpaid, to be settled from the board / the bar.

import { errorText, isOk } from '@/api/diningApi';
import qrMenuApi, { newOrderToken, type WalkInMenu, type WalkInOrder, type WalkInPayment } from '@/api/qrMenuApi';
import { ChoiceChips, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { kes } from '../shared';
import OrderPad, { type OrderPadInput } from './OrderPad';
import WalkInOrderView from './WalkInOrderView';

const METHOD_ICONS: Record<string, any> = { CASH: 'cash-outline', 'MOBILE MONEY': 'phone-portrait-outline', CARD: 'card-outline', BANK: 'business-outline' };
const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Take payment for a placed walk-in order (everything due, food and drinks together). */
function TakePayment({ order, onOrder }: { order: WalkInOrder; onOrder: (o: WalkInOrder) => void }) {
    const { theme, border } = useListTokens();
    const { paymentMethodsList } = usePaymentMethodsSync();
    // Staff take any method except credit (an unpaid order is simply left unpaid).
    const methods = useMemo(() => {
        const list = (paymentMethodsList ?? []).filter((m: any) => m?.active !== false && String(m?.title ?? '').toUpperCase() !== 'CREDIT');
        const rank = (t: string) => (t === 'CASH' ? 0 : t === 'MOBILE MONEY' ? 1 : 2);
        return [...list].sort((a: any, b: any) => rank(String(a.title).toUpperCase()) - rank(String(b.title).toUpperCase()));
    }, [paymentMethodsList]);
    const [methodId, setMethodId] = useState<string | null>(null);
    const [phone, setPhone] = useState(order.food_order?.customer_phone || order.tab?.customer_phone || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payment, setPayment] = useState<WalkInPayment | null>(null);

    useEffect(() => {
        if (!methodId && methods.length) setMethodId(String(methods[0].id));
    }, [methods, methodId]);
    const method: any = methods.find((m: any) => String(m.id) === methodId);
    const isMomo = String(method?.title ?? '').toUpperCase() === 'MOBILE MONEY';
    const due = Number(order.due);

    // Follow the mobile money prompt until the customer enters their PIN (or it fails).
    useEffect(() => {
        if (payment?.status !== 'PENDING' || !payment.reference) return;
        const t = setInterval(async () => {
            const res: any = await qrMenuApi.staffRefreshPayment(order.token, payment.reference as string).catch(() => null);
            if (isOk(res)) {
                const next: WalkInOrder = res.data.order;
                if (next.payment && next.payment.status !== 'PENDING') {
                    setPayment(next.payment);
                    onOrder(next);
                }
            }
        }, 4000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payment?.reference, payment?.status, order.token]);

    const take = async () => {
        setError(null);
        if (isMomo && phone.replace(/\D/g, '').length < 9) return setError("Enter the customer's mobile money number.");
        setBusy(true);
        try {
            const res: any = await qrMenuApi.staffPay(order.token, isMomo ? { mobile_money_phone: phone.trim() } : { payment_method: methodId });
            if (!isOk(res)) return setError(errorText(res, 'The payment was not taken.'));
            const next: WalkInOrder = res.data.order;
            setPayment(next.payment ?? null);
            onOrder(next);
        } catch {
            setError('Could not reach the server. Try again.');
        } finally {
            setBusy(false);
        }
    };

    if (due <= 0) {
        return (
            <View className="flex-row items-center rounded-2xl p-4" style={{ gap: 10, backgroundColor: 'rgba(16,185,129,0.12)' }}>
                <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Paid in full · {kes(order.total)}</Text>
            </View>
        );
    }
    const waiting = payment?.status === 'PENDING';
    return (
        <View className="rounded-2xl p-4" style={{ gap: 12, backgroundColor: theme.panel, borderWidth: 1, borderColor: border }}>
            <View className="flex-row items-center justify-between">
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Take payment</Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>{kes(due)}</Text>
            </View>
            {methods.length ? (
                <ChoiceChips<string>
                    label="Paid by"
                    options={methods.map((m: any) => ({ value: String(m.id), label: nice(String(m.title)), icon: METHOD_ICONS[String(m.title).toUpperCase()] ?? 'wallet-outline' }))}
                    value={methodId}
                    onChange={(v) => { setMethodId(v); setError(null); }}
                    disabled={waiting}
                />
            ) : (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Payment methods aren’t loaded on this device yet — it will be recorded as cash.</Text>
            )}
            {isMomo ? <CustomTextField label="Customer’s mobile money number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07…" editable={!waiting} /> : null}
            {waiting ? (
                <View className="flex-row items-center rounded-xl p-3" style={{ gap: 10, backgroundColor: 'rgba(59,130,246,0.10)' }}>
                    <ActivityIndicator color="#3b82f6" />
                    <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>Prompt sent. Waiting for the customer to enter their mobile money PIN…</Text>
                </View>
            ) : (
                <SheetButton label={isMomo ? `Send mobile money prompt · ${kes(due)}` : `Record payment · ${kes(due)}`} icon={isMomo ? 'phone-portrait-outline' : 'checkmark'} loading={busy} loadingLabel={isMomo ? 'Sending…' : 'Saving…'} onPress={() => void take()} />
            )}
            {payment?.status === 'FAILED' ? (
                <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{payment.description || 'The payment did not go through.'} Try again or pick another method.</Text>
            ) : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{error}</Text> : null}
        </View>
    );
}

export default function StaffWalkIn({ onClose, onPlaced }: { onClose?: () => void; onPlaced?: () => void }) {
    const { theme, border } = useListTokens();
    const [menu, setMenu] = useState<WalkInMenu | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<WalkInOrder | null>(null);
    const attempt = useRef(newOrderToken());

    const loadMenu = () =>
        qrMenuApi
            .staffMenu()
            .then((res: any) => (isOk(res) ? (setMenu(res.data.menu), setError(null)) : setError(errorText(res, 'Could not load the menu.'))))
            .catch(() => setError('Could not reach the server.'));
    useEffect(() => {
        void loadMenu();
    }, []);

    const place = async (input: OrderPadInput): Promise<string | null> => {
        try {
            const res: any = await qrMenuApi.staffPlace({ ...input, token: attempt.current });
            if (!isOk(res)) return errorText(res, 'The order could not be placed.');
            attempt.current = newOrderToken();
            setOrder(res.data.order);
            onPlaced?.();
            return null;
        } catch {
            return 'Could not reach the server. Try again.';
        }
    };
    const next = () => {
        setOrder(null);
        void loadMenu(); // drinks that just sold out drop off the list
    };
    const paid = order ? Number(order.due) <= 0 : false;

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View className="flex-row items-center px-3 py-2.5" style={{ gap: 10, borderBottomWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                {onClose ? (
                    <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to orders" className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: border }}>
                        <Ionicons name="arrow-back" size={20} color={theme.text} />
                    </Pressable>
                ) : (
                    <View className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${theme.primary}18` }}>
                        <Ionicons name="restaurant" size={19} color={theme.primary} />
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>{order ? (paid ? 'Order paid' : 'Take payment') : 'New order'}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                        {order ? [order.food_order?.reference, order.tab?.reference, order.table].filter(Boolean).join(' · ') : `${menu?.restaurant.title ?? 'Restaurant'} · food and drinks`}
                    </Text>
                </View>
            </View>
            {order ? (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
                    <TakePayment order={order} onOrder={(o) => { setOrder(o); onPlaced?.(); }} />
                    <WalkInOrderView order={order} mode="staff" />
                    <SheetButton label="New order" icon="add" variant={paid ? 'primary' : 'secondary'} onPress={next} />
                    {!paid ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, textAlign: 'center' }}>
                            Paying later? Start a new order — this one stays unpaid on the orders board{order.tab ? ' and in Bar' : ''}.
                        </Text>
                    ) : null}
                </ScrollView>
            ) : menu ? (
                <OrderPad menu={menu} mode="staff" onPlace={place} />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
                    {error ? (
                        <>
                            <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, textAlign: 'center' }}>{error}</Text>
                            <SheetButton label="Try again" icon="refresh" onPress={() => void loadMenu()} />
                        </>
                    ) : (
                        <ActivityIndicator color={theme.primary} />
                    )}
                </View>
            )}
        </View>
    );
}
