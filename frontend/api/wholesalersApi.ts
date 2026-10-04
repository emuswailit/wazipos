// api/wholesalersApi.ts

import { ApiResponse } from "apisauce";
import client from "./client";
import clientMultipart from "./multipartClient";

/* =========================================================
 * Debug logging — remove once the campaign flow is stable.
 * ======================================================= */

const LOG = (...args: any[]) => {
    if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[wholesalersApi]", ...args);
    }
};

/* =========================================================
 * Types
 * ======================================================= */

export interface WholesalerReceiptItem {
    id: string;
    title: string;
    unit_selling_price: number;
    current_pack_quantity: number;
    barcode?: string;
}

export interface RetailEntityItem {
    id: string;
    title: string;
}

export interface WholesaleOrderPayload {
    retailer_id: string;
    notes: string;
    items: Array<{
        product_id: string;
        barcode: string;
        quantity: number;
        discount: number;
        price: number;
    }>;
}

/* =========================================================
 * Wholesaler receipts dispatcher
 * ======================================================= */

export type WholesalerReceiptsAction =
    | "GetRetailEntities"
    | "GetInventory"
    | "WholesalerPriceDiscounts"
    | "WholesalerPriceDiscountDetails"
    | "WholesalerQuantityDiscounts"
    | "WholesalerQuantityDiscountDetails"
    | (string & {});

export interface WholesalerReceiptsDispatch {
    action: WholesalerReceiptsAction;
    [key: string]: any;
}

/* =========================================================
 * Discount payload / record shapes
 * ======================================================= */

export type ImageFieldValue = string | PickedImageLike | null;

export interface PickedImageLike {
    kind: "web" | "native";
    uri: string;
    file: File | { uri: string; name: string; type: string };
    name: string;
    type: string;
}

export interface PriceDiscountPayload {
    wholesaler_receipt: string;
    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
    start: string;
    end: string;
    is_active: "true" | "false";
    banner: ImageFieldValue;
}

export interface PriceDiscountRecord
    extends Omit<PriceDiscountPayload, "banner"> {
    id: string;
    wholesaler_receipt_title?: string;
    product_title?: string;
    receipt_unit_selling_price?: string;
    thumbnail_url?: string;
    images?: any[];
    price_discount_banners?: any[];
}

export interface QuantityDiscountPayload {
    wholesaler_receipt: string;
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    start: string;
    end: string;
    is_active: "true" | "false";
    banner: ImageFieldValue;
}

export interface QuantityDiscountRecord
    extends Omit<QuantityDiscountPayload, "banner"> {
    id: string;
    wholesaler_receipt_title?: string;
    product_title?: string;
    thumbnail_url?: string;
    images?: any[];
    quantity_discount_banners?: any[];
}

export interface DiscountSubmitResult<T> {
    errors: Record<string, string | string[]> | null;
    result: T | null;
}

/* =========================================================
 * Campaign types
 * ======================================================= */

export type CampaignStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "CLOSED"
    | "CANCELLED";

export interface WholesalerCampaignItem {
    id: string;
    campaign: string;
    wholesaler_receipt: string;
    wholesaler_receipt_title?: string;
    product_title?: string;
    wholesaler_price_discount: string | null;
    wholesaler_quantity_discount: string | null;
    suggested_quantity: number;
    per_retailer_limit: number | null;
    retail_price_hint: string | null;
    published_unit_price: string | null;
    published_bonus_quantity: number;
    created: string;
    updated: string;
}

export interface WholesalerCampaignAudience {
    id: string;
    campaign: string;
    retailer: string;
    retailer_title?: string;
    opted_in_at: string | null;
    opted_out_at: string | null;
    is_visible: "true" | "false";
    created: string;
    updated: string;
}

export interface WholesalerCampaign {
    id: string;
    entity: string;
    wholesaler: string;
    wholesaler_title?: string;
    title: string;
    description: string;
    banner?: string | null;
    status: CampaignStatus;
    start: string;
    end: string;
    is_active: "true" | "false";
    budget_cap: string | null;
    items?: WholesalerCampaignItem[];
    audience?: WholesalerCampaignAudience[];
    created: string;
    updated: string;
}

