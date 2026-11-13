// components/admin/subscriptionPayments/SubscriptionPaymentsMobileView.tsx
//
// Phones + narrow web: payment cards (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { subscriptionPaymentsConfig } from './subscriptionPaymentsConfig';
import type { SubscriptionPaymentsViewProps } from './SubscriptionPaymentsWebView';

export function SubscriptionPaymentsMobileView(props: SubscriptionPaymentsViewProps) {
    return <AdminListView {...props} variant="mobile" config={subscriptionPaymentsConfig} />;
}

