// components/retailers/stockAdjustments/StockAdjustmentsWebView.tsx
//
// Wide screens: stock adjustments table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, DateRangeFilter, type AdminFilters, type AdminListViewProps, type AdminStat } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import React from 'react';

import { stockAdjustmentsConfig } from './stockAdjustmentsConfig';
import type { StockAdjustment, StockAdjustmentDirection } from './StockAdjustmentsList';

export type StockAdjustmentsViewProps = {
    adjustments: StockAdjustment[];
    /** Whole filtered list (phones show all of it). */
    allAdjustments?: StockAdjustment[];
    counts: { all: number; visible: number; increments: number; decrements: number };
    query: string;
    onQueryChange: (q: string) => void;
    directionFilter: StockAdjustmentDirection | null;
    onDirectionFilterChange: (d: StockAdjustmentDirection | null) => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearFilters: () => void;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onNewAdjustment: () => void;
    onViewAdjustment?: (a: StockAdjustment) => void;
    onEditAdjustment: (a: StockAdjustment) => void;
    onDeleteAdjustment: (a: StockAdjustment) => void;

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

type Direction = 'ALL' | StockAdjustmentDirection;

/** Maps the shell's props onto the shared list view. */
export function stockAdjustmentsListProps(p: StockAdjustmentsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<StockAdjustment, Direction> {
    const filters: AdminFilters<Direction> = {
        options: [
            { key: 'ALL', label: 'All', icon: 'apps-outline' },
            { key: 'INCREMENT', label: 'Stock in', icon: 'arrow-up-outline' },
            { key: 'DECREMENT', label: 'Stock out', icon: 'arrow-down-outline' },
        ],
        value: p.directionFilter ?? 'ALL',
        onChange: (k) => p.onDirectionFilterChange(k === 'ALL' ? null : k),
        allKey: 'ALL',
    };
    const stats: AdminStat[] = [
        { label: 'Adjustments', value: p.counts.all.toLocaleString() },
        { label: 'Units in', value: `+${p.counts.increments.toLocaleString()}`, color: p.counts.increments ? '#10b981' : undefined },
        { label: 'Units out', value: `−${p.counts.decrements.toLocaleString()}`, color: p.counts.decrements ? '#f43f5e' : undefined },
    ];
    return {
        variant,
        config: stockAdjustmentsConfig,
        query: p.query,
        setQuery: p.onQueryChange,
        onRefresh: p.onRefresh,
        refreshing: p.loading,
        error: p.error,
        items: p.adjustments,
        allItems: p.allAdjustments,
        onOpenCreate: p.onNewAdjustment,
        onPressItem: p.onViewAdjustment ?? p.onEditAdjustment,
        onEditItem: p.onEditAdjustment,
        rowActions: (a) => [{ icon: 'trash-outline', label: 'Delete adjustment', tone: 'danger', onPress: () => p.onDeleteAdjustment(a) }],
        filters,
        stats,
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

export function StockAdjustmentsWebView(props: StockAdjustmentsViewProps) {
    return <AdminListView {...stockAdjustmentsListProps(props, 'web')} />;
}

