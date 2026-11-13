// components/admin/preparations/types.ts

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// Matches the nested GenericsSerializer in your backend response
export interface PreparationGeneric {
    id: string;
    title: string;
    description: string;
    synonym: string | null;
    drug_class: string[];
    drug_sub_class: string[];
    drug_class_titles: string | string[];
    drug_sub_class_titles: string | string[];
    owner?: string;
    created: string;
    updated: string;
}

export interface PreparationItem {
    id: string;
    key?: string; // Backend sends 'key' alongside 'id'
    title: string;
    long_title: string;
    description: string;

    // Backend returns 'formulation' (UUID) on read, 
    // but accepts 'formulation_id' on write.
    formulation?: string;
    formulation_id?: string;
    formulation_title: string;

    generics_string: string;
    generics: string[];
    gen_array: PreparationGeneric[];

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
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: PreparationItem[];
    emptyComponent?: React.ReactElement | null;
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