// components/retailers/stockOuts/RetailerOutOfStocksList.tsx
//
// Retailer out-of-stocks view — shell.
//
// Owns data + filter state, dispatches to the Web or Mobile view,
// and mounts the offers / details / form modals.
//
// Adding an offer to (or removing it from) the open indent is handled inside
// OutOfStockOffersModal via useIndentBridge (offline-first); this shell only opens it.

import { DetailsDock } from '@/components/common/listScreen';
import { useRetailerOutOfStocksSync } from '@/context/RetailerOutOfStocksSyncContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import type { PageSize } from '@/components/common/PaginationBar';
import { OutOfStockDetailsModal } from './OutOfStockDetailsModal';
import { OutOfStockFormModal } from './OutOfStockFormModal';
import { OutOfStockOffersModal, type OutOfStockFeedback } from './OutOfStockOffersModal';
import {
    formatDate,
    matchesStockOutFilter,
    OffersChip,
    StateBadge,
    STOCKOUT_FILTER_ICONS,
    STOCKOUT_FILTER_LABELS,
    STOCKOUT_FILTERS,
    stockOutImageUrl,
    stockOutState,
    stockOutTitle,
    type StockOutCounts,
    type StockOutFilter,
} from './RetailerOutOfStocksWebView';
import { AdminListView, type AdminListConfig } from '@/components/common/listScreen';

const STATE_BADGE = {
    draft: { label: 'Not uploaded', tone: 'info' },
    pending: { label: 'Waiting', tone: 'warning' },
    ordered: { label: 'Ordered', tone: 'success' },
} as const;
const offersOf = (i: RetailerOutOfStockNormalized) => i.wholesaler_offers?.length ?? 0;

/** Cards on phones, a table on wide screens; offers and status columns keep their chips. */
function buildConfig(onViewOffers: (i: RetailerOutOfStockNormalized) => void): AdminListConfig<RetailerOutOfStockNormalized> {
    return {
        title: 'Stock outs',
        noun: ['item', 'items'],
        icon: 'alert-circle-outline',
        searchPlaceholder: 'Search product, customer, offer…',
        addLabel: 'Record stock out',
        emptyTitle: 'Nothing out of stock',
        emptyMessage: 'Record what customers asked for that you didn’t have; wholesalers can then offer it.',
        keyOf: (i, idx) => `${i.remote_id || i.draft_id || 'oos'}-${idx}`,
        titleOf: stockOutTitle,
        subtitleOf: (i) => [i.customer_name || 'Walk-in', i.customer_phone, i.is_special_order ? 'Special order' : null].filter(Boolean).join(' · '),
        avatarOf: (i) => ({ uri: stockOutImageUrl(i), icon: 'cube-outline' }),
        badgesOf: (i) => {
            const b: any[] = [STATE_BADGE[stockOutState(i)]];
            const n = offersOf(i);
            if (n && !i.is_ordered) b.push({ label: `${n} offer${n === 1 ? '' : 's'}`, tone: 'primary', icon: 'pricetags-outline' });
            return b;
        },
        metaOf: (i) => (i.created ? formatDate(i.created) : null),
        metaIcon: 'time-outline',
        metricOf: (i) => ({ value: Number(i.required_quantity ?? 0).toLocaleString(), label: 'needed' }),
        primaryColumn: { label: 'Product', flex: 3 },
        columns: [
            { key: 'customer', label: 'Customer', flex: 1.8, render: (i) => i.customer_name || 'Walk-in' },
            { key: 'qty', label: 'Needed', flex: 0.8, align: 'right', render: (i) => Number(i.required_quantity ?? 0).toLocaleString() },
            { key: 'offers', label: 'Offers', flex: 1.8, render: (i) => <OffersChip item={i} onPress={() => onViewOffers(i)} size="sm" /> },
            { key: 'status', label: 'Status', flex: 1.1, render: (i) => <StateBadge item={i} size="sm" /> },
            { key: 'created', label: 'Created', flex: 1.2, render: (i) => formatDate(i.created) },
        ],
    };
}

interface RetailerOutOfStocksListProps {
    /** Called after an offer is added to / removed from the open indent. */
    onOfferFeedback?: (result: OutOfStockFeedback) => void;
    /** Overrides the default (open the details modal) when a row/card is tapped. */
    onItemPress?: (item: RetailerOutOfStockNormalized) => void;
    emptyComponent?: React.ReactElement | null;
}

