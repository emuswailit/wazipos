export interface ProductImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface InventoryData {
    id: string;
    title: string;
    entity: string;
    entity_title: string;
    product: string;
    preparation_title: string;
    product_title: string;
    formulation_title: string;
    long_title: string;
    received_from: string;
    unit_of_receipt: string;
    received_from_title: string;
    retailer_order: null | string;
    retailer_order_item: null | string;
    batch: null | string;
    bar_code: string;
    manufacture_date: string;
    expiry_date: string;
    unit_buying_price: string;
    unit_selling_price: string;
    unit_price_discount: string;
    current_unit_quantity: number;
    received_unit_quantity: number;
    in_placement: boolean;
    is_active: string;
    is_pom: boolean;
    supplier_invoice: null | string;
    origin_country: string;
    origin_country_title: string;
    final_unit_selling_price: string;
    images: ProductImage[];
    created: string;
    updated: string;
    employee: string;
    owner: string;
    days_to_expiry: number;
    expiry_status: string;
    packaging: string;
    units_per_pack: number;
    manufacturer: string;
    manufacturer_title: string;
}

export interface LayoutProps {
    data: InventoryData;
    isDarkMode: boolean;
    theme: {
        background: string;
        panel: string;
        primary: string;
        text: string;
        textDark: string;
    };
    isExpired: boolean;
}
