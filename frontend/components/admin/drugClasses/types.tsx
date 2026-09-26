// components/admin/drugClasses/types.ts

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface DrugClassItem {
    id: string;
    title: string;
    description: string;
    category: string;
    category_title: string;
    created: string;
    updated: string;
}

export interface AdminDrugClassesSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime: string;
    items: DrugClassItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: DrugClassItem) => void;
    onEditItem: (item: DrugClassItem) => void;
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