/* =========================================================
 * Campaign payloads
 *
 * `wholesaler_receipt_id`, `wholesaler_price_discount_id`, and
 * `wholesaler_quantity_discount_id` match the keys read by
 * `services.campaigns.add_campaign_item` on the backend.
 * ======================================================= */

export interface CreateCampaignPayload {
    title: string;
    description?: string;
    start: string;
    end: string;
    budget_cap?: string | null;
}

export interface UpdateCampaignPayload {
    campaign_id: string;
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    budget_cap?: string | null;
}

export interface AddCampaignItemPayload {
    campaign_id: string;
    wholesaler_receipt_id: string;
    wholesaler_price_discount_id?: string | null;
    wholesaler_quantity_discount_id?: string | null;
    suggested_quantity: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}

export interface UpdateCampaignItemPayload {
    item_id: string;
    wholesaler_price_discount_id?: string | null;
    wholesaler_quantity_discount_id?: string | null;
    suggested_quantity?: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}

export interface AddCampaignAudiencePayload {
    campaign_id: string;
    retailer_id: string;
}

export interface RemoveCampaignAudiencePayload {
    audience_id: string;
}

export interface CampaignActionPayload {
    campaign_id: string;
}

export interface ProjectCampaignPayload {
    campaign_id: string;
    markup_pct?: string;
    items: Array<{ item_id: string; quantity: number }>;
}

export interface OptInCampaignPayload {
    campaign_id: string;
    markup_pct?: string;
    items: Array<{ item_id: string; quantity: number }>;
}

/* =========================================================
 * Campaign response types
 * ======================================================= */

export interface CampaignProjectionRow {
    item_id: string;
    receipt_id: string;
    product_title: string;
    quantity: number;
    published_unit_price: string;
    published_bonus_quantity: number;
    profit_estimate: string;
}

export interface OptInResult {
    indent_id: string;
    indent_number: string;
    items_created: number;
}

/* =========================================================
 * Product request types — wholesaler side
 * ======================================================= */

export type ProductRequestUrgency = "low" | "medium" | "high";

export type ProductRequestStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "PARTIALLY_FULFILLED"
    | "FULFILLED"
    | "CANCELLED"
    | "EXPIRED";

export interface RespondAcceptedLine {
    item_id: string;
    receipt_id?: string;
    receipt?: Record<string, any>;
}

export interface RespondRejectedLine {
    item_id: string;
}

/* =========================================================
 * API contract
 * ======================================================= */

export interface WholesalersApiContract {
    getWholesaleInventoryAction: (params?: { action: string }) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleStaffAction: (data?: Record<string, any>) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleReceiptsAction: (data: WholesalerReceiptsDispatch) => Promise<ApiResponse<any>>;
    wholesaleRetailerOrdersAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;
    wholesaleRetailerOrdersStaffAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;

    priceDiscountCreateAction: (data: FormData) => Promise<ApiResponse<any>>;
    priceDiscountUpdateAction: (data: FormData, id: string) => Promise<ApiResponse<any>>;
    quantityDiscountCreateAction: (data: FormData) => Promise<ApiResponse<any>>;
    quantityDiscountUpdateAction: (data: FormData, id: string) => Promise<ApiResponse<any>>;

    submitPriceDiscountAction: (
        payload: PriceDiscountPayload,
        id?: string
    ) => Promise<DiscountSubmitResult<PriceDiscountRecord>>;
    submitQuantityDiscountAction: (
        payload: QuantityDiscountPayload,
        id?: string
    ) => Promise<DiscountSubmitResult<QuantityDiscountRecord>>;

    createCampaignAction: (
        data: CreateCampaignPayload | FormData
    ) => Promise<ApiResponse<WholesalerCampaign>>;
    updateCampaignAction: (
        data: UpdateCampaignPayload | FormData
    ) => Promise<ApiResponse<WholesalerCampaign>>;
    deleteCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<{ success: boolean }>>;
    publishCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaign>>;
    closeCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaign>>;
    getEntityCampaignsAction: (data?: { status?: CampaignStatus; search?: string }) => Promise<ApiResponse<WholesalerCampaign[]>>;
    getCampaignDetailsAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaign>>;

