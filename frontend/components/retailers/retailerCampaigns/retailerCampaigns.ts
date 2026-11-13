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
