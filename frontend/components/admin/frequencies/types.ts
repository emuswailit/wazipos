// components/admin/frequencies/types.ts
//
// Shared types and constants for the admin frequencies module.
//
// Imports nothing — so every consumer can pull from here without
// creating a module cycle back into AdminFrequenciesList.

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface FrequencyItem {
    id: string;
    title: string;
    abbreviation: string;
    latin: string;
    numerical: number;
    description: string;
    created: string;
    updated: string;
}

export interface AdminFrequenciesSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime: string;
    items: FrequencyItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: FrequencyItem) => void;
    onEditItem: (item: FrequencyItem) => void;
    formatDateHandler: (dateString: string) => string;
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