// components/admin/subscriptions/SubscriptionMobileView.tsx
//
// Phones + narrow web: subscription cards (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { subscriptionsConfig } from './subscriptionsConfig';
import { subscriptionFilters, type SubscriptionViewProps } from './SubscriptionWebView';

export function SubscriptionMobileView(props: SubscriptionViewProps) {
    return <AdminListView {...props} variant="mobile" config={subscriptionsConfig} filters={subscriptionFilters(props)} />;
}

