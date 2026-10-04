// Wraps the reusable quantity-discount form modal.
//
// Same pattern as PriceDiscountEditModal — the wire logic lives in
// api/wholesalersApi.ts under `submitQuantityDiscountAction`.

import api from "@/api/wholesalersApi";
import { WholesalerQuantityDiscountFormModal } from "@/components/common";
import { useAlert } from "@/components/common/AlertProvider";
import type { QuantityDiscount } from "./types";

interface Props {
    visible: boolean;
    discount?: QuantityDiscount | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function QuantityDiscountEditModal({
    visible,
    discount,
    onClose,
    onSaved,
}: Props) {
    const alert = useAlert();

    const existing = discount
        ? {
            id: discount.id,
            wholesaler_receipt: discount.wholesaler_receipt,
            wholesaler_receipt_title:
                discount.wholesaler_receipt_title,
            product_title: discount.product_title,
            thumbnail_url: (discount as any).thumbnail_url,
            images: (discount as any).images,
            quantity_discount_banners: (discount as any)
                .quantity_discount_banners,
            title: discount.title,
            limit_quantity: discount.limit_quantity,
            awarded_quantity: discount.awarded_quantity,
            start: discount.start,
            end: discount.end,
            is_active: discount.is_active,
            banner: null,
        }
        : null;

    return (
        <WholesalerQuantityDiscountFormModal
            visible={visible}
            existing={existing as any}
            onClose={onClose}
            onSaved={() => {
                alert(
                    "Saved",
                    discount
                        ? "Quantity discount updated."
                        : "Quantity discount created.",
                    [{ text: "OK", onPress: onSaved }]
                );
            }}
            onSubmit={(payload, id) =>
                api.submitQuantityDiscountAction(payload as any, id)
            }
        />
    );
}