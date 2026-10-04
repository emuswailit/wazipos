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
    id?: number;
    cached_at?: string;

    remote_id: string;
    remote_key?: string;
    url?: string;

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
// Retailer receipts
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
    id?: number;
    cached_at?: string;

    remote_id: string;
    remote_key?: string;
    server_id?: string | null;

    synced?: boolean;
    sync_error?: string | null;

    thumbnail_url?: string | null;
    image_url?: string | null;

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
// Retailer indent
// ===========================================================================

export interface RetailerIndentItemImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface RetailerIndentItem {
    /**
     * Local Dexie-style `++id` PK. Items are nested inside an indent
     * blob, so Dexie can't auto-increment them directly — the db layer
     * (`saveRetailerIndents`) assigns this. Undefined until first save.
     * Never sent to the server.
     */
    id?: number;

    /**
     * Server-assigned UUID for this item. On the wire this is the JSON
     * `id` field; the normalizer maps it into `remote_id` before
     * persisting. Null while the item is still local-only.
     */
    remote_id: string | null;

    /**
     * Client-generated UUID identifying this item across the draft
     * → remote transition. Present while the item is local-only and
     * echoed by the server on every WS frame once it exists remotely.
     * Null for items that arrived from the server on first sight.
     */
    draft_id: string | null;

    entity: string;
    entity_title: string;

    source: 'PREDICTION' | 'MANUAL' | 'IMPORTED' | string;
    source_label: string;

    retailer_indent: string;
    wholesale_receipt: string | null;
    wholesale_receipt_title: string;
    wholesaler: string | null;
    wholesaler_title: string;

    wholesaler_price_discount: string | null;
    wholesaler_price_discount_title: string;
    wholesaler_quantity_discount: string | null;
    wholesaler_quantity_discount_title: string;

    campaign_item: string | null;
    campaign_item_details: any | null;

    required_quantity: number;
    total_quantity: number;

    bonus_quantity_earned: number;
    bonus_blocks_earned: number;
    bonus_rule_buy_quantity: number | null;
    bonus_rule_free_quantity: number | null;

    supplier_unit_selling_price: string | null;
    final_supplier_unit_selling_price: string | null;
    recommended_retail_price: string | null;
    markup_percentage_used: string | null;

    final_unit_price: string | null;
    item_gross_total_amount: string | null;
    item_net_total_amount: string | null;

    profit_estimate: {
        cost_per_unit?: number;
        sell_per_unit?: number;
        pricing_source?: string;
        profit_per_unit?: number;
        margin_percent?: number;
        total_cost?: number;
        total_revenue?: number;
        total_profit?: number;
        [key: string]: any;
    } | null;

    cost_per_unit: number | null;
    sell_per_unit: number | null;
    profit_per_unit: number | null;
    total_profit: number | null;
    total_revenue: number | null;
    margin_percent: number | null;
    pricing_source: string | null;

    lead_time_days: number;
    lead_time_variance_days: number;
    lead_time_source: string;

    manufacture_date: string | null;
    expiry_date: string | null;
    images: RetailerIndentItemImage[];

    created: string;
    updated: string;
    owner: string;
}

export interface RetailerIndent {
    id?: number;
    cached_at?: string;

    remote_id: string;

    /**
     * Client-generated UUID identifying this indent across the draft
     * → remote transition. Present while the indent is local-only and
     * echoed by the server on every WS frame once it exists remotely.
     * Null for indents that arrived from the server on first sight.
     */
    draft_id: string | null;

    is_open: string;
    indent_number: string;
    entity: string;
    entity_title: string;

    lead_time: number;
    order_days: number;
    budget_amount: string | null;
    budget_enforced: string;
    pricing_percentage: string;

    average_lead_time_days: string;
    average_variance_days: string;
    min_lead_time_days: number;
    max_lead_time_days: number;
    lead_time_updated_at: string | null;

    total_cost: string;
    total_revenue: string;
    total_profit: string;
    included_item_count: number;
    excluded_item_count: number;
    over_budget: boolean;

    has_items: boolean;
    active_item_count: number;

    config_snapshot: any | null;

    retailer_indent_items: RetailerIndentItem[];

    created: string;
    updated: string;
    owner: string;
}

// ===========================================================================
// Customer orders
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

