// components/retailers/purchasesReturns/RetailerPurchasesReturnsList.tsx
//
// Shell for purchases returns (stock sent back to wholesalers) — read only.
//
// Returns are created from Stock adjustments (decrease + "Wholesaler return"), so
// "New return" opens that screen. GetPurchasesReturns takes no filters and
// paginates server-side: we fetch one large page and filter / page locally.

import { PAGE_SIZE_OPTIONS, type PageSize } from '@/components/common/PaginationBar';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';
import { describeFailure, isAuthFailure } from '@/utils/authGuard';

import { PurchasesReturnDetailsSheet } from './PurchasesReturnDetailsSheet';
import { RETURN_STATUSES, type ReturnStatus } from './purchasesReturnsConfig';
import { RetailerPurchasesReturnsMobileView } from './RetailerPurchasesReturnsMobileView';
import { RetailerPurchasesReturnsWebView } from './RetailerPurchasesReturnsWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const FETCH_PAGE_SIZE = 500;

/** WholesalerReceiptReturnListSerializer (backend wholesalers/serializers.py). */
export interface PurchasesReturn {
    id: string;
    product: string;
    product_title?: string | null;
    retailer_entity?: string;
    retailer_title?: string | null;
    wholesaler_entity?: string;
    wholesaler_title?: string | null;
    quantity: number | string;
    total_refund_amount?: string | number | null;
    reason?: string | null;
    reason_display?: string | null;
    status: string;
    status_display?: string | null;
    created: string;
    updated: string;
}

export type ReturnStatusFilter = 'ALL' | ReturnStatus;

function matchesQuery(r: PurchasesReturn, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [r.product_title, r.wholesaler_title, r.reason_display, r.reason, r.status_display, r.status, r.id].some((v) =>
        String(v ?? '').toLowerCase().includes(needle)
    );
}

const RetailerPurchasesReturnsList: React.FC = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Server data ---------------- */
    const [records, setRecords] = useState<PurchasesReturn[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await retailersApi.getPurchasesReturnsAction({ page: 1, page_size: FETCH_PAGE_SIZE });
                if (cancelled) return;
                if (!res.ok) {
                    if (!isAuthFailure(res)) setError(`Could not load returns (${describeFailure(res)}).`);
                    return;
                }
                const body = res.data as any;
                setRecords(Array.isArray(body?.results) ? body.results : []);
            } catch (e: any) {
                if (!cancelled) setError(e?.message ?? 'Could not load returns.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshTick]);

    const onRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);

    /* ---------------- Filters ---------------- */
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<ReturnStatusFilter>('ALL');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [detailsTarget, setDetailsTarget] = useState<PurchasesReturn | null>(null);

    const visible = useMemo(() => {
        let base = records;
        if (statusFilter !== 'ALL') base = base.filter((r) => r.status === statusFilter);
        if (dateFrom) base = base.filter((r) => (r.created || '').slice(0, 10) >= dateFrom);
        if (dateTo) base = base.filter((r) => (r.created || '').slice(0, 10) <= dateTo);
        return base
            .filter((r) => matchesQuery(r, query.trim()))
            .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    }, [records, statusFilter, dateFrom, dateTo, query]);

    const counts = useMemo(() => {
        const byStatus = Object.fromEntries(RETURN_STATUSES.map((s) => [s, records.filter((r) => r.status === s).length])) as Record<ReturnStatus, number>;
        const refunded = records
            .filter((r) => r.status === 'ACCEPTED')
            .reduce((sum, r) => sum + (Number(r.total_refund_amount ?? 0) || 0), 0);
        const totalQuantity = records.reduce((sum, r) => sum + (Number(r.quantity ?? 0) || 0), 0);
        return { all: records.length, visible: visible.length, byStatus, refunded, totalQuantity };
    }, [records, visible.length]);

    /* ---------------- Pagination (wide screens) ---------------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => setPage(1), [query, statusFilter, dateFrom, dateTo, pageSize]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => visible.slice(pageStart, pageEnd), [visible, pageStart, pageEnd]);

    const common = {
        returns: paginated,
        allReturns: visible,
        counts,
        query,
        onQueryChange: setQuery,
        statusFilter,
        onStatusChange: setStatusFilter,
        dateFrom,
        onDateFromChange: setDateFrom,
        dateTo,
        onDateToChange: setDateTo,
        onClearFilters: () => {
            setStatusFilter('ALL');
            setDateFrom('');
            setDateTo('');
        },
        loading,
        error,
        onRefresh,
        // Returns are created from Stock adjustments (decrease + "Wholesaler return").
        onNewReturn: () => router.push('/stockAdjustments?tab=stockAdjustments' as any),
        onViewReturn: setDetailsTarget,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => setPageSize(size),
    };

    return (
        <>
            {isLarge ? <RetailerPurchasesReturnsWebView {...common} /> : <RetailerPurchasesReturnsMobileView {...common} />}
            <PurchasesReturnDetailsSheet item={detailsTarget} onClose={() => setDetailsTarget(null)} />
        </>
    );
};

export default RetailerPurchasesReturnsList;
