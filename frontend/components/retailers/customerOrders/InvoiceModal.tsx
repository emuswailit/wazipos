// components/retailers/customerOrders/InvoiceModal.tsx
//
// Customer order details + invoice on the shared details sheet (bottom sheet on
// phones, centred card on wide screens). Used by both the web table and the
// phone cards: totals, credit reminder, details, items, Print and Make payment.

import { AdminDetailsSheet, SheetButton, useListTokens, useSheetIsWide, webPointer } from '@/components/common/listScreen';
import RecordPaymentModal, { CUSTOMER_ORDER_PAYMENT_CONFIG } from '@/components/common/RecordPaymentModal';
import type { CustomerOrder } from '@/databases/types';
import { printHtmlDocument } from '@/services/printHtml';
import { isTrueFlag } from '@/utils/flags';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { CreditReminderPanel, isUnpaidCredit, serverOrderId } from './CreditReminderPanel';
import { formatDate, formatKES, orderAmount, orderItemCount, orderRef } from './CustomerOrdersWebView';
import { buildCustomerOrderInvoiceHtml } from './invoiceHtml';

interface InvoiceModalProps {
    order: CustomerOrder | null;
    onClose: () => void;
    onRefresh?: () => void;
}

const num = (v: any): number => {
    const n = parseFloat(String(v ?? ''));
    return isNaN(n) ? 0 : n;
};

const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

function cleanCustomerName(name?: string | null): string {
    if (!name) return 'Walk-in customer';
    return (
        name
            .replace(/\d+/g, '')
            .trim()
            .split(/\s+/)
            .filter((w) => w.toUpperCase() !== 'TEST')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ') || name
    );
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, onClose, onRefresh }) => {
    const wide = useSheetIsWide();
    const [isPayOpen, setIsPayOpen] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [printError, setPrintError] = useState<string | null>(null);

    const orderKey = order?.remote_id || order?.draft_id || '';
    useEffect(() => {
        setIsPayOpen(false);
        setPrintError(null);
    }, [orderKey]);

    const customerName = useMemo(() => cleanCustomerName(order?.customer_name), [order?.customer_name]);

    if (!order) {
        return <AdminDetailsSheet visible={false} onClose={onClose} heading="" icon="receipt-outline" title="" sections={[]} />;
    }

    const o: any = order;
    const paid = isTrueFlag(order.is_paid);
    const amount = orderAmount(order);
    const items: any[] = order.order_items ?? [];
    const itemCount = orderItemCount(order);
    const pendingUpload = String(o.synced).toUpperCase() === 'FALSE';
    const isCredit = String(order.selected_payment_method_title || '').toUpperCase() === 'CREDIT';
    // Unpaid credit orders show phone and due date in the CreditReminderPanel instead.
    const showCreditPanel = isUnpaidCredit(order);
    // Must be the server UUID: drafts have no items on the backend. WebSocket orders carry it in `id`.
    const remoteOrderId = serverOrderId(order) || order.draft_id || '';

    const handlePrint = async () => {
        if (printing) return;
        setPrinting(true);
        setPrintError(null);
        try {
            const html = buildCustomerOrderInvoiceHtml(order, { customerName });
            await printHtmlDocument(html, { title: `Invoice ${order.order_number || ''}`.trim() });
        } catch (e: any) {
            setPrintError(`Couldn't print the invoice: ${e?.message || 'unknown error'}`);
        } finally {
            setPrinting(false);
        }
    };

    const phone = order.customer_phone?.trim();
    const fields = [
        { label: 'Store', value: order.entity_title ?? '', icon: 'storefront-outline' as const },
        ...(!showCreditPanel && phone ? [{ label: 'Phone', value: <PhoneLink phone={phone} />, icon: 'call-outline' as const }] : []),
        { label: 'Payment method', value: order.selected_payment_method_title ?? '', icon: 'card-outline' as const },
        { label: 'Paying number', value: o.payment_account_number ?? '', mono: true },
        { label: 'Provider ref', value: order.provider_reference_number || o.psp_reference_number || '', mono: true },
        { label: 'Delivery', value: o.delivery_method ?? '' },
        { label: 'Created', value: formatDate(order.created) },
        paid
            ? { label: 'Paid on', value: o.paid_at ? formatDate(o.paid_at) : '' }
            : showCreditPanel
                ? null
                : { label: isCredit ? 'Credit due' : 'Due date', value: o.due_date ? formatDate(o.due_date) : '' },
    ].filter((f): f is NonNullable<typeof f> => !!f && (typeof f.value !== 'string' || (f.value.trim() !== '' && f.value !== '—')));

    return (
        <>
            <AdminDetailsSheet
                visible={!isPayOpen}
                onClose={onClose}
                heading="Customer order"
                icon="receipt-outline"
                title={customerName}
                subtitle={`${orderRef(order)} · ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                avatar={{ label: customerName }}
                badges={[
                    paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Unpaid', tone: 'danger', icon: 'alert-circle' },
                    ...(order.status ? [{ label: titleCase(order.status), tone: 'info' as const }] : []),
                    ...(pendingUpload ? [{ label: 'Waiting to upload', tone: 'warning' as const, icon: 'cloud-upload-outline' as const }] : []),
                ]}
                stats={[
                    { label: 'Total', value: `KES ${formatKES(amount)}`, color: paid ? '#10b981' : '#f43f5e' },
                    { label: 'Items', value: String(itemCount) },
                    { label: 'Method', value: order.selected_payment_method_title || '—' },
                ]}
                sections={[
                    ...(printError ? [{ title: 'Print', icon: 'print-outline' as const, children: <Notice text={printError} /> }] : []),
                    ...(showCreditPanel
                        ? [{ title: 'Credit', icon: 'time-outline' as const, children: <CreditReminderPanel key={orderKey} order={order} onChanged={onRefresh} /> }]
                        : []),
                    { title: 'Order', icon: 'document-text-outline', fields },
                    { title: `Items (${items.length})`, icon: 'cube-outline', children: <LineItems items={items} /> },
                    { title: 'Invoice', icon: 'receipt-outline', children: <Totals order={order} amount={amount} /> },
                ]}
                actions={
                    <>
                        <SheetButton label="Print" variant="secondary" icon="print-outline" onPress={handlePrint} loading={printing} loadingLabel="Preparing…" grow={!wide} />
                        {!paid ? <SheetButton label="Make payment" icon="wallet-outline" onPress={() => setIsPayOpen(true)} grow={!wide} /> : null}
                    </>
                }
            />

            <RecordPaymentModal
                isOpen={isPayOpen}
                orderId={remoteOrderId}
                orderRef={order.order_number}
                config={CUSTOMER_ORDER_PAYMENT_CONFIG}
                onClose={() => {
                    setIsPayOpen(false);
                    onClose();
                }}
                onRefreshParentLedger={onRefresh}
            />
        </>
    );
};

function PhoneLink({ phone }: { phone: string }) {
    const { theme } = useListTokens();
    return (
        <Pressable
            onPress={() => Linking.openURL(`tel:${phone}`).catch(() => { })}
            accessibilityRole="link"
            accessibilityLabel={`Call ${phone}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, ...webPointer }}
        >
            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 14 }}>{phone}</Text>
            <Ionicons name="call" size={13} color={theme.primary} />
        </Pressable>
    );
}