    addCampaignItemAction: (data: AddCampaignItemPayload) => Promise<ApiResponse<WholesalerCampaignItem>>;
    updateCampaignItemAction: (data: UpdateCampaignItemPayload) => Promise<ApiResponse<WholesalerCampaignItem>>;
    deleteCampaignItemAction: (data: { item_id: string }) => Promise<ApiResponse<{ success: boolean }>>;
    getCampaignItemsAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaignItem[]>>;

    addCampaignAudienceAction: (data: AddCampaignAudiencePayload) => Promise<ApiResponse<WholesalerCampaignAudience>>;
    removeCampaignAudienceAction: (data: RemoveCampaignAudiencePayload) => Promise<ApiResponse<{ success: boolean }>>;
    getCampaignAudienceAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaignAudience[]>>;

    getMyCampaignsAction: (data?: { status?: CampaignStatus }) => Promise<ApiResponse<WholesalerCampaign[]>>;
    projectCampaignAction: (data: ProjectCampaignPayload) => Promise<ApiResponse<CampaignProjectionRow[]>>;
    optInCampaignAction: (data: OptInCampaignPayload) => Promise<ApiResponse<OptInResult>>;
    optOutCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaignAudience>>;

    wholesalerProductRequestsAction: (data: { action: string;[key: string]: any }) => Promise<ApiResponse<any>>;
    getWholesalerTaggedRequestsAction: (data?: { status?: ProductRequestStatus; urgency?: ProductRequestUrgency; page?: number; page_size?: number }) => Promise<ApiResponse<any>>;
    getWholesalerRequestDetailsAction: (data: { request_id: string }) => Promise<ApiResponse<any>>;
    createWholesalerOfferAction: (data: { request_id: string; line_id: string; offered_quantity: number; offered_unit_price: number; note?: string }) => Promise<ApiResponse<any>>;
    withdrawWholesalerOfferAction: (data: { offer_id: string }) => Promise<ApiResponse<any>>;
    respondToProductRequestAction: (data: { request_id: string; accepted_lines: RespondAcceptedLine[]; rejected_lines: RespondRejectedLine[]; note?: string }) => Promise<ApiResponse<any>>;
}

/* =========================================================
 * Existing actions
 * ======================================================= */

const getWholesaleInventoryAction = (params?: { action: string }): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/receipts", params);
};

const wholesaleStaffAction = (data?: Record<string, any>): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/receipts/staff", data);
};

const wholesaleRetailerOrdersAction = (data: WholesaleOrderPayload): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/retailers/orders", data);
};

const wholesaleRetailerOrdersStaffAction = (data: WholesaleOrderPayload): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/retailers/orders/staff", data);
};

const wholesaleReceiptsAction = (
    data: WholesalerReceiptsDispatch
): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/receipts", data);
};

/* =========================================================
 * Raw upload actions
 * ======================================================= */

const priceDiscountCreateAction = (data: FormData): Promise<ApiResponse<any>> => {
    return clientMultipart.post("/wholesalers/discounts/price/create", data);
};

const priceDiscountUpdateAction = (data: FormData, id: string): Promise<ApiResponse<any>> => {
    return clientMultipart.patch(`/wholesalers/discounts/price/${id}/update`, data);
};

const quantityDiscountCreateAction = (data: FormData): Promise<ApiResponse<any>> => {
    return clientMultipart.post("/wholesalers/discounts/quantity/create", data);
};

const quantityDiscountUpdateAction = (data: FormData, id: string): Promise<ApiResponse<any>> => {
    return clientMultipart.patch(`/wholesalers/discounts/quantity/${id}/update`, data);
};

/* =========================================================
 * Discount submit — helpers
 * ======================================================= */

const PRICE_DISCOUNT_FILE_FIELD = "price_discount_banners";
const QUANTITY_DISCOUNT_FILE_FIELD = "quantity_discount_banners";

