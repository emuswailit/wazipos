// api/campaignsApi.ts
//
// Campaign API client.
//
// Two entry points against the backend:
//
//   POST /wholesalers/campaigns/             → JSON dispatcher
//                                              (every action EXCEPT
//                                               CreateCampaign/UpdateCampaign)
//
//   POST /wholesalers/campaigns/create       → multipart CBV
//   POST /wholesalers/campaigns/<uuid>/update → multipart CBV
//                                              (no `action` field —
//                                               these are dedicated endpoints)
//
// The CBVs use MultiPartParser + FormParser only, so the two write
// helpers below take FormData directly. Callers build the FormData
// themselves (see buildCreateForm / buildUpdateForm for a starting
// point) and pass it through.
//
// Content-Type: the `clientMultipart` instance strips the apisauce
// default `application/json` header in its request transform so the
// browser/RN runtime can attach `multipart/form-data; boundary=...`.
// As a belt-and-braces measure, the two post calls below also override
// the header to `undefined` at the request level.
//
// Logging is guarded by __DEV__. Remove the guard (or delete the LOG
// helper) once the campaign flow is stable.

import type { CampaignStatus, TrueFalse, UUID } from "@/campaigns/types";
import client from "./client";
import clientMultipart from "./multipartClient";

/* =========================================================
 * Debug logging
 * ======================================================= */

const LOG = (...args: any[]) => {
    if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[campaignsApi]", ...args);
    }
};

/* =========================================================
 * Internals
 * ======================================================= */

// Trailing slashes matter. The CBV URLs are registered as
// `campaigns/create` and `campaigns/<uuid>/update` — no trailing
// slash. APPEND_SLASH on the server will 301 a slash-suffixed hit
// and, worse, browsers convert a 301 on POST to a GET, dropping the
// multipart body. So: dispatcher has the slash, CBVs do not.
const DISPATCHER_ENDPOINT = "/wholesalers/campaigns/";
const CREATE_ENDPOINT = "/wholesalers/campaigns/create";
const updateEndpoint = (id: UUID) =>
    `/wholesalers/campaigns/${id}/update`;

/**
 * Axios config override that tells axios to omit Content-Type for
 * this request. Without it, apisauce's default `application/json`
 * header survives and the browser never attaches the multipart
 * boundary, so Django's MultiPartParser returns 415.
 *
 * Setting to `undefined` (not "") is the axios convention for
 * "unset this header for this request".
 */
const NO_CONTENT_TYPE = {
    headers: { "Content-Type": undefined } as any,
};

/**
 * Duck-typed FormData check.
 *
 * `instanceof FormData` is unreliable on React Native Web — the
 * react-native-web FormData can differ from the global `window.FormData`.
 * A structural check catches every real FormData regardless of which
 * constructor produced it.
 */
function isFormDataInstance(value: unknown): value is FormData {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as any).append === "function" &&
        typeof (value as any).getAll === "function" &&
        typeof (value as any).entries === "function"
    );
}

/**
 * Materialise a FormData into a plain object for logging.
 * `console.log(fd)` shows `FormData {}` because entries aren't
 * enumerable — this prints something useful instead.
 */
function describePayload(value: any): any {
    if (isFormDataInstance(value)) {
        const out: Record<string, any> = {};
        Array.from((value as FormData).entries()).forEach(([k, v]) => {
            if (typeof v === "string") {
                out[k] = v;
            } else if (
                typeof File !== "undefined" &&
                v instanceof File
            ) {
                out[k] = `<File ${v.name} ${v.size}B ${v.type}>`;
            } else if (v && typeof v === "object" && "uri" in v) {
                const anyV = v as any;
                out[k] = `<File ${anyV.name ?? "?"} uri=${anyV.uri}>`;
            } else {
                out[k] = v;
            }
        });
        return { __formData: true, fields: out };
    }
    return value;
}

/* =========================================================
 * Dispatchers
 * ======================================================= */

/**
 * JSON path — posts plain objects to the campaign dispatcher.
 * Every action except CreateCampaign / UpdateCampaign goes through
 * here.
 *
 * The body is posted verbatim as a flat object:
 *   { action: "<ActionName>", ...fields }
 * No `payload` wrapper. The backend reads `action` and the action's
 * fields at the top level of the request body.
 */
