// components/wholesalers/orders/retailerOrdersConfig.tsx
//
// How a retailer order (a requisition a retailer sent to this wholesaler)
// shows in the wholesaler's list: cards on phones, a table on wide screens
// (shared AdminListView).

import { AdminBadgePill, CellText, formatDate, textOr, type AdminBadge, type AdminListConfig, type BadgeTone } from '@/components/common/listScreen';
import type { RetailerOrder } from '@/databases/types';
import React from 'react';
import { Text } from 'react-native';

import { balanceOf, formatKES, isPaid, orderItemCount, orderRef, totalOf } from '@/components/retailers/retailerRequisitions/primitives';

/** RetailerOrders.ORDER_STATUS_CHOICES (backend wholesalers/models.py). */
export const ORDER_STATUSES = ['SUBMITTED', 'PROCESSING', 'DISPATCHED', 'RECEIVED', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const STATUS_META: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
    SUBMITTED: { label: 'Submitted', tone: 'info' },
    PROCESSING: { label: 'Processing', tone: 'violet' },
    DISPATCHED: { label: 'Dispatched', tone: 'primary' },
    RECEIVED: { label: 'Received', tone: 'success' },
    COMPLETED: { label: 'Completed', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export const statusLabel = (s: string) => STATUS_META[s as OrderStatus]?.label ?? (s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Unknown');

export function statusBadge(o: RetailerOrder): AdminBadge {
    const s = String(o.status || '').toUpperCase();
    return { label: statusLabel(s), tone: STATUS_META[s as OrderStatus]?.tone ?? 'neutral' };
}

export function paymentBadge(o: RetailerOrder): AdminBadge {
    if (isPaid(o)) return { label: 'Paid', tone: 'success', icon: 'checkmark-circle' };
    const balance = balanceOf(o);
    const total = totalOf(o);
    return balance > 0 && balance < total
        ? { label: 'Part paid', tone: 'warning', icon: 'time-outline' }
        : { label: 'Unpaid', tone: 'warning', icon: 'alert-circle' };
}

/** delivery_method: "COURIER" = delivery, "SELF" = retailer collects, blank = not chosen yet. */
export function deliveryBadge(o: RetailerOrder): AdminBadge {
    const m = String((o as any).delivery_method || '').toUpperCase();
    if (m === 'COURIER') return { label: 'Delivery', tone: 'primary', icon: 'bicycle-outline' };
    if (m === 'SELF') return { label: 'Pickup', tone: 'neutral', icon: 'storefront-outline' };
    return { label: 'Not chosen', tone: 'neutral', icon: 'help-circle-outline' };
}

const kes = (n: number) => `KES ${formatKES(n)}`;

export const retailerOrdersConfig: AdminListConfig<RetailerOrder> = {
    title: 'Retailer orders',
    noun: ['order', 'orders'],
    icon: 'receipt-outline',
    searchPlaceholder: 'Search reference, retailer, payment…',
    emptyTitle: 'No retailer orders yet',
    emptyMessage: 'Orders retailers send you from their indents appear here.',
    keyOf: (o, i) => `${o.remote_id || o.draft_id || 'order'}-${i}`,
    titleOf: (o) => textOr(o.retailer_title, 'Unknown retailer'),
    subtitleOf: (o) => {
        const n = orderItemCount(o);
        return `${orderRef(o)} · ${n} item${n === 1 ? '' : 's'}`;
    },
    avatarOf: (o) => ({ label: o.retailer_title || orderRef(o) }),
    badgesOf: (o) => [statusBadge(o), paymentBadge(o), deliveryBadge(o)],
    metaOf: (o) => (o.created ? formatDate(o.created) : null),
    metaIcon: 'calendar-outline',
    metricOf: (o) => ({ value: kes(totalOf(o)), label: isPaid(o) ? 'Paid' : `Due ${kes(balanceOf(o))}`, color: isPaid(o) ? '#10b981' : undefined }),
    primaryColumn: { label: 'Retailer', flex: 2.4 },
    columns: [
        { key: 'ref', label: 'Reference', flex: 1.6, render: (o) => <CellText strong>{orderRef(o)}</CellText> },
        { key: 'items', label: 'Items', flex: 0.6, align: 'center', render: (o) => String(orderItemCount(o)) },
        { key: 'status', label: 'Status', flex: 1.2, render: (o) => <AdminBadgePill badge={statusBadge(o)} /> },
        { key: 'payment', label: 'Payment', flex: 1.1, render: (o) => <AdminBadgePill badge={paymentBadge(o)} /> },
        { key: 'delivery', label: 'Delivery', flex: 1.1, render: (o) => <AdminBadgePill badge={deliveryBadge(o)} /> },
        {
            key: 'balance',
            label: 'Balance',
            flex: 1.1,
            align: 'right',
            render: (o) => {
                const b = balanceOf(o);
                return <Text style={{ color: b > 0 ? '#f43f5e' : '#10b981', fontWeight: '700', fontSize: 13, textAlign: 'right' }}>{kes(b)}</Text>;
            },
        },
        { key: 'total', label: 'Total', flex: 1.1, align: 'right', render: (o) => <CellText strong align="right">{kes(totalOf(o))}</CellText> },
        { key: 'created', label: 'Created', flex: 1.1, render: (o) => formatDate(o.created) },
    ],
};
