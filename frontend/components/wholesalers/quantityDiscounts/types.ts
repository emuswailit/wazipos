// Mirrors the `quantity_discounts[]` array on WholesalerReceipts.

export interface QuantityDiscountBanner {
    id: string;
    quantity_discount_banner: string;
    thumbnail: string | null;
    owner: string;
    wholesaler_quantity_discount: string;
    entity: string;
    created: string;
    updated: string;
}

export interface QuantityBonusRatio {
    buy: number;
    free: number;
    display: string;
}

export interface QuantityDiscount {
    id: string;
    entity: string;
    entity_title?: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title?: string;

    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    limit_quantity_str: string;
    awarded_quantity_str: string;
    bonus_ratio: QuantityBonusRatio;

    start: string;
    end: string;
    is_active: "true" | "false";
    is_currently_active?: boolean;

    quantity_discount_banners: QuantityDiscountBanner[];

    created: string;
    updated: string;
    owner: string;

    /** Merged by the list/detail serializer from the related receipt. */
    product_title?: string;
}

export type QuantityDiscountFilter =
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

export function discountStatus(d: QuantityDiscount): DiscountStatus {
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

/** Free units as a share of the block, for display only. */
export function bonusPercent(limit: number, awarded: number): number {
    const block = limit + awarded;
    if (block <= 0) return 0;
    return (awarded / block) * 100;
}

/** Prefer the server-computed display string when present. */
export function bonusLabel(d: QuantityDiscount): string {
    return (
        d.bonus_ratio?.display ??
        `Buy ${d.limit_quantity} get ${d.awarded_quantity}`
    );
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