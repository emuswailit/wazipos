// @/databases/types.ts

// ===========================================================================
// Existing app types
// ===========================================================================

export interface OutOfStockRecord {
    id: string;
    entity: string;
    product: string;
    product_title: string;
    units_per_pack: number;
    customer: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    required_quantity: number;
    is_special_order: string;
    is_ordered: string;
    retailer_indent: string | null;
    created: string;
    updated: string;
    owner: string;
    images: any[];
    cached_at?: string;
}

export interface LocalIndentItemLine {
    product_id: string;
    wholesaler_receipt_id: string;
    title: string;
    quantity: number;
    price: number;
    total: number;
}

export interface CachedIndentSelection {
    id: string;
    retailer_indent_id: string | null;
    retailer_id: string | null;
    items: LocalIndentItemLine[];
    updated_at: string;
}

export interface ProcurementIntentRecord {
    product_id: string;
    title: string;
    bar_code: string;
    predicted_purchase_units: number;
    metrics_in_units: {
        total_physical_stock: number;
        average_daily_sales: number;
    };
    wholesaler_procurement_offers?: {
        wholesaler_receipt_id: string;
        supplier_name: string;
        unit_pricing: {
            final_unit_selling_price: number;
        };
    };
    cached_at: string;
}

export interface DBLineItemSchema {
    id: number;
    selectedProduct: string;
    selectedProductTitle: string;
    quantity: number;
    price: number;
    discount: number;
    searchQuery: string;
    isDropdownOpen: boolean;
}

export interface PaymentMethodItem {
    id: string;
    title: string;
    description?: string;
    active: boolean;
    updatedAt?: string;
}

// ===========================================================================
// Products
//
// Wire shape from the products API. Field names mirror the server exactly.
//
// Server `id` is exposed as `remote_id` because Dexie / AsyncStorage assign
// a locally-generated auto-incrementing primary key (`id` via `++id`).
// ===========================================================================

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

export interface ProductCategoryDetails {
    id: string;
    icon: string | null;
    icon_category: string | null;
    category_class: string;
    title: string;
    description: string;
    created: string;
    updated: string;
    subcategories: any[];
}

export interface ProductItem {
    // ---- Local persistence -------------------------------------------------
    /** Local auto-increment primary key (Dexie `++id`). */
    id?: number;
    /** When this row was last written to local storage. */
    cached_at?: string;

    // ---- Server identity ---------------------------------------------------
    /** Server UUID (was `id` on the wire). */
    remote_id: string;
    /** Server `key` field, if present. */
    remote_key?: string;
    /** Server `url` field — self-link, read-only. */
    url?: string;

    // ---- Server content ----------------------------------------------------
    title: string;
    long_title: string;
    product_name: string;
    preparation: string | null;
    preparation_details: any | null;
    manufacturer: string;
    packaging: string;
    bar_code: string;
    category: string;
    sub_category: string | null;
    is_vatable: string;
    is_pom: boolean;
    images: ProductImage[];
    description: string;
    owner: string;
    units_per_pack: number;
    manufacturer_title: string;
    country_of_origin: string;
    preparation_title: string;
    long_preparation_title: string;
    formulation_title: string;
    category_details: ProductCategoryDetails;
    category_title: string;
    sub_category_details: any | null;
    origin_country: string;
    active: boolean;
    allowed_entities: string[];
    created: string;
    updated: string;
}

// ===========================================================================
// Retailer receipt
//
// A single physical receipt / stock lot held by a retailer. Wire shape from
// the inventory API. Field names mirror the server exactly.
//
// Server `id` is exposed as `remote_id` because Dexie / AsyncStorage assign
// a locally-generated auto-incrementing primary key (`id` via `++id`).
// ===========================================================================

export interface RetailerReceiptImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface RetailerReceipt {
    // ---- Local persistence -------------------------------------------------
    /** Local auto-increment primary key (Dexie `++id`). */
    id?: number;
    /** When this row was last written to local storage. */
    cached_at?: string;

    // ---- Server identity ---------------------------------------------------
    /** Server UUID (was `id` on the wire). */
    remote_id: string;
    /** Server `key` field, if present. */
    remote_key?: string;
    /** Alias of `remote_id`, kept for legacy call sites. */
    server_id?: string | null;

