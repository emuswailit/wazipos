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
// All calls route through `campaignsApi` from `@/api/campaignsApi`,
// which is the shared JSON dispatcher client.

import campaignsApi from "@/api/campaignsApi";
import { useCallback, useEffect, useState } from "react";
import type {
    Campaign,
    OptInLine,
    RetailerCampaignDetail,
    UUID,
} from "./types";

/* =========================================================================
 * Response helpers
 * ======================================================================= */

function unwrapList<T>(res: any): T[] {
    const env = res?.data;
    if (!env) return [];
    if (Array.isArray(env.results)) return env.results;
    if (Array.isArray(env)) return env;
    return [];
}

function extractError(res: any): string | null {
    const env = res?.data;
    if (!env) return null;
    if (env.response_code != null && env.response_code !== 0) {
        return env.response_message ?? "Request failed";
    }
    return null;
}

/* =========================================================================
 * useRetailerCampaigns — list
 *
 * `isLoading` is true only during the initial fetch. `refreshing` is
 * true during a manual pull-to-refresh or an explicit refresh() call.
 * Splitting the two lets RefreshControl show its spinner without the
 * list flashing back to the full-screen loader.
 * ======================================================================= */

interface ListState {
    campaigns: Campaign[];
    isLoading: boolean;
    refreshing: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useRetailerCampaigns(
    filters: { active_only?: boolean; page?: number } = {}
): ListState {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filterKey = JSON.stringify(filters);

    const load = useCallback(
        async (isManual = false) => {
            if (isManual) setRefreshing(true);
            else setIsLoading(true);

            setError(null);
            try {
                const res = await campaignsApi.getMyCampaignsAction(filters);

                const envError = extractError(res);
                if (envError) {
                    setError(envError);
                    setCampaigns([]);
                    return;
                }

                setCampaigns(unwrapList<Campaign>(res));
            } catch (e: any) {
                setError(e?.message ?? "Failed to load campaigns");
                setCampaigns([]);
            } finally {
                setIsLoading(false);
                setRefreshing(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filterKey]
    );

    useEffect(() => {
        load();
    }, [load]);

    return {
        campaigns,
        isLoading,
        refreshing,
        error,
        refresh: () => load(true),
    };
}

/* =========================================================================
 * useRetailerCampaignDetail — one campaign
 *
 * Returns the campaign, the retailer-safe item list, and the caller's
 * own audience row (opt-in state, indent id, indent number).
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
            const res = await campaignsApi.getCampaignDetailsAction({
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

/* =========================================================================
 * useRetailerCampaignMutations
 *
 * Thin wrappers so callers don't have to know the action names. Every
 * method returns the raw server response so callers can read
 * `response_code` themselves — the modal does this.
 * ======================================================================= */

export function useRetailerCampaignMutations() {
    return {
        /**
         * Preview what the retailer's margin and total cost would be
         * for a set of quantities, without committing. Returns
         * `{ items: CampaignProjection[] }` in the response envelope.
         */
        project: (
            campaign_id: UUID,
            items: OptInLine[],
            markup_pct?: string
        ) =>
            campaignsApi.projectCampaignAction({
                campaign_id,
                items,
                markup_pct,
            }),

        /**
         * Commit. Seeds a RetailerIndent on the backend and links it
         * to the caller's audience row.
         */
        optIn: (
            campaign_id: UUID,
            items: OptInLine[],
            markup_pct?: string
        ) =>
            campaignsApi.optInCampaignAction({
                campaign_id,
                items,
                markup_pct,
            }),

        /**
         * Withdraw. Marks the audience row's opted_out_at; does not
         * delete the indent — that's a separate commercial decision.
         */
        optOut: (campaign_id: UUID) =>
            campaignsApi.optOutCampaignAction({ campaign_id }),
    };
}