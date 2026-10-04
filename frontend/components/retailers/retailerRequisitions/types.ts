// components/retailers/retailerRequisitions/types.ts
//
// Shapes for the retailer requisitions module.
//
// These mirror the wire format of RetrieveRetailerOrders as
// normalized by RetailerOrdersSyncContext.normalizeOrder. Field
// types follow what the server actually sends:
//   - Monetary values arrive as strings ("462.00")
//   - Quantity fields arrive as numbers (154)
//   - Nullable fields may be `null`
//   - "Display" fields are pre-formatted for the UI

import type { ThemeShape } from '@/context/AuthContext';

/* =========================================================
 * Common primitives
 * ======================================================= */

/** Monetary values arrive as decimal strings. */
export type Money = string;

/** Quantity fields arrive as numbers. */
export type Quantity = number;

/** Boolean flags arrive as "true" / "false" strings. */
export type FlagString = 'true' | 'false' | string;

/** ISO 8601 date without time, e.g. "2026-09-26". */
export type DateOnly = string;

/** Django datetime string, e.g. "2026-09-26 13:41:03". */
export type DateTimeString = string;

/* =========================================================
 * Order item
 * ======================================================= */

export interface OrderItemImage {
    id: string;
    image: string;
    thumbnail: string;
    owner: string;
    product: string;
    entity: string;
    created: DateTimeString;
    updated: DateTimeString;
}

export interface RetailerOrderItem {
    id: string;

    /* Relations */
    entity: string;
    retailer_order: string;
    retailer_indent_item: string | null;
    wholesaler_receipt: string;
    product: string;
    wholesaler: string;
    retailer: string;
    facilitator: string | null;
    owner: string;

    /* Snapshot of the product */
    title: string;
    product_title: string;
    preparation_title: string;
    units_per_pack: Quantity;

    /* Quantities */
    purchased_quantity: Quantity;
    discount_quantity: Quantity;
    total_quantity: Quantity;
    unit_quantity: Quantity;

    /* Pricing — all monetary */
    item_price: Money;
    item_price_total: Money;
    item_net_price: Money;
    item_net_price_total: Money;
    item_price_discount: Money | null;
    item_price_discount_total: Money | null;
    item_tax: Money | null;
    item_tax_total: Money | null;
    item_counter_price_discount: Money | null;
    item_counter_price_discount_amount: Money | null;
    item_counter_price_discount_amount_total: Money;
    item_final_price: Money;
    item_final_price_total: Money;

    /* Retailer's intended sell price */
    intended_retail_unit_price: Money | null;
    intended_retail_unit_price_source: string;
    line_margin: number | null;
    pricing_source_label: string;

    /* Lifecycle flags */
    is_received: FlagString;
    is_issued: FlagString;
    item_paid_amount: Money;
    item_pending_amount: Money | null;

    /* Inventory linkage */
    batch: string | null;
    manufacture_date: DateOnly | null;
    expiry_date: DateOnly | null;

    stakeholders: any[];
    images: OrderItemImage[];

    created: DateOnly;
    updated: DateOnly;
}

/* =========================================================
 * Order payment summary
 * ======================================================= */

export interface PaymentSummary {
    paid_total: number;
    balance_due: number;
    is_paid: boolean;
}

/* =========================================================
 * Order
 * ======================================================= */

export interface RetailerOrder {
    /* Identity */
    id: string;
    remote_id?: string;
    draft_id: string | null;
    title: string;

    /* Reference numbers */
    document_number: string | null;
    document_number_display: string;
    reference_number: string | null;
    provider_reference_number: string | null;
    psp_reference_number: string;
    telco: string;

    /* Parties */
    wholesaler: string | null;
    wholesaler_title: string | null;
    retailer: string;
    retailer_title: string;
    owner: string;
    owner_title: string;
    employee: string | null;

    /* Payment */
    payment_method: string | null;
    payment_method_title: string;
    payment_summary: PaymentSummary;

    /* Order classification */
    order_origin: string;
    order_terms: string;
    delivery_method: string;
    status: string;

    /* Totals — all monetary */
    shipping_amount: Money;
    order_discount_total: Money;
    order_gross_price_total: Money;
    order_tax_total: Money;
    final_price: Money;
    final_price_total: Money;

    /* Lifecycle flags */
    is_paid: FlagString;
    is_delivered: FlagString;
    is_processed: FlagString;
    is_packed: FlagString;
    is_received: FlagString;
    is_approved: FlagString;
    is_dispatched: FlagString;
    is_committed: FlagString;

    /* Lifecycle timestamps */
    paid_at: DateTimeString | null;
    delivered_at: DateTimeString | null;
    delivered_by: string | null;
    processed_at: DateTimeString | null;
    processed_by: string | null;
    packed_at: DateTimeString | null;
    packed_by: string | null;
    received_at: DateTimeString | null;
    received_by: string | null;
    approved_at: DateTimeString | null;
    approved_by: string | null;
    dispatched_at: DateTimeString | null;
    dispatched_by: string | null;
    cancelled_at: DateTimeString | null;

    /* Commit (wholesaler-side approval) */
    commit_type: string | null;
    commit_type_display: string | null;
    committed_at: DateTimeString | null;
    committed_by_entity: string | null;
    committed_by_title: string | null;
    committed_by_user: string | null;
    commit_note: string;

    /* Timing */
    actual_lead_time_days: number | null;

    /* Addresses */
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

    /* Description */
    description: string | null;

    /* Line items */
    order_items: RetailerOrderItem[];

    /* Timestamps */
    created: DateTimeString;
    updated: DateTimeString;

    /* --- Local-only fields (set by RetailerOrdersSyncContext) --- */

    /** Dexie primary key — only present on rows hydrated from local cache. */
    id_local?: number;
    cached_at?: string;
    synced?: boolean;
    sync_error?: string | null;
}

/* =========================================================
 * View props
 * ======================================================= */

export interface RequisitionsViewProps {
    orders: RetailerOrder[];
    onSelect: (order: RetailerOrder) => void;
}

export interface RequisitionsDetailsModalProps {
    order: RetailerOrder | null;
    visible: boolean;
    onClose: () => void;
    onRefreshParentLedger?: () => void;
}

export type RequisitionsTheme = ThemeShape;