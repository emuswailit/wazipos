// components/retailers/retailerPrescriptions/RetailerPrescriptionsWebView.tsx
//
// Wide screens: prescriptions table (shared list-screen kit).
// Also exports the view contract + list wiring shared with the mobile view.

import { AdminListView, type AdminListViewProps } from '@/components/common/listScreen';
import React from 'react';

import { canEditItems, prescriptionsConfig } from './prescriptionsConfig';
import type { PageSize, PrescriptionCounts, PrescriptionNormalized } from './RetailerPrescriptionsList';

export interface RetailerPrescriptionsViewProps {
    query: string;
    setQuery: (v: string) => void;
    onlyPending: boolean;
    setOnlyPending: (fn: (v: boolean) => boolean) => void;
    onRefresh: () => void;
    onDigitize: (item: PrescriptionNormalized) => void;
    refreshing: boolean;
    counts: PrescriptionCounts;
    items: PrescriptionNormalized[];
    /** Whole filtered list (phones show all of it). */
    allItems?: PrescriptionNormalized[];
    onPressItem: (item: PrescriptionNormalized) => void;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
    loading: boolean;
}

type Show = 'ALL' | 'QUEUED';

/** Maps the shell's props onto the shared list view. */
export function prescriptionsListProps(p: RetailerPrescriptionsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<PrescriptionNormalized, Show> {
    return {
        variant,
        config: prescriptionsConfig,
        query: p.query,
        setQuery: p.setQuery,
        onRefresh: p.onRefresh,
        refreshing: p.refreshing || p.loading,
        items: p.items,
        allItems: p.allItems,
        onPressItem: p.onPressItem,
        rowActions: (rx) =>
            canEditItems(rx)
                ? [{ icon: 'sparkles-outline', label: prescriptionItemsLabel(rx), tone: 'primary', onPress: () => p.onDigitize(rx) }]
                : [],
        filters: {
            options: [
                { key: 'ALL', label: 'All', icon: 'apps-outline' },
                { key: 'QUEUED', label: 'Queued', icon: 'time-outline', count: p.counts.queuing },
            ],
            value: p.onlyPending ? 'QUEUED' : 'ALL',
            onChange: (k) => p.setOnlyPending(() => k === 'QUEUED'),
            allKey: 'ALL',
        },
        stats: [
            { label: 'Prescriptions', value: p.counts.total.toLocaleString() },
            { label: 'Queued', value: p.counts.queuing.toLocaleString(), color: p.counts.queuing ? '#f59e0b' : undefined },
            { label: 'Needs verification', value: p.counts.needsVerification.toLocaleString(), color: p.counts.needsVerification ? '#f59e0b' : undefined },
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

function prescriptionItemsLabel(rx: PrescriptionNormalized) {
    const n = (rx.prescription_items || rx.items || []).length;
    return n > 0 ? 'Manage medicines' : 'Digitize prescription';
}

export function RetailerPrescriptionsWebView(props: RetailerPrescriptionsViewProps) {
    return <AdminListView {...prescriptionsListProps(props, 'web')} />;
}

