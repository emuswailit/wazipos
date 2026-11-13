// components/admin/subscriptions/subscriptionsConfig.tsx
//
// How a subscription is shown in the admin list.

import { CellText, formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import type { SubscriptionNormalized } from '@/databases/types';

export function daysLeft(s: SubscriptionNormalized): number | null {
    const end = new Date(String(s.endDate ?? '').replace(' ', 'T'));
    if (isNaN(end.getTime())) return null;
    return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

export function subscriptionBadges(s: SubscriptionNormalized): AdminBadge[] {
    if (!s.isActive) return [{ label: 'Expired', tone: 'neutral' }];
    const d = daysLeft(s);
    return [d !== null && d <= 7 ? { label: d <= 0 ? 'Ends today' : `${d} days left`, tone: 'warning' } : { label: 'Active', tone: 'success' }];
}

export const subscriptionsConfig: AdminListConfig<SubscriptionNormalized> = {
    title: 'Subscriptions',
    noun: ['subscription', 'subscriptions'],
    icon: 'card-outline',
    searchPlaceholder: 'Search entity or plan…',
    addLabel: 'Renew',
    emptyMessage: 'Renew to keep your entity active on the platform.',
    keyOf: (s, i) => `${s.id || 'sub'}-${i}`,
    titleOf: (s) => textOr(s.entity_title, 'Subscription'),
    subtitleOf: (s) => `${textOr(s.type, 'Plan')} · ${formatDate(s.startDate)} → ${formatDate(s.endDate)}`,
    avatarOf: (s) => ({ icon: 'card-outline', color: s.isActive ? '#10b981' : '#64748b' }),
    badgesOf: subscriptionBadges,
    metricOf: (s) => ({ value: String(s.months ?? 0), label: s.months === 1 ? 'month' : 'months' }),
    metaOf: (s) => `Ends ${formatDate(s.endDate)}`,
    metaIcon: 'hourglass-outline',
    primaryColumn: { label: 'Entity', flex: 2.4 },
    columns: [
        { key: 'plan', label: 'Plan', flex: 1.2, render: (s) => <CellText strong>{textOr(s.type)}</CellText> },
        { key: 'months', label: 'Months', flex: 0.8, align: 'right', render: (s) => <CellText align="right">{s.months ?? '—'}</CellText> },
        { key: 'start', label: 'Starts', flex: 1.1, render: (s) => formatDate(s.startDate) },
        { key: 'end', label: 'Ends', flex: 1.1, render: (s) => formatDate(s.endDate) },
        {
            key: 'status',
            label: 'Status',
            flex: 1.1,
            render: (s) => {
                const b = subscriptionBadges(s)[0];
                return <CellText strong>{b.label}</CellText>;
            },
        },
    ],
};
