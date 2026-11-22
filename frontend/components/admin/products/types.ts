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
    /** Weight of one unit (kg) and of a full pack (blank = unit x units per pack): deliveries are planned from these. */
    weight_kg?: string;
    pack_weight_kg?: string | null;
    length_cm?: string | null;
    width_cm?: string | null;
    height_cm?: string | null;
    /** False = still the old 0.5 kg default. */
    weight_captured?: boolean;
    bar_code: string;
    is_vatable: string;
    /** Sold in parts (utils/parts.ts) */
    sold_in_parts?: boolean;
    measure?: string | null;
    content_per_unit?: string | null;
    part_size?: string | null;
    part_label?: string | null;
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
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: ProductItem[];
    emptyComponent?: React.ReactElement | null;
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