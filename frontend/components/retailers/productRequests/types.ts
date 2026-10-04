// components/retailers/productRequests/types.ts
//
// Shared types for the retailer product requests module.
// Imports nothing — no cycles.

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export type {
    ProductRequest, ProductRequestItem,
    ProductRequestOffer, ProductRequestSummary
} from '@/databases/types';

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
    items: any[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressRequest: (item: any) => void;
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