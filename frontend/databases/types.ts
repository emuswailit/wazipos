// databases/types.ts

export interface CachedReceipt {
    key: string;
    id: string;
    title: string;
    long_title: string;
    unit_buying_price: string;
    unit_selling_price: string;
    current_unit_quantity: number;
    bar_code: string;
    expiry_status: string;
    manufacturer_title: string;
    origin_country_title: string;
    images: any[];
    cached_at: string;
    sku?: string;
    product_name?: string;

    /* Dates */
    manufacture_date?: string;
    expiry_date?: string;
    days_to_expiry?: number;

    /* Sync tracking */
    draft_id?: string | null;
    synced?: boolean;
    server_id?: string | null;
    sync_error?: string | null;
    local_created_at?: string;

    /* Received quantity */
    received_unit_quantity?: number;

    /* Local ↔ remote linking */
    product?: string;
    received_from?: string;
    received_from_title?: string;
    unit_of_receipt?: string;
    batch?: string;
    final_unit_selling_price?: string;
    unit_price_discount?: string;
    thumbnail_url?: string | null;
    image_url?: string | null;

    /* Server timestamps */
    created?: string;
    updated?: string;
}