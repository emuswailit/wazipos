// components/retailers/forecast/RetailerForecastsWebView.tsx
//
// Wide screens: forecasts table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, type AdminListViewProps } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import type { RetailerForecastNormalized } from '@/databases/types';
import React, { useMemo } from 'react';

import { MinDailyFilter, makeForecastsConfig, type ForecastFilter } from './forecastsConfig';

export type ForecastsCounts = { total: number; withOffers: number; noOffers: number; inBasket: number };

export interface RetailerForecastsViewProps {
    query: string;
    setQuery: (v: string) => void;
    minAvgDaily: number;
    setMinAvgDaily: (v: number) => void;
    filter: ForecastFilter;
    onFilterChange: (f: ForecastFilter) => void;
    counts: ForecastsCounts;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    isStale: boolean;
    isOnline: boolean;
    lastSyncedTime: string;
    items: RetailerForecastNormalized[];
    allItems: RetailerForecastNormalized[];
    emptyComponent?: React.ReactElement | null;
    onViewOffers: (item: RetailerForecastNormalized) => void;
    onViewDetails: (item: RetailerForecastNormalized) => void;
    onRequestSupply: (item: RetailerForecastNormalized) => void;
    hasDraftItem: (item: RetailerForecastNormalized) => boolean;
    draftCount: number;

    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

export function useForecastsListProps(p: RetailerForecastsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<RetailerForecastNormalized, ForecastFilter> {
    const { hasDraftItem } = p;
    const config = useMemo(() => makeForecastsConfig(hasDraftItem), [hasDraftItem]);
    const c = p.counts;
    return {
        variant,
        config,
        query: p.query,
        setQuery: p.setQuery,
        onRefresh: p.onRefresh,
        refreshing: p.refreshing,
        sourceLabel: p.isStale ? `${p.sourceLabel} · out of date` : p.sourceLabel,
        sourceTone: p.sourceTone,
        lastSyncedTime: p.lastSyncedTime,
        items: p.items,
        allItems: p.allItems,
        emptyComponent: p.emptyComponent,
        onPressItem: p.onViewDetails,
        rowActions: (f) => [
            f.has_offers || f.has_campaigns
                ? { icon: 'pricetags-outline', label: 'View offers', onPress: () => p.onViewOffers(f), tone: 'primary' }
                : { icon: 'paper-plane-outline', label: hasDraftItem(f) ? 'Edit supply request' : 'Request supply', onPress: () => p.onRequestSupply(f), tone: 'primary' },
            { icon: 'stats-chart-outline', label: 'Forecast details', onPress: () => p.onViewDetails(f) },
        ],
        filters: {
            options: [
                { key: 'ALL', label: 'All', icon: 'apps-outline', count: c.total },
                { key: 'OFFERS', label: 'With offers', icon: 'pricetags-outline', count: c.withOffers },
                { key: 'NO_OFFERS', label: 'No offers', icon: 'help-circle-outline', count: c.noOffers },
                { key: 'IN_BASKET', label: 'In basket', icon: 'basket-outline', count: c.inBasket },
            ],
            value: p.filter,
            onChange: p.onFilterChange,
            allKey: 'ALL',
        },
        stats: [
            { label: 'Products', value: c.total.toLocaleString() },
            { label: 'With offers', value: c.withOffers.toLocaleString(), color: c.withOffers ? '#10b981' : undefined },
            { label: 'In basket', value: p.draftCount.toLocaleString(), color: p.draftCount ? '#f59e0b' : undefined },
        ],
        toolbar: <MinDailyFilter value={p.minAvgDaily} onChange={p.setMinAvgDaily} variant={variant} />,
        toolbarLabel: 'Demand',
        toolbarActive: p.minAvgDaily > 0,
        onClearToolbar: () => p.setMinAvgDaily(0),
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

export function RetailerForecastsWebView(props: RetailerForecastsViewProps) {
    return <AdminListView {...useForecastsListProps(props, 'web')} />;
}

