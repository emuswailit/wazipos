// Retailer-facing campaign types.
//
// Shared campaign shape is re-exported from the wholesaler module —
// same wire payload for both roles. Retailer-specific shapes live
// here.

import type {
    Campaign,
    CampaignStatus,
    UUID,
} from "@/components/wholesalers/wholesalerCampaigns/types";

export type { Campaign, CampaignStatus, UUID };

// ============================================================================
// Retailer-safe item — supporting shapes
// ============================================================================

export interface RetailerCampaignItemRecommendation {
    recommended_quantity: number;
    confidence: "high" | "medium" | "low" | "none";
    reason: string;
    current_on_hand: number;
    expected_demand: number;
    safety_stock: number;
    demand_pattern: string | null;
    forecast_wape: number | null;
    capped_by_limit: boolean;
}

export interface RetailerPriceDiscount {
    title: string;
    percent: string;
    offer_price: string;
    normal_price: string;
}

export interface RetailerQuantityDiscount {
    title: string;
    buy_quantity: number;
    free_quantity: number;
}

// ============================================================================
// Retailer-safe item
// ============================================================================

export interface RetailerCampaignItem {
    id: string;

    /** Product title read through the receipt relation. */
    product_title: string;

    /** Batch number of the receipt. Null when the receipt has no batch. */
    batch: string | null;

    /** What the retailer pays per paid unit. Post-price-discount. */
    published_unit_price: string;

    /** Free units earned per block. 0 when no quantity discount. */
    published_bonus_quantity: number;

    /** The wholesaler's recommended order quantity. */
    suggested_quantity: number;

    /** Per-retailer cap on this item, or null when uncapped. */
    per_retailer_limit: number | null;

    /**
     * Price discount attached to this item. Null when the item has no
     * price discount. Exposed by
     * `RetailerCampaignItemSerializer.get_price_discount`.
     */
    price_discount?: RetailerPriceDiscount | null;

    /**
     * Quantity discount (buy N get M free). Null when absent.
     * Exposed by `RetailerCampaignItemSerializer.get_quantity_discount`.
     */
    quantity_discount?: RetailerQuantityDiscount | null;

    /**
     * Per-retailer quantity recommendation, computed server-side when
     * the detail is fetched. Absent only if the backend handler didn't
     * attach it — the modal falls back to `suggested_quantity`.
     */
    recommendation?: RetailerCampaignItemRecommendation;
}

// ============================================================================
// The retailer's own audience row
// ============================================================================

export interface MyCampaignAudience {
    id: string;
    has_opted_in: boolean;
    opted_in_at: string | null;
    opted_out_at: string | null;
    retailer_indent: string | null;
    retailer_indent_number: string | null;
}

// ============================================================================
// Full detail envelope
// ============================================================================

export interface RetailerCampaignDetail {
    campaign: Campaign;
    items: RetailerCampaignItem[];
    my_audience: MyCampaignAudience;
}

// ============================================================================
// One line in the opt-in cart
// ============================================================================

export interface OptInLine {
    item_id: UUID;
    quantity: number;
}

// ============================================================================
// Projection returned by ProjectCampaign
// ============================================================================

export interface CampaignProjection {
    item_id: string;
    receipt_id: string;
    product_title: string;
    quantity: number;
    published_unit_price: string;
    published_bonus_quantity: number;
    profit_estimate: string;
}