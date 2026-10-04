// app/(wholesalers)/quantityDiscounts/index.tsx
//
// Route entry for the standalone quantity-discounts screen.
// The screen itself lives under components so it can also be mounted
// inside the discounts sidebar host.

import QuantityDiscountsList from "@/components/wholesalers/quantityDiscounts/QuantityDiscountsList";

export default function QuantityDiscountsRoute() {
    return <QuantityDiscountsList />;
}