export interface OrderItem {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    pricePerUnit: number;
}

export interface RetailerOption {
    key: string;
    title: string;
}

export interface ProductCatalogItem {
    id: string;
    title: string;
    bar_code: string;
    item_price: number;
    available: string;
}

export interface WholesaleItemRow {
    id: string;
    wholesaler_receipt: string;
    purchased_quantity: string;
    bar_code: string;
    item_price_discount: string;
    item_price: number;
    item_price_total: number;
    available: string;
    showProductSuggestions?: boolean;
    productSearchQuery?: string;
}
