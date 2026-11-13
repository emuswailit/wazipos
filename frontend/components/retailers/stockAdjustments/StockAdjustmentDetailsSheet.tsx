// components/retailers/stockAdjustments/StockAdjustmentDetailsSheet.tsx
//
// Read-only details for a stock adjustment, with Edit / Delete.

import { AdminDetailsSheet, SheetButton, formatDateTime, textOr, useSheetIsWide } from '@/components/common/listScreen';
import React from 'react';

import { adjustmentBadges, directionColor, intentLabel, isIncrement, signedQty } from './stockAdjustmentsConfig';
import type { StockAdjustment } from './StockAdjustmentsList';

export function StockAdjustmentDetailsSheet({
    item: a,
    onClose,
    onEdit,
    onDelete,
}: {
    item: StockAdjustment | null;
    onClose: () => void;
    onEdit: (a: StockAdjustment) => void;
    onDelete: (a: StockAdjustment) => void;
}) {
    const wide = useSheetIsWide();
    return (
        <AdminDetailsSheet
            visible={!!a}
            onClose={onClose}
            heading="Stock adjustment"
            icon="swap-vertical-outline"
            title={textOr(a?.retailer_receipt_title, 'Unknown item')}
            subtitle={a ? (isIncrement(a) ? 'Stock added' : 'Stock removed') : ''}
            avatar={a ? { icon: isIncrement(a) ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline', color: directionColor(a) } : undefined}
            badges={a ? adjustmentBadges(a) : []}
            stats={a ? [{ label: 'Quantity', value: `${signedQty(a)} units`, color: directionColor(a) }, { label: 'Reason', value: intentLabel(a) || 'Correction' }] : []}
            sections={[
                { title: 'Justification', icon: 'chatbox-ellipses-outline', fields: [{ label: 'Why', value: textOr(a?.justification, ''), full: true }] },
                ...(a?.linked_return_status
                    ? [{ title: 'Linked return', icon: 'return-down-back-outline' as const, fields: [{ label: 'Status', value: textOr(a.linked_return_status, '') }] }]
                    : []),
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Recorded', value: formatDateTime(a?.created) },
                        { label: 'Last updated', value: formatDateTime(a?.updated) },
                    ],
                },
            ]}
            actions={a ? <SheetButton label="Delete" icon="trash-outline" variant="danger" onPress={() => (onClose(), onDelete(a))} grow={!wide} /> : null}
            onEdit={a ? () => (onClose(), onEdit(a)) : undefined}
            editLabel="Edit"
        />
    );
}
