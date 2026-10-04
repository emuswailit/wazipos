// Wraps the reusable price-discount form modal.
//
// All the wire logic — FormData building, file field name, create vs.
// update envelope normalisation — lives in api/wholesalersApi.ts under
// `submitPriceDiscountAction`. This file only:
//
//   1. Converts the list's `PriceDiscount` into the form modal's
//      `existing` record shape.
//   2. Forwards submit to the API action.
//   3. Shows the success alert and calls `onSaved`.

import api from "@/api/wholesalersApi";
import { WholesalerPriceDiscountFormModal } from "@/components/common";
import { useAlert } from "@/components/common/AlertProvider";
import type { PriceDiscount } from "./types";

interface Props {
    visible: boolean;
    discount?: PriceDiscount | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function PriceDiscountEditModal({
    visible,
    discount,
    onClose,
    onSaved,
}: Props) {
    const alert = useAlert();

    // Convert the list row into the modal's `existing` shape.
    // Display-only fields (`wholesaler_receipt_title`, `product_title`,
    // `images`, `price_discount_banners`) ride along so the picker can
    // backfill the receipt and the banner picker can show the current
    // banner URL when the sync context hasn't caught up.
    const existing = discount
        ? {
            id: discount.id,
            wholesaler_receipt: discount.wholesaler_receipt,
            wholesaler_receipt_title:
                discount.wholesaler_receipt_title,
            product_title: discount.product_title,
            receipt_unit_selling_price:
                discount.receipt_unit_selling_price,
            thumbnail_url: (discount as any).thumbnail_url,
            images: (discount as any).images,
            price_discount_banners: (discount as any)
                .price_discount_banners,
            title: discount.title,
            percent: discount.percent,
            normal_price: discount.normal_price,
            offer_price: discount.offer_price,
            start: discount.start,
            end: discount.end,
            is_active: discount.is_active,
            // Populated by the modal from `price_discount_banners`.
            banner: null,
        }
        : null;

    return (
        <WholesalerPriceDiscountFormModal
            visible={visible}
            existing={existing as any}
            onClose={onClose}
            onSaved={() => {
                alert(
                    "Saved",
                    discount
                        ? "Price discount updated."
                        : "Price discount created.",
                    [{ text: "OK", onPress: onSaved }]
                );
            }}
            onSubmit={(payload, id) =>
                api.submitPriceDiscountAction(payload as any, id)
            }
        />
    );
}