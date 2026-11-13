// components/retailers/productRequests/types.ts
//
// Shared types for the retailer product requests module.
// Imports nothing — no cycles.

export { type PageSize } from '@/components/common/PaginationBar';
import type { PageSize } from '@/components/common/PaginationBar';
import type { ProductRequestSummary } from '@/databases/types';

export type { ProductRequestSummary } from '@/databases/types';

/* ---------- Shared view props ---------- */
export interface RetailerProductRequestsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    statusFilter: string | null;
    setStatusFilter: (v: string | null) => void;
    statusOptions: any[];
    statusCounts: Record<string, number>;
    onRefresh: () => void;
    refreshing: boolean;
    isLiveConnected: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    pendingRequestCount: number;
    pendingOfferCount: number;
    items: ProductRequestSummary[];
    /** Whole filtered list (phones show everything, no pagination). */
    allItems?: ProductRequestSummary[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressRequest: (item: ProductRequestSummary) => void;
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