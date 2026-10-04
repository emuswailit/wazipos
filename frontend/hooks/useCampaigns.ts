// hooks/useCampaigns.ts

import campaignsApi from "@/api/campaignsApi";
import type {
    Campaign,
    CampaignAudience,
    CampaignItem,
    Role,
    UUID,
} from "@/campaigns/types";
import { useCallback, useEffect, useState } from "react";

/* =========================================================================
 * Debug logging — remove once the campaign flow is stable.
 * ======================================================================= */

const LOG = (...args: any[]) => {
    if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[useCampaigns]", ...args);
    }
};

/* =========================================================================
 * Response envelope helpers
 * ======================================================================= */

function unwrapList<T>(res: any): T[] {
    const env = res?.data;
    if (!env) return [];

    const firstValue = Object.entries(env).find(
        ([k, v]) =>
            !["response_code", "response_message", "errors"].includes(k) &&
            (Array.isArray(v) ||
                (v &&
                    typeof v === "object" &&
                    "results" in (v as any)))
    );
    if (firstValue) {
        const payload = firstValue[1] as any;
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload.results)) return payload.results;
    }

    if (Array.isArray((env as any).results)) return (env as any).results;
    if (Array.isArray(env)) return env;

    return [];
}

function unwrapSingle<T>(res: any, keys: string[]): T | null {
    const env = res?.data;
    if (!env) return null;
    if (env.response_code != null && env.response_code !== 0) return null;

    for (const k of keys) {
        if (env[k]) return env[k] as T;
    }
    return env as T;
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
 * useCampaignList
 * ======================================================================= */

interface ListState {
    data: Campaign[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useCampaignList(
    role: Role,
    filters: Record<string, any> = {}
): ListState {
    const [data, setData] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const filterKey = JSON.stringify(filters);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            LOG("useCampaignList →", { role, filters });
            const res =
                role === "wholesaler"
                    ? await campaignsApi.getEntityCampaignsAction(filters)
                    : await campaignsApi.getMyCampaignsAction(filters);

            LOG("useCampaignList ←", {
                role,
                ok: res?.ok,
                status: res?.status,
                response_code: (res?.data as any)?.response_code,
                response_message: (res?.data as any)?.response_message,
            });

            const envError = extractError(res);
            if (envError) {
                setError(envError);
                setData([]);
                return;
            }

            const rows = unwrapList<Campaign>(res);
            LOG("useCampaignList — parsed rows", {
                role,
                count: rows.length,
            });
            setData(rows);
        } catch (e: any) {
            LOG("useCampaignList threw", e);
            setError(e?.message ?? "Failed to load campaigns");
            setData([]);
        } finally {
            setIsLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, filterKey]);

    useEffect(() => {
        load();
    }, [load]);

    return { data, isLoading, error, refresh: load };
}

/* =========================================================================
 * useCampaignDetails
 * ======================================================================= */

interface DetailsState {
    campaign: Campaign | null;
    items: CampaignItem[];
    audience: CampaignAudience[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useCampaignDetails(
    campaignId: UUID | undefined
): DetailsState {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [items, setItems] = useState<CampaignItem[]>([]);
    const [audience, setAudience] = useState<CampaignAudience[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!campaignId) {
            setCampaign(null);
            setItems([]);
            setAudience([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            LOG("useCampaignDetails →", { campaignId });
            const [detailsRes, itemsRes, audienceRes] = await Promise.all([
                campaignsApi.getCampaignDetailsAction({
                    campaign_id: campaignId,
                }),
                campaignsApi.getCampaignItemsAction({
                    campaign_id: campaignId,
                }),
                campaignsApi.getCampaignAudienceAction({
                    campaign_id: campaignId,
                }),
            ]);

            const envError = extractError(detailsRes);
            if (envError) {
                LOG("useCampaignDetails — error envelope", envError);
                setError(envError);
                setCampaign(null);
                setItems([]);
                setAudience([]);
                return;
            }

            const campaignParsed = unwrapSingle<Campaign>(detailsRes, [
                "campaign",
            ]);
            const itemsParsed = unwrapList<CampaignItem>(itemsRes);
            const audienceParsed = unwrapList<CampaignAudience>(audienceRes);

            LOG("useCampaignDetails ← parsed", {
                campaign: campaignParsed?.id,
                itemsCount: itemsParsed.length,
                audienceCount: audienceParsed.length,
            });

            setCampaign(campaignParsed);
            setItems(itemsParsed);
            setAudience(audienceParsed);
        } catch (e: any) {
            LOG("useCampaignDetails threw", e);
            setError(e?.message ?? "Failed to load campaign");
            setCampaign(null);
            setItems([]);
            setAudience([]);
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        load();
    }, [load]);

    return { campaign, items, audience, isLoading, error, refresh: load };
}

/* =========================================================================
 * useCampaignMutations
 *
 * Every write returns the raw server response. Payload shapes match the
 * backend services 1:1 — in particular:
 *
 *   addItem        → wholesaler_receipt_id, wholesaler_price_discount_id,
 *                    wholesaler_quantity_discount_id
 *   addAudience    → retailer_id (singular)
 *   removeAudience → audience_id
 *
 * createCampaign / updateCampaign are special: the backend routes those
 * through dedicated class-based views with multipart-only parsers, so
 * the payload is always FormData. The campaign id for updates is passed
 * as the first argument and lands in the URL path — it is never a form
 * field. Both CBVs return the saved campaign under `wholesaler_campaign`.
 * ======================================================================= */

export function useCampaignMutations() {
    return {
        /* ---------------- Lifecycle ---------------- */

        /**
         * Create a new campaign.
         *
         * POST /wholesalers/campaigns/create
         * Content-Type: multipart/form-data
         *
         * @param formData  Fields: title, description?, start, end,
         *                  budget_cap?, campaign_banners? (repeated).
         *                  Build with the modal's `buildPayload`.
         */
        createCampaign: (formData: FormData) => {
            LOG("createCampaign → FormData");
            return campaignsApi.createCampaignAction(formData);
        },

        /**
         * Update an existing campaign.
         *
         * POST /wholesalers/campaigns/<campaign_id>/update
         * Content-Type: multipart/form-data
         *
         * @param campaign_id  UUID; goes in the URL, never in the body.
         * @param formData     Same fields as create, all optional.
         *                     Adding a `campaign_banners` file appends
         *                     to the existing banner set.
         */
        updateCampaign: (campaign_id: UUID, formData: FormData) => {
            LOG("updateCampaign →", { campaign_id });
            return campaignsApi.updateCampaignAction(campaign_id, formData);
        },

        deleteCampaign: (campaign_id: UUID) => {
            LOG("deleteCampaign →", { campaign_id });
            return campaignsApi.deleteCampaignAction({ campaign_id });
        },

        publishCampaign: (campaign_id: UUID) => {
            LOG("publishCampaign →", { campaign_id });
            return campaignsApi.publishCampaignAction({ campaign_id });
        },

        closeCampaign: (campaign_id: UUID) => {
            LOG("closeCampaign →", { campaign_id });
            return campaignsApi.closeCampaignAction({ campaign_id });
        },

        /* ---------------- Items ---------------- */

        addItem: (payload: {
            campaign_id: UUID;
            wholesaler_receipt_id: UUID;
            wholesaler_price_discount_id?: UUID | null;
            wholesaler_quantity_discount_id?: UUID | null;
            suggested_quantity?: number;
            per_retailer_limit?: number | null;
            retail_price_hint?: string | null;
        }) => {
            LOG("addItem →", payload);
            return campaignsApi.addCampaignItemAction(payload);
        },

        updateItem: (payload: {
            item_id: UUID;
            wholesaler_price_discount_id?: UUID | null;
            wholesaler_quantity_discount_id?: UUID | null;
            suggested_quantity?: number;
            per_retailer_limit?: number | null;
            retail_price_hint?: string | null;
        }) => {
            LOG("updateItem →", payload);
            return campaignsApi.updateCampaignItemAction(payload);
        },

        deleteItem: (item_id: UUID) => {
            LOG("deleteItem →", { item_id });
            return campaignsApi.deleteCampaignItemAction({ item_id });
        },

        /* ---------------- Audience ---------------- */

        addAudience: (campaign_id: UUID, retailer_id: UUID) => {
            const payload = { campaign_id, retailer_id };
            LOG("addAudience →", payload);
            return campaignsApi.addCampaignAudienceAction(payload);
        },

        removeAudience: (audience_id: UUID) => {
            LOG("removeAudience →", { audience_id });
            return campaignsApi.removeCampaignAudienceAction({ audience_id });
        },

        /* ---------------- Retailer-facing ---------------- */

        project: (payload: {
            campaign_id: UUID;
            items: Array<{ item_id: UUID; quantity: number }>;
            markup_pct?: string;
        }) => {
            LOG("project →", payload);
            return campaignsApi.projectCampaignAction(payload);
        },

        optIn: (payload: {
            campaign_id: UUID;
            items: Array<{ item_id: UUID; quantity: number }>;
            markup_pct?: string;
        }) => {
            LOG("optIn →", payload);
            return campaignsApi.optInCampaignAction(payload);
        },

        optOut: (campaign_id: UUID) => {
            LOG("optOut →", { campaign_id });
            return campaignsApi.optOutCampaignAction({ campaign_id });
        },
    };
}