function Notice({ text }: { text: string }) {
    const { theme } = useListTokens();
    return (
        <View style={{ borderRadius: 14, padding: 12, backgroundColor: 'rgba(244,63,94,0.08)' }}>
            <Text style={{ color: '#e11d48', fontFamily: theme.font.medium, fontSize: 13 }}>{text}</Text>
        </View>
    );
}

function LineItems({ items }: { items: any[] }) {
    const { theme, chipBg } = useListTokens();
    if (items.length === 0) {
        return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No item details available.</Text>;
    }
    return (
        <View style={{ gap: 8 }}>
            {items.map((it, i) => {
                const qty = num(it.purchased_quantity) || 1;
                const lineTotal = num(it.item_price_total) || num(it.final_unit_selling_price ?? it.unit_selling_price) * qty;
                const unit = qty ? lineTotal / qty : 0;
                return (
                    <View key={it.id || String(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, backgroundColor: chipBg }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>
                                {it.title || it.receipt_details?.product_title || 'Product'}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }}>
                                {qty.toLocaleString()} × KES {formatKES(unit)}
                            </Text>
                        </View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>KES {formatKES(lineTotal)}</Text>
                    </View>
                );
            })}
        </View>
    );
}

function Totals({ order, amount }: { order: CustomerOrder; amount: number }) {
    const { theme, chipBg, divider } = useListTokens();
    const o: any = order;
    const discount = num(o.order_price_discount_total);
    const shipping = num(o.shipping_cost);
    return (
        <View style={{ borderRadius: 16, padding: 14, gap: 6, backgroundColor: chipBg }}>
            {discount > 0 ? <TotalRow label="Discount" value={`− KES ${formatKES(discount)}`} color="#10b981" /> : null}
            {shipping > 0 ? <TotalRow label="Shipping" value={`KES ${formatKES(shipping)}`} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: discount > 0 || shipping > 0 ? 8 : 0, borderTopWidth: discount > 0 || shipping > 0 ? 1 : 0, borderTopColor: divider }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Total due</Text>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 16 }}>KES {formatKES(amount)}</Text>
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
