// components/retailers/retailerIndents/indentsConfig.tsx
//
// How a retailer indent (a purchase plan built from wholesaler offers) is shown
// in lists and details. Helpers are shared by the list views and the details sheet.

import { CellText, formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import type { RetailerIndent } from '@/databases/types';
import React from 'react';

export const toBool = (v: any): boolean => v === true || v === 'true' || v === 1 || v === '1';

/** Draft indents (not yet on the server) use `<userId>:<entityId>:<ts>` ids (see RetailerIndentsSyncContext). */
export const isDraftIndent = (i: RetailerIndent): boolean => typeof i.remote_id === 'string' && i.remote_id.includes(':');

export const indentKey = (i: RetailerIndent): string => i.remote_id || String(i.id ?? '');

export const indentTitle = (i: RetailerIndent): string => i.indent_number || (isDraftIndent(i) ? 'Draft indent' : `Indent ${String(i.remote_id ?? '').slice(0, 8)}`);

export function formatKES(raw: string | number | null | undefined): string {
    const n = Number(raw ?? 0);
    return `KES ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export const hasBudgetSet = (i: RetailerIndent): boolean => {
    if (i.budget_amount === null || i.budget_amount === undefined) return false;
    const n = Number(String(i.budget_amount).trim());
    return Number.isFinite(n) && n > 0;
};

export const budgetPct = (i: RetailerIndent): number | null => {
    if (!hasBudgetSet(i)) return null;
    const total = Number(i.total_cost || 0);
    return Number.isFinite(total) ? (total / Number(i.budget_amount)) * 100 : null;
};

export const isOverBudget = (i: RetailerIndent): boolean => {
    if (toBool(i.over_budget)) return true;
    return hasBudgetSet(i) && Number(i.total_cost || 0) > Number(i.budget_amount);
};

const indentItemCount = (i: RetailerIndent): number =>
    typeof i.active_item_count === 'number' && i.active_item_count > 0 ? i.active_item_count : (i.retailer_indent_items?.length ?? 0);

export const campaignTitleOf = (i: RetailerIndent): string => String((i as any).campaign_title ?? '');

export function indentBadges(i: RetailerIndent): AdminBadge[] {
    const badges: AdminBadge[] = [toBool(i.is_open) ? { label: 'Open', tone: 'success', icon: 'ellipse' } : { label: 'Closed', tone: 'neutral' }];
    if (isDraftIndent(i)) badges.push({ label: 'Draft', tone: 'warning', icon: 'cloud-upload-outline' });
    if (isOverBudget(i)) badges.push({ label: 'Over budget', tone: 'danger', icon: 'alert-circle' });
    return badges;
}

export type IndentFilter = 'ALL' | 'OPEN' | 'OVER_BUDGET' | 'DRAFTS';

export const indentsConfig: AdminListConfig<RetailerIndent> = {
    title: 'Indents',
    noun: ['indent', 'indents'],
    icon: 'document-text-outline',
    searchPlaceholder: 'Search indent, branch, product, wholesaler…',
    emptyTitle: 'No indents yet',
    emptyMessage: 'Indents are created when you add wholesaler offers from the marketplace or from stock-outs.',
    keyOf: (i, idx) => `${indentKey(i) || 'indent'}-${idx}`,
    titleOf: indentTitle,
    subtitleOf: (i) => [textOr(i.entity_title, ''), campaignTitleOf(i)].filter(Boolean).join(' · ') || null,
    avatarOf: (i) => ({ icon: 'document-text-outline', color: isOverBudget(i) ? '#f43f5e' : toBool(i.is_open) ? '#10b981' : '#64748b' }),
    badgesOf: indentBadges,
    metricOf: (i) => ({ value: formatKES(i.total_cost), label: `${indentItemCount(i)} item${indentItemCount(i) === 1 ? '' : 's'}` }),
    metaOf: (i) => formatDate(i.created),
    metaIcon: 'calendar-outline',
    primaryColumn: { label: 'Indent', flex: 1.8 },
    columns: [
        { key: 'campaign', label: 'Campaign', flex: 1.3, render: (i) => textOr(campaignTitleOf(i)) },
        {
            key: 'items',
            label: 'Items',
            flex: 0.6,
            align: 'right',
            render: (i) => (
                <CellText strong align="right">
                    {indentItemCount(i).toLocaleString()}
                </CellText>
            ),
        },
        { key: 'lead', label: 'Lead', flex: 0.6, align: 'right', render: (i) => <CellText align="right">{`${i.lead_time ?? 0}d`}</CellText> },
        {
            key: 'total',
            label: 'Total cost',
            flex: 1.2,
            align: 'right',
            render: (i) => (
                <CellText strong align="right">
                    {formatKES(i.total_cost)}
                </CellText>
            ),
        },
        {
            key: 'profit',
            label: 'Profit',
            flex: 1.1,
            align: 'right',
            render: (i) => (
                <CellText strong align="right">
                    {formatKES(i.total_profit)}
                </CellText>
            ),
        },
        {
            key: 'budget',
            label: 'Budget',
            flex: 0.8,
            align: 'right',
            render: (i) => {
                const pct = budgetPct(i);
                return <CellText align="right">{pct === null ? 'None' : `${pct.toFixed(0)}%`}</CellText>;
            },
        },
        { key: 'created', label: 'Created', flex: 1, render: (i) => formatDate(i.created) },
    ],
};
