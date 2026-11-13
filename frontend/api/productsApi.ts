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
}
