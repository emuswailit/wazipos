// components/retailers/reports/expiries/ExpiryReport.tsx
//
// Stock nearing (or past) expiry: value at risk, an age breakdown, suppliers,
// and every batch (cards on phones, table on wide screens). Kept on the device.

import retailersApi from '@/api/retailersApi';
import { AdminListView, ConfigDetailsSheet, DetailsDock, formatDate, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';

import { BreakdownCard, DaysChips, matches, money, num, ReportHeader, shareRows, useReport, useVariant } from '../ReportKit';

/* ------------------------------------------------------------- types */

export type ExpiryBucket = 'EXPIRED' | '0_7' | '8_30' | '31_60' | '61_90' | '91_PLUS';

export interface ExpiryKPI {
    total_batches: number;
    total_units: number;
    cost_value_at_risk: string;
    retail_value_at_risk: string;
    expired_batches: number;
    expired_units: number;
    expired_cost_value: string;
    urgent_batches: number;
    urgent_units: number;
    urgent_cost_value: string;
}
export interface ExpiryBucketRow {
    key: ExpiryBucket;
    label: string;
    batches: number;
    units: number;
    cost_value: string;
    retail_value: string;
}
export interface ExpiryWholesalerRow {
    wholesaler_id: string | null;
    wholesaler_title: string;
    batches: number;
    units: number;
    cost_value: string;
}
export interface ExpiryReceiptRow {
    id: string;
    product_id: string | null;
    product_title: string;
    batch: string;
    supplier_invoice: string;
    expiry_date: string;
    days_until_expiry: number;
    bucket: ExpiryBucket;
    quantity: number;
    unit_cost: string;
    cost_value: string;
    retail_value: string;
    wholesaler_id: string | null;
    wholesaler_title: string;
}
export interface ExpiryReportData {
    period: { as_of: string; window_days: number };
    filters: { bucket: ExpiryBucket | null; product: string | null; wholesaler: string | null; search: string | null };
    entity: { id: string; title: string };
    kpi: ExpiryKPI;
    buckets: ExpiryBucketRow[];
    wholesaler_breakdown: ExpiryWholesalerRow[];
    receipts: ExpiryReceiptRow[];
}

/* ------------------------------------------------------------- list */

const BUCKET_COLOR: Record<ExpiryBucket, string> = { EXPIRED: '#dc2626', '0_7': '#f43f5e', '8_30': '#f59e0b', '31_60': '#eab308', '61_90': '#3b82f6', '91_PLUS': '#64748b' };

function whenBadge(e: ExpiryReceiptRow): AdminBadge {
    const d = e.days_until_expiry;
    if (e.bucket === 'EXPIRED' || d < 0) return { label: `Expired ${Math.abs(d)}d ago`, tone: 'danger', icon: 'alert-circle' };
    if (d <= 7) return { label: d === 0 ? 'Expires today' : `${d} days left`, tone: 'danger', icon: 'time' };
    if (d <= 30) return { label: `${d} days left`, tone: 'warning', icon: 'time-outline' };
    return { label: `${d} days left`, tone: d <= 90 ? 'info' : 'neutral' };
}

const config: AdminListConfig<ExpiryReceiptRow> = {
    title: 'Expiries',
    noun: ['batch', 'batches'],
    icon: 'hourglass-outline',
    searchPlaceholder: 'Search product, batch or supplier…',
    emptyMessage: 'Nothing expires in this window.',
    keyOf: (e) => e.id,
    titleOf: (e) => e.product_title,
    subtitleOf: (e) => [e.batch && `Batch ${e.batch}`, e.wholesaler_title].filter(Boolean).join(' · ') || null,
    avatarOf: () => ({ icon: 'medkit-outline' }),
    badgesOf: (e) => [whenBadge(e)],
    metaOf: (e) => `Expires ${formatDate(e.expiry_date)} · ${num(e.quantity)} units`,
    metaIcon: 'calendar-outline',
    metricOf: (e) => ({ value: money(e.cost_value), label: 'at cost', color: BUCKET_COLOR[e.bucket] }),
    primaryColumn: { label: 'Product', flex: 2 },
    columns: [
        { key: 'batch', label: 'Batch', flex: 1, render: (e) => e.batch || '—' },
        { key: 'supplier', label: 'Supplier', flex: 1.3, render: (e) => e.wholesaler_title || '—' },
        { key: 'exp', label: 'Expires', flex: 1, render: (e) => formatDate(e.expiry_date) },
        { key: 'qty', label: 'Units', flex: 0.6, align: 'right', render: (e) => num(e.quantity) },
        { key: 'cost', label: 'Cost value', flex: 1, align: 'right', render: (e) => money(e.cost_value) },
        { key: 'retail', label: 'Retail value', flex: 1, align: 'right', render: (e) => money(e.retail_value) },
    ],
};

type Filter = 'ALL' | ExpiryBucket;

export default function ExpiryReport() {
    const variant = useVariant();
    const [days, setDays] = useState(90);
    const r = useReport<ExpiryReportData>(`expiries:${days}`, () => retailersApi.getExpiryReportAction({ days }));
    const rep = r.report;
    const k = rep?.kpi;

    const [query, setQuery] = useState('');
    const [bucket, setBucket] = useState<Filter>('ALL');
    const [viewing, setViewing] = useState<ExpiryReceiptRow | null>(null);
    const rows = useMemo(
        () =>
            (rep?.receipts ?? [])
                .filter((e) => bucket === 'ALL' || e.bucket === bucket)
                .filter((e) => matches(query, e.product_title, e.batch, e.wholesaler_title, e.supplier_invoice))
                .sort((a, b) => a.days_until_expiry - b.days_until_expiry),
        [rep, query, bucket],
    );
    const paged = usePaged(rows, `${query}|${bucket}|${days}`);

    return (
        <DetailsDock placeholder="Pick a batch to see it here." pane={<ConfigDetailsSheet config={config} item={viewing} onClose={() => setViewing(null)} />}>
            <AdminListView<ExpiryReceiptRow, Filter>
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
                    { label: 'Cost at risk', value: money(k?.cost_value_at_risk), color: '#f59e0b' },
                    { label: 'Retail at risk', value: money(k?.retail_value_at_risk) },
                    { label: 'Expired', value: money(k?.expired_cost_value), color: '#dc2626' },
                    { label: 'Batches', value: num(k?.total_batches) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: rep?.receipts.length ?? 0 },
                        ...(rep?.buckets ?? []).map((b) => ({ key: b.key as Filter, label: b.label, count: b.batches })),
                    ],
                    value: bucket,
                    onChange: setBucket,
                    allKey: 'ALL',
                }}
                header={
                    <ReportHeader controls={<DaysChips label="Look ahead" value={days} onChange={setDays} options={[30, 60, 90, 180, 365]} />}>
                        {rep ? (
                            <>
                                <BreakdownCard
                                    title="By time left"
                                    icon="hourglass-outline"
                                    accent="#f59e0b"
                                    rows={shareRows(rep.buckets, (b) => Number(b.cost_value), (b) => ({ label: b.label, value: money(b.cost_value), sub: `${b.batches} batches · ${num(b.units)} units`, color: BUCKET_COLOR[b.key] }))}
                                />
                                <BreakdownCard
                                    title="By supplier"
                                    icon="business-outline"
                                    rows={shareRows(rep.wholesaler_breakdown, (w) => Number(w.cost_value), (w) => ({ label: w.wholesaler_title || 'Unknown supplier', value: money(w.cost_value), sub: `${w.batches} batches · ${num(w.units)} units` }))}
                                />
                            </>
                        ) : null}
                    </ReportHeader>
                }
            />
        </DetailsDock>
    );
}
