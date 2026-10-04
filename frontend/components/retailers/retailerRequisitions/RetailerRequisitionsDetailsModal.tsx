// components/retailers/retailerRequisitions/RetailerRequisitionsDetailsModal.tsx
//
// Read-only invoice for a single retailer order.

import RecordPaymentModal from '@/components/common/RecordPaymentModal';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import type {
    RetailerOrder,
    RetailerOrderItem,
} from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useState,
} from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import {
    PaymentPill,
    formatKES,
    isPaid,
    orderRef,
    type RequisitionsDetailsModalProps,
} from './primitives';

/* =========================================================
 * Constants
 * ======================================================= */

const PRINT_TOAST_MS = 1800;

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerRequisitionsDetailsModal({
    order,
    visible,
    onClose,
    onRefreshParentLedger,
}: RequisitionsDetailsModalProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [showPrintToast, setShowPrintToast] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setIsPaymentOpen(false);
        setShowPrintToast(false);
    }, [visible, order?.remote_id]);

    useEffect(() => {
        if (!showPrintToast) return;
        const id = setTimeout(
            () => setShowPrintToast(false),
            PRINT_TOAST_MS
        );
        return () => clearTimeout(id);
    }, [showPrintToast]);

    const onPrint = useCallback(() => setShowPrintToast(true), []);

    const onOpenPayment = useCallback(
        () => setIsPaymentOpen(true),
        []
    );

    const onClosePayment = useCallback(() => {
        setIsPaymentOpen(false);
        onClose();
    }, [onClose]);

    if (!order) return null;

    const paid = isPaid(order);
    const items = order.order_items ?? [];
    const ref = orderRef(order);

    return (
        <>
            <Modal
                visible={visible && !isPaymentOpen}
                transparent
                animationType="fade"
                onRequestClose={onClose}
            >
                <View className="flex-1 bg-black/50 justify-center items-center p-4">
                    <View
                        className="w-full max-w-2xl rounded-2xl overflow-hidden flex-col"
                        style={{
                            backgroundColor: theme.panel,
                            maxHeight: '85%',
                        }}
                    >
                        {/* ============ Header ============ */}
                        <View
                            className="px-5 py-3.5 border-b flex-row justify-between items-center"
                            style={{
                                backgroundColor: subBg,
                                borderBottomColor: borderColor,
                            }}
                        >
                            <View className="flex-1 min-w-0 pr-3">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.lg,
                                    }}
                                >
                                    Invoice details
                                </Text>
                                <Text
                                    className="uppercase mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.mono,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                    numberOfLines={1}
                                >
                                    Ref: {ref}
                                </Text>
                            </View>

                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Close invoice"
                                className="w-8 h-8 rounded-full items-center justify-center"
                                style={{
                                    backgroundColor:
                                        theme.background,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        {/* ============ Body ============ */}
                        <ScrollView
                            className="flex-1"
                            contentContainerStyle={{ padding: 20 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <View className="flex-row flex-wrap justify-between gap-4 mb-4">
                                <MetaCell
                                    label="Vendor supplier"
                                    value={
                                        order.wholesaler_title ?? '—'
                                    }
                                    theme={theme}
                                />
                                <MetaCell
                                    label="Retailer client"
                                    value={
                                        order.retailer_title ?? '—'
                                    }
                                    theme={theme}
                                />
                                <MetaCell
                                    label="Creation timeline"
                                    value={order.created ?? '—'}
                                    theme={theme}
                                    mono
                                />
                                <MetaCell
                                    label="Settlement condition"
                                    value={
                                        paid
                                            ? 'Settled ✓'
                                            : 'Unpaid balance'
                                    }
                                    theme={theme}
                                    tone={
                                        paid
                                            ? 'positive'
                                            : 'negative'
                                    }
                                />
                            </View>

                            <View
                                className="flex-row items-center justify-between mb-2 pb-1 border-b"
                                style={{
                                    borderBottomColor: borderColor,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wider"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Itemized line entries ledger
                                </Text>
                                <PaymentPill paid={paid} compact />
                            </View>

                            {items.length === 0 ? (
                                <Text
                                    className="py-4 text-center"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    No line items on this order.
                                </Text>
                            ) : (
                                items.map((item, idx) => (
                                    <LineItem
                                        key={
                                            item.remote_id ??
                                            String(idx)
                                        }
                                        item={item}
                                        theme={theme}
                                        borderColor={borderColor}
                                    />
                                ))
                            )}

                            <Totals
                                order={order}
                                theme={theme}
                                borderColor={borderColor}
                            />

                            {showPrintToast ? (
                                <View
                                    className="rounded-xl px-3 py-2.5 mt-4"
                                    style={{
                                        backgroundColor:
                                            'rgba(59,130,246,0.12)',
                                        borderWidth: 1,
                                        borderColor:
                                            'rgba(59,130,246,0.35)',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: '#1d4ed8',
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.xs,
                                        }}
                                    >
                                        Compiling print stream…
                                    </Text>
                                </View>
                            ) : null}
                        </ScrollView>

                        {/* ============ Footer ============ */}
                        <View
                            className="p-4 border-t flex-row items-center gap-2"
                            style={{
                                backgroundColor: subBg,
                                borderTopColor: borderColor,
                            }}
                        >
                            <Pressable
                                onPress={onPrint}
                                accessibilityRole="button"
                                accessibilityLabel="Print PDF"
                                className="flex-1 h-10 rounded-xl border items-center justify-center"
                                style={{
                                    borderColor:
                                        'rgba(59,130,246,0.30)',
                                    backgroundColor:
                                        'rgba(59,130,246,0.05)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#2563eb',
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    🖨️ Print PDF
                                </Text>
                            </Pressable>

                            {!paid ? (
                                <Pressable
                                    onPress={onOpenPayment}
                                    accessibilityRole="button"
                                    accessibilityLabel="Make payment"
                                    className="flex-1 h-10 rounded-xl items-center justify-center"
                                    style={{
                                        backgroundColor:
                                            theme.primary,
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-wider text-white"
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        Make payment
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                </View>
            </Modal>

            <RecordPaymentModal
                isOpen={isPaymentOpen}
                orderId={order.remote_id}
                orderRef={ref}
                onClose={onClosePayment}
                onRefreshParentLedger={onRefreshParentLedger}
            />
        </>
    );
}

/* =========================================================
 * Sub-components
 * ======================================================= */

function MetaCell({
    label,
    value,
    theme,
    mono = false,
    tone = 'neutral',
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    mono?: boolean;
    tone?: 'neutral' | 'positive' | 'negative';
}) {
    const valueColor =
        tone === 'positive'
            ? '#10b981'
            : tone === 'negative'
                ? '#f43f5e'
                : theme.text;

    return (
        <View style={{ width: '45%' }}>
            <Text
                className="uppercase"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.xs,
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                style={{
                    color: valueColor,
                    fontFamily: mono
                        ? theme.font.mono
                        : theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}

function LineItem({
    item,
    theme,
    borderColor,
}: {
    item: RetailerOrderItem;
    theme: ThemeShape;
    borderColor: string;
}) {
    const purchased = Number(item.purchased_quantity) || 0;
    const bonus = Number(item.discount_quantity) || 0;

    return (
        <View
            className="py-2.5 border-b last:border-b-0 flex-row justify-between items-center"
            style={{ borderBottomColor: borderColor }}
        >
            <View className="flex-1 pr-3 min-w-0">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                    }}
                    numberOfLines={1}
                >
                    {item.product_title || 'Line entry'}
                </Text>
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: theme.fontSize.xs,
                    }}
                    numberOfLines={1}
                >
                    Batch: {item.batch || 'N/A'} · Expiry:{' '}
                    {item.expiry_date || 'N/A'}
                </Text>
            </View>

            <View className="items-end pl-2">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.mono,
                        fontSize: theme.fontSize.sm,
                    }}
                >
                    Qty: {purchased} U
                </Text>
                <Text
                    className="mt-0.5"
                    style={{
                        color: '#10b981',
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.xs,
                    }}
                >
                    Bonus: +{bonus} U
                </Text>
            </View>
        </View>
    );
}

function Totals({
    order,
    theme,
    borderColor,
}: {
    order: RetailerOrder;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="mt-5 p-3 rounded-xl border"
            style={{
                backgroundColor: theme.background,
                borderColor,
            }}
        >
            <TotalRow
                label="Order base price total"
                value={`KES ${formatKES(
                    order.order_gross_price_total
                )}`}
                theme={theme}
            />
            <TotalRow
                label="Order discounts apportioned"
                value={`- KES ${formatKES(
                    order.order_discount_total
                )}`}
                theme={theme}
                tone="negative"
            />
            <TotalRow
                label="Logistics shipping amount"
                value={`KES ${formatKES(order.shipping_amount)}`}
                theme={theme}
            />

            <View
                className="flex-row justify-between pt-2 mt-1 border-t"
                style={{ borderTopColor: borderColor }}
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.sm,
                    }}
                >
                    Net invoice final total
                </Text>
                <Text
                    style={{
                        color: '#10b981',
                        fontFamily: theme.font.mono,
                        fontSize: theme.fontSize.base,
                    }}
                >
                    KES {formatKES(order.final_price_total)}
                </Text>
            </View>
        </View>
    );
}

function TotalRow({
    label,
    value,
    theme,
    tone = 'neutral',
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    tone?: 'neutral' | 'negative';
}) {
    return (
        <View className="flex-row justify-between py-0.5">
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color:
                        tone === 'negative'
                            ? '#f43f5e'
                            : theme.text,
                    fontFamily: theme.font.mono,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {value}
            </Text>
        </View>
    );
}