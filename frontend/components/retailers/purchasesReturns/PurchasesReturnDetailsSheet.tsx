// components/retailers/purchasesReturns/PurchasesReturnDetailsSheet.tsx
//
// Read-only details for a purchases return (stock sent back to a wholesaler).

import { AdminDetailsSheet, formatDateTime, textOr } from '@/components/common/listScreen';
import React from 'react';

import { STATUS_COLOR, formatKES, reasonLabel, statusBadge, type ReturnStatus } from './purchasesReturnsConfig';
import type { PurchasesReturn } from './RetailerPurchasesReturnsList';

const STATUS_NOTE: Record<ReturnStatus, string> = {
    PENDING: 'Waiting for the wholesaler to accept or reject this return.',
    ACCEPTED: 'The wholesaler accepted the return.',
    REJECTED: 'The wholesaler rejected the return.',
    CANCELLED: 'This return was cancelled.',
};

export function PurchasesReturnDetailsSheet({ item: r, onClose }: { item: PurchasesReturn | null; onClose: () => void }) {
    const status = (r?.status ?? 'PENDING') as ReturnStatus;
    return (
        <AdminDetailsSheet
            visible={!!r}
            onClose={onClose}
            heading="Purchases return"
            icon="return-down-back-outline"
            title={textOr(r?.product_title, 'Unknown product')}
            subtitle={r?.wholesaler_title ? `Back to ${r.wholesaler_title}` : 'Return to wholesaler'}
            avatar={{ icon: 'return-down-back-outline', color: STATUS_COLOR[status] ?? '#64748b' }}
            badges={r ? [statusBadge(r)] : []}
            stats={[
                { label: 'Units returned', value: Number(r?.quantity ?? 0).toLocaleString() },
                { label: 'Refund', value: r?.total_refund_amount ? formatKES(r.total_refund_amount) : '—', color: status === 'ACCEPTED' ? '#10b981' : undefined },
            ]}
            sections={[
                {
                    title: 'Status',
                    icon: 'flag-outline',
                    fields: [{ label: 'Where it stands', value: STATUS_NOTE[status] ?? textOr(r?.status_display, ''), full: true }],
                },
                {
                    title: 'Return',
                    icon: 'cube-outline',
                    fields: [
                        { label: 'Reason', value: r ? reasonLabel(r) : '' },
                        { label: 'Wholesaler', value: textOr(r?.wholesaler_title, '') },
                        { label: 'Reference', value: textOr(r?.id, ''), mono: true, full: true },
                    ],
                },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: formatDateTime(r?.created) },
                        { label: 'Last updated', value: formatDateTime(r?.updated) },
                    ],
                },
            ]}
        />
    );
}
