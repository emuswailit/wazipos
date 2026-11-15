// components/retailers/retailerRequisitions/RequisitionCart.tsx
//
// Cart-style pane for one retailer order (requisition): header, scrollable
// line items, pinned footer with the invoice totals and payment.
//   viewer="retailer"   (Requisitions): the retailer pays — mobile money only.
//   viewer="wholesaler" (Retailer orders): staff "Retry payment" with any method
//                       while the order is unpaid or has no successful payment.
// Once paid, both sides can print / share the invoice PDF, and the retailer can
// "Receive into stock" (ReceiveRetailerOrder: RetailerReceipts in the exact
// invoice quantities).

import { AdminBadgePill, SheetButton, formatDateTime, useListTokens } from '@/components/common/listScreen';
import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { exportToPdf } from '@/components/common/Exportable';
import { DeliveryOptionsPicker } from '@/components/deliveries/DeliveryOptionsPicker';
import { ShipmentTracker } from '@/components/deliveries/ShipmentTracker';
import RecordPaymentModal from '@/components/common/RecordPaymentModal';
import retailersApi from '@/api/retailersApi';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import { RETAILER_ORDER_PAYMENT_CONFIG, WHOLESALER_RETAILER_ORDER_PAYMENT_CONFIG } from '@/hooks/useRecordPayment';
import type { RetailerOrder, RetailerOrderItem } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { balanceOf, formatKES, isPaid, orderRef, totalOf } from './primitives';
import { buildRetailerOrderInvoiceHtml, invoiceFilename } from './retailerOrderInvoice';

/** order.is_received defaults to "true" on the server, so use received_at / status. */
const isReceived = (o: RetailerOrder) => !!o.received_at || String(o.status || '').toUpperCase() === 'RECEIVED';
/** Set by the last delivery leg or collection with the delivery code (is_delivered can't be trusted). */
const isDelivered = (o: RetailerOrder) => !!o.delivered_at;
/** The retailer chose delivery (delivery_method COURIER); otherwise they collect it. */
const wantsDelivery = (o: RetailerOrder) => String((o as any).delivery_method || '').toUpperCase() === 'COURIER';
/** Pickup orders: receiving is the collection. Delivery orders: only once delivered. */
const canReceiveNow = (o: RetailerOrder) => !isReceived(o) && (!wantsDelivery(o) || isDelivered(o));

function confirmReceive(itemCount: number): Promise<boolean> {
    const title = 'Receive order into stock?';
    const message = `${itemCount} item${itemCount === 1 ? '' : 's'} will be added to your stock in the invoice quantities, with their batch and expiry. This can't be undone.`;
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) =>
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Receive', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) }),
    );
}

const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');
const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

interface Props {
    order: RetailerOrder | null;
    onClose?: () => void;
    onRefreshParentLedger: () => void;
    /** Whose screen this is (who the counterparty is, who pays and how). */
    viewer?: 'retailer' | 'wholesaler';
    /** Opens the full details (lifecycle, identifiers…). */
    onShowDetails?: () => void;
    /** Safe-area bottom padding when shown full screen. */
    bottomInset?: number;
}

/** Whether a successful payment has been recorded (server payment_summary). */
const hasSuccessfulPayment = (o: RetailerOrder) => {
    const summary = (o as any).payment_summary;
    if (summary && typeof summary.paid_total !== 'undefined') return Number(summary.paid_total) > 0;
    const method = o.payment_method_title;
    return !!method && method !== 'N/A';
};