const campaignAction = (data: {
    action: string;
    [key: string]: any;
}) => {
    LOG("campaignAction →", data);

    return client.post(DISPATCHER_ENDPOINT, data).then((res) => {
        LOG("campaignAction ←", {
            action: data.action,
            ok: res.ok,
            status: res.status,
            response_code: (res.data as any)?.response_code,
            response_message: (res.data as any)?.response_message,
            errors: (res.data as any)?.errors,
        });
        return res;
    });
};

/**
 * Multipart path for CreateCampaign.
 *
 * Hits the dedicated CBV URL, not the dispatcher. No `action` field
 * is appended — the URL itself identifies the operation. The
 * Content-Type override prevents apisauce from forcing JSON.
 */
const postCreateCampaign = (formData: FormData) => {
    LOG("postCreateCampaign →", {
        url: CREATE_ENDPOINT,
        fields: describePayload(formData),
    });

    return clientMultipart
        .post(CREATE_ENDPOINT, formData, NO_CONTENT_TYPE)
        .then((res) => {
            LOG("postCreateCampaign ←", {
                ok: res.ok,
                status: res.status,
                response_code: (res.data as any)?.response_code,
                response_message: (res.data as any)?.response_message,
                errors: (res.data as any)?.errors,
                data: res.data,
            });
            return res;
        });
};

/**
 * Multipart path for UpdateCampaign.
 *
 * Same as above — dedicated CBV URL, no `action` field, Content-Type
 * override applied.
 */
const postUpdateCampaign = (id: UUID, formData: FormData) => {
    const url = updateEndpoint(id);
    LOG("postUpdateCampaign →", {
        url,
        fields: describePayload(formData),
    });

    return clientMultipart
        .post(url, formData, NO_CONTENT_TYPE)
        .then((res) => {
            LOG("postUpdateCampaign ←", {
                ok: res.ok,
                status: res.status,
                response_code: (res.data as any)?.response_code,
                response_message: (res.data as any)?.response_message,
                errors: (res.data as any)?.errors,
                data: res.data,
            });
            return res;
        });
};

/* =========================================================
 * FormData builders
 * ======================================================= */

export function buildCreateForm(
    fields: {
        title: string;
        description?: string;
        start: string;
        end: string;
        budget_cap?: string;
    },
    banners?: File[]
): FormData {
    const fd = new FormData();
    fd.append("title", fields.title);
    if (fields.description !== undefined) {
        fd.append("description", fields.description);
    }
    fd.append("start", fields.start);
    fd.append("end", fields.end);
    if (fields.budget_cap !== undefined) {
        fd.append("budget_cap", fields.budget_cap);
    }
    for (const f of banners ?? []) {
        fd.append("campaign_banners", f);
    }
    return fd;
}

export function buildUpdateForm(
    fields: {
        title?: string;
        description?: string;
        start?: string;
        end?: string;
        budget_cap?: string;
    },
    banners?: File[]
): FormData {
    const fd = new FormData();
    if (fields.title !== undefined) fd.append("title", fields.title);
    if (fields.description !== undefined) fd.append("description", fields.description);
    if (fields.start !== undefined) fd.append("start", fields.start);
    if (fields.end !== undefined) fd.append("end", fields.end);
    if (fields.budget_cap !== undefined) fd.append("budget_cap", fields.budget_cap);
    for (const f of banners ?? []) {
        fd.append("campaign_banners", f);
    }
    return fd;
}

/* =========================================================
 * Named wrappers — one per server action
 * ======================================================= */

/* ---------------- Campaign lifecycle ---------------- */

const createCampaignAction = (formData: FormData) => {
    if (!isFormDataInstance(formData)) {
        throw new Error(
            "createCampaignAction: expected FormData. " +
            "Use buildCreateForm(fields, banners) to construct it."
        );
    }
    LOG("createCampaignAction — incoming FormData", describePayload(formData));
    return postCreateCampaign(formData);
};

const getEntityCampaignsAction = (
    data: {
        status?: CampaignStatus;
        is_active?: TrueFalse;
        active_only?: boolean;
        page?: number;
    } = {}
) => {
    return campaignAction({
        action: "GetEntityCampaigns",
        ...data,
    });
};

const getCampaignDetailsAction = (data: { campaign_id: UUID }) => {
    return campaignAction({
        action: "GetCampaignDetails",
        ...data,
    });
};

