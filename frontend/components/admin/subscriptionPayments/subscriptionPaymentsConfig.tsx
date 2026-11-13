// components/admin/subscriptionPayments/subscriptionPaymentsConfig.tsx
//
// How a subscription payment (M-Pesa charge) is shown in the admin list.

import { CellText, formatDateTime, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import type { SubscriptionPaymentNormalized } from '@/databases/types';

export function formatKES(amount: number | string | null | undefined): string {
    const n = Number(amount ?? 0);
    return `KES ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS: Record<string, AdminBadge> = {
    SUCCESS: { label: 'Paid', tone: 'success', icon: 'checkmark-circle' },
    PENDING: { label: 'Pending', tone: 'warning', icon: 'time-outline' },
    FAILED: { label: 'Failed', tone: 'danger', icon: 'close-circle' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const paymentBadge = (p: SubscriptionPaymentNormalized): AdminBadge => STATUS[p.status] ?? { label: p.status, tone: 'neutral' };

const STATUS_COLOR: Record<string, string> = { SUCCESS: '#10b981', PENDING: '#f59e0b', FAILED: '#f43f5e', CANCELLED: '#64748b' };

export const subscriptionPaymentsConfig: AdminListConfig<SubscriptionPaymentNormalized> = {
    title: 'Subscription payments',
    noun: ['payment', 'payments'],
    icon: 'receipt-outline',
    searchPlaceholder: 'Search reference or status…',
    emptyMessage: 'Payments appear here after a subscription renewal is charged.',
    keyOf: (p, i) => `${p.id || 'payment'}-${i}`,
    titleOf: (p) => textOr(p.reference_number, 'Payment'),
    subtitleOf: (p) => [textOr(p.entity_title, ''), textOr(p.description, '')].filter(Boolean).join(' · ') || null,
    avatarOf: (p) => ({ icon: 'receipt-outline', color: STATUS_COLOR[p.status] ?? '#64748b' }),
    badgesOf: (p) => [paymentBadge(p)],
    metricOf: (p) => ({ value: formatKES(p.amount), label: 'amount', color: p.status === 'SUCCESS' ? '#10b981' : undefined }),
    metaOf: (p) => formatDateTime(p.created),
    metaIcon: 'time-outline',
    primaryColumn: { label: 'Reference', flex: 2 },
    columns: [
        { key: 'status', label: 'Status', flex: 1, render: (p) => <CellText strong>{paymentBadge(p).label}</CellText> },
        { key: 'psp', label: 'M-Pesa ref', flex: 1.5, render: (p) => textOr(p.psp_reference_number) },
        { key: 'entity', label: 'Entity', flex: 1.6, render: (p) => textOr(p.entity_title) },
        { key: 'amount', label: 'Amount', flex: 1.2, align: 'right', render: (p) => <CellText strong align="right">{formatKES(p.amount)}</CellText> },
        { key: 'date', label: 'Date', flex: 1.5, render: (p) => formatDateTime(p.created) },
    ],
};
