export interface ProductItem {
    key: string;
    title: string;
    label: string;
    price: number;
    available: number;
    barcode: string | null;
    cached_at: string;
}

export interface OrderLineItem {
    id: string;
    selectedProduct: string | null; // 🚀 FIXED: Enforced strictly as a string text primitive type
    selectedProductTitle: string;
    quantity: number;
    discount: number;
    searchQuery: string;
    isDropdownOpen: boolean;
    price?: number;
    calculatedLineAmount?: number;
}


export interface PaymentMethodItem {
    id: string;
    title: string;
    is_active?: boolean;
}
