// components/retailers/purchasesReturns/RetailerPurchasesReturnsWebView.tsx
//
// Wide screens: purchases returns table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, DateRangeFilter, type AdminListViewProps } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import React from 'react';

import { formatKES, purchasesReturnsConfig, type ReturnStatus } from './purchasesReturnsConfig';
import type { PurchasesReturn, ReturnStatusFilter } from './RetailerPurchasesReturnsList';

export type RetailerPurchasesReturnsViewProps = {
    returns: PurchasesReturn[];
    allReturns?: PurchasesReturn[];
    counts: { all: number; visible: number; byStatus: Record<ReturnStatus, number>; refunded: number; totalQuantity: number };
    query: string;
    onQueryChange: (q: string) => void;
    statusFilter: ReturnStatusFilter;
    onStatusChange: (s: ReturnStatusFilter) => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearFilters: () => void;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onNewReturn: () => void;
    onViewReturn: (r: PurchasesReturn) => void;

    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
};

/** Maps the shell's props onto the shared list view. */
export function purchasesReturnsListProps(p: RetailerPurchasesReturnsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<PurchasesReturn, ReturnStatusFilter> {
    const s = p.counts.byStatus;
    return {
        variant,
        config: purchasesReturnsConfig,
        query: p.query,
        setQuery: p.onQueryChange,
        onRefresh: p.onRefresh,
        refreshing: p.loading,
        error: p.error,
        items: p.returns,
        allItems: p.allReturns,
        onOpenCreate: p.onNewReturn,
        onPressItem: p.onViewReturn,
        filters: {
            options: [
                { key: 'ALL', label: 'All', icon: 'apps-outline' },
                { key: 'PENDING', label: 'Awaiting', icon: 'time-outline', count: s.PENDING },
                { key: 'ACCEPTED', label: 'Accepted', icon: 'checkmark-circle-outline', count: s.ACCEPTED },
                { key: 'REJECTED', label: 'Rejected', icon: 'close-circle-outline', count: s.REJECTED },
                { key: 'CANCELLED', label: 'Cancelled', icon: 'remove-circle-outline', count: s.CANCELLED },
            ],
            value: p.statusFilter,
            onChange: p.onStatusChange,
            allKey: 'ALL',
        },
        stats: [
            { label: 'Returns', value: p.counts.all.toLocaleString() },
            { label: 'Awaiting', value: s.PENDING.toLocaleString(), color: s.PENDING ? '#f59e0b' : undefined },
            { label: 'Refunded', value: formatKES(p.counts.refunded), color: p.counts.refunded ? '#10b981' : undefined },
        ],
        toolbar: <DateRangeFilter from={p.dateFrom} to={p.dateTo} onFromChange={p.onDateFromChange} onToChange={p.onDateToChange} variant={variant} />,
        toolbarActive: !!p.dateFrom || !!p.dateTo,
        onClearToolbar: p.onClearFilters,
        page: p.page,
        pageSize: p.pageSize,
        totalItems: p.totalItems,
        totalPages: p.totalPages,
        pageStart: p.pageStart,
        pageEnd: p.pageEnd,
        onPrev: p.onPrev,
        onNext: p.onNext,
        onPageSizeChange: p.onPageSizeChange,
    };
}

export function RetailerPurchasesReturnsWebView(props: RetailerPurchasesReturnsViewProps) {
    return <AdminListView {...purchasesReturnsListProps(props, 'web')} />;
}

