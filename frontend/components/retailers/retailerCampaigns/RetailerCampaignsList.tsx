// Retailer campaign inbox — container.
//
// Responsibilities:
//   1. Own the list data hook (useRetailerCampaigns)
//   2. Own the detail modal's open/close state
//   3. Branch between mobile and web presentations by Platform.OS
//
// This mirrors the wholesaler pattern (WholesalerCampaignsList), so
// the two role modules read identically.
//
// The route file (app/(retailers)/retailerCampaigns/index.tsx) is
// just a one-liner that renders this component.

import { useState } from "react";
import { Platform } from "react-native";
import RetailerCampaignDetailModal from "./RetailerCampaignDetailModal";
import { useRetailerCampaigns } from "./retailerCampaigns";
import RetailerCampaignsMobileView from "./RetailerCampaignsMobileView";
import RetailerCampaignsWebView from "./RetailerCampaignsWebView";
import type { UUID } from "./types";

export default function RetailerCampaignsList() {
    // Which campaign's detail modal is open, if any.
    const [openId, setOpenId] = useState<UUID | undefined>(undefined);

    // List data. `active_only` restricts to campaigns whose window
    // includes today — the retailer inbox shouldn't surface expired
    // or not-yet-started campaigns.
    const { campaigns, isLoading, error, refresh } = useRetailerCampaigns({
        active_only: true,
    });

    // The two views below share the same prop shape, so we can build
    // one object and spread it into either.
    const listProps = {
        campaigns,
        isLoading,
        error,
        refreshing: false,
        onRefresh: refresh,
        onOpen: (id: UUID) => setOpenId(id),
    };

    return (
        <>
            {Platform.OS === "web" ? (
                <RetailerCampaignsWebView {...listProps} />
            ) : (
                <RetailerCampaignsMobileView {...listProps} />
            )}

            {/* Detail modal. Mounted once and toggled by `visible` so
                the internal fetch state resets cleanly on open. */}
            <RetailerCampaignDetailModal
                visible={!!openId}
                campaignId={openId}
                onClose={() => setOpenId(undefined)}
                onAccepted={refresh}
            />
        </>
    );
}