function isPendingUpload(banner: ImageFieldValue): banner is PickedImageLike {
    return (
        typeof banner === "object" &&
        banner !== null &&
        "kind" in banner &&
        ((banner as PickedImageLike).kind === "web" ||
            (banner as PickedImageLike).kind === "native")
    );
}

function appendImageToFormData(
    fd: FormData,
    field: string,
    img: PickedImageLike
): void {
    fd.append(field, img.file as any);
}

function normaliseDiscountErrors(
    raw: any
): Record<string, string | string[]> {
    if (!raw) return { detail: "Request failed." };

    if (Array.isArray(raw)) {
        const out: Record<string, string> = {};
        raw.forEach((line: any) => {
            const s = String(line ?? "");
            const idx = s.indexOf(": ");
            if (idx > 0) {
                const key = s.slice(0, idx).trim();
                const msg = s.slice(idx + 2).trim();
                out[key] = out[key] ? `${out[key]}; ${msg}` : msg;
            } else if (s) {
                out.detail = out.detail ? `${out.detail}; ${s}` : s;
            }
        });
        return out;
    }

    if (typeof raw === "object") return raw as Record<string, string>;

    return { detail: String(raw) };
}

/* =========================================================
 * Discount submit — price
 * ======================================================= */

const submitPriceDiscountAction = async (
    payload: PriceDiscountPayload,
    id?: string
): Promise<DiscountSubmitResult<PriceDiscountRecord>> => {
    const { banner, ...fields } = payload;

    LOG("submitPriceDiscount request", { id: id ?? "(create)", payload: { ...fields, banner: banner ? "<file>" : null } });

    const fd = new FormData();
    fd.append("wholesaler_receipt", String(fields.wholesaler_receipt));
    fd.append("title", String(fields.title));
    fd.append("percent", String(fields.percent));
    fd.append("start", String(fields.start));
    fd.append("end", String(fields.end));
    fd.append("is_active", String(fields.is_active));
    fd.append("normal_price", String(fields.normal_price));
    fd.append("offer_price", String(fields.offer_price));

    if (isPendingUpload(banner)) {
        appendImageToFormData(fd, PRICE_DISCOUNT_FILE_FIELD, banner);
    }

    const res = id
        ? await priceDiscountUpdateAction(fd, id)
        : await priceDiscountCreateAction(fd);

    LOG("submitPriceDiscount response", {
        ok: res.ok,
        status: res.status,
        problem: res.problem,
        data: res.data,
    });

    if (!res.ok) {
        return {
            errors: {
                detail:
                    (res.data as any)?.response_message ??
                    (res.problem as any) ??
                    "Request failed.",
            },
            result: null,
        };
    }

    const data = (res.data ?? {}) as any;

    if (typeof data.response_code === "number") {
        if (data.response_code !== 0) {
            return {
                errors: normaliseDiscountErrors(data.errors),
                result: null,
            };
        }
        const record: PriceDiscountRecord | null =
            data.wholesale_price_discount ?? null;
        if (!record) {
            return {
                errors: { detail: "Server did not return the saved discount." },
                result: null,
            };
        }
        return { errors: null, result: record };
    }

    if (id && data && typeof data === "object" && data.id) {
        return { errors: null, result: data as PriceDiscountRecord };
    }

    return {
        errors: { detail: "Unexpected response shape from server." },
        result: null,
    };
};

/* =========================================================
 * Discount submit — quantity
 * ======================================================= */

