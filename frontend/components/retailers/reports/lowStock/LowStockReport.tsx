// components/retailers/reports/lowStock/LowStockReport.tsx
//
// What to reorder: urgency, suggested quantities, the best wholesale offer for
// each product and the total by supplier. Kept on the device.

import retailersApi from '@/api/retailersApi';
import { AdminListView, ConfigDetailsSheet, DetailsDock, formatDate, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';

import { BreakdownCard, DaysChips, matches, money, num, ReportHeader, shareRows, useReport, useVariant } from '../ReportKit';

/* ------------------------------------------------------------- types */

export type LowStockUrgency = 'OUT' | 'CRITICAL' | 'WARNING' | 'SOON';

export interface LowStockKPI {
    reorder_count: number;
    out_of_stock_count: number;
    critical_count: number;
    warning_count: number;
    soon_count: number;
    estimated_total_units: number;
    estimated_total_cost: string;
    zero_velocity_count: number;
    products_with_offers: number;
    products_with_discounted_offers: number;
    products_with_cheaper_offer: number;
    estimated_savings_on_orders: string;
}
export interface LowStockUrgencyRow {
    key: LowStockUrgency;
    label: string;
    count: number;
    estimated_cost: string;
}
export interface LowStockCategoryRow {
    category_id: string | null;
    category: string;
    count: number;
    total_units: number;
    total_cost: string;
}
export interface LowStockPriceDiscount {
    id: string;
    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
}
export interface LowStockQuantityDiscount {
    id: string;
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
}
export interface LowStockOffer {
    receipt_id: string;
    product_id: string;
    wholesaler_id: string | null;
    wholesaler_title: string;
    batch: string;
    expiry_date: string | null;
    days_to_expiry: number | null;
    available_units: number;
    pack_size: number;
    unit_price: string;
    effective_unit_price: string;
    price_discount: LowStockPriceDiscount | null;
    quantity_discount: LowStockQuantityDiscount | null;
    has_discount: boolean;
    recommended_retail_price: string | null;
    savings_per_unit: string;
    savings_on_suggested: string;
    covers_suggested: boolean;
}
export interface LowStockBestOffer {
    receipt_id: string;
    wholesaler_id: string | null;
    wholesaler_title: string;
    effective_unit_price: string;
    has_discount: boolean;
    covers_suggested: boolean;
    savings_per_unit: string;
    savings_on_suggested: string;
}
export interface LowStockProductRow {
    product_id: string;
    product_title: string;
    category_id: string | null;
    category: string;
    sub_category_id: string | null;
    sub_category: string;
    current_stock: number;
    pack: number;
    receipt_count: number;
    reorder_level: number;
    danger_stock: number;
    maximum_stock: number;
    lead_time_days: number;
    target_stock: number;
    shortfall: number;
    suggested_quantity: number;
    avg_daily_sales: number;
    days_of_cover: number | null;
    sales_lookback: number;
    last_sale: string | null;
    days_since_sale: number | null;
    urgency: LowStockUrgency;
    is_out_of_stock: boolean;
    is_danger: boolean;
    unit_cost: string;
    line_cost: string;
    last_wholesaler_id: string | null;
    last_wholesaler_title: string;
    wholesale_offers: LowStockOffer[];
    wholesale_offer_count: number;
    best_offer: LowStockBestOffer | null;
    best_offer_savings_on_suggested: string;
}
export interface LowStockWholesalerGroupProduct {
    product_id: string;
    product_title: string;
    current_stock: number;
    suggested_quantity: number;
    unit_cost: string;
    line_cost: string;
    urgency: LowStockUrgency;
    has_best_offer: boolean;
    best_offer_wholesaler: string | null;
    best_offer_price: string | null;
    best_offer_has_discount: boolean;
    savings_on_line: string;
}
export interface LowStockWholesalerGroup {
    wholesaler_id: string | null;
    wholesaler_title: string;
    line_count: number;
    total_units: number;
    total_cost: string;
    total_savings: string;
    products: LowStockWholesalerGroupProduct[];
}
export interface LowStockReportData {
    period: { as_of: string; lookback_days: number; cover_days: number };
    filters: { category: string | null; wholesaler: string | null; search: string | null; only_danger: boolean; include_zero_velocity: boolean; include_offers: boolean };
    entity: { id: string; title: string };
    kpi: LowStockKPI;
    urgency_rollup: LowStockUrgencyRow[];
    category_rollup: LowStockCategoryRow[];
    wholesaler_groups: LowStockWholesalerGroup[];
    products: LowStockProductRow[];
}

/* ------------------------------------------------------------- list */

const URGENCY: Record<LowStockUrgency, { label: string; tone: AdminBadge['tone']; color: string }> = {
    OUT: { label: 'Out of stock', tone: 'danger', color: '#dc2626' },
    CRITICAL: { label: 'Critical', tone: 'danger', color: '#f43f5e' },
    WARNING: { label: 'Low', tone: 'warning', color: '#f59e0b' },
    SOON: { label: 'Reorder soon', tone: 'info', color: '#3b82f6' },
};
const RANK: Record<LowStockUrgency, number> = { OUT: 0, CRITICAL: 1, WARNING: 2, SOON: 3 };

const offerText = (p: LowStockProductRow) =>
    p.best_offer ? `${p.best_offer.wholesaler_title} @ ${money(p.best_offer.effective_unit_price)}${p.best_offer.has_discount ? ' (deal)' : ''}` : null;

const config: AdminListConfig<LowStockProductRow> = {
    title: 'Low stock',
    noun: ['product', 'products'],
    icon: 'trending-down-outline',
    searchPlaceholder: 'Search products or suppliers…',
    emptyMessage: 'Nothing needs reordering. Nice.',
    keyOf: (p) => p.product_id,
    titleOf: (p) => p.product_title,
    subtitleOf: (p) => offerText(p) ?? (p.last_wholesaler_title ? `Last from ${p.last_wholesaler_title}` : p.category || null),
    avatarOf: () => ({ icon: 'cube-outline' }),
    badgesOf: (p) => {
        const u = URGENCY[p.urgency];
        const out: AdminBadge[] = [{ label: u.label, tone: u.tone, icon: p.urgency === 'OUT' ? 'alert-circle' : undefined }];
        if (p.best_offer?.has_discount) out.push({ label: 'Deal available', tone: 'success', icon: 'pricetag' });
        return out;
    },
    metaOf: (p) => `In stock ${num(p.current_stock)} · ${p.days_of_cover != null ? `${num(p.days_of_cover)} days cover` : 'no recent sales'}${p.last_sale ? ` · last sold ${formatDate(p.last_sale)}` : ''}`,
    metaIcon: 'layers-outline',
    metricOf: (p) => ({ value: num(p.suggested_quantity), label: 'to order', color: URGENCY[p.urgency].color }),
    primaryColumn: { label: 'Product', flex: 2 },
    columns: [
        { key: 'stock', label: 'In stock', flex: 0.7, align: 'right', render: (p) => num(p.current_stock) },
        { key: 'reorder', label: 'Reorder at', flex: 0.8, align: 'right', render: (p) => num(p.reorder_level) },
        { key: 'cover', label: 'Cover', flex: 0.7, align: 'right', render: (p) => (p.days_of_cover != null ? `${num(p.days_of_cover)}d` : '—') },
        { key: 'order', label: 'Order', flex: 0.6, align: 'right', render: (p) => num(p.suggested_quantity) },
        { key: 'offer', label: 'Best offer', flex: 1.6, render: (p) => offerText(p) ?? '—' },
        { key: 'cost', label: 'Est. cost', flex: 0.9, align: 'right', render: (p) => money(p.line_cost) },
    ],
};

type Filter = 'ALL' | LowStockUrgency;

export default function LowStockReport() {
    const variant = useVariant();
    const [coverDays, setCoverDays] = useState(30);
    const r = useReport<LowStockReportData>(`low_stock:${coverDays}`, () => retailersApi.getLowStockReportAction({ cover_days: coverDays, include_offers: true }));
    const rep = r.report;
    const k = rep?.kpi;

    const [query, setQuery] = useState('');
    const [urgency, setUrgency] = useState<Filter>('ALL');
    const [viewing, setViewing] = useState<LowStockProductRow | null>(null);
    const all = rep?.products ?? [];
    const rows = useMemo(
        () =>
            all
                .filter((p) => urgency === 'ALL' || p.urgency === urgency)
                .filter((p) => matches(query, p.product_title, p.category, p.last_wholesaler_title, p.best_offer?.wholesaler_title))
                .sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || (a.days_of_cover ?? 0) - (b.days_of_cover ?? 0)),
        [all, query, urgency],
    );
    const paged = usePaged(rows, `${query}|${urgency}|${coverDays}`);
    const countOf = (u: LowStockUrgency) => all.filter((p) => p.urgency === u).length;

    return (
        <DetailsDock placeholder="Pick a product to see reorder details." pane={<ConfigDetailsSheet config={config} item={viewing} onClose={() => setViewing(null)} />}>
            <AdminListView<LowStockProductRow, Filter>
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
                    { label: 'To reorder', value: num(k?.reorder_count) },
                    { label: 'Out of stock', value: num(k?.out_of_stock_count), color: '#dc2626' },
                    { label: 'Est. cost', value: money(k?.estimated_total_cost) },
                    { label: 'Savings on deals', value: money(k?.estimated_savings_on_orders), color: '#10b981' },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: all.length },
                        ...(['OUT', 'CRITICAL', 'WARNING', 'SOON'] as LowStockUrgency[]).map((u) => ({ key: u as Filter, label: URGENCY[u].label, count: countOf(u) })),
                    ],
                    value: urgency,
                    onChange: setUrgency,
                    allKey: 'ALL',
                }}
                header={
                    <ReportHeader controls={<DaysChips label="Order enough for" value={coverDays} onChange={setCoverDays} options={[7, 14, 30, 60]} />}>
                        {rep ? (
                            <>
                                <BreakdownCard
                                    title="Order by supplier"
                                    icon="business-outline"
                                    rows={shareRows(rep.wholesaler_groups, (g) => Number(g.total_cost), (g) => ({
                                        label: g.wholesaler_title || 'No supplier yet',
                                        value: money(g.total_cost),
                                        sub: `${g.line_count} products · ${num(g.total_units)} units${Number(g.total_savings) > 0 ? ` · save ${money(g.total_savings)}` : ''}`,
                                    }))}
                                />
                                <BreakdownCard
                                    title="By category"
                                    icon="grid-outline"
                                    accent="#8b5cf6"
                                    rows={shareRows(rep.category_rollup, (c) => Number(c.total_cost), (c) => ({ label: c.category || 'Uncategorised', value: money(c.total_cost), sub: `${c.count} products · ${num(c.total_units)} units` }))}
                                />
                            </>
                        ) : null}
                    </ReportHeader>
                }
            />
        </DetailsDock>
    );
}
