// components/retailers/reports/profitAndLoss/ProfitAndLossReport.tsx
//
// Profit & loss for a period as statement lines (revenue → gross profit → net
// profit), with headline numbers, expense breakdowns and the stock position.
// Kept on the device per period.

import retailersApi from '@/api/retailersApi';
import { AdminListView, ConfigDetailsSheet, DetailsDock, type AdminListConfig } from '@/components/common/listScreen';
import { usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';

import { BreakdownCard, HeadlineCard, matches, money, num, PeriodBar, pct, ReportHeader, shareRows, titleCase, usePeriod, useReport, useVariant } from '../ReportKit';

/* ------------------------------------------------------------- types */

export interface PlRevenue {
    orders_count: number;
    gross_sales: string;
    tax_collected: string;
    discounts: string;
    item_discounts?: string;
    counter_discounts?: string;
    shipping_charged: string;
    net_sales: string;
    returns_value: string;
    net_revenue: string;
    paid_total: string;
}
export interface PlExpenseCategory {
    category_id: string | null;
    category: string;
    amount: string;
    count: number;
}
export interface PlCogs {
    sold_cost: string;
    returned_cost: string;
    net_cogs: string;
    units_sold: string;
    units_returned: string;
    expense_categories: PlExpenseCategory[];
    expense_categories_total: string;
    total: string;
}
interface PlPaymentFees {
    fees: string;
    transactions: number;
}
interface PlWriteOffBreakdown {
    reason: string;
    cost: string;
    quantity: number;
}
interface PlWriteOffs {
    total_cost: string;
    total_quantity: number;
    breakdown: PlWriteOffBreakdown[];
}
export interface PlOperatingExpenses {
    categories: PlExpenseCategory[];
    categories_total: string;
    payment_fees: PlPaymentFees;
    inventory_write_offs: PlWriteOffs;
    total: string;
}
export interface PlStockPosition {
    units: number;
    cost_value: string;
    retail_value: string;
}
export interface ProfitAndLossData {
    period: { from: string; to: string; days: number };
    entity: { id: string; title: string };
    revenue: PlRevenue;
    cogs: PlCogs;
    gross_profit: string;
    gross_margin_percent: string;
    operating_expenses: PlOperatingExpenses;
    net_profit: string;
    net_margin_percent: string;
    stock_position: PlStockPosition;
}

/* ------------------------------------------------------------- statement */

type Section = 'Revenue' | 'Cost of sales' | 'Operating expenses' | 'Result';
interface Line {
    key: string;
    section: Section;
    label: string;
    amount: number;
    /** Shown with a minus: it reduces profit. */
    deduct?: boolean;
    total?: boolean;
    note?: string;
}

function statement(p: ProfitAndLossData): Line[] {
    const n = Number;
    const rv = p.revenue;
    const cg = p.cogs;
    const ox = p.operating_expenses;
    // Net sales = gross − discounts + delivery (tax is collected for KRA, not
    // income). Discounts are derived so the lines always add up, including
    // till (counter) discounts.
    const gross = n(rv.gross_sales);
    const ship = n(rv.shipping_charged);
    const netSales = n(rv.net_sales);
    const discounts = Math.max(0, gross + ship - netSales);
    const counter = n(rv.counter_discounts ?? 0);
    const cogsExtras = cg.expense_categories.reduce((s, c) => s + n(c.amount), 0);
    return [
        { key: 'gross', section: 'Revenue', label: 'Gross sales', amount: gross, note: `${rv.orders_count} orders, before tax` },
        { key: 'disc', section: 'Revenue', label: 'Discounts', amount: discounts, deduct: true, note: counter > 0 ? `${money(counter)} given at the till` : undefined },
        { key: 'ship', section: 'Revenue', label: 'Delivery charged', amount: ship },
        { key: 'ns', section: 'Revenue', label: 'Net sales', amount: netSales, total: true, note: n(rv.tax_collected) ? `Excludes ${money(rv.tax_collected)} tax collected` : 'Excludes tax' },
        { key: 'ret', section: 'Revenue', label: 'Customer returns', amount: n(rv.returns_value), deduct: true },
        { key: 'rev', section: 'Revenue', label: 'Net revenue', amount: n(rv.net_revenue), total: true, note: `${money(rv.paid_total)} paid so far` },
        { key: 'cogs', section: 'Cost of sales', label: 'Cost of goods sold', amount: n(cg.net_cogs), deduct: true, note: `${num(cg.units_sold)} sold · ${num(cg.units_returned)} returned, at buying price` },
        ...cg.expense_categories.map((c, i) => ({ key: `cg-${c.category_id ?? i}`, section: 'Cost of sales' as Section, label: titleCase(c.category), amount: n(c.amount), deduct: true, note: `${c.count} expenses` })),
        { key: 'gp', section: 'Result', label: 'Gross profit', amount: n(p.gross_profit), total: true, note: `${pct(p.gross_margin_percent)} margin · net revenue − ${money(n(cg.net_cogs) + cogsExtras)} cost of sales` },
        ...ox.categories.map((c, i) => ({ key: `ox-${c.category_id ?? i}`, section: 'Operating expenses' as Section, label: titleCase(c.category), amount: n(c.amount), deduct: true, note: `${c.count} expenses` })),
        { key: 'fees', section: 'Operating expenses', label: 'Payment fees', amount: n(ox.payment_fees.fees), deduct: true, note: `${ox.payment_fees.transactions} payments` },
        { key: 'wo', section: 'Operating expenses', label: 'Stock written off', amount: n(ox.inventory_write_offs.total_cost), deduct: true, note: `${num(ox.inventory_write_offs.total_quantity)} units expired or damaged` },
        { key: 'ox', section: 'Operating expenses', label: 'Total operating expenses', amount: n(ox.total), deduct: true, total: true },
        { key: 'np', section: 'Result', label: 'Net profit', amount: n(p.net_profit), total: true, note: `${pct(p.net_margin_percent)} margin · gross profit − operating expenses` },
    ];
}

const SECTION_ICON: Record<Section, any> = { Revenue: 'trending-up-outline', 'Cost of sales': 'cube-outline', 'Operating expenses': 'receipt-outline', Result: 'stats-chart-outline' };
const lineValue = (l: Line) => `${l.deduct && l.amount ? '− ' : ''}${money(Math.abs(l.amount))}`;
const lineColor = (l: Line) => (l.deduct ? '#f43f5e' : l.total ? (l.amount < 0 ? '#f43f5e' : '#10b981') : undefined);

const config: AdminListConfig<Line> = {
    title: 'Profit & loss',
    noun: ['line', 'lines'],
    icon: 'stats-chart-outline',
    searchPlaceholder: 'Search lines…',
    emptyMessage: 'No figures for this period.',
    keyOf: (l) => l.key,
    titleOf: (l) => l.label,
    subtitleOf: (l) => l.note ?? null,
    avatarOf: (l) => ({ icon: SECTION_ICON[l.section] }),
    badgesOf: (l) => [{ label: l.section, tone: l.total ? 'success' : l.deduct ? 'danger' : 'info' }],
    metricOf: (l) => ({ value: lineValue(l), label: l.total ? 'total' : l.deduct ? 'cost' : 'income', color: lineColor(l) }),
    primaryColumn: { label: 'Line', flex: 2 },
    columns: [
        { key: 'section', label: 'Section', flex: 1.2, render: (l) => l.section },
        { key: 'note', label: 'Detail', flex: 1.4, render: (l) => l.note || '—' },
        { key: 'amount', label: 'Amount', flex: 1, align: 'right', render: (l) => lineValue(l) },
    ],
};

export default function ProfitAndLossReport() {
    const variant = useVariant();
    const period = usePeriod('MONTH');
    const r = useReport<ProfitAndLossData>(`pnl:${period.from}:${period.to}`, () => retailersApi.getProfitAndLossAction({ from: period.from || undefined, to: period.to || undefined }));
    const rep = r.report;

    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<Line | null>(null);
    const rows = useMemo(() => (rep ? statement(rep) : []).filter((l) => matches(query, l.label, l.section, l.note)), [rep, query]);
    const paged = usePaged(rows, `${query}|${period.from}|${period.to}`);
    const ox = rep?.operating_expenses;
    const expenseRows = rep ? [...rep.cogs.expense_categories, ...rep.operating_expenses.categories] : [];

    return (
        <DetailsDock placeholder="Pick a line to see it here." pane={<ConfigDetailsSheet config={config} item={viewing} onClose={() => setViewing(null)} />}>
            <AdminListView<Line>
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
                hidePagination
                onPressItem={setViewing}
                stats={[
                    { label: 'Net revenue', value: money(rep?.revenue.net_revenue) },
                    { label: 'Gross profit', value: money(rep?.gross_profit) },
                    { label: 'Net profit', value: money(rep?.net_profit), color: Number(rep?.net_profit) < 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Net margin', value: pct(rep?.net_margin_percent) },
                ]}
                header={
                    <ReportHeader controls={<PeriodBar state={period} options={['MONTH', 'LAST_MONTH', '30D', 'YEAR', 'CUSTOM']} />}>
                        {rep ? (
                            <>
                                <HeadlineCard
                                    icon={Number(rep.net_profit) < 0 ? 'trending-down' : 'trending-up'}
                                    label="Net profit"
                                    value={money(rep.net_profit)}
                                    sub={`${pct(rep.net_margin_percent)} of net revenue ${money(rep.revenue.net_revenue)}`}
                                    color={Number(rep.net_profit) < 0 ? '#f43f5e' : '#10b981'}
                                />
                                <HeadlineCard icon="pie-chart-outline" label="Gross profit" value={money(rep.gross_profit)} sub={`${pct(rep.gross_margin_percent)} margin after cost of goods`} />
                                <HeadlineCard icon="layers-outline" label="Stock on hand" value={money(rep.stock_position.cost_value)} sub={`${num(rep.stock_position.units)} units · ${money(rep.stock_position.retail_value)} at retail`} color="#8b5cf6" />
                                <BreakdownCard
                                    title="Where the money went"
                                    icon="receipt-outline"
                                    accent="#f43f5e"
                                    rows={[
                                        ...shareRows(expenseRows, (c) => Number(c.amount), (c) => ({ label: titleCase(c.category), value: money(c.amount), sub: `${c.count} expenses` })),
                                        ...(Number(ox?.payment_fees.fees) > 0 ? [{ label: 'Payment fees', value: money(ox?.payment_fees.fees), sub: `${ox?.payment_fees.transactions} payments` }] : []),
                                    ]}
                                    empty="No expenses recorded in this period."
                                />
                                {ox && ox.inventory_write_offs.breakdown.length ? (
                                    <BreakdownCard
                                        title="Stock written off"
                                        icon="trash-outline"
                                        accent="#f59e0b"
                                        rows={shareRows(ox.inventory_write_offs.breakdown, (w) => Number(w.cost), (w) => ({ label: titleCase(w.reason), value: money(w.cost), sub: `${num(w.quantity)} units` }))}
                                    />
                                ) : null}
                            </>
                        ) : null}
                    </ReportHeader>
                }
            />
        </DetailsDock>
    );
}
