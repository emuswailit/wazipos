// api/productsApi.ts
//
// Product payload types. The products endpoints themselves are called through
// api/drugs/productsApi.ts.

export interface ProductDetails {
    title: string;
    description: string;
    preparation: string;
    units_per_pack: number;
    pack_tag: string;
    manufacturer: string;
    category: string;
    is_vatable: string;
    allowed_entities: string[];
    bar_code: string;
    images: string[];
    // Sold in parts (backend/products/units_admin.py)
    sold_in_parts?: string;
    measure?: string;
    content_per_unit?: string;
    content_unit?: string;
    part_size?: string;
    part_unit?: string;
    part_label?: string;
    /** kg: one unit (required when creating), a full pack (optional); size in cm (all three or none). */
    weight_kg?: string;
    pack_weight_kg?: string;
    length_cm?: string;
    width_cm?: string;
    height_cm?: string;
}