export interface CustomerOrderItemLine {
    retailer_receipt: string;
    purchased_quantity: number;
    unit_selling_price: number;
    final_unit_selling_price: number;
    item_discount: number;
}

export interface CustomerOrder {
    id?: number;
    cached_at: string;

    remote_id: string;
    remote_key?: string;
    draft_id: string | null;

    synced?: 'TRUE' | 'FALSE';

    customerName?: string;
    customerPhone?: string;
    dueDate?: string;
    deliveryMethod?: string;
    shippingCost?: number;
    selectedPaymentMethodId?: string;
    paymentAccountNumber?: string;
    customerOrderItems?: CustomerOrderItemLine[];

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

// ===========================================================================
// Retailer Out of Stocks
// ===========================================================================

export interface OutOfStockCategory {
    id: string;
    icon: null;
    icon_category: null;
    category_class: string;
    title: string;
    description: string;
    created: string;
    updated: string;
    subcategories: never[];
}

export interface OutOfStockReceivedFromDetails {
    id: string;
    entity_code: string;
    bank_code: null;
    title: string;
    rating: number;
    administrator: null;
    owner: string;
    registration: null;
    phone: null;
    phone1: null;
    phone2: null;
    phone3: null;
    email: null;
    entity_type: string;
    entity_ownership: string;
    categories: string[];
    town: string;
    country: string;
    county: string | null;
    constituency: null;
    road: string | null;
    building: string | null;
    images: never[];
    logos: never[];
    licences: never[];
    is_subscribed: boolean;
    is_verified: string;
    trial_from: null;
    trial_to: null;
    registration_fee: string;
    commission_percentage: string;
    registration_fee_paid: string;
    offer_trial: string;
    created: string;
    updated: string;
    departments: null;
    description: string | null;
    categories_array: OutOfStockCategory[];
    owner_details: string;
    country_title: string;
    county_title: string;
    constituency_title: string;
    plan: null;
    plan_title: string;
    postal_address: null;
    postal_code: null;
    postal_town: null;
}

export interface RetailerOutOfStockImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface OutOfStockBonusRatio {
    buy: number;
    free: number;
    display: string;
}

export interface OutOfStockQuantityDiscountBanner {
    id: string;
    quantity_discount_banner: string;
    thumbnail: string | null;
    owner: string;
    wholesaler_quantity_discount: string;
    entity: string;
    created: string;
    updated: string;
}

export interface OutOfStockQuantityDiscount {
    id: string;
    entity: string;
    entity_title: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title: string;
    quantity_discount_banners: OutOfStockQuantityDiscountBanner[];
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    awarded_quantity_str: string;
    limit_quantity_str: string;
    bonus_ratio: OutOfStockBonusRatio;
    start: string;
    end: string;
    is_active: string;
    is_currently_active: boolean;
    created: string;
    updated: string;
    owner: string;
}

export interface OutOfStockPriceDiscountBanner {
    id: string;
    price_discount_banner: string;
    thumbnail: string | null;
    owner: string;
    wholesaler_price_discount: string;
    entity: string;
    created: string;
    updated: string;
}

export interface OutOfStockPriceDiscount {
    id: string;
    entity: string;
    entity_title: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title: string;
    receipt_unit_selling_price: string;
    receipt_final_unit_selling_price: string;
    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
    start: string;
    end: string;
    is_active: string;
    is_currently_active: boolean;
    price_discount_banners: OutOfStockPriceDiscountBanner[];
    created: string;
    updated: string;
    owner: string;
}

export interface RetailerOutOfStockWholesalerOffer {
    id: string;
    title: string;
    unit_of_receipt: string;
    product_title: string;
    preparation_title: string;
    product: string;
    bar_code: string | null;
    wholesaler_variation: string;
    received_from: string | null;
    wholesaler_order_item: null;
    retailer_order_item: null;
    retailer_order_item_details: null;
    batch: string | null;
    employee: string;
    manufacture_date: string | null;
    days_to_expiry: number | null;
    expiry_date: string | null;
    unit_buying_price: string;
    unit_selling_price: string;
    final_unit_selling_price: string;
    discount_unit_selling_price: string;
    current_unit_quantity: number;
    received_unit_quantity: number;
    received_pack_quantity: number;
    recommended_retail_price: null;
    in_placement: string;
    description: string;
    created: string;
    updated: string;
    expiry_status: string | null;
    received_from_details: OutOfStockReceivedFromDetails | null;
    manufacturer: string | null;
    manufacturer_title: string | null;
    origin_country: string | null;
    packaging: string | null;
    units_per_pack: number;
    quantity_discounts: OutOfStockQuantityDiscount[] | null;
    price_discount: OutOfStockPriceDiscount | null;
    images: RetailerOutOfStockImage[];
    owner: string;
}

export interface RetailerOutOfStock {
    id: string;
    entity: string;
    product: string;
    unit_of_receipt: string;
    product_title: string;
    units_per_pack: number;