export function RequisitionCart({ order, onClose, onRefreshParentLedger, viewer = 'retailer', onShowDetails, bottomInset = 0 }: Props) {
    const isWholesaler = viewer === 'wholesaler';
    const { theme, border, chipBg, divider } = useListTokens();
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const { applyServerOrder } = useRetailerOrdersSync();
    const [printing, setPrinting] = useState(false);
    const [printError, setPrintError] = useState<string | null>(null);
    const [receiving, setReceiving] = useState(false);
    const [receiveMsg, setReceiveMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        setIsPaymentOpen(false);
        setPrintError(null);
        setReceiveMsg(null);
    }, [order?.remote_id]);

    const receiveOrder = async () => {
        if (!order) return;
        if (!(await confirmReceive((order.order_items ?? []).length))) return;
        setReceiving(true);
        setReceiveMsg(null);
        try {
            const res: any = await retailersApi.retailStaffAction({ action: 'ReceiveRetailerOrder', retailer_order: order.remote_id });
            if (res?.ok && String(res.data?.response_code) === '0') {
                if (res.data?.retailer_order) await applyServerOrder(res.data.retailer_order);
                setReceiveMsg({ ok: true, text: 'Received. The items are now in your stock.' });
            } else {
                const errs = res?.data?.errors;
                setReceiveMsg({ ok: false, text: (Array.isArray(errs) && errs.length ? errs.join(' ') : res?.data?.response_message) || 'Could not receive the order.' });
                // e.g. "already received": the screen was out of date.
                onRefreshParentLedger();
            }
        } catch (e: any) {
            setReceiveMsg({ ok: false, text: e?.message || 'Could not reach the server.' });
        } finally {
            setReceiving(false);
        }
    };

    const printInvoice = async () => {
        if (!order) return;
        setPrinting(true);
        setPrintError(null);
        try {
            await exportToPdf({ html: buildRetailerOrderInvoiceHtml(order), filename: invoiceFilename(order) });
        } catch (e: any) {
            setPrintError(e?.message || 'Could not create the invoice PDF.');
        } finally {
            setPrinting(false);
        }
    };

    if (!order) {
        return (
            <View className="flex-1 items-center justify-center p-8" style={{ gap: 10 }}>
                <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                    <Ionicons name="receipt-outline" size={26} color={theme.primary} />
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{isWholesaler ? 'No order selected' : 'No requisition selected'}</Text>
                <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    {isWholesaler ? 'Pick an order from the list to see its items and payment.' : 'Pick a requisition from the list to see its items and pay for it.'}
                </Text>
            </View>
        );
    }

    const paid = isPaid(order);
    const items = order.order_items ?? [];
    const ref = orderRef(order);
    const total = totalOf(order);
    const balance = balanceOf(order);
    const gross = num(order.order_gross_price_total);
    const discount = num(order.order_discount_total);
    const shipping = num(order.shipping_amount);
    const status = (order.status || '').toUpperCase();
    const settled = paid && hasSuccessfulPayment(order);
    // Wholesaler staff can retry while unpaid or with no successful payment.
    const canPay = status !== 'CANCELLED' && (isWholesaler ? !settled : !paid);
    // delivery_method: "COURIER" = delivery chosen, "SELF" = pickup, blank = not chosen yet.
    const deliveryChosen = !!String((order as any).delivery_method || '').trim();
    const paymentStarted = Number((order as any).payment_summary?.paid_total || 0) > 0;
    const counterparty = isWholesaler ? order.retailer_title || 'Retailer order' : order.wholesaler_title || 'Wholesaler order';

    return (
        <View className="flex-1">
            {/* Header */}
            <View className="flex-row items-center gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: border }}>
                <InitialsAvatar name={counterparty} size={40} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>
                        {counterparty}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                        Ref {ref} · {formatDateTime(order.created)}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                        <AdminBadgePill badge={(isWholesaler ? settled : paid) ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Unpaid', tone: 'warning', icon: 'alert-circle' }} />
                        {status ? <AdminBadgePill badge={{ label: titleCase(status), tone: status === 'DELIVERED' || status === 'COMPLETED' ? 'success' : 'info' }} /> : null}
                    </View>
                </View>
                {onShowDetails ? (
                    <Pressable onPress={onShowDetails} hitSlop={8} accessibilityRole="button" accessibilityLabel="Order details" className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: chipBg }}>
                        <Ionicons name="information-circle-outline" size={17} color={theme.text} />
                    </Pressable>
                ) : null}
                {onClose ? (
                    <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close order" className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: chipBg }}>
                        <Ionicons name="close" size={16} color={theme.text} />
                    </Pressable>
                ) : null}
            </View>

            {/* Items */}
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 8 }} showsVerticalScrollIndicator={false}>
                <View className="flex-row items-center justify-between mb-1">
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>
                        {items.length} ITEM{items.length === 1 ? '' : 'S'}
                    </Text>
                    {(isWholesaler ? order.owner_title : order.retailer_title) ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                            Ordered by {isWholesaler ? order.owner_title : order.retailer_title}
                        </Text>
                    ) : null}
                </View>
                {items.length === 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No items on this order.</Text>
                ) : (
                    items.map((item, idx) => <LineItem key={item.remote_id ?? String(idx)} item={item} />)
                )}

                {/* Delivery: the buyer chooses before paying; then both sides track it. */}
                {!isWholesaler && canPay ? (
                    <View className="mt-3">
                        <DeliveryOptionsPicker order={order} editable={!paymentStarted} />
                    </View>
                ) : null}
                {wantsDelivery(order) && (isWholesaler || !canPay) ? (
                    <View className="mt-3" style={{ gap: 6 }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>DELIVERY</Text>
                        <ShipmentTracker link={{ retailer_order: order.remote_id }} version={`${order.updated}|${order.delivered_at ?? ''}`} viewer={viewer} paid={paid} onOrderChanged={onRefreshParentLedger} />
                    </View>
                ) : null}
                {!wantsDelivery(order) && String((order as any).delivery_method || '').toUpperCase() === 'SELF' ? (
                    <Text className="mt-3" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {isWholesaler ? 'The retailer will collect this order.' : `You'll collect this order from ${order.wholesaler_title || 'the wholesaler'}.`}
                    </Text>
                ) : null}
            </ScrollView>

            {/* Pinned footer: invoice + payment */}
            <View className="px-4 pt-3" style={{ paddingBottom: 16 + bottomInset, borderTopWidth: 1, borderTopColor: border, gap: 6, backgroundColor: theme.panel }}>
                <Row label="Items" value={`KES ${formatKES(gross || num(order.final_price_total))}`} />
                {discount > 0 ? <Row label="Discounts" value={`− KES ${formatKES(discount)}`} color="#10b981" /> : null}
                {shipping > 0 ? <Row label="Shipping" value={`KES ${formatKES(shipping)}`} /> : null}
                <View className="flex-row items-end justify-between pt-2 mt-1" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>TOTAL</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>KES {formatKES(total)}</Text>
                </View>
                {!canPay && status === 'CANCELLED' && !paid ? (
                    <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 mt-1" style={{ backgroundColor: '#f43f5e14' }}>
                        <Ionicons name="close-circle" size={16} color="#f43f5e" />
                        <Text style={{ color: '#f43f5e', fontFamily: theme.font.bold, fontSize: 13 }}>Cancelled — no payment due</Text>
                    </View>
                ) : !canPay ? (
                    <>
                    <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 mt-1" style={{ backgroundColor: '#10b98114' }}>
                        <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                        <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 13 }}>
                            Paid{order.payment_method_title && order.payment_method_title !== 'N/A' ? ` · ${order.payment_method_title}` : ''}
                        </Text>
                    </View>
                    {isReceived(order) ? (
                        <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: `${theme.primary}12` }}>
                            <Ionicons name="cube" size={16} color={theme.primary} />
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13, flexShrink: 1 }}>
                                {isWholesaler ? 'Received by the retailer' : 'Received into stock'}
                                {order.received_at ? ` · ${formatDateTime(order.received_at)}` : ''}
                            </Text>
                        </View>
                    ) : wantsDelivery(order) && !isDelivered(order) ? (
                        <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: '#f59e0b14' }}>
                            <Ionicons name="bicycle-outline" size={16} color="#f59e0b" />
                            <Text style={{ color: '#b45309', fontFamily: theme.font.bold, fontSize: 13, flexShrink: 1 }}>
                                {isWholesaler ? 'Not delivered yet' : 'Awaiting delivery — receive it once it arrives'}
                            </Text>
                        </View>
                    ) : null}
                    {/* Paid: the invoice replaces the payment button */}
                    <View className="mt-1 flex-row gap-2">
                        <View style={{ flex: 1 }}>
                            <SheetButton
                                label={!isWholesaler && canReceiveNow(order) ? 'Invoice (PDF)' : 'Print / share invoice (PDF)'}
                                icon="document-text-outline"
                                variant={!isWholesaler && canReceiveNow(order) ? 'ghost' : undefined}
                                onPress={printInvoice}
                                loading={printing}
                                grow
                            />
                        </View>
                        {!isWholesaler && canReceiveNow(order) ? (
                            <View style={{ flex: 1 }}>
                                <SheetButton label="Receive into stock" icon="download-outline" onPress={receiveOrder} loading={receiving} grow />
                            </View>
                        ) : null}
                    </View>
                    {printError ? (
                        <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12, textAlign: 'center' }}>{printError}</Text>
                    ) : null}
                    {receiveMsg ? (
                        <Text style={{ color: receiveMsg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12, textAlign: 'center' }}>{receiveMsg.text}</Text>
                    ) : null}
                    </>
                ) : (
                    <>
                        <Row label="Balance due" value={`KES ${formatKES(balance)}`} color={balance > 0 ? '#f43f5e' : undefined} bold />
                        <View className="mt-1">
                            <SheetButton
                                label={`${isWholesaler ? 'Retry payment' : 'Pay'} · KES ${formatKES(balance > 0 ? balance : total)}`}
                                icon={isWholesaler ? 'refresh' : 'card-outline'}
                                onPress={() => setIsPaymentOpen(true)}
                                disabled={!isWholesaler && !deliveryChosen}
                                grow
                            />
                            {!isWholesaler && !deliveryChosen ? (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>
                                    Choose delivery or pickup above to pay.
                                </Text>
                            ) : null}
                            {isWholesaler ? (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>
                                    Mobile money prompts the retailer's phone; cash or credit is recorded as paid.
                                </Text>
                            ) : null}
                        </View>
                    </>
                )}
            </View>

            <RecordPaymentModal
                isOpen={isPaymentOpen}
                orderId={order.remote_id}
                orderRef={ref}
                config={isWholesaler ? WHOLESALER_RETAILER_ORDER_PAYMENT_CONFIG : RETAILER_ORDER_PAYMENT_CONFIG}
                onClose={() => setIsPaymentOpen(false)}
                onRefreshParentLedger={onRefreshParentLedger}
                onOrderUpdated={applyServerOrder}
            />
        </View>
    );
}

function LineItem({ item }: { item: RetailerOrderItem }) {
    const { theme, chipBg } = useListTokens();
    const qty = num(item.purchased_quantity);
    const bonus = num(item.discount_quantity);
    const lineTotal = num(item.item_final_price_total ?? item.item_price_total);
    const unit = num(item.item_final_price ?? item.item_price) || (qty ? lineTotal / qty : 0);
    return (
        <View className="rounded-2xl p-3" style={{ backgroundColor: chipBg, gap: 6 }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{item.product_title || 'Item'}</Text>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                Batch {item.batch || '—'} · Expires {item.expiry_date || '—'}
            </Text>
            <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2 flex-wrap flex-shrink">
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {qty.toLocaleString()} × KES {formatKES(unit)}
                    </Text>
                    {bonus > 0 ? <AdminBadgePill badge={{ label: `+${bonus.toLocaleString()} free`, tone: 'success' }} /> : null}
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>KES {formatKES(lineTotal)}</Text>
            </View>
        </View>
    );
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
    const { theme } = useListTokens();
    return (
        <View className="flex-row justify-between">
            <Text style={{ color: theme.textDark, fontFamily: bold ? theme.font.bold : theme.font.medium, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
}
