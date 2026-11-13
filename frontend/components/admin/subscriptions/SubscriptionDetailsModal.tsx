// components/admin/subscriptions/SubscriptionDetailsModal.tsx
//
// Read-only details for a subscription.

import { AdminDetailsSheet, formatDate, textOr } from '@/components/admin/kit';
import type { SubscriptionNormalized } from '@/databases/types';

import { daysLeft, subscriptionBadges } from './subscriptionsConfig';

interface Props {
    item: SubscriptionNormalized | null;
    onClose: () => void;
}

export function SubscriptionDetailsModal({ item: s, onClose }: Props) {
    const left = s ? daysLeft(s) : null;
    return (
        <AdminDetailsSheet
            visible={!!s}
            onClose={onClose}
            heading="Subscription details"
            icon="card-outline"
            title={textOr(s?.entity_title, 'Subscription')}
            subtitle={textOr(s?.type, 'Plan')}
            avatar={{ icon: 'card-outline', color: s?.isActive ? '#10b981' : '#64748b' }}
            badges={s ? subscriptionBadges(s) : []}
            stats={[
                { label: 'Duration', value: `${s?.months ?? 0} ${s?.months === 1 ? 'month' : 'months'}` },
                { label: s?.isActive ? 'Days left' : 'Status', value: s?.isActive ? String(Math.max(0, left ?? 0)) : 'Expired', color: s?.isActive && left !== null && left <= 7 ? '#f59e0b' : undefined },
            ]}
            sections={[
                {
                    title: 'Period',
                    icon: 'calendar-outline',
                    fields: [
                        { label: 'Starts', value: formatDate(s?.startDate) },
                        { label: 'Ends', value: formatDate(s?.endDate) },
                        { label: 'Created', value: formatDate(s?.created) },
                    ],
                },
            ]}
        />
    );
}
