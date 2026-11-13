// components/admin/subscriptions/SubscriptionWebView.tsx
//
// Wide screens: subscriptions table (see components/admin/kit).
// Also exports the view contract + helpers shared with the mobile view and modals.

import { AdminListView, type AdminFilters, type AdminStat } from '@/components/admin/kit';
import type { PageSize } from '@/components/common/PaginationBar';
import type { SubscriptionNormalized } from '@/databases/types';

import { subscriptionsConfig } from './subscriptionsConfig';

export interface SubscriptionCounts {
    total: number;
    active: number;
    expired: number;
}

export interface SubscriptionViewProps {
    query: string;
    setQuery: (v: string) => void;
    onlyActive: boolean;
    setOnlyActive: (fn: (v: boolean) => boolean) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    counts: SubscriptionCounts;
    items: SubscriptionNormalized[];
    onPressItem: (item: SubscriptionNormalized) => void;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

type Show = 'ALL' | 'ACTIVE';

export function subscriptionFilters({ onlyActive, setOnlyActive, counts }: SubscriptionViewProps): AdminFilters<Show> {
    return {
        options: [
            { key: 'ALL', label: 'All', icon: 'apps-outline' },
            { key: 'ACTIVE', label: 'Active', icon: 'checkmark-circle-outline', count: counts.active },
        ],
        value: onlyActive ? 'ACTIVE' : 'ALL',
        onChange: (k) => setOnlyActive(() => k === 'ACTIVE'),
        allKey: 'ALL',
    };
}

function subscriptionStats(counts: SubscriptionCounts): AdminStat[] {
    return [
        { label: 'Total', value: counts.total.toLocaleString() },
        { label: 'Active', value: counts.active.toLocaleString(), color: counts.active > 0 ? '#10b981' : undefined },
        { label: 'Expired', value: counts.expired.toLocaleString() },
    ];
}

export function SubscriptionWebView(props: SubscriptionViewProps) {
    return (
        <AdminListView
            {...props}
            variant="web"
            config={subscriptionsConfig}
            filters={subscriptionFilters(props)}
            stats={subscriptionStats(props.counts)}
        />
    );
}

