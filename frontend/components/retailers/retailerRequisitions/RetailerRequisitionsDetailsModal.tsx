// components/retailers/retailerRequisitions/RetailerRequisitionsDetailsModal.tsx
//
// Invoice for one requisition (order to a wholesaler), on the shared details sheet.
// "Make payment" opens RecordPaymentModal restricted to online methods — the
// requisitions flow does not allow recording offline payments.

import { AdminDetailsSheet, SheetButton, formatDateTime, textOr, useListTokens, useSheetIsWide } from '@/components/common/listScreen';
import RecordPaymentModal from '@/components/common/RecordPaymentModal';
import type { RetailerOrder, RetailerOrderItem } from '@/databases/types';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { balanceOf, formatKES, isPaid, orderRef, statusTint, totalOf, type RequisitionsDetailsModalProps } from './primitives';

const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

export function RetailerRequisitionsDetailsModal({ order, visible, onClose, onRefreshParentLedger }: RequisitionsDetailsModalProps) {
    const wide = useSheetIsWide();
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);

    useEffect(() => {
        if (visible) setIsPaymentOpen(false);
    }, [visible, order?.remote_id]);

    const onClosePayment = useCallback(() => {
        setIsPaymentOpen(false);
        onClose();
    }, [onClose]);

    if (!order) return null;

    const paid = isPaid(order);
    const items = order.order_items ?? [];
    const ref = orderRef(order);
    const total = totalOf(order);
    const balance = balanceOf(order);
    const tint = statusTint(order.status);

    return (
        <>
            <AdminDetailsSheet
                visible={visible && !isPaymentOpen}
                onClose={onClose}
                heading="Requisition"
                icon="cart-outline"
                title={textOr(order.wholesaler_title, 'Wholesaler order')}
                subtitle={`Ref ${ref}`}
                avatar={{ label: order.wholesaler_title ?? ref }}
                badges={[
                    paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Unpaid', tone: 'warning', icon: 'alert-circle' },
                    ...(order.status ? [{ label: titleCase(order.status), tone: tint.fg === '#10b981' ? ('success' as const) : ('info' as const) }] : []),
                ]}
                stats={[
                    { label: 'Total', value: `KES ${formatKES(total)}` },
                    { label: paid ? 'Paid' : 'Balance due', value: `KES ${formatKES(paid ? total : balance)}`, color: paid ? '#10b981' : balance > 0 ? '#f43f5e' : undefined },
                    { label: 'Items', value: String(items.length) },
                ]}
                sections={[
                    {
                        title: 'Order',
                        icon: 'storefront-outline',
                        fields: [
                            { label: 'Supplier', value: textOr(order.wholesaler_title, '') },
                            { label: 'Ordered by', value: textOr(order.retailer_title, '') },
                            { label: 'Created', value: formatDateTime(order.created) },
                            { label: 'Payment method', value: textOr((order as any).payment_method_title, '') },
                        ],
                    },
                    { title: `Items (${items.length})`, icon: 'cube-outline', children: <LineItems items={items} /> },
                    { title: 'Invoice', icon: 'receipt-outline', children: <Totals order={order} /> },
                ]}
                actions={!paid ? <SheetButton label="Make payment" icon="card-outline" onPress={() => setIsPaymentOpen(true)} grow={!wide} /> : null}
            />

            <RecordPaymentModal isOpen={isPaymentOpen} orderId={order.remote_id} orderRef={ref} onClose={onClosePayment} onRefreshParentLedger={onRefreshParentLedger} onlineOnly />
        </>
    );
}

function LineItems({ items }: { items: RetailerOrderItem[] }) {
    const { theme, chipBg } = useListTokens();
    if (items.length === 0) {
        return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No items on this order.</Text>;
    }
    return (
        <View style={{ gap: 8 }}>
            {items.map((item, idx) => {
                const qty = Number(item.purchased_quantity) || 0;
                const bonus = Number(item.discount_quantity) || 0;
                return (
                    <View key={item.remote_id ?? String(idx)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, backgroundColor: chipBg }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>
                                {item.product_title || 'Item'}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                Batch {item.batch || '—'} · Expires {item.expiry_date || '—'}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>×{qty.toLocaleString()}</Text>
                            {bonus > 0 ? <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 11.5 }}>+{bonus.toLocaleString()} free</Text> : null}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

function Totals({ order }: { order: RetailerOrder }) {
    const { theme, chipBg, divider } = useListTokens();
    const discount = Number(order.order_discount_total) || 0;
    const shipping = Number(order.shipping_amount) || 0;
    return (
        <View style={{ borderRadius: 16, padding: 14, gap: 6, backgroundColor: chipBg }}>
            <TotalRow label="Items" value={`KES ${formatKES(order.order_gross_price_total)}`} />
            {discount > 0 ? <TotalRow label="Discounts" value={`− KES ${formatKES(discount)}`} color="#10b981" /> : null}
            {shipping > 0 ? <TotalRow label="Shipping" value={`KES ${formatKES(shipping)}`} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: divider }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Total</Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>KES {formatKES(order.final_price_total)}</Text>
            </View>
        </View>
    );
}

function TotalRow({ label, value, color }: { label: string; value: string; color?: string }) {
    const { theme } = useListTokens();
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
}