    customer: null;
    customer_name: string | null;
    customer_phone: string | null;

    required_quantity: number;
    is_special_order: string;
    is_ordered: string;
    retailer_indent: null;

    created: string;
    updated: string;
    owner: string;

    images: RetailerOutOfStockImage[];
    wholesaler_offers: RetailerOutOfStockWholesalerOffer[];
}

export interface RetailerOutOfStocksResponse {
    out_of_stocks: RetailerOutOfStock[];
}

export interface RetailerOutOfStockNormalized {
    cached_at: string;
    remote_id: string;

    draft_id?: string;
    is_pending?: boolean;

    entity: string;
    product: string;
    unit_of_receipt: string;
    product_title: string;
    units_per_pack: number;

    customer: null;
    customer_name: string | null;
    customer_phone: string | null;

    required_quantity: number;
    is_special_order: boolean;
    is_ordered: boolean;
    retailer_indent: null;

    images: RetailerOutOfStockImage[];
    wholesaler_offers: RetailerOutOfStockWholesalerOffer[];

    created: string;
    updated: string;
    owner: string;
}

export interface PendingOutOfStockCreate {
    id: string;
    draft_id: string;
    local_row_id: string;
    params: {
        product: string;
        required_quantity: number;
        is_special_order: boolean | string;
        customer_name?: string | null;
        customer_phone?: string | null;
        unit_of_receipt?: string | null;
    };
    created_at: string;
}

export interface PendingOutOfStockEdit {
    id: string;
    remote_id: string;
    params: Partial<RetailerOutOfStockNormalized>;
    created_at: string;
}

export interface OutOfStockItemParamsResponse {
    status?: string;
    item_id?: string;
    params?: Partial<RetailerOutOfStock>;
}

// ===========================================================================
// Forecast feature — normalized view models
// ===========================================================================

export interface RetailerForecastDailyRow {
    forecast_date: string;
    horizon_days: number;
    point_forecast: number;
    p10: number | null;
    p50: number | null;
    p90: number | null;
    model_name: string;
    segment: string;
}

export interface RetailerForecastOffer {
    receipt_id: string;
    wholesaler_id: string;
    wholesaler_title: string;
    batch: string | null;
    expiry_date: string | null;
    days_to_expiry: number | null;
    current_quantity: number;
    list_unit_price: string;
    effective_unit_price: string;
    price_discount_percent: number;
    wholesaler_price_discount_id: string | null;
    quantity_discount: {
        limit_quantity: number;
        awarded_quantity: number;
        bonus_pct: number;
    } | null;
    wholesaler_quantity_discount_id: string | null;
    effective_unit_cost_after_bonus: string;
    score: number;
    rationale: string;

    in_placement: boolean;
    placement_note: string | null;
}

export interface RetailerForecastCampaign {
    campaign_id: string;
    campaign_title: string;
    campaign_status: string;
    campaign_end: string;
    days_remaining: number;
    wholesaler_id: string;
    wholesaler_title: string;
    receipt_id: string;
    batch: string | null;
    days_to_expiry: number | null;
    published_unit_price: string;
    published_bonus_quantity: number;
    suggested_quantity: number;
    per_retailer_limit: number | null;
    expected_margin_estimate: string | null;
    opted_in: boolean;
    score: number;
    rationale: string;
}

export interface RetailerForecastNormalized {
    remote_id: string;

    entity: string;
    entity_title: string;

    product_title: string;

    total_forecast: number;
    total_p10: number;
    total_p90: number;
    avg_daily_forecast: number;

    days_covered: number;

    daily: RetailerForecastDailyRow[];

    wholesaler_offers: RetailerForecastOffer[];

