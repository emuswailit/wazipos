// components/admin/subscriptionPayments/SubscriptionPaymentsDetailsModal.tsx
//
// Read-only details for a subscription payment.

import { AdminDetailsSheet, formatDateTime, textOr } from '@/components/admin/kit';
import type { SubscriptionPaymentNormalized } from '@/databases/types';

import { formatKES, paymentBadge } from './subscriptionPaymentsConfig';

interface Props {
    item: SubscriptionPaymentNormalized | null;
    onClose: () => void;
}

export function SubscriptionPaymentsDetailsModal({ item: p, onClose }: Props) {
    return (
        <AdminDetailsSheet
            visible={!!p}
            onClose={onClose}
            heading="Payment details"
            icon="receipt-outline"
            title={p ? formatKES(p.amount) : ''}
            subtitle={textOr(p?.entity_title, 'Subscription payment')}
            avatar={{ icon: 'receipt-outline', color: p?.status === 'SUCCESS' ? '#10b981' : p?.status === 'PENDING' ? '#f59e0b' : '#64748b' }}
            badges={p ? [paymentBadge(p)] : []}
            sections={[
                {
                    title: 'References',
                    icon: 'barcode-outline',
                    fields: [
                        { label: 'Reference', value: textOr(p?.reference_number, ''), mono: true },
                        { label: 'M-Pesa reference', value: textOr(p?.psp_reference_number, ''), mono: true },
                        { label: 'Provider reference', value: textOr(p?.provider_reference_number, ''), mono: true },
                        { label: 'Payment ID', value: textOr(p?.id, ''), mono: true, full: true },
                    ],
                },
                {
                    title: 'Payment',
                    icon: 'card-outline',
                    fields: [
                        { label: 'Description', value: textOr(p?.description, ''), full: true },
                        { label: 'Created', value: formatDateTime(p?.created) },
                        { label: 'Updated', value: formatDateTime(p?.updated) },
                    ],
                },
            ]}
        />
    );
}
