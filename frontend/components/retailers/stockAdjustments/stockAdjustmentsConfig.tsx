// components/retailers/stockAdjustments/stockAdjustmentsConfig.tsx
//
// How a stock adjustment is shown in the list (cards + table) and details.

import { CellText, formatDate, formatDateTime, textOr, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';

import type { StockAdjustment } from './StockAdjustmentsList';

export const isIncrement = (a: StockAdjustment) => a.direction === 'INCREMENT';
const adjustmentQty = (a: StockAdjustment) => {
    const n = Number(a.quantity ?? 0);
    return Number.isFinite(n) ? n : 0;
};
export const signedQty = (a: StockAdjustment) => `${isIncrement(a) ? '+' : '−'}${adjustmentQty(a).toLocaleString()}`;
export const directionColor = (a: StockAdjustment) => (isIncrement(a) ? '#10b981' : '#f43f5e');

const INTENT_LABELS: Record<string, string> = {
    WHOLESALER_RETURN: 'Wholesaler return',
    CUSTOMER_RETURN: 'Customer return',
    EXPIRY_WRITE_OFF: 'Expiry write-off',
    DAMAGE_WRITE_OFF: 'Damage write-off',
    INTERNAL_CORRECTION: 'Internal correction',
};

export const intentLabel = (a: StockAdjustment) => (a.return_intent && a.return_intent !== 'NONE' ? a.return_intent_display || INTENT_LABELS[a.return_intent] || a.return_intent : '');

export function adjustmentBadges(a: StockAdjustment): AdminBadge[] {
    const badges: AdminBadge[] = [isIncrement(a) ? { label: 'Stock in', tone: 'success', icon: 'arrow-up' } : { label: 'Stock out', tone: 'danger', icon: 'arrow-down' }];
    const intent = intentLabel(a);
    if (intent) badges.push({ label: intent, tone: 'violet' });
    if (a.linked_return_status) badges.push({ label: `Return ${a.linked_return_status.toLowerCase()}`, tone: 'info' });
    return badges;
}

export const stockAdjustmentsConfig: AdminListConfig<StockAdjustment> = {
    title: 'Stock adjustments',
    noun: ['adjustment', 'adjustments'],
    icon: 'swap-vertical-outline',
    searchPlaceholder: 'Search item, reason…',
    addLabel: 'New adjustment',
    emptyMessage: 'Correct stock counts after a stock take, breakage, expiry or return.',
    keyOf: (a, i) => `${a.id || 'adj'}-${i}`,
    titleOf: (a) => textOr(a.retailer_receipt_title, 'Unknown item'),
    subtitleOf: (a) => textOr(a.justification, '') || null,
    avatarOf: (a) => ({ icon: isIncrement(a) ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline', color: directionColor(a) }),
    badgesOf: adjustmentBadges,
    metricOf: (a) => ({ value: signedQty(a), label: 'units', color: directionColor(a) }),
    metaOf: (a) => formatDate(a.created),
    primaryColumn: { label: 'Item', flex: 3 },
    columns: [
        {
            key: 'qty',
            label: 'Quantity',
            flex: 1,
            align: 'right',
            render: (a) => (
                <CellText strong align="right">
                    {signedQty(a)}
                </CellText>
            ),
        },
        { key: 'intent', label: 'Reason', flex: 1.6, render: (a) => intentLabel(a) || 'Correction' },
        { key: 'date', label: 'Date', flex: 1.4, render: (a) => formatDateTime(a.created) },
    ],
};
