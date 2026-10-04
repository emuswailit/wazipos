// Types + small helpers for the price-discounts folder.
// Mirrors the `price_discount` object on WholesalerReceipts and the
// payload/record shapes the form modal produces.

/* =========================================================
 * API shapes
 * ======================================================= */

export interface PriceDiscountBanner {
    id: string;
    price_discount_banner: string;
    thumbnail: string | null;
    owner: string;
    wholesaler_price_discount: string;
    entity: string;
    created: string;
    updated: string;
}

export interface PriceDiscount {
    id: string;
    entity: string;
    entity_title?: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title?: string;

    // Receipt's prices at discount-creation time. Present so the client
    // can fall back when `normal_price` / `offer_price` are still "0.00".
    receipt_unit_selling_price?: string;
    receipt_final_unit_selling_price?: string;

    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
    start: string;
    end: string;
    is_active: "true" | "false";
    is_currently_active?: boolean;

    price_discount_banners: PriceDiscountBanner[];

    created: string;
    updated: string;
    owner: string;

    /** Merged by the list/detail serializer from the related receipt. */
    product_title?: string;
}

/* =========================================================
 * UI types
 * ======================================================= */

export type PriceDiscountFilter =
    | "ALL"
    | "ACTIVE"
    | "SCHEDULED"
    | "EXPIRED";

export type DiscountStatusLabel =
    | "ACTIVE"
    | "SCHEDULED"
    | "EXPIRED"
    | "INACTIVE";

export interface DiscountStatus {
    label: DiscountStatusLabel;
    tone: "success" | "warning" | "neutral";
    isActive: boolean;
}

/* =========================================================
 * Helpers
 * ======================================================= */

export function discountStatus(d: PriceDiscount): DiscountStatus {
    const today = new Date().toISOString().slice(0, 10);
    const isActive = d.is_active === "true";
    if (!isActive)
        return { label: "INACTIVE", tone: "neutral", isActive: false };
    if (d.end < today)
        return { label: "EXPIRED", tone: "warning", isActive: false };
    if (d.start > today)
        return { label: "SCHEDULED", tone: "neutral", isActive: false };
    return { label: "ACTIVE", tone: "success", isActive: true };
}

/** The API sometimes returns "0.00" for a snapshot — fall back to receipt. */
export function effectivePrices(d: PriceDiscount) {
    const has = (v?: string | null) => !!v && v !== "0.00";
    const normal = has(d.normal_price)
        ? d.normal_price
        : d.receipt_unit_selling_price ?? d.normal_price;
    const offer = has(d.offer_price)
        ? d.offer_price
        : d.receipt_final_unit_selling_price ?? normal;
    return { normal, offer };
}

export function fmtDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    } catch {
        return iso;
    }
}