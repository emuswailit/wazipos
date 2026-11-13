// components/retailers/salesReturns/salesReturnsConfig.tsx
//
// How a sales return (customer brought stock back) is shown in lists and details.

import { CellText, formatDate, formatDateTime, textOr, type AdminListConfig } from '@/components/common/listScreen';

import type { SalesReturn } from './SalesReturnsList';

export const returnQty = (r: SalesReturn) => {
    const n = Number(r.quantity ?? 0);
    return Number.isFinite(n) ? n : 0;
};

export const isUnsynced = (r: SalesReturn) => !!r.draft_id && !r.id;

export const salesReturnsConfig: AdminListConfig<SalesReturn> = {
    title: 'Sales returns',
    noun: ['return', 'returns'],
    icon: 'return-up-back-outline',
    searchPlaceholder: 'Search item, order #, reason…',
    addLabel: 'New return',
    emptyMessage: 'Record items customers bring back so stock and sales stay accurate.',
    keyOf: (r, i) => `${r.id || r.draft_id || 'ret'}-${i}`,
    titleOf: (r) => textOr(r.retailer_receipt_title, 'Unknown item'),
    subtitleOf: (r) => [r.customer_order_number ? `Order ${r.customer_order_number}` : '', textOr(r.justification, '')].filter(Boolean).join(' · ') || null,
    avatarOf: () => ({ icon: 'return-up-back-outline', color: '#0ea5e9' }),
    badgesOf: (r) => (isUnsynced(r) ? [{ label: 'Not uploaded', tone: 'info', icon: 'cloud-upload-outline' }] : []),
    metricOf: (r) => ({ value: returnQty(r).toLocaleString(), label: returnQty(r) === 1 ? 'unit' : 'units' }),
    metaOf: (r) => formatDate(r.created),
    primaryColumn: { label: 'Item', flex: 3 },
    columns: [
        { key: 'order', label: 'Order', flex: 1.3, render: (r) => textOr(r.customer_order_number) },
        {
            key: 'qty',
            label: 'Qty',
            flex: 0.8,
            align: 'right',
            render: (r) => (
                <CellText strong align="right">
                    {returnQty(r).toLocaleString()}
                </CellText>
            ),
        },
        { key: 'reason', label: 'Justification', flex: 2.2, render: (r) => textOr(r.justification) },
        { key: 'date', label: 'Date', flex: 1.4, render: (r) => formatDateTime(r.created) },
    ],
};