    // ---- Local sync state --------------------------------------------------
    /** true when the row has been confirmed by the server. */
    synced?: boolean;
    /** Last sync error message, if any. */
    sync_error?: string | null;

    // ---- Resolved image URLs (derived at normalize time) -------------------
    thumbnail_url?: string | null;
    image_url?: string | null;

    // ---- Server content ----------------------------------------------------
    title: string;
    entity: string;
    entity_title: string;
    product: string;
    draft_id: string | null;
    preparation_title: string;
    product_title: string;
    formulation_title: string;
    long_title: string;
    received_from: string | null;
    unit_of_receipt: string;
    received_from_title: string;
    retailer_order: string | null;
    retailer_order_item: string | null;
    batch: string | null;
    bar_code: string;
    manufacture_date: string | null;
    expiry_date: string | null;
    unit_buying_price: string | null;
    unit_selling_price: string;
    unit_price_discount: string;
    current_unit_quantity: number;
    received_unit_quantity: number;
    in_placement: boolean;
    is_active: string;
    is_pom: boolean;
    supplier_invoice: string | null;
    origin_country: string;
    origin_country_title: string;
    final_unit_selling_price: string;
    images: RetailerReceiptImage[];
    created: string;
    updated: string;
    employee: string;
    owner: string;
    days_to_expiry: number | null;
    expiry_status: string | null;
    packaging: string;
    units_per_pack: number;
    manufacturer: string;
    manufacturer_title: string;
}

// ===========================================================================
// Customer orders
//
// Wire shape from RetrieveOwnOrders (HTTP) and from the WebSocket push
// (customer_orders). Field names mirror the server exactly.
//
// Server `id` is exposed as `remote_id` (and `key` as `remote_key`) because
// Dexie / AsyncStorage assign a locally-generated auto-incrementing primary
// key (`id` via `++id`).
//
// The same type also carries the local queue fields used by useOrderPersistence
// when a draft is saved offline (synced, customerName, customerOrderItems, ...)
// and filled in once the server responds (remote_id, order_number, ...).
// ===========================================================================

export interface CustomerOrderItemImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface CustomerOrderItemReceiptDetails {
    id: string;
    title: string;
    entity: string;
    entity_title: string;
    product: string;
    draft_id: string | null;
    preparation_title: string;
    product_title: string;
    formulation_title: string;
    long_title: string;
    received_from: string | null;
    unit_of_receipt: string;
    received_from_title: string;
    retailer_order: string | null;
    retailer_order_item: string | null;
    batch: string | null;
    bar_code: string;
    manufacture_date: string | null;
    expiry_date: string | null;
    unit_buying_price: string | null;
    unit_selling_price: string;
    unit_price_discount: string;
    current_unit_quantity: number;
    received_unit_quantity: number;
    in_placement: boolean;
    is_active: string;
    is_pom: boolean;
    supplier_invoice: string | null;
    origin_country: string;
    origin_country_title: string;
    final_unit_selling_price: string;
    images: CustomerOrderItemImage[];
    created: string;
    updated: string;
    employee: string;
    owner: string;
    days_to_expiry: number | null;
    expiry_status: string | null;
    packaging: string;
    units_per_pack: number;
    manufacturer: string;
    manufacturer_title: string;
}

/** A single order line as it exists on the server (`order_items[]`). */
export interface CustomerOrderItem {
    id: string;
    title: string;
    customer_order: string;
    retailer_receipt: string;
    purchased_quantity: number;
    discount_quantity: string;
    total_quantity: string;
    unit_of_issue: string;
    quantity: string;
    item_price: string;
    item_price_total: string;
    item_tax: string;
    item_tax_total: string;
    item_price_discount: string;
    item_price_discount_total: string;
    item_net_price: string;
    item_net_price_total: string;
    item_counter_price_discount: string | null;
    item_counter_price_discount_amount: string | null;
    item_counter_price_discount_amount_total: string;
    receipt_details: CustomerOrderItemReceiptDetails;
    created: string;
    updated: string;
    images: CustomerOrderItemImage[];
}

/**
 * The payload shape sent to `CreateCustomerOrder`. Distinct from
 * `CustomerOrderItem` (which is the server's rich representation).
 */
export interface CustomerOrderItemLine {
    retailer_receipt: string;
    purchased_quantity: number;
    unit_selling_price: number;
    final_unit_selling_price: number;
    item_discount: number;
}

/**
 * A customer order — wire shape + local persistence fields.
 */
