// components/wholesalers/inventory/WholesalerReceiptsList.tsx

import { useWholesalerReceiptsSync } from '@/context/WholesalerReceiptsSyncContext';
import { WholesalerReceipt } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import { WholesalerReceiptDetailsModal } from './WholesalerReceiptDetailsModal';
import { WholesalerReceiptsMobileView } from './WholesalerReceiptsMobileView';
import { WholesalerReceiptsWebView } from './WholesalerReceiptsWebView';

export type { WholesalerReceipt };

/* =========================================================
 * Constants
 * ======================================================= */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const EXPIRY_FILTERS = [
    { value: 'FRESH', label: 'Fresh' },
    { value: 'EXPIRING', label: 'Expiring' },
    { value: 'EXPIRING_SOON', label: 'Expiring soon' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'UNKNOWN', label: 'No expiry' },
] as const;

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    onReceiptPress?: (receipt: WholesalerReceipt) => void;
    emptyComponent?: React.ReactNode;
}

/* =========================================================
 * Component
 * ======================================================= */

export default function WholesalerReceiptsList({
    onReceiptPress,
    emptyComponent,
}: Props) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const {
        wholesalerReceipts: items,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        pendingCount,
        syncStatus,
        lastSyncedTime,
        forceManualRefresh,
    } = useWholesalerReceiptsSync();

    /* ---------------- UI state ---------------- */
    const [query, setQuery] = useState('');
    const [expiryFilter, setExpiryFilter] = useState<
        string | null
    >(null);
    const [inStockOnly, setInStockOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [detailsTarget, setDetailsTarget] =
        useState<WholesalerReceipt | null>(null);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        let base = items;

        if (expiryFilter) {
            base = base.filter(
                (r) => r.expiry_status === expiryFilter
            );
        }

        if (inStockOnly) {
            base = base.filter(
                (r) => r.current_unit_quantity > 0
            );
        }

        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((r) => {
            if (r.title?.toLowerCase().includes(q)) return true;
            if (r.product_title?.toLowerCase().includes(q))
                return true;
            if (r.bar_code?.toLowerCase().includes(q))
                return true;
            if (r.batch?.toLowerCase().includes(q)) return true;
            if (
                r.received_from_title?.toLowerCase().includes(q)
            )
                return true;
            return false;
        });
    }, [items, query, expiryFilter, inStockOnly]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [query, expiryFilter, inStockOnly, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(
        pageStart + pageSize,
        totalItems
    );

    const paginated = useMemo(
        () => filtered.slice(pageStart, pageEnd),
        [filtered, pageStart, pageEnd]
    );

    /* ---------------- Handlers ---------------- */
    const handleRefresh = useCallback(() => {
        void forceManualRefresh();
    }, [forceManualRefresh]);

    const openDetails = useCallback(
        (receipt: WholesalerReceipt) => {
            setDetailsTarget(receipt);
            onReceiptPress?.(receipt);
        },
        [onReceiptPress]
    );

    const closeDetails = useCallback(
        () => setDetailsTarget(null),
        []
    );

    /* ---------------- Pagination handlers ---------------- */
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

    /* ---------------- Shared props ---------------- */
    const refreshing = isSyncing || isManualRefreshing;

    const sourceTone:
        | 'server'
        | 'cache'
        | 'none' = isLiveConnected
            ? 'server'
            : items.length > 0
                ? 'cache'
                : 'none';

    const sharedProps = {
        query,
        setQuery,
        expiryFilter,
        setExpiryFilter,
        expiryFilters: EXPIRY_FILTERS,
        inStockOnly,
        setInStockOnly,
        onRefresh: handleRefresh,
        refreshing,
        isLiveConnected,
        syncStatus,
        sourceLabel:
            sourceTone === 'server'
                ? 'Live · socket'
                : sourceTone === 'cache'
                    ? 'Local cache'
                    : 'No data',
        sourceTone,
        lastSyncedTime,
        pendingCount,
        items: paginated,
        emptyComponent,
        onPressReceipt: openDetails,
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

    /* ---------------- Render ---------------- */
    return (
        <>
            {isLarge ? (
                <WholesalerReceiptsWebView {...sharedProps} />
            ) : (
                <WholesalerReceiptsMobileView {...sharedProps} />
            )}

            <WholesalerReceiptDetailsModal
                receipt={detailsTarget}
                onClose={closeDetails}
            />
        </>
    );
}

export { EXPIRY_FILTERS };