    wholesaler_campaigns: RetailerForecastCampaign[];

    required_quantity: number;

    has_offers: boolean;
    has_campaigns: boolean;

    best_offer_score: number;

    created: string;
}

// ===========================================================================
// Product Request feature — normalized view models
// ===========================================================================

export interface ProductRequestOffer {
    id: string;
    request_item: string;
    wholesaler: string;
    wholesaler_title: string;
    wholesaler_receipt: string | null;
    wholesaler_receipt_title: string;
    offered_quantity: number;
    offered_unit_price: string | null;
    batch: string | null;
    expiry_date: string | null;
    manufacture_date: string | null;
    is_placement: boolean;
    status: string;
    status_display: string;
    retailer_confirmed_at: string | null;
    retailer_response_note: string;
    responded_by_user: string | null;
    responded_by_user_name: string | null;
    responded_at: string | null;
    response_note: string;
    resulting_order_item: string | null;
    created: string;
    updated: string;
}

export interface ProductRequestItem {
    id: string;
    request: string;
    product: string;
    product_title: string;
    product_bar_code: string;
    requested_quantity: number;
    urgency: string;
    urgency_display: string;
    note: string;
    status: string;
    status_display: string;
    offer_count: number;
    total_offered_quantity: number;
    confirmed_quantity: number;
    offers: ProductRequestOffer[];
    created: string;
    updated: string;
}

export interface ProductRequestResponse {
    id: string;
    request: string;
    wholesaler: string;
    wholesaler_title: string;
    response_type: string;
    response_type_display: string;
    note: string;
    offered_line_count: number;
    rejected_line_count: number;
    resulting_orders: string[];
    created: string;
}

export interface ProductRequest {
    id: string;
    request_number: string;
    entity: string;
    entity_title: string;
    urgency: string;
    urgency_display: string;
    note: string;
    status: string;
    status_display: string;
    total_line_count: number;
    fulfilled_line_count: number;
    pending_line_count: number;
    expires_at: string | null;
    fulfilled_at: string | null;
    cancelled_at: string | null;
    items: ProductRequestItem[];
    responses: ProductRequestResponse[];
    created: string;
    updated: string;
}

export interface CreateProductRequestPayload {
    items: Array<{
        product_id: string;
        requested_quantity: number;
        urgency?: "low" | "medium" | "high";
        note?: string;
    }>;
    urgency?: "low" | "medium" | "high";
    note?: string;
}

export interface ConfirmProductRequestOffersPayload {
    request_id: string;
    confirmations: Array<{ offer_id: string; response_note?: string }>;
    declinations: Array<{ offer_id: string; reason?: string }>;
    note?: string;
}

export interface WholesalerProductRequestTargetWholesaler {
    id: string;
    title: string;
}

export interface ProductRequestSummaryLineItem {
    id?: string;
    request?: string;
    product_id: string;
    product_title?: string;
    requested_quantity?: number;

    urgency?: 'low' | 'medium' | 'high';
    urgency_display?: string;

    note?: string;
    status?: string;
    status_display?: string;

    offer_count?: number;
    total_offered_quantity?: number;
    confirmed_quantity?: number;

    offers?: ProductRequestOffer[];

    created?: string;
    updated?: string;

    target_wholesalers?: WholesalerProductRequestTargetWholesaler[];
    target_wholesaler_ids?: string[];

    wholesalers?: Array<{ id: string; title: string }>;

    /** @deprecated kept for backward compat; prefer `wholesalers`. */
    wholesaler_titles?: string[];
}

export interface ProductRequestSummary {
    remote_id: string | null;

    request_number: string;
    entity: string;
    entity_title: string;

    urgency: string;
    urgency_display: string;
    note: string;

    status: string;
    status_display: string;

    total_line_count: number;
    fulfilled_line_count: number;
    pending_line_count: number;

    expires_at: string | null;
    fulfilled_at: string | null;
    cancelled_at: string | null;

    created: string;
    updated?: string;
    cached_at: string;

    is_pending: boolean;
    draft_id?: string;

