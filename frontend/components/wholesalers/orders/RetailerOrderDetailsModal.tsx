// components/wholesalers/orders/RetailerOrderDetailsModal.tsx

import { useAuth } from '@/context/AuthContext';
import type {
    RetailerOrder,
    RetailerOrderItem,
} from '@/databases/types';
import React, { useMemo, useState } from 'react';
import {
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

/* =========================================================
 * Props
 * ======================================================= */
interface Props {
    visible: boolean;
    order: RetailerOrder | null;
    onClose: () => void;
}

/* =========================================================
 * Modal
 * ======================================================= */
export function RetailerOrderDetailsModal({
    visible,
    order,
    onClose,
}: Props) {
    const { theme, isDarkMode } = useAuth();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [showAllItems, setShowAllItems] = useState(false);

    /* -------- Derived -------- */
    const status = String(order?.status ?? '').toUpperCase();
    const statusTint = useMemo(() => {
        if (status === 'DELIVERED') return '#10b981';
        if (status === 'CANCELLED') return '#ef4444';
        if (status === 'DRAFT') return '#f59e0b';
        if (status === 'APPROVED') return '#0ea5e9';
        return theme.primary;
    }, [status, theme.primary]);

    const items = order?.order_items ?? [];
    const visibleItems = showAllItems
        ? items
        : items.slice(0, 5);

    if (!order) return null;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[900px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* ============================================
                     * Header
                     * ============================================ */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-1 min-w-0 pr-3">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                                numberOfLines={1}
                            >
                                {order.reference_number ||
                                    order.document_number_display ||
                                    'Order'}
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.mono,
                                    fontSize: theme.fontSize.xs,
                                }}
                                numberOfLines={1}
                            >
                                {order.retailer_title}
                                {order.wholesaler_title
                                    ? ` → ${order.wholesaler_title}`
                                    : ''}
                                {' · '}
                                {order.created}
                            </Text>
                        </View>

                        <View className="flex-row items-center gap-2">
                            <View
                                className="px-2.5 py-1 rounded-md"
                                style={{
                                    backgroundColor: `${statusTint}20`,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: statusTint,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {status}
                                </Text>
                            </View>
                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                className="p-1.5"
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.base,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* ============================================
                     * Body
                     * ============================================ */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {/* -------- Summary -------- */}
                        <SectionTitle label="Summary" />
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Total"
                                value={`KES ${Number(
                                    order.final_price_total ?? 0
                                ).toFixed(2)}`}
                            />
                            <SummaryCell
                                label="Items"
                                value={String(
                                    items.length
                                )}
                            />
                            <SummaryCell
                                label="Payment"
                                value={
                                    order.payment_method_title ||
                                    '—'
                                }
                            />
                            <SummaryCell
                                label="Terms"
                                value={order.order_terms || '—'}
                            />
                            <SummaryCell
                                label="Origin"
                                value={order.order_origin || '—'}
                            />
                            {order.owner_title ? (
                                <SummaryCell
                                    label="Created by"
                                    value={order.owner_title}
                                />
                            ) : null}
                        </View>

                        {/* -------- Payment summary -------- */}
                        <SectionTitle label="Payment" />
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Paid"
                                value={`KES ${Number(
                                    order.payment_summary
                                        ?.paid_total ?? 0
                                ).toFixed(2)}`}
                            />
                            <SummaryCell
                                label="Balance due"
                                value={`KES ${Number(
                                    order.payment_summary
                                        ?.balance_due ?? 0
                                ).toFixed(2)}`}
                            />
                            <SummaryCell
                                label="Settled"
                                value={
                                    order.payment_summary
                                        ?.is_paid
                                        ? 'Yes'
                                        : 'No'
                                }
                            />
                            {order.psp_reference_number ? (
                                <SummaryCell
                                    label="PSP ref"
                                    value={
                                        order.psp_reference_number
                                    }
                                />
                            ) : null}
                            {order.telco ? (
                                <SummaryCell
                                    label="Telco"
                                    value={order.telco}
                                />
                            ) : null}
                        </View>

                        {/* -------- Lifecycle -------- */}
                        <SectionTitle label="Lifecycle" />
                        <View className="flex-row flex-wrap gap-2 mb-4">
                            {order.is_processed === 'true' ? (
                                <MiniBadge
                                    label="Processed"
                                    tone="success"
                                />
                            ) : null}
                            {order.is_packed === 'true' ? (
                                <MiniBadge
                                    label="Packed"
                                    tone="success"
                                />
                            ) : null}
                            {order.is_dispatched === 'true' ? (
                                <MiniBadge
                                    label="Dispatched"
                                    tone="success"
                                />
                            ) : null}
                            {order.is_delivered === 'true' ? (
                                <MiniBadge
                                    label="Delivered"
                                    tone="success"
                                />
                            ) : null}
                            {order.is_approved === 'true' ? (
                                <MiniBadge
                                    label="Approved"
                                    tone="success"
                                />
                            ) : null}
                            {order.is_paid === 'true' ? (
                                <MiniBadge
                                    label="Paid"
                                    tone="success"
                                />
                            ) : null}
                            {order.is_committed === 'true' ? (
                                <MiniBadge
                                    label="Committed"
                                    tone="warning"
                                />
                            ) : null}
                        </View>

                        {/* -------- Items -------- */}
                        <View className="flex-row items-center justify-between mb-2">
                            <SectionTitle
                                label={`Items (${items.length})`}
                                inline
                            />
                            {items.length > 5 ? (
                                <Pressable
                                    onPress={() =>
                                        setShowAllItems(
                                            (v) => !v
                                        )
                                    }
                                >
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: theme.primary,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 10,
                                        }}
                                    >
                                        {showAllItems
                                            ? 'Collapse'
                                            : `Show all (${items.length})`}
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>

                        {items.length === 0 ? (
                            <EmptyBlock message="No items on this order." />
                        ) : (
                            visibleItems.map((item) => (
                                <OrderItemRow
                                    key={item.id}
                                    item={item}
                                    subBg={subBg}
                                    borderColor={borderColor}
                                />
                            ))
                        )}

                        {/* -------- Notes -------- */}
                        {order.description ? (
                            <>
                                <SectionTitle label="Notes" />
                                <View
                                    className="rounded-xl p-3 mb-4"
                                    style={{ backgroundColor: subBg }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        {order.description}
                                    </Text>
                                </View>
                            </>
                        ) : null}

                        {/* -------- Identifiers -------- */}
                        <SectionTitle label="Identifiers" />
                        <View
                            className="rounded-xl p-3 mb-2"
                            style={{ backgroundColor: subBg }}
                        >
                            <KeyValue
                                label="Remote ID"
                                value={order.remote_id}
                                mono
                            />
                            <KeyValue
                                label="Draft ID"
                                value={order.draft_id}
                                mono
                            />
                            {order.reference_number ? (
                                <KeyValue
                                    label="Reference"
                                    value={
                                        order.reference_number
                                    }
                                    mono
                                />
                            ) : null}
                            {order.document_number ? (
                                <KeyValue
                                    label="Document"
                                    value={
                                        order.document_number
                                    }
                                    mono
                                />
                            ) : null}
                        </View>
                    </ScrollView>

                    {/* ============================================
                     * Footer
                     * ============================================ */}
                    <View
                        className="flex-row justify-end p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                Close
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Item row
 * ======================================================= */
function OrderItemRow({
    item,
    subBg,
    borderColor,
}: {
    item: RetailerOrderItem;
    subBg: string;
    borderColor: string;
}) {
    const { theme, isDarkMode } = useAuth();

    const thumbnail = item.images?.[0]?.thumbnail
        ? `https://api.wazipos.co.ke${item.images[0].thumbnail}`
        : null;

    const unitPrice = Number(item.item_price ?? 0);
    const lineTotal = Number(
        item.item_price_total ?? 0
    );

    return (
        <View
            className="rounded-xl border p-3 mb-2"
            style={{ backgroundColor: subBg, borderColor }}
        >
            <View className="flex-row items-center gap-3">
                {/* Thumbnail */}
                <View
                    className="rounded-lg overflow-hidden"
                    style={{
                        width: 40,
                        height: 40,
                        backgroundColor: isDarkMode
                            ? '#1e293b'
                            : '#e2e8f0',
                    }}
                >
                    {thumbnail ? (
                        <Image
                            source={{ uri: thumbnail }}
                            style={{
                                width: '100%',
                                height: '100%',
                            }}
                            resizeMode="cover"
                        />
                    ) : null}
                </View>

                {/* Title + meta */}
                <View className="flex-1 min-w-0">
                    <Text
                        numberOfLines={1}
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 13,
                        }}
                    >
                        {item.product_title ||
                            item.title ||
                            '—'}
                    </Text>
                    <View className="flex-row flex-wrap gap-2 mt-[2px]">
                        {item.batch ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.mono,
                                    fontSize: 10,
                                }}
                            >
                                Batch {item.batch}
                            </Text>
                        ) : null}
                        {item.expiry_date ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.mono,
                                    fontSize: 10,
                                }}
                            >
                                Exp {item.expiry_date}
                            </Text>
                        ) : null}
                    </View>
                </View>

                {/* Quantity + totals */}
                <View className="items-end">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 13,
                        }}
                    >
                        {item.purchased_quantity} × KES{' '}
                        {unitPrice.toFixed(2)}
                    </Text>
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                            marginTop: 1,
                        }}
                    >
                        KES {lineTotal.toFixed(2)}
                    </Text>
                </View>
            </View>
        </View>
    );
}

