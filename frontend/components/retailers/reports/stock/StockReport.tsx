// components/retailers/reports/stock/StockReport.tsx
//
// What's on the shelf: value at cost and retail, margin, slow movers and
// expiring lines, by category and per product. Kept on the device.

import retailersApi from '@/api/retailersApi';
import { AdminListView, ConfigDetailsSheet, DetailsDock, formatDate, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';

import { BreakdownCard, DaysChips, matches, money, num, pct, ReportHeader, shareRows, useReport, useVariant } from '../ReportKit';

/* ------------------------------------------------------------- types */

export interface StockKPI {
    sku_count: number;
    batch_count: number;
    total_units: number;
    cost_value: string;
    retail_value: string;
    potential_margin: string;
    margin_percent: string;
    dead_sku_count: number;
    expiring_within_30: number;
    already_expired: number;
    cost_basis_missing_count?: number;
}
export interface StockCategoryRow {
    category_id: string | null;
    category: string;
    sku_count: number;
    units: number;
    cost_value: string;
    retail_value: string;
    margin: string;
    margin_percent: string;
}
export interface StockProductRow {
    product_id: string;
    product_title: string;
    category_id: string | null;
    category: string;
    sub_category_id: string | null;
    sub_category: string;
    units: number;
    receipt_count: number;
    unit_cost: string;
    cost_value: string;
    retail_value: string;
    margin: string;
    margin_percent: string;
    nearest_expiry: string | null;
    days_to_expiry: number | null;
    last_sale: string | null;
    days_since_sale: number | null;
    is_dead: boolean;
    cost_basis_missing?: boolean;
}
export interface StockReportData {
    period: { as_of: string; dead_days: number };
    filters: { category: string | null; sub_category: string | null; search: string | null; dead_only: boolean; expiring_within: number | null };
    entity: { id: string; title: string };
    kpi: StockKPI;
    category_rollup: StockCategoryRow[];
    products: StockProductRow[];
}

/* ------------------------------------------------------------- list */

const expiringSoon = (p: StockProductRow) => p.days_to_expiry != null && p.days_to_expiry <= 30;

function badges(p: StockProductRow): AdminBadge[] {
    const out: AdminBadge[] = [];
    if (p.days_to_expiry != null && p.days_to_expiry < 0) out.push({ label: 'Expired stock', tone: 'danger', icon: 'alert-circle' });
    else if (expiringSoon(p)) out.push({ label: `Expires in ${p.days_to_expiry}d`, tone: 'warning', icon: 'time-outline' });
    if (p.is_dead) out.push({ label: 'Not selling', tone: 'neutral', icon: 'pause-circle-outline' });
    if (p.cost_basis_missing) out.push({ label: 'No cost price', tone: 'info' });
    return out;
}

const config: AdminListConfig<StockProductRow> = {
    title: 'Stock',
    noun: ['product', 'products'],
    icon: 'layers-outline',
    searchPlaceholder: 'Search products or categories…',
    emptyMessage: 'No stock on hand.',
    keyOf: (p) => p.product_id,
    titleOf: (p) => p.product_title,
    subtitleOf: (p) => [p.category, p.sub_category].filter(Boolean).join(' · ') || null,
    avatarOf: () => ({ icon: 'cube-outline' }),
    badgesOf: badges,
    metaOf: (p) => `${num(p.units)} units · ${p.last_sale ? `last sold ${formatDate(p.last_sale)}` : 'never sold'}`,
    metaIcon: 'layers-outline',
    metricOf: (p) => ({ value: money(p.retail_value), label: `${pct(p.margin_percent)} margin`, color: '#10b981' }),
    primaryColumn: { label: 'Product', flex: 2 },
    columns: [
        { key: 'cat', label: 'Category', flex: 1.2, render: (p) => p.category || '—' },
        { key: 'units', label: 'Units', flex: 0.6, align: 'right', render: (p) => num(p.units) },
        { key: 'cost', label: 'Cost value', flex: 1, align: 'right', render: (p) => money(p.cost_value) },
        { key: 'retail', label: 'Retail value', flex: 1, align: 'right', render: (p) => money(p.retail_value) },
        { key: 'margin', label: 'Margin', flex: 0.7, align: 'right', render: (p) => pct(p.margin_percent) },
        { key: 'exp', label: 'Nearest expiry', flex: 1, render: (p) => (p.nearest_expiry ? formatDate(p.nearest_expiry) : '—') },
    ],
};

type Filter = 'ALL' | 'DEAD' | 'EXPIRING' | 'NO_COST';

export default function StockReport() {
    const variant = useVariant();
    const [deadDays, setDeadDays] = useState(30);
    const r = useReport<StockReportData>(`stock:${deadDays}`, () => retailersApi.getStockReportAction({ dead_days: deadDays }));
    const rep = r.report;
    const k = rep?.kpi;

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [viewing, setViewing] = useState<StockProductRow | null>(null);
    const all = rep?.products ?? [];
    const rows = useMemo(
        () =>
            all
                .filter((p) => filter === 'ALL' || (filter === 'DEAD' ? p.is_dead : filter === 'EXPIRING' ? expiringSoon(p) : !!p.cost_basis_missing))
                .filter((p) => matches(query, p.product_title, p.category, p.sub_category))
                .sort((a, b) => Number(b.retail_value) - Number(a.retail_value)),
        [all, query, filter],
    );
    const paged = usePaged(rows, `${query}|${filter}|${deadDays}`);

    return (
        <DetailsDock placeholder="Pick a product to see its stock." pane={<ConfigDetailsSheet config={config} item={viewing} onClose={() => setViewing(null)} />}>
            <AdminListView<StockProductRow, Filter>
                variant={variant}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={r.refresh}
                refreshing={r.refreshing}
                sourceLabel={r.sourceLabel}
                sourceTone={r.source}
                lastSyncedTime={r.lastSynced}
                error={r.error}
                {...paged}
                onPressItem={setViewing}
                stats={[
                    { label: 'Cost value', value: money(k?.cost_value) },
                    { label: 'Retail value', value: money(k?.retail_value), color: '#10b981' },
                    { label: 'Margin', value: `${money(k?.potential_margin)} · ${pct(k?.margin_percent)}` },
                    { label: 'Units', value: num(k?.total_units) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: all.length },
                        { key: 'DEAD', label: 'Not selling', icon: 'pause-circle-outline', count: all.filter((p) => p.is_dead).length },
                        { key: 'EXPIRING', label: 'Expiring ≤30d', icon: 'time-outline', count: all.filter(expiringSoon).length },
                        { key: 'NO_COST', label: 'No cost price', icon: 'help-circle-outline', count: all.filter((p) => p.cost_basis_missing).length },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
                header={
                    <ReportHeader controls={<DaysChips label="Not selling if no sale in" value={deadDays} onChange={setDeadDays} options={[14, 30, 60, 90]} />}>
                        {rep ? (
                            <BreakdownCard
                                title="By category"
                                icon="grid-outline"
                                rows={shareRows(rep.category_rollup, (c) => Number(c.retail_value), (c) => ({ label: c.category || 'Uncategorised', value: money(c.retail_value), sub: `${c.sku_count} products · ${num(c.units)} units · ${pct(c.margin_percent)} margin` }))}
                            />
                        ) : null}
                    </ReportHeader>
                }
            />
        </DetailsDock>
    );
}