const updateCampaignAction = (campaign_id: UUID, formData: FormData) => {
    if (!campaign_id) {
        throw new Error("updateCampaignAction: campaign_id is required.");
    }
    if (!isFormDataInstance(formData)) {
        throw new Error(
            "updateCampaignAction: expected FormData. " +
            "Use buildUpdateForm(fields, banners) to construct it."
        );
    }
    LOG("updateCampaignAction — incoming FormData", {
        campaign_id,
        fields: describePayload(formData),
    });
    return postUpdateCampaign(campaign_id, formData);
};

const deleteCampaignAction = (data: { campaign_id: UUID }) => {
    return campaignAction({
        action: "DeleteCampaign",
        ...data,
    });
};

const publishCampaignAction = (data: { campaign_id: UUID }) => {
    return campaignAction({
        action: "PublishCampaign",
        ...data,
    });
};

const closeCampaignAction = (data: { campaign_id: UUID }) => {
    return campaignAction({
        action: "CloseCampaign",
        ...data,
    });
};

/* ---------------- Campaign items ---------------- */

const addCampaignItemAction = (data: {
    campaign_id: UUID;
    wholesaler_receipt_id: UUID;
    wholesaler_price_discount_id?: UUID | null;
    wholesaler_quantity_discount_id?: UUID | null;
    suggested_quantity?: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}) => {
    return campaignAction({
        action: "AddCampaignItem",
        ...data,
    });
};

const updateCampaignItemAction = (data: {
    item_id: UUID;
    wholesaler_price_discount_id?: UUID | null;
    wholesaler_quantity_discount_id?: UUID | null;
    suggested_quantity?: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}) => {
    return campaignAction({
        action: "UpdateCampaignItem",
        ...data,
    });
};

const deleteCampaignItemAction = (data: { item_id: UUID }) => {
    return campaignAction({
        action: "DeleteCampaignItem",
        ...data,
    });
};

const getCampaignItemsAction = (data: {
    campaign_id: UUID;
    page?: number;
}) => {
    return campaignAction({
        action: "GetCampaignItems",
        ...data,
    });
};

/* ---------------- Audience ---------------- */

const addCampaignAudienceAction = (data: {
    campaign_id: UUID;
    retailer_id: UUID;
}) => {
    return campaignAction({
        action: "AddCampaignAudience",
        ...data,
    });
};

const removeCampaignAudienceAction = (data: { audience_id: UUID }) => {
    return campaignAction({
        action: "RemoveCampaignAudience",
        ...data,
    });
};

const getCampaignAudienceAction = (data: {
    campaign_id: UUID;
    opted_in?: TrueFalse;
    page?: number;
}) => {
    return campaignAction({
        action: "GetCampaignAudience",
        ...data,
    });
};

/* ---------------- Retailer-facing ---------------- */

const getMyCampaignsAction = (
    data: {
        status?: CampaignStatus;
        opted_in?: TrueFalse;
        active_only?: boolean;
        page?: number;
    } = {}
) => {
    return campaignAction({
        action: "GetMyCampaigns",
        ...data,
    });
};

const getMyCampaignDetailsAction = (data: { campaign_id: UUID }) => {
    return campaignAction({
        action: "GetMyCampaignDetails",
        ...data,
    });
};

const projectCampaignAction = (data: {
    campaign_id: UUID;
    items: Array<{ item_id: UUID; quantity: number }>;
    markup_pct?: string;
}) => {
    return campaignAction({
        action: "ProjectCampaign",
        ...data,
    });
};

const optInCampaignAction = (data: {
    campaign_id: UUID;
    items: Array<{ item_id: UUID; quantity: number }>;
    markup_pct?: string;
}) => {
    return campaignAction({
        action: "OptInCampaign",
        ...data,
    });
};

const optOutCampaignAction = (data: { campaign_id: UUID }) => {
    return campaignAction({
        action: "OptOutCampaign",
        ...data,
    });
};

/* =========================================================
 * Default export
 * ======================================================= */

export default {
    campaignAction,
    postCreateCampaign,
    postUpdateCampaign,

    createCampaignAction,
    getEntityCampaignsAction,
    getCampaignDetailsAction,
    updateCampaignAction,
    deleteCampaignAction,
    publishCampaignAction,
    closeCampaignAction,

    addCampaignItemAction,
    updateCampaignItemAction,
    deleteCampaignItemAction,
    getCampaignItemsAction,

    addCampaignAudienceAction,
    removeCampaignAudienceAction,
    getCampaignAudienceAction,

    getMyCampaignsAction,
    getMyCampaignDetailsAction,
    projectCampaignAction,
    optInCampaignAction,
    optOutCampaignAction,
};