/* =========================================================
 * Small pieces
 * ======================================================= */
function SectionTitle({
    label,
    inline,
}: {
    label: string;
    inline?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <Text
            className="uppercase tracking-widest mb-2"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
                marginTop: inline ? 0 : 8,
            }}
        >
            {label}
        </Text>
    );
}

function SummaryCell({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    const { theme } = useAuth();
    return (
        <View style={{ minWidth: 100 }}>
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                numberOfLines={1}
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function KeyValue({
    label,
    value,
    mono,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <View className="flex-row items-center justify-between mb-1">
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            <Text
                numberOfLines={1}
                style={{
                    color: theme.text,
                    fontFamily: mono
                        ? theme.font.mono
                        : theme.font.medium,
                    fontSize: 11,
                    flexShrink: 1,
                    marginLeft: 12,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function MiniBadge({
    label,
    tone = 'default',
}: {
    label: string;
    tone?: 'default' | 'success' | 'warning';
}) {
    const { theme, isDarkMode } = useAuth();

    const bg =
        tone === 'success'
            ? 'rgba(16,185,129,0.15)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.15)'
                : isDarkMode
                    ? '#0f172a'
                    : '#f8fafc';
    const border =
        tone === 'success'
            ? 'rgba(16,185,129,0.3)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.3)'
                : isDarkMode
                    ? '#334155'
                    : '#e2e8f0';
    const color =
        tone === 'success'
            ? '#10b981'
            : tone === 'warning'
                ? '#f59e0b'
                : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{ backgroundColor: bg, borderColor: border }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function EmptyBlock({ message }: { message: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            className="rounded-xl p-4 items-center mb-3"
            style={{
                backgroundColor: isDarkMode
                    ? '#0f172a'
                    : '#f8fafc',
            }}
        >
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {message}
            </Text>
        </View>
    );
}