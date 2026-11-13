// Data hooks for the retailer campaign views.
//
//   useRetailerCampaigns         → list of campaigns the retailer sees
//   useRetailerCampaignDetail    → one campaign + retailer-safe items + my audience row
//   useRetailerCampaignMutations → project / optIn / optOut
//
// Response envelope: every call returns
//   { response_code, response_message, <payload>, errors }
// The hooks unwrap the payload and normalize errors into a plain string.
//
// All calls route through `campaignsApi` from `@/api/campaignsApi`.

import campaignsApi from "@/api/campaignsApi";
import { useCallback, useEffect, useState } from "react";
import type {
    RetailerCampaignDetail,
    UUID,
} from "./types";

/* =========================================================================
 * useRetailerCampaignDetail — one campaign
 *
 * Returns the campaign, the retailer-safe item list, and the caller's
 * own audience row (opt-in state, indent id, indent number).
 *
 * The detail response is a single envelope from GetMyCampaignDetails,
 * not three parallel calls — the backend assembles campaign + items +
 * my_audience in one shot.
 * ======================================================================= */

interface DetailState {
    detail: RetailerCampaignDetail | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useRetailerCampaignDetail(
    campaignId: UUID | undefined
): DetailState {
    const [detail, setDetail] = useState<RetailerCampaignDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!campaignId) {
            setDetail(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const res = await campaignsApi.getMyCampaignDetailsAction({
                campaign_id: campaignId,
            });
            const env = (res?.data ?? {}) as any;

            if (env.response_code !== 0) {
                setError(
                    env.response_message ?? "Campaign could not be loaded"
                );
                setDetail(null);
                return;
            }

            setDetail({
                campaign: env.campaign,
                items: Array.isArray(env.items) ? env.items : [],
                my_audience: env.my_audience,
            });
        } catch (e: any) {
            setError(e?.message ?? "Failed to load campaign");
            setDetail(null);
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        load();
    }, [load]);

    return { detail, isLoading, error, refresh: load };
}
