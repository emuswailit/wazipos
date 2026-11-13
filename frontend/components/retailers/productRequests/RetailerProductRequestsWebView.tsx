// components/retailers/productRequests/RetailerProductRequestsWebView.tsx
//
// Wide screens: product requests table (shared list-screen kit).
// Also exports the list wiring shared with the mobile view.

import { AdminListView, type AdminListViewProps, type IconName } from '@/components/common/listScreen';
import type { ProductRequestSummary } from '@/databases/types';
import React from 'react';

import { needsAction, offerCount, productRequestsConfig } from './productRequestsConfig';
import type { RetailerProductRequestsSharedProps } from './types';

const FILTER_ICONS: Record<string, IconName> = {
    ALL: 'apps-outline',
    DRAFT: 'create-outline',
    PUBLISHED: 'paper-plane-outline',
    ACKNOWLEDGED: 'pricetags-outline',
    PARTIALLY_FULFILLED: 'pie-chart-outline',
    FULFILLED: 'checkmark-done-outline',
    CANCELLED: 'close-circle-outline',
    EXPIRED: 'hourglass-outline',
};

export function productRequestsListProps(p: RetailerProductRequestsSharedProps, variant: 'mobile' | 'web'): AdminListViewProps<ProductRequestSummary, string> {
    const c = p.statusCounts;
    const all: ProductRequestSummary[] = p.allItems ?? p.items;
    const toReview = all.filter((r) => needsAction(r) && offerCount(r) > 0).length;
    const pendingUploads = p.pendingRequestCount + p.pendingOfferCount;
    return {
        variant,
        config: productRequestsConfig,
        query: p.query,
        setQuery: p.setQuery,
        onRefresh: p.onRefresh,
        refreshing: p.refreshing,
        sourceLabel: pendingUploads > 0 ? `${p.sourceLabel} · ${pendingUploads} waiting to upload` : p.sourceLabel,
        sourceTone: p.sourceTone,
        lastSyncedTime: p.lastSyncedTime,
        items: p.items,
        allItems: p.allItems,
        emptyComponent: p.emptyComponent,
        onOpenCreate: p.onOpenCreate,
        onPressItem: p.onPressRequest,
        rowActions: (r) => [
            needsAction(r)
                ? { icon: statusIsDraft(r) ? 'paper-plane-outline' : 'pricetags-outline', label: statusIsDraft(r) ? 'Review and publish' : 'Review offers', onPress: () => p.onPressRequest(r), tone: 'primary' }
                : { icon: 'eye-outline', label: 'View request', onPress: () => p.onPressRequest(r) },
        ],
        filters: {
            options: p.statusOptions
                .filter((s: any) => s.value === 'ALL' || (c[s.value] ?? 0) > 0 || s.value === p.statusFilter)
                .map((s: any) => ({ key: s.value, label: s.label, icon: FILTER_ICONS[s.value] ?? 'ellipse-outline', count: c[s.value] ?? 0 })),
            value: p.statusFilter ?? 'ALL',
            onChange: (k) => p.setStatusFilter(k === 'ALL' ? null : k),
            allKey: 'ALL',
        },
        stats: [
            { label: 'Requests', value: (c.ALL ?? 0).toLocaleString() },
            { label: 'To review', value: toReview.toLocaleString(), color: toReview ? '#6366f1' : undefined },
            { label: 'Fulfilled', value: (c.FULFILLED ?? 0).toLocaleString(), color: c.FULFILLED ? '#10b981' : undefined },
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

const statusIsDraft = (r: ProductRequestSummary) => String(r.status ?? '').toUpperCase() === 'DRAFT';

export function RetailerProductRequestsWebView(props: RetailerProductRequestsSharedProps) {
    return <AdminListView {...productRequestsListProps(props, 'web')} />;
}

