// components/retailers/purchasesReturns/purchasesReturnsConfig.tsx
//
// How a purchases return (stock sent back to a wholesaler) is shown in lists and details.
// Returns are created from Stock adjustments (decrease + "Wholesaler return").

import { CellText, formatDate, formatDateTime, textOr, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';

import type { PurchasesReturn } from './RetailerPurchasesReturnsList';

export const RETURN_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

const STATUS_BADGE: Record<ReturnStatus, AdminBadge> = {
    PENDING: { label: 'Awaiting wholesaler', tone: 'warning', icon: 'time-outline' },
    ACCEPTED: { label: 'Accepted', tone: 'success', icon: 'checkmark-circle' },
    REJECTED: { label: 'Rejected', tone: 'danger', icon: 'close-circle' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const STATUS_COLOR: Record<ReturnStatus, string> = { PENDING: '#f59e0b', ACCEPTED: '#10b981', REJECTED: '#f43f5e', CANCELLED: '#64748b' };

export function statusBadge(r: PurchasesReturn): AdminBadge {
    return STATUS_BADGE[r.status as ReturnStatus] ?? { label: textOr(r.status_display || r.status, 'Unknown'), tone: 'neutral' };
}

export function formatKES(raw: string | number | null | undefined): string {
    const n = Number(raw ?? 0);
    return `KES ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const reasonLabel = (r: PurchasesReturn) => textOr(r.reason_display || r.reason, '');

export const purchasesReturnsConfig: AdminListConfig<PurchasesReturn> = {
    title: 'Purchases returns',
    noun: ['return', 'returns'],
    icon: 'return-down-back-outline',
    searchPlaceholder: 'Search product, wholesaler, reason…',
    addLabel: 'New return',
    emptyMessage: 'Send stock back to a wholesaler from Stock adjustments: decrease the item and pick “Wholesaler return”.',
    keyOf: (r, i) => `${r.id || 'return'}-${i}`,
    titleOf: (r) => textOr(r.product_title, 'Unknown product'),
    subtitleOf: (r) => [textOr(r.wholesaler_title, ''), reasonLabel(r)].filter(Boolean).join(' · ') || null,
    avatarOf: (r) => ({ icon: 'return-down-back-outline', color: STATUS_COLOR[r.status as ReturnStatus] ?? '#64748b' }),
    badgesOf: (r) => [statusBadge(r)],
    metricOf: (r) => ({ value: Number(r.quantity ?? 0).toLocaleString(), label: 'units' }),
    metaOf: (r) => formatDate(r.created),
    primaryColumn: { label: 'Product', flex: 2.6 },
    columns: [
        { key: 'wholesaler', label: 'Wholesaler', flex: 1.6, render: (r) => textOr(r.wholesaler_title) },
        {
            key: 'qty',
            label: 'Qty',
            flex: 0.7,
            align: 'right',
            render: (r) => (
                <CellText strong align="right">
                    {Number(r.quantity ?? 0).toLocaleString()}
                </CellText>
            ),
        },
        {
            key: 'refund',
            label: 'Refund',
            flex: 1.2,
            align: 'right',
            render: (r) => (
                <CellText strong align="right">
                    {r.total_refund_amount ? formatKES(r.total_refund_amount) : '—'}
                </CellText>
            ),
        },
        { key: 'status', label: 'Status', flex: 1.4, render: (r) => <CellText strong>{statusBadge(r).label}</CellText> },
        { key: 'date', label: 'Date', flex: 1.3, render: (r) => formatDateTime(r.created) },
    ],
};
