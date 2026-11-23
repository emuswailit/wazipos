import { errorText } from '@/utils/apiFeedback';
import InsuranceOffer from '@/components/insurance/InsuranceOffer';
import CreditOffer from '@/components/credit/CreditOffer';
// components/distributors/OrderDetailsSheet.tsx
//
// One wholesaler order on a distributor, for either side:
//   seller (distributor staff): reject, take payment (record cash/credit… or send a
//     mobile money prompt), prepare -> pack -> ready, hand over with the pickup code;
//   buyer (wholesaler staff): pay by mobile money, follow it, cancel while unpaid,
//     show the pickup code, receive the goods into stock with selling prices.

import { distributorStaffApi, ORDER_STATUS_META, wholesalerBuyApi, type OrderPayment, type WholesalerOrder } from '@/api/distributorsApi';
import { AdminSheet, ChoiceChips, formatDate, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { ShipmentTracker } from '@/components/deliveries/ShipmentTracker';
import React, { useEffect, useState } from 'react';
import { Text, TextInput, useWindowDimensions, View } from 'react-native';

export const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';
export { errorText } from '@/utils/apiFeedback';

export default function OrderDetailsSheet({
    order: initial,
    role,
    onClose,
    onChanged,
}: {
    order: WholesalerOrder;
    role: 'seller' | 'buyer';
    onClose: () => void;
    onChanged: (o: WholesalerOrder) => void;
}) {
    const { theme, border, chipBg } = useListTokens();
    const { user } = useAuth() as any;
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const { paymentMethodsList } = usePaymentMethodsSync() as any;
    const [order, setOrder] = useState<WholesalerOrder>(initial);
    const [busy, setBusy] = useState<string | null>(null);
    const [phone, setPhone] = useState(role === 'buyer' && user?.phone && user.phone !== 'None' ? String(user.phone) : '');
    const [method, setMethod] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const [code, setCode] = useState('');
    const [collector, setCollector] = useState('');
    const [prices, setPrices] = useState<Record<string, string>>({});
    const [pending, setPending] = useState<OrderPayment | null>(null);
    useEffect(() => setOrder(initial), [initial]);

    const api = role === 'seller' ? distributorStaffApi : wholesalerBuyApi;
    const reload = async () => {
        const res: any = await api.order(order.id);
        if (ok(res)) {
            setOrder(res.data.order);
            onChanged(res.data.order);
        }
    };
    const run = async (key: string, fn: () => Promise<any>, done?: string) => {
        setBusy(key);
        try {
            const res: any = await fn();
            if (!ok(res)) return alert('Not done', errorText(res, 'Something went wrong.'), undefined, 'danger');
            if (res.data.order) {
                setOrder(res.data.order);
                onChanged(res.data.order);
            }
            if (res.data.payment) {
                if (res.data.payment.status === 'PENDING') setPending(res.data.payment);
                await reload();
            }
            if (done) alert('Done', done, undefined, 'success');
        } finally {
            setBusy(null);
        }
    };
    const refreshPending = async () => {
        if (!pending?.reference_number) return;
        setBusy('refresh');
        try {
            const res: any = await api.refreshPayment(pending.reference_number);
            if (ok(res)) {
                const p: OrderPayment = res.data.payment;
                if (p.status !== 'PENDING') {
                    setPending(null);
                    alert(p.status === 'SUCCESS' ? 'Paid' : 'Not paid', p.description || p.status, undefined, p.status === 'SUCCESS' ? 'success' : 'danger');
                } else setPending(p);
                await reload();
            }
        } finally {
            setBusy(null);
        }
    };

    const s = order.status;
    const unpaid = s === 'SUBMITTED';
    // Goods in hand: collected (pickup), or delivered (logistics shipment).
    const arrived = s === 'COLLECTED' || (s === 'DISPATCHED' && !!order.shipment?.delivered_at);
    const stage = order.fulfilment?.stage;
    const input = (value: string, onChange: (t: string) => void, placeholder: string, keyboard: any = 'default') => (
        <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={theme.textDark}
            keyboardType={keyboard}
            style={{ flex: 1, minWidth: 140, height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
        />
    );
    const heading = (t: string) => <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{t}</Text>;
    const note = (t: string) => <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>{t}</Text>;
    const row = (children: React.ReactNode) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</View>;
    const offline = (paymentMethodsList ?? []).filter((m: any) => String(m.title).toUpperCase() !== 'MOBILE MONEY');

    return (
        <AdminSheet
            visible
            onClose={onClose}
            title={`${role === 'seller' ? order.wholesaler_title : order.distributor_title} · ${order.reference_number}`}
            subtitle={`${ORDER_STATUS_META[s].label} · ${formatKES(order.final_price_total)} · ${order.delivery_method === 'SELF' ? 'pickup' : 'delivery'} · ${formatDate(order.created)}`}
            icon="cube-outline"
            width={720}
            footer={<SheetButton label="Close" variant="ghost" onPress={onClose} grow={!isLarge} />}
        >
            <View style={{ gap: 16 }}>
                {/* ---- lines */}
                <View style={{ gap: 6 }}>
                    {heading(`${order.items.length} product${order.items.length === 1 ? '' : 's'}`)}
                    {order.items.map((i) => (
                        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: border }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>{i.title}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {i.purchased_quantity} {i.unit_of_issue} × {formatKES(i.item_final_price)}
                                    {i.free_quantity ? ` · +${i.free_quantity} free` : ''}
                                    {i.batch ? ` · batch ${i.batch}` : ''}
                                    {i.expiry_date ? ` · exp ${formatDate(i.expiry_date)}` : ''}
                                </Text>
                            </View>
                            {role === 'buyer' && arrived ? (
                                <TextInput
                                    value={prices[i.id] ?? ''}
                                    onChangeText={(t) => setPrices((p) => ({ ...p, [i.id]: t.replace(/[^0-9.]/g, '') }))}
                                    placeholder="Your price"
                                    placeholderTextColor={theme.textDark}
                                    keyboardType="decimal-pad"
                                    style={{ width: 96, height: 34, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium, textAlign: 'right' }}
                                />
                            ) : (
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{formatKES(i.item_final_price_total)}</Text>
                            )}
                        </View>
                    ))}
                    <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: border }}>
                        {Number(order.discount_total) ? note(`List ${formatKES(order.gross_price_total)} · discounts −${formatKES(order.discount_total)}`) : null}
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                            Total {formatKES(order.final_price_total)}{Number(order.amount_due) > 0 && !unpaid ? '' : ''}{unpaid ? ` · due ${formatKES(order.amount_due)}` : ' · paid'}
                        </Text>
                    </View>
                </View>

                {/* WaziPOS Credit: a lender pays the distributor now; the wholesaler repays later. */}
                {role === 'buyer' && unpaid ? (
                    <CreditOffer kind="wholesaler" orderId={order.id} onPaid={() => void onChanged?.(order)} />
                ) : null}
                {/* WaziPOS Cover: the buyer can insure goods on their way (until delivered). */}
                {role === 'buyer' && order.delivery_method === 'COURIER' && !arrived && s !== 'REJECTED' && s !== 'CANCELLED' ? (
                    <InsuranceOffer
                        product="SAFE_PARCEL"
                        source="b2b_order"
                        variant="strip"
                        context={{ subject_kind: 'wholesaler', subject_id: String(order.id), inputs: { value: Math.max(100, Math.round(Number(order.final_price_total) || 0)) } }}
                        subjectLabel={`Delivery of order ${order.reference_number ?? ''}`.trim()}
                        locked={['value']}
                    />
                ) : null}
                {s === 'REJECTED' ? note(`Rejected: ${order.rejected_reason}`) : null}

                {/* ---- payment */}
                {unpaid ? (
                    <View style={{ gap: 8 }}>
                        {heading('Payment')}
                        {pending ? (
                            <View style={{ gap: 6, padding: 10, borderRadius: 12, backgroundColor: chipBg }}>
                                {note(`Mobile money prompt sent for ${formatKES(pending.amount)}. ${role === 'buyer' ? 'Enter your PIN, then check.' : 'Ask the buyer to enter their PIN, then check.'}`)}
                                <SheetButton label="Check payment" icon="refresh" variant="secondary" loading={busy === 'refresh'} onPress={() => void refreshPending()} />
                            </View>
                        ) : (
                            row(
                                <>
                                    {input(phone, setPhone, role === 'buyer' ? 'Your mobile money number' : "Buyer's mobile money number", 'phone-pad')}
                                    <SheetButton
                                        label={role === 'buyer' ? `Pay ${formatKES(order.amount_due)}` : 'Send payment prompt'}
                                        icon="phone-portrait-outline"
                                        loading={busy === 'mm'}
                                        onPress={() => void run('mm', () => (role === 'buyer' ? wholesalerBuyApi.pay(order.id, phone.trim()) : distributorStaffApi.requestPayment(order.id, phone.trim())))}
                                    />
                                </>,
                            )
                        )}
                        {role === 'seller' && offline.length ? (
                            <View style={{ gap: 6 }}>
                                {note('Or record a payment taken another way (the buyer pays you directly):')}
                                <ChoiceChips<string> options={offline.map((m: any) => ({ value: String(m.id), label: String(m.title) }))} value={method} onChange={setMethod} />
                                {method ? <SheetButton label={`Record ${formatKES(order.amount_due)} paid`} icon="checkmark" variant="secondary" loading={busy === 'rec'} onPress={() => void run('rec', () => distributorStaffApi.recordPayment(order.id, method), 'Payment recorded.')} /> : null}
                            </View>
                        ) : null}
                    </View>
                ) : null}
                {order.payments.length ? (
                    <View style={{ gap: 4 }}>
                        {heading('Payments')}
                        {order.payments.map((p) => note(`${formatDate(p.created)} · ${p.method || 'Payment'} · ${formatKES(p.amount)} · ${p.status.toLowerCase()}`))}
                    </View>
                ) : null}

                {/* ---- seller: fulfilment */}
                {role === 'seller' && order.is_paid && stage && stage !== 'COLLECTED' && s !== 'RECEIVED' ? (
                    <View style={{ gap: 8 }}>
                        {heading(`Fulfilment · ${stage.toLowerCase()}`)}
                        {row(
                            <>
                                {stage === 'PENDING' ? <SheetButton label="Start preparing" icon="construct-outline" variant="secondary" loading={busy === 'prep'} onPress={() => void run('prep', () => distributorStaffApi.fulfil(order.id, 'PREPARING'))} /> : null}
                                {stage === 'PENDING' || stage === 'PREPARING' ? <SheetButton label="Packed" icon="cube-outline" variant="secondary" loading={busy === 'pack'} onPress={() => void run('pack', () => distributorStaffApi.fulfil(order.id, 'PACKED'))} /> : null}
                                {stage === 'PREPARING' || stage === 'PACKED' ? <SheetButton label="Ready" icon="checkmark-done" loading={busy === 'ready'} onPress={() => void run('ready', () => distributorStaffApi.fulfil(order.id, 'READY'), order.delivery_method === 'SELF' ? 'Ready. The buyer can now collect with their pickup code.' : 'Ready to dispatch.')} /> : null}
                            </>,
                        )}
                        {stage === 'READY' && order.delivery_method === 'SELF' ? (
                            <View style={{ gap: 6 }}>
                                {note("Hand over when the collector gives the buyer's pickup code:")}
                                {row(
                                    <>
                                        {input(code, (t) => setCode(t.replace(/[^0-9]/g, '')), 'Pickup code', 'number-pad')}
                                        {input(collector, setCollector, 'Collector name (optional)')}
                                        <SheetButton label="Hand over" icon="hand-left-outline" loading={busy === 'collect'} onPress={() => void run('collect', () => distributorStaffApi.confirmCollection(order.id, code, collector.trim() || undefined), 'Collected.')} />
                                    </>,
                                )}
                            </View>
                        ) : null}
                    </View>
                ) : null}
                {role === 'seller' && unpaid ? (
                    <View style={{ gap: 6 }}>
                        {heading('Reject')}
                        {row(
                            <>
                                {input(reason, setReason, 'Why (e.g. out of stock)')}
                                <SheetButton label="Reject order" icon="close-circle-outline" variant="ghost" loading={busy === 'reject'} onPress={() => void run('reject', () => distributorStaffApi.reject(order.id, reason.trim()), 'Order rejected.')} />
                            </>,
                        )}
                    </View>
                ) : null}

                {/* ---- buyer: follow, collect, receive */}
                {role === 'buyer' && order.fulfilment?.pickup_code && stage !== 'COLLECTED' ? (
                    <View style={{ padding: 12, borderRadius: 12, backgroundColor: chipBg, gap: 4 }}>
                        {heading(`Pickup code: ${order.fulfilment.pickup_code}`)}
                        {note(stage === 'READY' ? 'Ready — whoever collects gives this code at the distributor.' : `Being ${stage?.toLowerCase()}. You'll collect with this code.`)}
                    </View>
                ) : null}
                {order.delivery_method === 'COURIER' ? (
                    <View style={{ gap: 6 }}>
                        {heading(role === 'seller' ? 'Delivery · allocate once ready' : 'Delivery')}
                        <ShipmentTracker
                            link={{ wholesaler_order: order.id }}
                            version={`${order.status}-${order.paid_at ?? ''}`}
                            viewer={role === 'seller' ? 'wholesaler' : 'retailer'}
                            paid={order.is_paid}
                            onOrderChanged={() => void reload()}
                        />
                    </View>
                ) : null}

                {role === 'buyer' && arrived ? (
                    <View style={{ gap: 6 }}>
                        {heading('Receive into your stock')}
                        {note('Enter your selling price per unit for each product (you can change it later), then receive. Free units lower your cost per unit.')}
                        <SheetButton
                            label="Receive into stock"
                            icon="archive-outline"
                            loading={busy === 'receive'}
                            onPress={() => void run('receive', () => wholesalerBuyApi.receive(order.id, Object.entries(prices).filter(([, v]) => v).map(([item, v]) => ({ item, unit_selling_price: v }))), 'Received into your stock.')}
                        />
                    </View>
                ) : null}
                {role === 'buyer' && unpaid && !pending ? (
                    <SheetButton label="Cancel order" icon="close-circle-outline" variant="ghost" loading={busy === 'cancel'} onPress={() => void run('cancel', () => wholesalerBuyApi.cancel(order.id), 'Order cancelled.')} />
                ) : null}
            </View>
        </AdminSheet>
    );
}
