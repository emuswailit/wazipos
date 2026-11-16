// components/retailers/reports/productMovement/ProductMovementReport.tsx
//
// One product's stock ledger for a period: opening → in / out → closing, per
// batch, per day and every movement (cards on phones, table on wide screens).
// Opens with ?product=<id>&title=<name> too. Kept on the device.

import type { ProductMovementType } from '@/api/retailersApi';
import retailersApi from '@/api/retailersApi';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { AdminListView, ConfigDetailsSheet, DetailsDock, EmptyState, formatDate, formatDateTime, type AdminListConfig } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import { usePaged } from '@/hooks/useCachedList';
import { useLocalSearchParams } from 'expo-router';
import { Formik } from 'formik';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BreakdownCard, matches, num, PeriodBar, ReportHeader, shareRows, usePeriod, useReport, useVariant } from '../ReportKit';

/* ------------------------------------------------------------- types */

export interface MovementRow {
    datetime: string;
    date: string;
    type: ProductMovementType;
    direction: 'IN' | 'OUT';
    quantity: number;
    signed_quantity: number;
    reference: string;
    batch: string;
    expiry_date: string | null;
    note: string;
    user_id: string | null;
    source_id: string;
    source_type: string;
    receipt_id: string;
    balance_after: number;
    order_id?: string | null;
    return_intent?: string;
}
export interface DailySummaryRow {
    date: string;
    in: number;
    out: number;
    net: number;
    balance: number;
}
export interface ReceiptBreakdownRow {
    receipt_id: string;
    batch: string;
    expiry_date: string | null;
    received: number;
    sold: number;
    current: number;
    is_active: boolean;
}
export interface MovementKPIs {
    opening_balance: number;
    closing_balance: number;
    total_in: number;
    total_out: number;
    net_change: number;
    movement_count: number;
    receipts_count: number;
    sales_count: number;
    adjustments_count: number;
}
export interface ProductMovementReportData {
    period: { from: string; to: string; days: number };
    entity: { id: string; title: string };
    product: { id: string; title: string; category: string | null; current_stock: number; receipt_count: number };
    filters: { retailer_receipt: string | null; movement_types: ProductMovementType[] | null };
    kpi: MovementKPIs;
    movements: MovementRow[];
    daily_summary: DailySummaryRow[];
    receipt_breakdown: ReceiptBreakdownRow[];
}

/* ------------------------------------------------------------- list */

const TYPES: Record<ProductMovementType, { label: string; color: string; icon: any }> = {
    RECEIPT: { label: 'Received', color: '#10b981', icon: 'download-outline' },
    SALE: { label: 'Sale', color: '#0ea5e9', icon: 'cart-outline' },
    ADJUSTMENT: { label: 'Adjustment', color: '#64748b', icon: 'options-outline' },
    CORRECTION: { label: 'Correction', color: '#94a3b8', icon: 'construct-outline' },
    EXPIRY_WRITE_OFF: { label: 'Expired', color: '#dc2626', icon: 'hourglass-outline' },
    DAMAGE_WRITE_OFF: { label: 'Damaged', color: '#ea580c', icon: 'warning-outline' },
    WHOLESALER_RETURN: { label: 'To wholesaler', color: '#f59e0b', icon: 'return-up-forward-outline' },
    CUSTOMER_RETURN: { label: 'From customer', color: '#8b5cf6', icon: 'return-down-back-outline' },
};
const typeOf = (t: ProductMovementType) => TYPES[t] ?? { label: t, color: '#64748b', icon: 'swap-vertical-outline' };
const signed = (n: number) => `${n > 0 ? '+' : ''}${num(n)}`;