const submitQuantityDiscountAction = async (
    payload: QuantityDiscountPayload,
    id?: string
): Promise<DiscountSubmitResult<QuantityDiscountRecord>> => {
    const { banner, ...fields } = payload;

    LOG("submitQuantityDiscount request", { id: id ?? "(create)", payload: { ...fields, banner: banner ? "<file>" : null } });

    const fd = new FormData();
    fd.append("wholesaler_receipt", String(fields.wholesaler_receipt));
    fd.append("title", String(fields.title));
    fd.append("limit_quantity", String(fields.limit_quantity));
    fd.append("awarded_quantity", String(fields.awarded_quantity));
    fd.append("start", String(fields.start));
    fd.append("end", String(fields.end));
    fd.append("is_active", String(fields.is_active));

    if (isPendingUpload(banner)) {
        appendImageToFormData(fd, QUANTITY_DISCOUNT_FILE_FIELD, banner);
    }

    const res = id
        ? await quantityDiscountUpdateAction(fd, id)
        : await quantityDiscountCreateAction(fd);

    LOG("submitQuantityDiscount response", {
        ok: res.ok,
        status: res.status,
        problem: res.problem,
        data: res.data,
    });

    if (!res.ok) {
        return {
            errors: {
                detail:
                    (res.data as any)?.response_message ??
                    (res.problem as any) ??
                    "Request failed.",
            },
            result: null,
        };
    }

    const data = (res.data ?? {}) as any;

    if (typeof data.response_code === "number") {
        if (data.response_code !== 0) {
            return {
                errors: normaliseDiscountErrors(data.errors),
                result: null,
            };
        }
        const record: QuantityDiscountRecord | null =
            data.wholesaler_quantity_discount ?? null;
        if (!record) {
            return {
                errors: { detail: "Server did not return the saved discount." },
                result: null,
            };
        }
        return { errors: null, result: record };
    }

    if (id && data && typeof data === "object" && data.id) {
        return { errors: null, result: data as QuantityDiscountRecord };
    }

    return {
        errors: { detail: "Unexpected response shape from server." },
        result: null,
    };
};

/* =========================================================
 * Campaign dispatcher
 * ======================================================= */

const CAMPAIGNS_ENDPOINT = "/wholesalers/campaigns";

function isFormDataInstance(value: unknown): value is FormData {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as any).append === "function" &&
        typeof (value as any).getAll === "function" &&
        typeof (value as any).entries === "function"
    );
}

const campaignsAction = (data: {
    action: string;
    [key: string]: any;
}): Promise<ApiResponse<any>> => {
    LOG("campaignsAction →", { action: data.action, payload: data });

    return client.post(CAMPAIGNS_ENDPOINT, data).then((res) => {
        LOG("campaignsAction ←", {
            action: data.action,
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

const campaignsMultipartAction = (
    action: string,
    formData: FormData
): Promise<ApiResponse<any>> => {
    formData.append("action", action);

    LOG("campaignsMultipartAction →", {
        action,
        fields: Array.from((formData as any).keys?.() ?? []),
    });

    return clientMultipart
        .post(CAMPAIGNS_ENDPOINT, formData)
        .then((res) => {
            LOG("campaignsMultipartAction ←", {
                action,
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

/* ---- Campaign lifecycle ---- */

const createCampaignAction = (
    data: CreateCampaignPayload | FormData
): Promise<ApiResponse<any>> => {
    if (isFormDataInstance(data)) {
        return campaignsMultipartAction("CreateCampaign", data);
    }
    return campaignsAction({ action: "CreateCampaign", ...data });
};

const updateCampaignAction = (
    data: UpdateCampaignPayload | FormData
): Promise<ApiResponse<any>> => {
    if (isFormDataInstance(data)) {
        return campaignsMultipartAction("UpdateCampaign", data);
    }
    return campaignsAction({ action: "UpdateCampaign", ...data });
};

const deleteCampaignAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "DeleteCampaign", ...data });

const publishCampaignAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "PublishCampaign", ...data });

const closeCampaignAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "CloseCampaign", ...data });

const getEntityCampaignsAction = (
    data?: { status?: CampaignStatus; search?: string }
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "GetEntityCampaigns", ...(data ?? {}) });

const getCampaignDetailsAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "GetCampaignDetails", ...data });

/* ---- Campaign items ---- */

const addCampaignItemAction = (
    data: AddCampaignItemPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "AddCampaignItem", ...data });

const updateCampaignItemAction = (
    data: UpdateCampaignItemPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "UpdateCampaignItem", ...data });

