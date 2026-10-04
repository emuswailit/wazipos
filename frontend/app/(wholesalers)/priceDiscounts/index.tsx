// app/(wholesalers)/priceDiscounts/index.tsx
//
// Route entry for the standalone price-discounts screen.
// Thin wrapper — the actual screen lives in components so it can be
// mounted either here (deep link) or inside the discounts sidebar host.

import PriceDiscountsList from "@/components/wholesalers/priceDiscounts/PriceDiscountsList";

export default function PriceDiscountsRoute() {
    return <PriceDiscountsList />;
}