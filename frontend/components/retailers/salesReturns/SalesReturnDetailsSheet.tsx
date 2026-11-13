// components/retailers/salesReturns/SalesReturnDetailsSheet.tsx
//
// Read-only details for a sales return, with Edit / Delete.

import { AdminDetailsSheet, SheetButton, formatDateTime, textOr, useSheetIsWide } from '@/components/common/listScreen';
import React from 'react';

import { isUnsynced, returnQty } from './salesReturnsConfig';
import type { SalesReturn } from './SalesReturnsList';

export function SalesReturnDetailsSheet({
    item: r,
    onClose,
    onEdit,
    onDelete,
}: {
    item: SalesReturn | null;
    onClose: () => void;
    onEdit: (r: SalesReturn) => void;
    onDelete: (r: SalesReturn) => void;
}) {
    const wide = useSheetIsWide();
    return (
        <AdminDetailsSheet
            visible={!!r}
            onClose={onClose}
            heading="Sales return"
            icon="return-up-back-outline"
            title={textOr(r?.retailer_receipt_title, 'Unknown item')}
            subtitle={r?.customer_order_number ? `Order ${r.customer_order_number}` : 'Customer return'}
            avatar={{ icon: 'return-up-back-outline', color: '#0ea5e9' }}
            badges={r && isUnsynced(r) ? [{ label: 'Not uploaded', tone: 'info', icon: 'cloud-upload-outline' }] : []}
            stats={r ? [{ label: 'Units returned', value: returnQty(r).toLocaleString() }, { label: 'Order', value: textOr(r.customer_order_number) }] : []}
            sections={[
                { title: 'Justification', icon: 'chatbox-ellipses-outline', fields: [{ label: 'Why', value: textOr(r?.justification, ''), full: true }] },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Recorded', value: formatDateTime(r?.created) },
                        { label: 'Last updated', value: formatDateTime(r?.updated) },
                    ],
                },
            ]}
            actions={r ? <SheetButton label="Delete" icon="trash-outline" variant="danger" onPress={() => (onClose(), onDelete(r))} grow={!wide} /> : null}
            onEdit={r ? () => (onClose(), onEdit(r)) : undefined}
            editLabel="Edit"
        />
    );
}
