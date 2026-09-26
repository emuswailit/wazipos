// components/admin/preparations/types.ts

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface PreparationItem {
    id: string;
    title: string;
    long_title: string;
    description: string;
    formulation_id: string;
    formulation_title: string;
    generics_string: string;
    generics: string[];
    gen_array: any[];
    created: string;
    updated: string;
}

export interface AdminPreparationsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime: string;
    items: PreparationItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: PreparationItem) => void;
    onEditItem: (item: PreparationItem) => void;
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