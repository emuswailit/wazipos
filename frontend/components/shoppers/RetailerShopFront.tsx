// components/shoppers/RetailerShopFront.tsx
//
// Runtime dispatcher. Picks the shop front implementation based on
// where the user actually is:
//
//   native      → RetailerShopFrontMobile
//   mobile-web  → RetailerShopFrontMobileWeb
//   desktop-web → RetailerShopFrontWeb
//
// Callers just import this file and render it. The choice of
// implementation is invisible to them.

import { useRuntimeClass } from "@/hooks/useRuntimeClass";
import React from "react";

import RetailerShopFrontMobile from "./RetailerShopFrontMobile";
import RetailerShopFrontMobileWeb from "./RetailerShopFrontMobileWeb";
import RetailerShopFrontWeb from "./RetailerShopFrontWeb";

export interface RetailerShopFrontProps {
    /** Entity id of the retailer whose inventory to load. */
    retailerId: string;

    /** Display strings — passed via route params, not fetched. */
    retailerName?: string;
    retailerType?: string;
    /** Pre-formatted location string, e.g. "Kidera, Bungoma". */
    retailerLocation?: string;

    /** Back handler — usually `() => router.back()`. */
    onBack: () => void;
}

export default function RetailerShopFront(props: RetailerShopFrontProps) {
    const runtime = useRuntimeClass();

    if (runtime === "native") {
        return <RetailerShopFrontMobile {...props} />;
    }
    if (runtime === "mobile-web") {
        return <RetailerShopFrontMobileWeb {...props} />;
    }
    return <RetailerShopFrontWeb {...props} />;
}