    items?: ProductRequestSummaryLineItem[];
}

export interface PendingWholesalerOffer {
    id: string;
    request_id: string;
    line_id: string;
    offered_quantity: number;
    offered_unit_price: number;
    note?: string;
    created_at: string;
}

export interface PendingRequestCreate {
    id: string;
    draft_id: string;
    local_row_id: string;
    params: {
        items: RequestDraftItem[];
        urgency?: 'low' | 'medium' | 'high';
        note?: string;
    };
    created_at: string;
}

export type PendingOfferActionType =
    | 'CREATE'
    | 'UPDATE'
    | 'WITHDRAW';

export interface PendingOfferAction {
    id: string;
    action: PendingOfferActionType;

    request_id: string;
    line_id: string;

    offer_id?: string;

    offered_quantity?: number;
    offered_unit_price?: number;

    note?: string;
    withdraw_reason?: string;

    created_at: string;
}

export interface RequestDraftItem {
    product_id: string;
    product_title?: string;
    quantity: number;
    urgency: 'low' | 'medium' | 'high';
    note: string;
    target_wholesaler_ids: string[];
    target_wholesaler_titles?: string[];
    wholesalers?: Array<{ id: string; title: string }>;
    added_at: string;
    best_forecast_quantity?: number;
}

// ===========================================================================
// Wholesaler receipts
// ===========================================================================

export interface WholesalerReceiptImage {
    id: string;
    image: string;
    thumbnail: string | null;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface WholesalerReceiptDiscountBanner {
    id: string;
    price_discount_banner?: string;
    quantity_discount_banner?: string;
    thumbnail: string | null;
    owner: string;
    wholesaler_price_discount?: string;
    wholesaler_quantity_discount?: string;
    entity: string;
    created: string;
    updated: string;
}

export interface WholesalerReceiptQuantityDiscount {
    id: string;
    entity: string;
    entity_title: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title: string;
    quantity_discount_banners: WholesalerReceiptDiscountBanner[];
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    awarded_quantity_str: string;
    limit_quantity_str: string;
    bonus_ratio: {
        buy: number;
        free: number;
        display: string;
    };
    start: string;
    end: string;
    is_active: string;
    is_currently_active: boolean;
    created: string;
    updated: string;
    owner: string;
}

export interface WholesalerReceiptPriceDiscount {
    id: string;
    entity: string;
    entity_title: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title: string;
    receipt_unit_selling_price: string;
    receipt_final_unit_selling_price: string;
    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
    start: string;
    end: string;
    is_active: string;
    is_currently_active: boolean;
    price_discount_banners: WholesalerReceiptDiscountBanner[];
    created: string;
    updated: string;
    owner: string;
}

export interface WholesalerReceiptsSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    isPushSyncing: boolean;
    pendingCount: number;
    syncStatus:
    | 'idle'
    | 'pushing'
    | 'live'
    | 'offline'
    | 'error';
    forceManualRefresh: () => Promise<void>;
    pushPending: () => Promise<void>;
    lastSyncedTime: string;
    wholesalerReceipts: WholesalerReceipt[];
}

export interface WholesalerReceipt {
    id?: number;
    cached_at: string;
    synced: boolean;
    sync_error: string | null;
    thumbnail_url: string | null;
    image_url: string | null;

    remote_id: string;
    remote_key?: string;
    draft_id: string | null;

    title: string;
    long_title: string;
    product_title: string;
    product_id: string;

    entity: string;
    entity_title: string;
    preparation_title: string;
    formulation_title: string;

    /** UUID of the product category. */
    category: string;
    /** Human-readable category name, e.g. "PERSONAL CARE AND HYGIENE PRODUCTS". */
    category_title: string;

    received_from: string | null;
    received_from_title: string;
    manufacturer: string;
    manufacturer_title: string;
    origin_country: string;
    origin_country_title: string;

    unit_of_receipt: string;
    retailer_order: string | null;
    retailer_order_item: string | null;
    wholesaler_order: string | null;
    wholesaler_order_item: string | null;

    batch: string | null;
    bar_code: string;

    manufacture_date: string | null;
    expiry_date: string | null;
    days_to_expiry: number | null;
    expiry_status: string | null;

    unit_buying_price: string | null;
    unit_selling_price: string;
    final_unit_selling_price: string;
    discount_unit_selling_price: string;
    recommended_retail_price: string | null;
    unit_price_discount: string;

    current_unit_quantity: number;
    received_unit_quantity: number;
    received_pack_quantity: number;