export interface CustomerOrder {
    // ---- Local persistence -------------------------------------------------
    /** Local auto-increment primary key (Dexie `++id`). */
    id?: number;
    /** When this row was last written to local storage. */
    cached_at: string;

    // ---- Server identity ---------------------------------------------------
    /** Server UUID (was `id` on the wire). May be empty before first sync. */
    remote_id: string;
    /** Server `key` field, if present. */
    remote_key?: string;
    /** Client-generated draft id, echoed by the server. */
    draft_id: string | null;

    // ---- Local queue state -------------------------------------------------
    /** "TRUE" once CreateCustomerOrder succeeds, "FALSE" while pending. */
    synced?: 'TRUE' | 'FALSE';

    // ---- Local form fields captured at save time ---------------------------
    customerName?: string;
    customerPhone?: string;
    dueDate?: string;
    deliveryMethod?: string;
    shippingCost?: number;
    selectedPaymentMethodId?: string;
    paymentAccountNumber?: string;
    customerOrderItems?: CustomerOrderItemLine[];

    // ---- Server content ----------------------------------------------------
    status: string;
    reference_number: string | null;
    psp_reference_number: string;
    provider_reference_number: string | null;
    employee: string | null;
    order_number: string;
    order_type: string;
    payment_account_number: string;
    order_price_discount_total: number;
    order_net_price_total: string;
    order_origin: string;
    order_price_total: string;
    order_tax_total: number;
    shipping_cost: string;
    is_quoted: string;
    is_paid: string;
    paid_at: string;
    due_date: string;
    is_delivered: string;
    is_delivered_string: string;
    is_packed_string: string;
    delivered_at: string;
    delivered_by: string | null;
    is_packed: string;
    packed_at: string;
    packed_by: string | null;
    is_received: string;
    received_at: string;
    received_by: string | null;
    delivery_method: string;
    customer: string | null;
    coupon: string | null;
    entity: string;
    entity_title: string;
    vendor: string;
    user: string;
    phone: string;
    email: string;
    bodaboda_latitude: number | null;
    bodaboda_longitude: number | null;
    origin_latitude: number | null;
    origin_longitude: number | null;
    destination_latitude: number | null;
    destination_longitude: number | null;
    created: string;
    updated: string;
    owner: string;
    customer_name: string;
    customer_phone: string;
    recipient_name: string | null;
    recipient_phone: string | null;
    selected_payment_method: string;
    selected_payment_method_title: string;
    payment_status: string;
    payment_description: string;
    order_items: CustomerOrderItem[];
    images: any[];
    shipping_address: string | null;
    origin_point: any | null;
    destination_point: any | null;
    farness: string;
    bodaboda: string | null;
    bodaboda_title: string;
    bodaboda_farness: string;
    city_name: string | null;

    // ---- Derived convenience ----------------------------------------------
    total_amount: string;
    fulfillment_status: string;
    updated_at?: string;
}

// ===========================================================================
// Entity
// ===========================================================================

export interface EntityCategory {
    id: string;
    icon: string | null;
    icon_category: string | null;
    category_class: string;
    title: string;
    description: string;
    created: string;
    updated: string;
    subcategories: any[];
}

export interface EntityItem {
    id?: number;
    cached_at?: string;

    remote_id: string;

    entity_code: string | null;
    bank_code: string | null;
    title: string;
    rating: number;
    administrator: string | null;
    owner: string | null;
    registration: string;
    phone: string;
    phone1: string | null;
    phone2: string | null;
    phone3: string | null;
    email: string | null;
    entity_type: string;
    entity_ownership: string;
    categories: string[];
    town: string;
    country: string;
    county: string | null;
    constituency: string | null;
    road: string;
    building: string;
    images: any[];
    logos: any[];
    licences: any[];
    is_subscribed: boolean;
    is_verified: string;
    trial_from: string | null;
    trial_to: string | null;
    registration_fee: string;
    commission_percentage: string;
    registration_fee_paid: string;
    offer_trial: string;
    created: string;
    updated: string;
    departments: any | null;
    description: string | null;
    categories_array: EntityCategory[];
    owner_details: string;
    country_title: string;
    county_title: string;
    constituency_title: string;
    plan: any | null;
    plan_title: string;
    postal_address: string | null;
    postal_code: string | null;
    postal_town: string | null;
}