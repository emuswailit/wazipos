// components/retailers/retailerRequisitions/RetailerRequisitionsList.tsx
//
// Retailer-side requisitions view — shell.
//
// Data lives in RetailerOrdersSyncContext (mirrored over the
// RetailerOrders websocket). This shell reads it, computes search
// and filter state, owns pagination state, dispatches to the Web or
// Mobile breakpoint, and mounts the details modal.

import {
    PAGE_SIZE_OPTIONS,
    type PageSize,
} from '@/components/common/PaginationBar';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import type { RetailerOrder } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { RetailerRequisitionsDetailsModal } from './RetailerRequisitionsDetailsModal';
import { RetailerRequisitionsMobileView } from './RetailerRequisitionsMobileView';
import { RetailerRequisitionsWebView } from './RetailerRequisitionsWebView';
import {
    balanceOf,
    orderRef,
    toBool,
    totalOf,
    type RequisitionsCounts,
} from './primitives';

// Same rule as the Customer Orders screen: paginated table only on wide web screens;
// native apps and narrow web get the full card list (no pagination).
const LARGE_SCREEN_MIN_WIDTH = 768;

/** Newest first. */
const createdMs = (o: RetailerOrder): number => {
    const t = new Date(String(o.created ?? '').replace(' ', 'T')).getTime();
    return Number.isNaN(t) ? 0 : t;
};

/* =========================================================
 * Search
 * ======================================================= */

function matchesQuery(o: RetailerOrder, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();

    const haystacks = [
        orderRef(o),
        o.wholesaler_title,
        o.retailer_title,
        o.title,
        o.order_origin,
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

    for (const h of haystacks) {
        if (h.includes(needle)) return true;
    }

    for (const item of o.order_items ?? []) {
        const t = String(item.product_title || '').toLowerCase();
        if (t.includes(needle)) return true;

        const b = String(item.batch || '').toLowerCase();
        if (b.includes(needle)) return true;
    }

    return false;
}

/* =========================================================
 * Component
 * ======================================================= */

const RetailerRequisitionsList: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = Platform.OS === 'web' && width >= LARGE_SCREEN_MIN_WIDTH;

    const {
        retailerOrders,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        syncStatus,
        lastSyncedTime,
        forceManualRefresh,
    } = useRetailerOrdersSync();

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [onlyUnpaid, setOnlyUnpaid] = useState(false);
    const [selected, setSelected] =
        useState<RetailerOrder | null>(null);

    /* ---------------- Pagination state ---------------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- Filtering ---------------- */
    const visible = useMemo(() => {
        const base = onlyUnpaid
            ? retailerOrders.filter((o) => !toBool(o.is_paid))
            : retailerOrders;

        return base
            .filter((o) => matchesQuery(o, query))
            .sort((a, b) => createdMs(b) - createdMs(a));
    }, [retailerOrders, onlyUnpaid, query]);

    const counts: RequisitionsCounts = useMemo(
        () => ({
            total: retailerOrders.length,
            visible: visible.length,
            unpaid: retailerOrders.filter(
                (o) => !toBool(o.is_paid)
            ).length,
            submitted: retailerOrders.filter(
                (o) =>
                    (o.status || '').toUpperCase() ===
                    'SUBMITTED'
            ).length,
            visibleValue: visible.reduce((sum, o) => sum + totalOf(o), 0),
            visibleBalance: visible.reduce((sum, o) => sum + balanceOf(o), 0),
        }),
        [retailerOrders, visible]
    );

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    // Reset to page 1 whenever the filter or page size changes.
    useEffect(() => {
        setPage(1);
    }, [query, onlyUnpaid, pageSize]);

    // Clamp page if the list shrinks below the current page.
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => visible.slice(pageStart, pageEnd),
        [visible, pageStart, pageEnd]
    );

    const goPrev = useCallback(
        () => setPage((p) => Math.max(1, p - 1)),
        []
    );
    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages]
    );
    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
        setPage(1);
    }, []);

    /* ---------------- Refresh / handlers ---------------- */
    const refreshing = isSyncing || isManualRefreshing;

    const onRefresh = useCallback(() => {
        forceManualRefresh();
    }, [forceManualRefresh]);

    const onView = useCallback((order: RetailerOrder) => {
        setSelected(order);
    }, []);

    const onCloseDetails = useCallback(() => {
        setSelected(null);
    }, []);

    const onQueryChange = useCallback((q: string) => {
        setQuery(q);
    }, []);

    const onToggleOnlyUnpaid = useCallback(() => {
        setOnlyUnpaid((v) => !v);
    }, []);

    /* ---------------- Shared props ---------------- */
    const common = {
        // Web table gets the current page; the mobile list gets everything (no pagination).
        orders: isLarge ? paginated : visible,
        counts,
        query,
        onQueryChange,
        onlyUnpaid,
        onToggleOnlyUnpaid,
        refreshing,
        onRefresh,
        isLiveConnected,
        syncStatus,
        lastSyncedTime,
        onView,

        // pagination
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: goPrev,
        onNext: goNext,
        onPageSizeChange: changePageSize,
    };

    return (
        <>
            {isLarge ? (
                <RetailerRequisitionsWebView {...common} />
            ) : (
                <RetailerRequisitionsMobileView {...common} />
            )}

            <RetailerRequisitionsDetailsModal
                order={selected}
                visible={!!selected}
                onClose={onCloseDetails}
                onRefreshParentLedger={onRefresh}
            />
        </>
    );
};

export default RetailerRequisitionsList;