export default function RetailerOutOfStocksList({ onOfferFeedback, onItemPress, emptyComponent }: RetailerOutOfStocksListProps) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const { outOfStocks, isSyncing, isManualRefreshing, lastSyncedTime, dataSource, reconnectLiveSync } = useRetailerOutOfStocksSync();

    const [query, setQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<StockOutFilter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [offersTarget, setOffersTarget] = useState<RetailerOutOfStockNormalized | null>(null);
    const [detailsTarget, setDetailsTarget] = useState<RetailerOutOfStockNormalized | null>(null);
    const [formState, setFormState] = useState<{ mode: 'create' | 'edit'; item: RetailerOutOfStockNormalized | null } | null>(null);

    /* ---------------- Filter (newest first) ---------------- */
    const filtered = useMemo(() => {
        const base = outOfStocks
            .filter((i) => matchesStockOutFilter(i, activeFilter))
            .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));

        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((i) => {
            if (String(i.product_title || '').toLowerCase().includes(q)) return true;
            if (String(i.customer_name || '').toLowerCase().includes(q)) return true;
            if (String(i.customer_phone || '').toLowerCase().includes(q)) return true;
            return (i.wholesaler_offers || []).some((o) => {
                const t = String(o.title || o.product_title || '').toLowerCase();
                const m = String(o.manufacturer_title || '').toLowerCase();
                return t.includes(q) || m.includes(q);
            });
        });
    }, [outOfStocks, activeFilter, query]);

    /* ---------------- Counts ---------------- */
    const counts: StockOutCounts = useMemo(() => {
        const byFilter = Object.fromEntries(
            STOCKOUT_FILTERS.map((f) => [f, outOfStocks.filter((i) => matchesStockOutFilter(i, f)).length])
        ) as Record<StockOutFilter, number>;
        return {
            total: outOfStocks.length,
            pending: byFilter.PENDING,
            ordered: byFilter.ORDERED,
            withOffers: byFilter.OFFERS,
            visible: filtered.length,
            byFilter,
        };
    }, [outOfStocks, filtered.length]);

    /* ---------------- Pagination (wide screens only) ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [query, activeFilter, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    /* ---------------- Callbacks ---------------- */
    const refreshing = isSyncing || isManualRefreshing;
    const handleRefresh = useCallback(() => void reconnectLiveSync(), [reconnectLiveSync]);
    const openOffers = useCallback((item: RetailerOutOfStockNormalized) => setOffersTarget(item), []);
    const openEdit = useCallback((item: RetailerOutOfStockNormalized) => setFormState({ mode: 'edit', item }), []);
    const handlePressItem = useCallback(
        (item: RetailerOutOfStockNormalized) => (onItemPress ? onItemPress(item) : setDetailsTarget(item)),
        [onItemPress]
    );

    const config = useMemo(() => buildConfig(openOffers), [openOffers]);

    const sharedProps = {
        query,
        setQuery,
        activeFilter,
        setActiveFilter,
        onOpenCreate: () => setFormState({ mode: 'create', item: null }),
        onRefresh: handleRefresh,
        refreshing,
        sourceLabel: dataSource === 'server' ? 'Server · live' : dataSource === 'cache' ? 'Local cache' : 'No data',
        sourceTone: dataSource as 'server' | 'cache' | 'none',
        lastSyncedTime,
        counts,
        emptyComponent,
        onViewOffers: openOffers,
        onPressItem: handlePressItem,
    };

    return (
        <>
            <DetailsDock
                placeholder="Pick an item to see its details here."
                pane={
                    <OutOfStockDetailsModal
                        item={detailsTarget}
                        onClose={() => setDetailsTarget(null)}
                        onViewOffers={(target) => {
                            setDetailsTarget(null);
                            openOffers(target);
                        }}
                        onEdit={(target) => {
                            setDetailsTarget(null);
                            openEdit(target);
                        }}
                    />
                }
            >
                <AdminListView<RetailerOutOfStockNormalized, StockOutFilter>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={config}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={handleRefresh}
                    refreshing={refreshing}
                    sourceLabel={sharedProps.sourceLabel}
                    sourceTone={sharedProps.sourceTone}
                    lastSyncedTime={lastSyncedTime}
                    emptyComponent={emptyComponent}
                    items={paginated}
                    allItems={filtered}
                    onOpenCreate={sharedProps.onOpenCreate}
                    onPressItem={handlePressItem}
                    onEditItem={openEdit}
                    rowActions={(i) => [
                        { icon: 'eye-outline', label: 'View', onPress: () => handlePressItem(i) },
                        ...(offersOf(i) && !i.is_ordered ? [{ icon: 'pricetags-outline' as const, label: 'View offers', onPress: () => openOffers(i), tone: 'primary' as const }] : []),
                    ]}
                    stats={[
                        { label: 'Waiting', value: String(counts.pending), color: counts.pending ? '#f59e0b' : undefined },
                        { label: 'With offers', value: String(counts.withOffers), color: counts.withOffers ? '#10b981' : undefined },
                        { label: 'Ordered', value: String(counts.ordered) },
                    ]}
                    filters={{
                        options: STOCKOUT_FILTERS.map((f) => ({ key: f, label: STOCKOUT_FILTER_LABELS[f], icon: STOCKOUT_FILTER_ICONS[f], count: counts.byFilter[f] })),
                        value: activeFilter,
                        onChange: setActiveFilter,
                        allKey: 'ALL',
                    }}
                    page={page}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    onPrev={() => setPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                />
            </DetailsDock>

            {/* Offers: add to / remove from the open indent happens inside */}
            <OutOfStockOffersModal item={offersTarget} onClose={() => setOffersTarget(null)} onFeedback={onOfferFeedback} />

            <OutOfStockFormModal
                visible={!!formState}
                mode={formState?.mode ?? 'create'}
                item={formState?.item ?? null}
                onClose={() => setFormState(null)}
            />
        </>
    );
}
