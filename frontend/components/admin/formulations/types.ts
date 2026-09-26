// components/admin/formulations/types.ts
//
// Shared types and constants for the admin formulations module.
//
// Imports nothing — so every consumer can pull from here without
// creating a module cycle back into AdminFormulationsList.

/* =========================================================
 * Constants
 * ======================================================= */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/* =========================================================
 * Record shape
 * ======================================================= */

export interface FormulationItem {
    id: string;
    title: string;
    description: string;
    created: string;
    updated: string;
}

/* =========================================================
 * Shared view contract
 * ======================================================= */

export interface AdminFormulationsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime: string;
    items: FormulationItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: FormulationItem) => void;
    onEditItem: (item: FormulationItem) => void;
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