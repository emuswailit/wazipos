// components/retailers/reports/dailySales/DailySalesReport.tsx
//
// Sales for a period: headline numbers, payment / collection / origin /
// channel breakdowns, and the products sold (cards on phones, table on wide
// screens; tap one for details). Kept on the device per period.

import retailersApi from '@/api/retailersApi';
import { AdminListView, ConfigDetailsSheet, DetailsDock, FilterChips, type AdminListConfig } from '@/components/common/listScreen';
import { usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';

import { BreakdownCard, matches, money, num, PeriodBar, ReportHeader, shareRows, titleCase, usePeriod, useReport, useVariant } from '../ReportKit';

/* ------------------------------------------------------------- types */

export interface DailySalesKPI {
    orders_count: number;
    gross_sales: string;
    tax_total: string;
    discount_total: string;
    shipping_total: string;
    net_sales: string;
    paid_total: string;
    balance_due_total: string;
    units_sold: string;
    returns_count: number;
    units_returned: string;
    returns_value: string;
    net_after_returns: string;
    receipts_on_hand_units: number;
    receipts_on_hand_value: string;
}
export interface OriginCount {
    order_origin: string;
    orders_count: number;
    net: string;
    paid: string;
}
export interface ChannelCount {
    order_channel: string;
    orders_count: number;
    net: string;
}
export interface PaymentRow {
    payment_method_id: string | null;
    payment_method_title: string;
    orders_count: number;
    gross?: string;
    net: string;
    paid: string;
}
export interface CollectionRow {
    payment_method_id: string | null;
    payment_method_title: string;
    transactions: number;
    collected: string;
}
export interface OriginPaymentRow {
    order_origin: string;
    summary: { orders_count: number; net: string; paid: string };
    methods: PaymentRow[];
}
export interface ProductRow {
    product_id: string;
    product_title: string;
    sold_quantity: string;
    gross_value: string;
    net_value: string;
    order_count: number;
    returned_quantity: number;
    return_count: number;
    net_quantity: string;
    current_stock: number;
    stock_value: string;
}
export interface DailySalesTotals {
    sold_quantity: string;
    gross_value: string;
    net_value: string;
    returned_quantity: string;
    current_stock: number;
    stock_value: string;
}
export interface DailySalesReportData {
    period: { from: string; to: string; days: number };
    entity: { id: string; title: string };
    filters: { include_cancelled: boolean };
    kpi: DailySalesKPI;
    origin_counts: OriginCount[];
    channel_counts: ChannelCount[];
    payment_breakdown: PaymentRow[];
    collections_breakdown: CollectionRow[];
    origin_payment_breakdown: OriginPaymentRow[];
    product_breakdown: ProductRow[];
    totals: DailySalesTotals;
}

/* ------------------------------------------------------------- list */

const config: AdminListConfig<ProductRow> = {
    title: 'Daily sales',
    noun: ['product', 'products'],
    icon: 'trending-up-outline',
    searchPlaceholder: 'Search products sold…',
    emptyMessage: 'No sales in this period.',
    keyOf: (p) => p.product_id,
    titleOf: (p) => p.product_title,
    subtitleOf: (p) => `${num(p.sold_quantity)} sold · ${p.order_count} ${p.order_count === 1 ? 'order' : 'orders'}`,
    avatarOf: () => ({ icon: 'cube-outline' }),
    badgesOf: (p) => (Number(p.returned_quantity) > 0 ? [{ label: `${num(p.returned_quantity)} returned`, tone: 'warning', icon: 'return-down-back-outline' }] : []),
    metaOf: (p) => `In stock ${num(p.current_stock)} · worth ${money(p.stock_value)}`,
    metaIcon: 'layers-outline',
    metricOf: (p) => ({ value: money(p.net_value), label: 'net', color: '#10b981' }),
    primaryColumn: { label: 'Product', flex: 2 },
    columns: [
        { key: 'sold', label: 'Sold', flex: 0.7, align: 'right', render: (p) => num(p.sold_quantity) },
        { key: 'ret', label: 'Returned', flex: 0.8, align: 'right', render: (p) => num(p.returned_quantity) },
        { key: 'orders', label: 'Orders', flex: 0.7, align: 'right', render: (p) => String(p.order_count) },
        { key: 'gross', label: 'Gross', flex: 1, align: 'right', render: (p) => money(p.gross_value) },
        { key: 'net', label: 'Net', flex: 1, align: 'right', render: (p) => money(p.net_value) },
        { key: 'stock', label: 'In stock', flex: 0.8, align: 'right', render: (p) => num(p.current_stock) },
    ],
};

type Scope = 'DONE' | 'ALL';

export default function DailySalesReport() {
    const variant = useVariant();
    const period = usePeriod('TODAY');
    const [scope, setScope] = useState<Scope>('DONE');
    const r = useReport<DailySalesReportData>(`daily_sales:${period.from}:${period.to}:${scope}`, () =>
        retailersApi.getDailySalesReportAction({ from: period.from || undefined, to: period.to || undefined, include_cancelled: scope === 'ALL' }),
    );
    const rep = r.report;
    const k = rep?.kpi;

    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<ProductRow | null>(null);
    const rows = useMemo(
        () => (rep?.product_breakdown ?? []).filter((p) => matches(query, p.product_title)).sort((a, b) => Number(b.net_value) - Number(a.net_value)),
        [rep, query],
    );
    const paged = usePaged(rows, `${query}|${period.from}|${period.to}|${scope}`);

    const header = (
        <ReportHeader
            controls={
                <>
                    <PeriodBar state={period} />
                    <FilterChips<Scope>
                        options={[
                            { key: 'DONE', label: 'Excluding cancelled', icon: 'checkmark-circle-outline' },
                            { key: 'ALL', label: 'Including cancelled', icon: 'close-circle-outline' },
                        ]}
                        value={scope}
                        onChange={setScope}
                    />
                </>
            }
        >
            {k ? (
                <>
                    <BreakdownCard
                        title="Summary"
                        icon="receipt-outline"
                        rows={[
                            { label: 'Gross sales', value: money(k.gross_sales) },
                            { label: 'Discounts', value: `− ${money(k.discount_total)}` },
                            { label: 'Tax', value: money(k.tax_total) },
                            { label: 'Delivery charged', value: money(k.shipping_total) },
                            { label: `Returns (${k.returns_count})`, value: `− ${money(k.returns_value)}`, sub: `${num(k.units_returned)} units` },
                            { label: 'Net after returns', value: money(k.net_after_returns), color: '#10b981' },
                        ]}
                    />
                    <BreakdownCard
                        title="By payment method"
                        icon="card-outline"
                        accent="#3b82f6"
                        rows={shareRows(rep!.payment_breakdown, (p) => Number(p.net), (p) => ({ label: p.payment_method_title || 'Not set', value: money(p.net), sub: `${p.orders_count} orders · paid ${money(p.paid)}` }))}
                    />
                    <BreakdownCard
                        title="Money collected"
                        icon="wallet-outline"
                        accent="#10b981"
                        rows={shareRows(rep!.collections_breakdown, (c) => Number(c.collected), (c) => ({ label: c.payment_method_title || 'Not set', value: money(c.collected), sub: `${c.transactions} payments` }))}
                    />
                    <BreakdownCard
                        title="Where orders came from"
                        icon="git-branch-outline"
                        accent="#8b5cf6"
                        rows={[
                            ...shareRows(rep!.origin_counts, (o) => Number(o.net), (o) => ({ label: titleCase(o.order_origin), value: money(o.net), sub: `${o.orders_count} orders` })),
                            ...shareRows(rep!.channel_counts, (c) => Number(c.net), (c) => ({ label: `${titleCase(c.order_channel)} channel`, value: money(c.net), sub: `${c.orders_count} orders`, color: '#0ea5e9' })),
                        ]}
                    />
                </>
            ) : null}
        </ReportHeader>
    );

    return (
        <DetailsDock placeholder="Pick a product to see its sales." pane={<ConfigDetailsSheet config={config} item={viewing} onClose={() => setViewing(null)} />}>
            <AdminListView<ProductRow>
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
                header={header}
                stats={[
                    { label: 'Net sales', value: money(k?.net_sales), color: '#10b981' },
                    { label: 'Orders', value: num(k?.orders_count) },
                    { label: 'Units sold', value: num(k?.units_sold) },
                    { label: 'Paid', value: money(k?.paid_total) },
                    { label: 'Balance due', value: money(k?.balance_due_total), color: Number(k?.balance_due_total) > 0 ? '#f43f5e' : undefined },
                ]}
            />
        </DetailsDock>
    );
}