const config: AdminListConfig<MovementRow> = {
    title: 'Product movement',
    noun: ['movement', 'movements'],
    icon: 'swap-vertical-outline',
    searchPlaceholder: 'Search reference, batch or note…',
    emptyMessage: 'No stock movements in this period.',
    keyOf: (m, i) => `${m.source_type}-${m.source_id}-${m.receipt_id}-${i}`,
    titleOf: (m) => typeOf(m.type).label,
    subtitleOf: (m) => [m.reference, m.batch && `Batch ${m.batch}`, m.note].filter(Boolean).join(' · ') || null,
    avatarOf: (m) => ({ icon: typeOf(m.type).icon, color: typeOf(m.type).color }),
    badgesOf: (m) => [{ label: m.direction === 'IN' ? 'In' : 'Out', tone: m.direction === 'IN' ? 'success' : 'danger', icon: m.direction === 'IN' ? 'arrow-down' : 'arrow-up' }],
    metaOf: (m) => `${formatDateTime(m.datetime || m.date)} · balance ${num(m.balance_after)}`,
    metaIcon: 'time-outline',
    metricOf: (m) => ({ value: signed(m.signed_quantity), label: 'units', color: m.signed_quantity >= 0 ? '#10b981' : '#f43f5e' }),
    primaryColumn: { label: 'Movement', flex: 1.2 },
    columns: [
        { key: 'when', label: 'When', flex: 1.2, render: (m) => formatDateTime(m.datetime || m.date) },
        { key: 'ref', label: 'Reference', flex: 1.3, render: (m) => m.reference || '—' },
        { key: 'batch', label: 'Batch', flex: 0.9, render: (m) => m.batch || '—' },
        { key: 'qty', label: 'Qty', flex: 0.6, align: 'right', render: (m) => signed(m.signed_quantity) },
        { key: 'bal', label: 'Balance', flex: 0.7, align: 'right', render: (m) => num(m.balance_after) },
    ],
};

const readId = (p: any) => String(p?.remote_id ?? p?.product_id ?? p?.id ?? '').trim();
const readTitle = (p: any) => p?.title ?? p?.product_title ?? p?.long_title ?? p?.product_name ?? 'Unknown product';

type Filter = 'ALL' | ProductMovementType;

