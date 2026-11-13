// components/shoppers/RetailerShopFrontMobileWeb.tsx
//
// Phone-browser shop front.
//
// The desktop-web implementation already collapses to a single-
// column layout with chips + a cart FAB below 1200 px, so this
// file is currently a thin alias.
//
// Give it its own implementation only if the mobile-web experience
// needs to diverge from the desktop-web one — e.g. a sticky bottom
// "Add to cart" bar, a touch-first category drawer, or hover-free
// interactions that differ from what the desktop code does on
// narrow viewports.

import React from "react";
import type { RetailerShopFrontProps } from "./RetailerShopFront";
import RetailerShopFrontWeb from "./RetailerShopFrontWeb";

export default function RetailerShopFrontMobileWeb(
    props: RetailerShopFrontProps,
) {
    return <RetailerShopFrontWeb {...props} />;
}