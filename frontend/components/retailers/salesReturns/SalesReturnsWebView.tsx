// components/retailers/salesReturns/SalesReturnsWebView.tsx
//
// Wide screens: sales returns table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, DateRangeFilter, type AdminListViewProps } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import React from 'react';

import { salesReturnsConfig } from './salesReturnsConfig';
import type { SalesReturn } from './SalesReturnsList';

export type SalesReturnsViewProps = {
    returns: SalesReturn[];
    /** Whole filtered list (phones show all of it). */
    allReturns?: SalesReturn[];
    counts: { all: number; visible: number; totalQuantity: number };
    query: string;
    onQueryChange: (q: string) => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearFilters: () => void;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onNewReturn: () => void;
    onViewReturn?: (r: SalesReturn) => void;
    onEditReturn: (r: SalesReturn) => void;
    onDeleteReturn: (r: SalesReturn) => void;

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
export function salesReturnsListProps(p: SalesReturnsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<SalesReturn> {
    return {
        variant,
        config: salesReturnsConfig,
        query: p.query,
        setQuery: p.onQueryChange,
        onRefresh: p.onRefresh,
        refreshing: p.loading,
        error: p.error,
        items: p.returns,
        allItems: p.allReturns,
        onOpenCreate: p.onNewReturn,
        onPressItem: p.onViewReturn ?? p.onEditReturn,
        onEditItem: p.onEditReturn,
        rowActions: (r) => [{ icon: 'trash-outline', label: 'Delete return', tone: 'danger', onPress: () => p.onDeleteReturn(r) }],
        stats: [
            { label: 'Returns', value: p.counts.all.toLocaleString() },
            { label: 'Units returned', value: p.counts.totalQuantity.toLocaleString() },
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

export function SalesReturnsWebView(props: SalesReturnsViewProps) {
    return <AdminListView {...salesReturnsListProps(props, 'web')} />;
}

