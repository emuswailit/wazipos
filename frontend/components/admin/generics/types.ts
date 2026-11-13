// components/admin/generics/types.ts

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface GenericItem {
    id: string;
    title: string;
    description: string;
    synonym: string | null;

    // Arrays of UUIDs representing the relations
    drug_class: string[];
    drug_sub_class: string[];

    // Strictly comma-separated strings representing the titles
    drug_class_titles: string;
    drug_sub_class_titles: string;

    owner: string;
    created: string;
    updated: string;
}

export interface AdminGenericsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime?: string;
    items: GenericItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: GenericItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: GenericItem) => void;
    onEditItem: (item: GenericItem) => void;
    formatDateHandler: (dateString: string) => string;

    // Pagination
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