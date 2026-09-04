export interface CachedReceipt {
    key: string; id: string; title: string; long_title: string; label: string; price: string;
    unit_buying_price: string; final_unit_selling_price: string; available: number;
    current_unit_quantity: number; barcode: string | null; bar_code: string;
    days_to_expiry: number; expiry_status: string; manufacturer_title: string;
    origin_country_title: string; images: any[]; cached_at: string;
}

export interface ProductItem {
    id: string; title: string; long_title: string; product_name: string; preparation: string;
    preparation_title: string; long_preparation_title: string; formulation_title: string;
    manufacturer_title: string; country_of_origin: string; category_title: string;
    units_per_pack: number; pack_tag: string; bar_code: string; manufacturer: string;
    category: string; images: string[]; active: boolean; created: string; updated: string; cached_at?: string;
}

export interface OutOfStockRecord {
    id: string; entity: string; product: string; product_title: string; units_per_pack: number;
    customer: string | null; customer_name: string | null; customer_phone: string | null;
    required_quantity: number; is_special_order: string; is_ordered: string;
    retailer_indent: string | null; created: string; updated: string; owner: string; images: any[]; cached_at?: string;
}

export interface CustomerOrderItem { id: string; selectedProduct: any | null; quantity: number; price: number; }

export interface CustomerOrder {
    draftId: string; status: 'OPEN' | 'CLOSED'; customerOrderItems: CustomerOrderItem[];
    vendor_session_id?: string; customerName?: string; customerPhone?: string; dueDate?: string;
    deliveryMethod?: string; shippingCost?: number; selectedPaymentMethodId?: string; paymentAccountNumber?: string; updatedAt: string;
}

export interface LocalIndentItemLine { product_id: string; wholesaler_receipt_id: string; title: string; quantity: number; price: number; total: number; }

export interface CachedIndentSelection { id: string; retailer_indent_id: string | null; retailer_id: string | null; items: LocalIndentItemLine[]; updated_at: string; }

export interface ProcurementIntentRecord {
    product_id: string; title: string; bar_code: string; predicted_purchase_units: number;
    metrics_in_units: { total_physical_stock: number; average_daily_sales: number; };
    wholesaler_procurement_offers?: { wholesaler_receipt_id: string; supplier_name: string; unit_pricing: { final_unit_selling_price: number; }; }; cached_at: string;
}

export interface DBLineItemSchema { id: number; selectedProduct: string; selectedProductTitle: string; quantity: number; price: number; discount: number; searchQuery: string; isDropdownOpen: boolean; }

export interface PaymentMethodItem {
    id: string;
    title: string;
    description?: string;
    active: boolean;
    updatedAt?: string;
}