    in_placement: boolean;
    is_active: string;
    is_pom: boolean;
    supplier_invoice: string | null;

    quantity_discounts: WholesalerReceiptQuantityDiscount[] | null;
    price_discount: WholesalerReceiptPriceDiscount | null;
    images: WholesalerReceiptImage[];

    description: string;

    created: string;
    updated: string;
    employee: string;
    owner: string;
}

// ===========================================================================
// Wholesaler offers / tagged requests
// ===========================================================================

export interface WholesalerOffer {
    id: string;
    request_item: string;
    offered_quantity: number;
    offered_unit_price: string | null;
    batch: string | null;
    expiry_date: string | null;
    manufacture_date: string | null;
    is_placement: boolean;
    status: string;
    status_display: string;
    response_note: string;
    retailer_response_note: string;
    created: string;
    updated: string;
}

export interface WholesalerTaggedRequestItem {
    id: string;
    product: string;
    product_title: string;
    requested_quantity: number;
    urgency: 'low' | 'medium' | 'high';
    urgency_display: string;
    note: string;
    status: string;
    my_offers: WholesalerOffer[];
    created: string;
}

export interface WholesalerTaggedRequest {
    id: string;
    request_number: string;
    entity: string;
    entity_title: string;
    urgency: 'low' | 'medium' | 'high';
    urgency_display: string;
    note: string;
    status: string;
    status_display: string;
    line_count: number;
    expires_at: string | null;
    created: string;
    items: WholesalerTaggedRequestItem[];
}

// ===========================================================================
// Retailer Orders
//
// Wire shape from the RetailerOrders websocket frame. Orders are
// created on the backend; the client is read-only and mirrors the
// server's state locally.
//
// Persistence contract:
//   - `id`        → local Dexie `++id` PK. Never sent to server.
//   - `remote_id` → server UUID. On the wire this is the JSON `id`.
// ===========================================================================

export interface RetailerOrderItemImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: string;
    updated: string;
}

export interface RetailerOrderItem {
    /** Server UUID for this line item. Maps the JSON `id` field. */
    remote_id: string;

    entity: string;
    title: string;
    units_per_pack: number;
    retailer_order: string;
    retailer_indent_item: string | null;
    product_title: string;
    preparation_title: string;

    /** FK to WholesalerReceipt.remote_id */
    wholesaler_receipt: string;

    /** FK to Product.remote_id */
    product: string;

    purchased_quantity: number;
    discount_quantity: number;
    total_quantity: number;
    unit_quantity: number;

    item_price: string | null;
    item_price_total: string;
    item_net_price: string;
    item_net_price_total: string | null;
    item_price_discount: string | null;
    item_price_discount_total: string | null;
    item_tax: string | null;
    item_tax_total: string | null;
    item_counter_price_discount: string | null;
    item_counter_price_discount_amount: string | null;
    item_counter_price_discount_amount_total: string;
    item_final_price: string | null;
    item_final_price_total: string | null;
    intended_retail_unit_price: string | null;
    intended_retail_unit_price_source: string;
    line_margin: string | null;
    pricing_source_label: string;

    stakeholders: any[];

    is_received: string;
    is_issued: string;

    item_paid_amount: string;
    item_pending_amount: string | null;

    batch: string | null;
    manufacture_date: string | null;
    expiry_date: string | null;

    wholesaler: string;
    retailer: string;
    facilitator: string;

    images: RetailerOrderItemImage[];

    created: string;
    updated: string;
    owner: string;

    cached_at?: string;
}

export interface RetailerOrderPaymentSummary {
    paid_total: number;
    balance_due: number;
    is_paid: boolean;
}

export interface RetailerOrder {
    /** Local Dexie PK. Assigned by `++id`. Never sent to server. */
    id?: number;

    /**
     * Server-assigned UUID. On the wire this is the JSON `id` field;
     * the db layer maps it into `remote_id` before persisting.
     */
    remote_id: string;

    /** Server-issued draft id (informational). Null when absent. */
    draft_id: string | null;

    wholesaler: string | null;
    wholesaler_title: string | null;
    retailer: string;
    retailer_title: string;
    owner: string;
    owner_title: string;
    employee: string | null;

    title: string;

    payment_method: string | null;
    payment_method_title: string;

    order_origin: string;
    order_terms: string;
    order_type?: string;

