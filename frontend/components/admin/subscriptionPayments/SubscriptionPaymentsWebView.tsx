// components/admin/subscriptionPayments/SubscriptionPaymentsWebView.tsx
//
// Wide screens: subscription payments table (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';
import type { PageSize } from '@/components/common/PaginationBar';
import type { SubscriptionPaymentNormalized } from '@/databases/types';

import { subscriptionPaymentsConfig } from './subscriptionPaymentsConfig';

export interface SubscriptionPaymentsViewProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    items: SubscriptionPaymentNormalized[];
    onPressItem: (item: SubscriptionPaymentNormalized) => void;
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

export function SubscriptionPaymentsWebView(props: SubscriptionPaymentsViewProps) {
    return <AdminListView {...props} variant="web" config={subscriptionPaymentsConfig} />;
}

