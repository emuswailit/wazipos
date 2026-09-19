export interface InventoryImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface InventoryItem {
    id: string;
    title: string;
    unit_of_receipt: string;
    product_title: string;
    preparation_title: string;
    product: string;
    bar_code: string | null;
    wholesaler_variation: string;
    received_from: string | null;
    wholesaler_order_item: string | null;
    batch: string;
    employee: string;
    manufacture_date: string;
    days_to_expiry: number;
    expiry_date: string;
    unit_buying_price: string;
    unit_selling_price: string;
    final_unit_selling_price: string;
    current_unit_quantity: number;
    received_unit_quantity: number;
    discount_unit_selling_price: string;
    in_placement: string;
    description: string;
    created: string;
    updated: string;
    expiry_status: string;
    received_from_details: any | null;
    manufacturer: string;
    manufacturer_title: string;
    origin_country: string;
    packaging: string | null;
    units_per_pack: number;
    quantity_discounts: any | null;
    price_discount: any | null;
    images: InventoryImage[];
    owner: string;
}
