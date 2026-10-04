// src/campaigns/types.ts
//
// Types for the wholesaler campaigns UI.
//
// Mirror the serializer shapes on the backend:
//   - wholesalers.serializers.WholesalerCampaignSerializer
//   - wholesalers.serializers.WholesalerCampaignBannersSerializer
//   - wholesalers.serializers.WholesalerCampaignItemDetailSerializer
//   - wholesalers.serializers.WholesalerCampaignAudienceListSerializer
//
// Field names are snake_case to match the API responses verbatim.

// ============================================================================
// Enums and primitives
// ============================================================================

export type CampaignStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED";

export type TrueFalse = "true" | "false";

export type DecimalString = string;

/** "YYYY-MM-DD" */
export type DateString = string;

/** "YYYY-MM-DD HH:mm:ss" */
export type DateTimeString = string;

/** UUID string */
export type UUID = string;

export type Role = "wholesaler" | "retailer";

// ============================================================================
// Banner
// ============================================================================

export interface CampaignBanner {
    id: string;
    wholesaler_campaign: string;
    campaign_banner: string;
    thumbnail: string | null;
    created: DateTimeString;
    updated: DateTimeString;
    owner: string;
    entity: string;
}

// ============================================================================
// Campaign
// ============================================================================

export interface CampaignDuration {
    start: DateString;
    end: DateString;
    days: number;
    display: string;
}

export interface Campaign {
    id: string;
    entity: string;
    entity_title: string;
    campaign_banners: CampaignBanner[];
    title: string;
    description: string;
    budget_cap: DecimalString;
    budget_cap_str: DecimalString;
    status: CampaignStatus;
    status_display: string;
    duration: CampaignDuration | null;
    start: DateString;
    end: DateString;
    is_currently_active: boolean;
    created: DateTimeString;
    updated: DateTimeString;
    owner: string;

    /**
     * One-line summary of item-level discounts on this campaign,
     * e.g. "Up to 40% off · Buy 10 get 1 free". Empty string when
     * no item carries a discount. Exposed by
     * `WholesalerCampaignSerializer.get_discount_summary`.
     */
    discount_summary?: string;

    // Optional counts — populated only if the backend annotates them.
    item_count?: number;
    audience_count?: number;
}

// ============================================================================
// Item
// ============================================================================

export interface CampaignItem {
    id: string;
    campaign: string;
    wholesaler_receipt: string;

    /**
     * Product title read through the receipt relation. Exposed by
     * `WholesalerCampaignItemDetailSerializer.wholesaler_receipt_title`.
     * Falls back to `Receipt #<uuid>` on the frontend when absent.
     */
    wholesaler_receipt_title?: string;

    /** Batch number of the receipt, when the serializer exposes it. */
    wholesaler_receipt_batch?: string | null;

    /** Product UUID, when the serializer exposes it. */
    wholesaler_receipt_product_id?: string;

    wholesaler_price_discount: string | null;
    wholesaler_quantity_discount: string | null;
    suggested_quantity: number;
    per_retailer_limit: number | null;
    retail_price_hint: DecimalString | null;
    published_unit_price: DecimalString | null;
    published_bonus_quantity: number;
    published_at: DateTimeString | null;
    created: DateTimeString;
    updated: DateTimeString;
    owner: string;
}

// ============================================================================
// Audience
// ============================================================================

export interface CampaignAudience {
    id: string;
    campaign: string;
    retailer: string;
    retailer_title?: string;
    retailer_indent: string | null;
    opted_in_at: DateTimeString | null;
    opted_out_at: DateTimeString | null;
    has_opted_in: boolean;
    is_visible: TrueFalse;
    created: DateTimeString;
    updated: DateTimeString;
    owner: string;
}

// ============================================================================
// Pagination envelope
// ============================================================================

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export type CampaignListResponse = PaginatedResponse<Campaign>;
export type CampaignItemListResponse = PaginatedResponse<CampaignItem>;
export type CampaignAudienceListResponse = PaginatedResponse<CampaignAudience>;