const deleteCampaignItemAction = (
    data: { item_id: string }
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "DeleteCampaignItem", ...data });

const getCampaignItemsAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "GetCampaignItems", ...data });

/* ---- Campaign audience ---- */

const addCampaignAudienceAction = (
    data: AddCampaignAudiencePayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "AddCampaignAudience", ...data });

const removeCampaignAudienceAction = (
    data: RemoveCampaignAudiencePayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "RemoveCampaignAudience", ...data });

const getCampaignAudienceAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "GetCampaignAudience", ...data });

/* ---- Retailer-facing campaigns ---- */

const getMyCampaignsAction = (
    data?: { status?: CampaignStatus }
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "GetMyCampaigns", ...(data ?? {}) });

const projectCampaignAction = (
    data: ProjectCampaignPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "ProjectCampaign", ...data });

const optInCampaignAction = (
    data: OptInCampaignPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "OptInCampaign", ...data });

const optOutCampaignAction = (
    data: CampaignActionPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "OptOutCampaign", ...data });

/* =========================================================
 * Product request actions — wholesaler side
 * ======================================================= */

const wholesalerProductRequestsAction = (
    data: { action: string;[key: string]: any }
): Promise<ApiResponse<any>> => {
    return client.post("/retailers/product-requests", data);
};

export interface GetWholesalerTaggedRequestsPayload {
    status?: ProductRequestStatus;
    urgency?: ProductRequestUrgency;
    page?: number;
    page_size?: number;
}

const getWholesalerTaggedRequestsAction = (
    data?: GetWholesalerTaggedRequestsPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "GetWholesalerTaggedRequests",
        ...(data ?? {}),
    });

export interface GetWholesalerRequestDetailsPayload {
    request_id: string;
}

const getWholesalerRequestDetailsAction = (
    data: GetWholesalerRequestDetailsPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "GetRequestDetails",
        ...data,
    });

export interface CreateWholesalerOfferPayload {
    request_id: string;
    line_id: string;
    offered_quantity: number;
    offered_unit_price: number;
    note?: string;
}

const createWholesalerOfferAction = (
    data: CreateWholesalerOfferPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "CreateOffer",
        ...data,
    });

export interface WithdrawWholesalerOfferPayload {
    offer_id: string;
}

const withdrawWholesalerOfferAction = (
    data: WithdrawWholesalerOfferPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "WithdrawOffer",
        ...data,
    });

export interface RespondToProductRequestPayload {
    request_id: string;
    accepted_lines: RespondAcceptedLine[];
    rejected_lines: RespondRejectedLine[];
    note?: string;
}

const respondToProductRequestAction = (
    data: RespondToProductRequestPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "Respond",
        ...data,
    });

/* =========================================================
 * Default export
 * ======================================================= */

const apiExportInstance: WholesalersApiContract = {
    getWholesaleInventoryAction,
    priceDiscountUpdateAction,
    priceDiscountCreateAction,
    quantityDiscountUpdateAction,
    quantityDiscountCreateAction,
    submitPriceDiscountAction,
    submitQuantityDiscountAction,
    wholesaleStaffAction,
    wholesaleReceiptsAction,
    wholesaleRetailerOrdersAction,
    wholesaleRetailerOrdersStaffAction,

    createCampaignAction,
    updateCampaignAction,
    deleteCampaignAction,
    publishCampaignAction,
    closeCampaignAction,
    getEntityCampaignsAction,
    getCampaignDetailsAction,

    addCampaignItemAction,
    updateCampaignItemAction,
    deleteCampaignItemAction,
    getCampaignItemsAction,

    addCampaignAudienceAction,
    removeCampaignAudienceAction,
    getCampaignAudienceAction,

    getMyCampaignsAction,
    projectCampaignAction,
    optInCampaignAction,
    optOutCampaignAction,

    wholesalerProductRequestsAction,
    getWholesalerTaggedRequestsAction,
    getWholesalerRequestDetailsAction,
    createWholesalerOfferAction,
    withdrawWholesalerOfferAction,
    respondToProductRequestAction,
};

export default apiExportInstance;