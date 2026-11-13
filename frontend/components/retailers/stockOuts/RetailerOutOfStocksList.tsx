// components/retailers/stockOuts/RetailerOutOfStocksList.tsx
//
// Retailer out-of-stocks view — shell.
//
// Owns data + filter state, dispatches to the Web or Mobile view,
// and mounts the offers / details / form modals.
//
// Adding an offer to (or removing it from) the open indent is handled inside
// OutOfStockOffersModal via useIndentBridge (offline-first); this shell only opens it.

import { useRetailerOutOfStocksSync } from '@/context/RetailerOutOfStocksSyncContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import type { PageSize } from '@/components/common/PaginationBar';
import { OutOfStockDetailsModal } from './OutOfStockDetailsModal';
import { OutOfStockFormModal } from './OutOfStockFormModal';
import { OutOfStockOffersModal, type OutOfStockFeedback } from './OutOfStockOffersModal';
import { RetailerOutOfStocksMobileView } from './RetailerOutOfStocksMobileView';
import {
    matchesStockOutFilter,
    RetailerOutOfStocksWebView,
    STOCKOUT_FILTERS,
    type StockOutCounts,
    type StockOutFilter,
} from './RetailerOutOfStocksWebView';

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

    const sharedProps = {
        query,
        setQuery,
        activeFilter,
        setActiveFilter,
        onOpenCreate: () => setFormState({ mode: 'create', item: null }),
        onRefresh: handleRefresh,
        refreshing,
        sourceLabel: dataSource === 'server' ? 'Server · live' : dataSource === 'cache' ? 'Local cache' : 'No data',
        sourceTone: dataSource,
        lastSyncedTime,
        counts,
        emptyComponent,
        onViewOffers: openOffers,
        onPressItem: handlePressItem,
    };

    return (
        <>
            {isLarge ? (
                <RetailerOutOfStocksWebView
                    {...sharedProps}
                    items={paginated}
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
            ) : (
                // No pagination on small screens: the whole filtered list
                <RetailerOutOfStocksMobileView {...sharedProps} items={filtered} />
            )}

            {/* Offers: add to / remove from the open indent happens inside */}
            <OutOfStockOffersModal item={offersTarget} onClose={() => setOffersTarget(null)} onFeedback={onOfferFeedback} />

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

            <OutOfStockFormModal
                visible={!!formState}
                mode={formState?.mode ?? 'create'}
                item={formState?.item ?? null}
                onClose={() => setFormState(null)}
            />
        </>
    );
}
