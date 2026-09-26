// components/wholesalers/orders/RetailerOrdersList.tsx

import { useAuth } from '@/context/AuthContext';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import type { RetailerOrder } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Platform,
    Text,
    useWindowDimensions,
    View
} from 'react-native';
import { RetailerOrderDetailsModal } from './RetailerOrderDetailsModal';
import RetailerOrdersMobileView from './RetailerOrdersMobileView';
import RetailerOrdersWebView from './RetailerOrdersWebView';

/* =========================================================
 * Page size type — mirrors the inventory list
 * ======================================================= */
export type PageSize = 10 | 20 | 50 | 100;

export const PAGE_SIZE_OPTIONS: PageSize[] = [
    10, 20, 50, 100,
];

export interface OrderStatusFilter {
    value: string;
    label: string;
}

export const STATUS_FILTERS: OrderStatusFilter[] = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'DELIVERED', label: 'Delivered' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

/* =========================================================
 * List shell
 * ======================================================= */
export default function RetailerOrdersList() {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === 'web' && width >= 768;

    const {
        retailerOrders,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        isPushSyncing,
        pendingCount,
        syncStatus,
        forceManualRefresh,
        syncUiState,
    } = useRetailerOrdersSync();

    /* -------- Query + filters -------- */
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<
        string | null
    >(null);

    /* -------- Pagination -------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(20);

    /* -------- Source label -------- */
    const sourceLabel = isLiveConnected
        ? 'LIVE'
        : isSyncing
            ? 'SYNCING'
            : 'CACHE';
    const sourceTone: 'server' | 'cache' | 'none' =
        isLiveConnected
            ? 'server'
            : isSyncing
                ? 'server'
                : 'cache';

    /* -------- Filtering -------- */
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();

        return (retailerOrders ?? []).filter((o) => {
            /* Status filter */
            if (
                statusFilter &&
                String(o.status).toUpperCase() !==
                statusFilter.toUpperCase()
            ) {
                return false;
            }

            if (!needle) return true;

            const haystack = [
                o.retailer_title,
                o.wholesaler_title,
                o.reference_number,
                o.document_number_display,
                o.draft_id,
                o.owner_title,
                o.payment_method_title,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(needle);
        });
    }, [retailerOrders, query, statusFilter]);

    /* -------- Reset page on filter change -------- */
    useEffect(() => {
        setPage(1);
    }, [query, statusFilter, pageSize]);

    /* -------- Pagination slice -------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const pageEnd = Math.min(
        pageStart + pageSize,
        totalItems
    );
    const pagedItems = filtered.slice(pageStart, pageEnd);

    /* -------- Detail modal -------- */
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailOrder, setDetailOrder] =
        useState<RetailerOrder | null>(null);

    const openDetail = useCallback((o: RetailerOrder) => {
        setDetailOrder(o);
        setDetailOpen(true);
    }, []);

    /* -------- Shared props -------- */
    const sharedProps = {
        query,
        setQuery,
        statusFilter,
        setStatusFilter,
        statusFilters: STATUS_FILTERS,
        onRefresh: forceManualRefresh,
        refreshing: isManualRefreshing || isPushSyncing,
        sourceLabel,
        sourceTone,
        lastSyncedTime: syncUiState.lastSyncedTime,
        items: pagedItems,
        onPressOrder: openDetail,
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
        pageStart: pageStart + 1,
        pageEnd,
        onPrev: () =>
            setPage((p) => Math.max(1, p - 1)),
        onNext: () =>
            setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => {
            setPageSize(size);
            setPage(1);
        },
    };

    /* -------- Loading skeleton -------- */
    if (!retailerOrders?.length && isSyncing) {
        return (
            <View
                className="flex-1 items-center justify-center"
                style={{ backgroundColor: theme.background }}
            >
                <ActivityIndicator
                    size="large"
                    color={theme.primary}
                />
                <Text
                    className="mt-3 text-sm"
                    style={{ color: theme.textDark }}
                >
                    Loading retailer orders…
                </Text>
            </View>
        );
    }

    return (
        <>
            {isWeb ? (
                <RetailerOrdersWebView {...sharedProps} />
            ) : (
                <RetailerOrdersMobileView {...sharedProps} />
            )}

            {/* -------- Detail modal -------- */}
            {detailOrder ? (
                <RetailerOrderDetailsModal
                    visible={detailOpen}
                    order={detailOrder}
                    onClose={() => setDetailOpen(false)}
                />
            ) : null}
        </>
    );
}