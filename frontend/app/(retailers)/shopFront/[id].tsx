// app/retailers/shopFront/[id].tsx
//
// Full-screen retailer shop front route.
//
// Reached via:
//   router.push({
//     pathname: "/retailers/shopFront/[id]",
//     params: { id, name, type, location },
//   });
//
// All display state travels through params so the shop front doesn't
// need to look the retailer up from a cached list.

import RetailerShopFront from "@/components/shoppers/RetailerShopFront";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";

export default function ShopFrontRoute() {
    const params = useLocalSearchParams<{
        id: string;
        name?: string;
        type?: string;
        location?: string;
    }>();

    const id = Array.isArray(params.id) ? params.id[0] : params.id;

    if (!id) {
        /* Should never happen — the route segment is required. */
        return null;
    }

    return (
        <RetailerShopFront
            retailerId={id}
            retailerName={
                Array.isArray(params.name) ? params.name[0] : params.name
            }
            retailerType={
                Array.isArray(params.type) ? params.type[0] : params.type
            }
            retailerLocation={
                Array.isArray(params.location)
                    ? params.location[0]
                    : params.location
            }
            onBack={() => router.back()}
        />
    );
}