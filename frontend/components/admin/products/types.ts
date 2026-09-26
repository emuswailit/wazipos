// components/admin/products/types.ts

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface ProductItem {
    id: string;
    title: string;
    description: string;
    long_title: string;
    product_name: string;
    preparation: string;
    preparation_title: string;
    long_preparation_title: string;
    formulation_title: string;
    manufacturer: string;
    manufacturer_title: string;
    country_of_origin: string;
    category: string;
    category_title: string;
    units_per_pack: number;
    pack_tag: string;
    bar_code: string;
    is_vatable: string;
    allowed_entities: string[];
    allowed_entities_titles: string[];
    active: boolean;
    images: string[];
    created: string;
    updated: string;
}

export interface AdminProductsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime: string;
    items: ProductItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: ProductItem) => void;
    onEditItem: (item: ProductItem) => void;
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