export default function ProductMovementReport() {
    const variant = useVariant();
    const { theme, isDarkMode } = useAuth() as any;
    const params = useLocalSearchParams<{ product?: string; title?: string }>();
    const { productsList } = useProductsSync();
    const options = useMemo(
        () =>
            (productsList as any[])
                .map((p) => ({ id: readId(p), title: String(readTitle(p)) }))
                .filter((p) => p.id),
        [productsList],
    );

    const [product, setProduct] = useState<{ id: string; title: string } | null>(params.product ? { id: String(params.product), title: String(params.title ?? '') } : null);
    const period = usePeriod('30D');
    const r = useReport<ProductMovementReportData>(
        `movement:${product?.id ?? 'none'}:${period.from}:${period.to}`,
        () => retailersApi.getProductMovementReportAction({ product: product!.id, from: period.from || undefined, to: period.to || undefined }),
        !!product,
    );
    const rep = product ? r.report : null;
    const k = rep?.kpi;

    const [query, setQuery] = useState('');
    const [type, setType] = useState<Filter>('ALL');
    const [viewing, setViewing] = useState<MovementRow | null>(null);
    const all = rep?.movements ?? [];
    const rows = useMemo(
        () =>
            all
                .filter((m) => type === 'ALL' || m.type === type)
                .filter((m) => matches(query, m.reference, m.batch, m.note, typeOf(m.type).label))
                .sort((a, b) => String(b.datetime || b.date).localeCompare(String(a.datetime || a.date))),
        [all, query, type],
    );
    const paged = usePaged(rows, `${query}|${type}|${product?.id}|${period.from}|${period.to}`);
    const present = Array.from(new Set(all.map((m) => m.type)));

    const picker = (
        <Formik initialValues={{ product: product?.id ?? '' }} onSubmit={() => undefined} enableReinitialize>
            <View style={{ zIndex: 50, maxWidth: 520 }}>
                <CustomAutocompletePicker
                    name="product"
                    label="Product"
                    options={options}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    initialTitle={product?.title || rep?.product.title}
                    loading={productsList.length === 0}
                    placeholder="Search a product…"
                    loadingPlaceholder="Loading products…"
                    onAfterSelect={(id, title) => {
                        setProduct({ id, title });
                        setType('ALL');
                        setViewing(null);
                    }}
                />
            </View>
        </Formik>
    );

    return (
        <DetailsDock placeholder="Pick a movement to see it here." pane={<ConfigDetailsSheet config={config} item={viewing} onClose={() => setViewing(null)} />}>
            <AdminListView<MovementRow, Filter>
                variant={variant}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={() => (product ? void r.refresh() : undefined)}
                refreshing={r.refreshing}
                sourceLabel={product ? r.sourceLabel : undefined}
                sourceTone={product ? r.source : undefined}
                lastSyncedTime={product ? r.lastSynced : undefined}
                error={product ? r.error : null}
                {...paged}
                onPressItem={setViewing}
                emptyComponent={product ? undefined : <EmptyState icon="search-outline" title="Pick a product" message="Choose a product above to see every unit in and out." />}
                stats={[
                    { label: 'Opening', value: num(k?.opening_balance) },
                    { label: 'In', value: `+${num(k?.total_in)}`, color: '#10b981' },
                    { label: 'Out', value: `−${num(k?.total_out)}`, color: '#f43f5e' },
                    { label: 'Closing', value: num(k?.closing_balance) },
                ]}
                filters={
                    rep
                        ? {
                              options: [
                                  { key: 'ALL', label: 'All', icon: 'apps-outline', count: all.length },
                                  ...present.map((t) => ({ key: t as Filter, label: typeOf(t).label, count: all.filter((m) => m.type === t).length })),
                              ],
                              value: type,
                              onChange: setType,
                              allKey: 'ALL',
                          }
                        : undefined
                }
                header={
                    <ReportHeader
                        controls={
                            <>
                                {picker}
                                <PeriodBar state={period} options={['7D', '30D', 'MONTH', 'LAST_MONTH', 'YEAR', 'CUSTOM']} />
                            </>
                        }
                        note={rep ? `${rep.product.title}${rep.product.category ? ` · ${rep.product.category}` : ''} · ${num(rep.product.current_stock)} in stock now · ${formatDate(rep.period.from)} – ${formatDate(rep.period.to)}` : null}
                    >
                        {rep ? (
                            <>
                                <BreakdownCard
                                    title="By batch"
                                    icon="file-tray-stacked-outline"
                                    rows={rep.receipt_breakdown.map((b) => ({
                                        label: b.batch ? `Batch ${b.batch}` : 'No batch',
                                        value: `${num(b.current)} left`,
                                        sub: `Received ${num(b.received)} · sold ${num(b.sold)}${b.expiry_date ? ` · expires ${formatDate(b.expiry_date)}` : ''}${b.is_active ? '' : ' · closed'}`,
                                        share: b.received ? b.current / b.received : 0,
                                        color: b.is_active ? undefined : '#94a3b8',
                                    }))}
                                />
                                <BreakdownCard
                                    title="By day"
                                    icon="calendar-outline"
                                    accent="#0ea5e9"
                                    rows={shareRows(
                                        rep.daily_summary.filter((d) => d.in || d.out).slice(-10).reverse(),
                                        (d) => d.in + d.out,
                                        (d) => ({ label: formatDate(d.date), value: signed(d.net), sub: `+${num(d.in)} in · −${num(d.out)} out · balance ${num(d.balance)}`, color: d.net < 0 ? '#f43f5e' : '#10b981' }),
                                    )}
                                    empty="No movement in this period."
                                />
                            </>
                        ) : null}
                    </ReportHeader>
                }
            />
        </DetailsDock>
    );
}
