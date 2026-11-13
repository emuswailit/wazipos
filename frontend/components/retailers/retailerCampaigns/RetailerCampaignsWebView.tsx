// components/retailers/retailerCampaigns/RetailerCampaignsWebView.tsx
//
// Wide screens: campaign inbox table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, type AdminListViewProps } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import React from 'react';

import { campaignsConfig, daysLeft } from './campaignsConfig';
import type { Campaign, UUID } from './types';

export interface RetailerCampaignsViewProps {
    campaigns: Campaign[];
    /** Whole filtered list (phones show all of it). */
    allCampaigns?: Campaign[];
    totalCampaigns: number;
    isLoading: boolean;
    error: string | null;
    onOpen: (id: UUID) => void;
    onRefresh: () => void;
    refreshing: boolean;
    query: string;
    setQuery: (q: string) => void;
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

/** Maps the shell's props onto the shared list view. */
export function campaignsListProps(p: RetailerCampaignsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<Campaign> {
    const endingSoon = (p.allCampaigns ?? p.campaigns).filter((c) => {
        const d = daysLeft(c);
        return d !== null && d >= 0 && d <= 3;
    }).length;
    return {
        variant,
        config: campaignsConfig,
        query: p.query,
        setQuery: p.setQuery,
        onRefresh: p.onRefresh,
        refreshing: p.refreshing || p.isLoading,
        error: p.error,
        items: p.campaigns,
        allItems: p.allCampaigns,
        onPressItem: (c) => p.onOpen(c.id),
        stats: [
            { label: 'Live campaigns', value: p.totalCampaigns.toLocaleString() },
            { label: 'Ending soon', value: endingSoon.toLocaleString(), color: endingSoon ? '#f59e0b' : undefined },
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

export default function RetailerCampaignsWebView(props: RetailerCampaignsViewProps) {
    return <AdminListView {...campaignsListProps(props, 'web')} />;
}
