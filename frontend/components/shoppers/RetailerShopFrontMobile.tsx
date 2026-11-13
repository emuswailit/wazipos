// components/shoppers/RetailerShopFrontMobile.tsx
//
// Native app shop front.
//
// TODO: build the native-specific implementation with expo-router
// navigation, native modals, and platform-specific gestures. Until
// then this aliases the web implementation so the app keeps
// running end-to-end.

import React from "react";
import type { RetailerShopFrontProps } from "./RetailerShopFront";
import RetailerShopFrontWeb from "./RetailerShopFrontWeb";

export default function RetailerShopFrontMobile(
    props: RetailerShopFrontProps,
) {
    return <RetailerShopFrontWeb {...props} />;
}