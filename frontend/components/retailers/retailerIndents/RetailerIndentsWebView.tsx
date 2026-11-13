// components/retailers/retailerIndents/RetailerIndentsWebView.tsx
//
// Wide screens: indents table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, type AdminListViewProps } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import type { RetailerIndent } from '@/databases/types';
import React from 'react';

import { formatKES, indentsConfig, type IndentFilter } from './indentsConfig';

export type IndentsCounts = {
    total: number;
    visible: number;
    open: number;
    overBudget: number;
    drafts: number;
    openValue: number;
};

export type RetailerIndentsViewProps = {
    indents: RetailerIndent[];
    allIndents: RetailerIndent[];
    counts: IndentsCounts;
    query: string;
    onQueryChange: (q: string) => void;
    filter: IndentFilter;
    onFilterChange: (f: IndentFilter) => void;
    refreshing: boolean;
    onRefresh: () => void;
    isLiveConnected: boolean;
    pendingIndentOpCount: number;
    lastSyncedTime: string;
    onView: (indent: RetailerIndent) => void;
    onEdit: (indent: RetailerIndent) => void;

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

export function indentsListProps(p: RetailerIndentsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<RetailerIndent, IndentFilter> {
    const c = p.counts;
    const sourceLabel = p.isLiveConnected
        ? p.pendingIndentOpCount > 0
            ? `Live · ${p.pendingIndentOpCount} change${p.pendingIndentOpCount === 1 ? '' : 's'} waiting to upload`
            : 'Live sync'
        : p.pendingIndentOpCount > 0
            ? `Offline · ${p.pendingIndentOpCount} waiting to upload`
            : 'Local cache';
    return {
        variant,
        config: indentsConfig,
        query: p.query,
        setQuery: p.onQueryChange,
        onRefresh: p.onRefresh,
        refreshing: p.refreshing,
        sourceLabel,
        sourceTone: p.isLiveConnected ? 'server' : 'cache',
        lastSyncedTime: p.lastSyncedTime,
        items: p.indents,
        allItems: p.allIndents,
        onPressItem: p.onView,
        rowActions: (i) => [
            { icon: 'eye-outline', label: 'View indent', onPress: () => p.onView(i) },
            { icon: 'create-outline', label: 'Edit indent', onPress: () => p.onEdit(i), tone: 'primary' },
        ],
        filters: {
            options: [
                { key: 'ALL', label: 'All', icon: 'apps-outline', count: c.total },
                { key: 'OPEN', label: 'Open', icon: 'folder-open-outline', count: c.open },
                { key: 'OVER_BUDGET', label: 'Over budget', icon: 'alert-circle-outline', count: c.overBudget },
                { key: 'DRAFTS', label: 'Drafts', icon: 'cloud-upload-outline', count: c.drafts },
            ],
            value: p.filter,
            onChange: p.onFilterChange,
            allKey: 'ALL',
        },
        stats: [
            { label: 'Open', value: c.open.toLocaleString() },
            { label: 'Open value', value: formatKES(c.openValue) },
            { label: 'Over budget', value: c.overBudget.toLocaleString(), color: c.overBudget ? '#f43f5e' : undefined },
        ],
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

export function RetailerIndentsWebView(props: RetailerIndentsViewProps) {
    return <AdminListView {...indentsListProps(props, 'web')} />;
}