    document_number: string | null;
    document_number_display: string;
    reference_number: string | null;
    provider_reference_number: string | null;
    psp_reference_number: string;
    telco: string;

    status: string;

    shipping_amount: string;
    order_discount_total: string;
    order_gross_price_total: string;
    order_tax_total: string;
    final_price: string;
    final_price_total: string;

    is_paid: string;
    is_delivered: string;
    is_processed: string;
    is_packed: string;
    is_received: string;
    is_approved: string;
    is_dispatched: string;
    is_committed: string;

    paid_at: string | null;
    delivered_at: string | null;
    delivered_by: string | null;
    processed_at: string | null;
    processed_by: string | null;
    packed_at: string | null;
    packed_by: string | null;
    received_at: string | null;
    received_by: string | null;
    approved_at: string | null;
    approved_by: string | null;
    dispatched_at: string | null;
    dispatched_by: string | null;
    committed_at: string | null;
    cancelled_at: string | null;

    commit_type: string | null;
    commit_type_display: string | null;
    committed_by_entity: string | null;
    committed_by_title: string | null;
    committed_by_user: string | null;
    commit_note: string;

    delivery_method: string;
    actual_lead_time_days: number | null;

    payment_summary: RetailerOrderPaymentSummary;

    description: string | null;

    order_items: RetailerOrderItem[];

    retailer_postal_town: string | null;
    retailer_postal_code: string | null;
    retailer_postal_address: string | null;
    retailer_phone: string | null;
    retailer_email: string | null;

    wholesaler_postal_town: string | null;
    wholesaler_postal_code: string | null;
    wholesaler_postal_address: string | null;
    wholesaler_phone: string | null;
    wholesaler_email: string | null;

    created: string;
    updated: string;

    /** When this row was cached locally. */
    cached_at?: string;
}

/* ---------------------------------------------------------
 * Wire envelope for the RetailerOrders websocket/REST frame.
 * ------------------------------------------------------- */
export interface RetailerRequisitionsResponse {
    "retailer-requisitions": RetailerOrder[];
}

// ===========================================================================
// Pending indent operations queue
//
// Offline-first retry queue for indent mutations. Every write the user
// makes — add an item, change its quantity, remove it, close the indent —
// is either applied on the server immediately (happy path) or enqueued
// here for retry by the sync engine.
//
// Each op carries `client_op_id`, a client-generated UUID sent to the
// backend so a timed-out retry cannot double-apply the same mutation.
// If the backend doesn't dedupe yet, the worst case is a rare duplicate
// item that the user can remove manually — worth adding server-side.
//
// The queue is serialized per-indent: ops for indent A don't block ops
// for indent B, but within a single indent strict FIFO applies so that
// SET_QTY and REMOVE cannot overtake the ADD they depend on.
// ===========================================================================

export type PendingIndentOpKind =
    | 'ITEM_ADD'
    | 'ITEM_SET_QTY'
    | 'ITEM_REMOVE'
    | 'INDENT_CLOSE';

export interface PendingIndentOp {
    /** Dexie autoincrement PK. Not sent to the server. */
    id?: number;

    /**
     * Idempotency key sent with every POST. Same UUID is reused on
     * retries so the server can detect a duplicate submission.
     */
    client_op_id: string;

    kind: PendingIndentOpKind;

    /** Local indent id. `local-*` until the indent is created remotely. */
    indent_local_id: string;

    /** Real server UUID once the indent has been created (null otherwise). */
    indent_remote_id: string | null;

    /**
     * Target item for SET_QTY / REMOVE ops. Either a server UUID
     * (once promoted) or a client draft UUID.
     */
    item_id?: string | null;

    /** Receipt FK for ITEM_ADD ops. */
    wholesale_receipt?: string | null;

    /** Absolute quantity for ITEM_ADD / ITEM_SET_QTY. */
    quantity?: number;

    /**
     * Snapshot of the item at enqueue time. Lets the sync engine rebuild
     * the correct payload even if the local item was mutated or removed
     * by the time the op actually drains.
     */
    item_snapshot?: Partial<RetailerIndentItem> | null;

    /** Free-text note attached to close ops (reserved for future use). */
    close_note?: string | null;

    attempts: number;
    last_error: string | null;

    created_at: string;
    updated_at: string;
}