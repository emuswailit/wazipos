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

interface WholesalerReceiptItem {
    id: string;
    title: string;
    unit_selling_price: number;
    current_pack_quantity: number;
    barcode?: string;
}

interface WholesaleOrderPayload {
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

/** Matches `create_retailer_order` in backend wholesalers/utils/retailer_orders_utils.py. */
export interface CreateStaffRetailerOrderPayload {
    action: "CreateStaffRetailerOrder";
    retailer_order_details: {
        retailer_id: string;
        /** Idempotency key: the backend returns the existing order for a repeated draft_id. */
        draft_id: string;
        order_terms: string;
        payment_method_id?: string;
        mobile_money_phone?: string | null;
        order_gross_price_total: number;
        order_discount_total: number;
        final_price_total: number;
        order_items: Array<{
            wholesaler_receipt: string;
            purchased_quantity: number;
            discount_quantity: number;
            total_quantity: number;
            item_price: number;
            item_price_discount: number;
            item_net_price: number;
            item_price_total: number;
        }>;
    };
}

/** Errors also arrive as HTTP 200, with response_code 1 and `errors`. */
export interface CreateStaffRetailerOrderResponse {
    response_code: number | string;
    response_message?: string;
    errors?: string[] | Record<string, unknown>;
    retailer_order?: { id: string; reference_number?: string } & Record<string, unknown>;
}

/* =========================================================
 * Wholesaler receipts dispatcher
 * ======================================================= */

type WholesalerReceiptsAction =
    | "GetRetailEntities"
    | "GetInventory"
    | "WholesalerPriceDiscounts"
    | "WholesalerPriceDiscountDetails"
    | "WholesalerQuantityDiscounts"
    | "WholesalerQuantityDiscountDetails"
    | (string & {});

interface WholesalerReceiptsDispatch {
    action: WholesalerReceiptsAction;
    [key: string]: any;
}

/* =========================================================
 * Wholesaler receipt-returns dispatcher
 *
 * Backend: POST /wholesalers/receipt-returns
 * View:    wholesalers.views.receiptReturnsAPIView
 * Utils:   wholesalers.utils.return_utils
 *
 * Simplified lifecycle:
 *     PENDING   -> ACCEPTED   (wholesaler takes goods back)
 *     PENDING   -> REJECTED   (wholesaler declines; adjusts later)
 *     PENDING   -> CANCELLED  (either party, pre-decision)
 *
 * NOTE: this is a DIFFERENT endpoint from
 * `/wholesalers/receipts` (see `wholesaleReceiptsAction` above).
 * ======================================================= */

export type WholesalerReturnStatus =
    | "PENDING"
    | "ACCEPTED"
    | "REJECTED"
    | "CANCELLED";

export type WholesalerReturnReason =
    | "EXPIRED"
    | "NEAR_EXPIRY"
    | "DAMAGED"
    | "WRONG_ITEM"
    | "SHORT_DATED"
    | "QUALITY"
    | "OVER_ORDERED"
    | "RECALL"
    | "OTHER";

export type WholesalerReturnType = "REFUND" | "EXCHANGE" | "REPLACEMENT";

export interface WholesalerReturnRecord {
    id: string;
    product: string;
    product_title?: string;
    wholesaler_entity: string;
    retailer_entity: string;
    quantity: number;
    reason: WholesalerReturnReason;
    justification: string;
    return_type: WholesalerReturnType;
    status: WholesalerReturnStatus;
    reference_number?: string | null;
    unit_price_paid?: string | null;
    unit_price_refunded?: string | null;
    restocking_fee_percent?: string | null;
    total_refund_amount?: string | null;
    decision_notes?: string;
    created: string;
    updated: string;
    accepted_at?: string | null;
    rejected_at?: string | null;
    cancelled_at?: string | null;
}

interface WholesalerReturnDispatch {
    action: string;
    [key: string]: any;
}

const RECEIPT_RETURNS_ENDPOINT = "/wholesalers/receipt-returns";

/* ---- Base dispatcher ---- */

const receiptReturnsAction = (
    data: WholesalerReturnDispatch
): Promise<ApiResponse<any>> => {
    LOG("receiptReturnsAction →", { action: data.action, payload: data });

    return client.post(RECEIPT_RETURNS_ENDPOINT, data).then((res) => {
        LOG("receiptReturnsAction ←", {
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

/* ---- Typed wrappers, one per backend action ---- */

interface InitiateReturnPayload {
    retailer_receipt: string;
    quantity: number;
    reason: WholesalerReturnReason;
    justification: string;
    return_type?: WholesalerReturnType;
    unit_price_refunded?: string;
    restocking_fee_percent?: string;
}

const initiateReturnAction = (
    data: InitiateReturnPayload
): Promise<ApiResponse<any>> =>
    receiptReturnsAction({ action: "InitiateReturn", ...data });

interface ListReturnsPayload {
    status?: WholesalerReturnStatus;
    reason?: WholesalerReturnReason;
    return_type?: WholesalerReturnType;
    wholesaler_entity?: string;
    retailer_entity?: string;
    search?: string;
}

const listReturnsAction = (
    data?: ListReturnsPayload
): Promise<ApiResponse<any>> =>
    receiptReturnsAction({ action: "ListReturns", ...(data ?? {}) });

interface GetReturnDetailsPayload {
    return_id: string;
}

const getReturnDetailsAction = (
    data: GetReturnDetailsPayload
): Promise<ApiResponse<any>> =>
    receiptReturnsAction({ action: "GetReturnDetails", ...data });

interface AcceptReturnPayload {
    return_id: string;
    /** Optional override applied at accept time. */
    unit_price_refunded?: string;
    /** Optional override applied at accept time, 0–100. */
    restocking_fee_percent?: string;
    /** Free-text note recorded on the return. */
    notes?: string;
}

const acceptReturnAction = (
    data: AcceptReturnPayload
): Promise<ApiResponse<any>> =>
    receiptReturnsAction({ action: "AcceptReturn", ...data });

interface RejectReturnPayload {
    return_id: string;
    reason?: string;
}

const rejectReturnAction = (
    data: RejectReturnPayload
): Promise<ApiResponse<any>> =>
    receiptReturnsAction({ action: "RejectReturn", ...data });

interface CancelReturnPayload {
    return_id: string;
    reason?: string;
}

const cancelReturnAction = (
    data: CancelReturnPayload
): Promise<ApiResponse<any>> =>
    receiptReturnsAction({ action: "CancelReturn", ...data });

/* =========================================================
 * Discount payload / record shapes
 * ======================================================= */

type ImageFieldValue = string | PickedImageLike | null;

interface PickedImageLike {
    kind: "web" | "native";
    uri: string;
    file: File | { uri: string; name: string; type: string };
    name: string;
    type: string;
}

interface PriceDiscountPayload {
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

interface PriceDiscountRecord
    extends Omit<PriceDiscountPayload, "banner"> {
    id: string;
    wholesaler_receipt_title?: string;
    product_title?: string;
    receipt_unit_selling_price?: string;
    thumbnail_url?: string;
    images?: any[];
    price_discount_banners?: any[];
}

interface QuantityDiscountPayload {
    wholesaler_receipt: string;
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    start: string;
    end: string;
    is_active: "true" | "false";
    banner: ImageFieldValue;
}

interface QuantityDiscountRecord
    extends Omit<QuantityDiscountPayload, "banner"> {
    id: string;
    wholesaler_receipt_title?: string;
    product_title?: string;
    thumbnail_url?: string;
    images?: any[];
    quantity_discount_banners?: any[];
}

interface DiscountSubmitResult<T> {
    errors: Record<string, string | string[]> | null;
    result: T | null;
}

/* =========================================================
 * Campaign types
 * ======================================================= */

type CampaignStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "CLOSED"
    | "CANCELLED";

interface WholesalerCampaignItem {
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

interface WholesalerCampaignAudience {
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

interface WholesalerCampaign {
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

interface CreateCampaignPayload {
    title: string;
    description?: string;
    start: string;
    end: string;
    budget_cap?: string | null;
}

interface UpdateCampaignPayload {
    campaign_id: string;
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    budget_cap?: string | null;
}

interface AddCampaignItemPayload {
    campaign_id: string;
    wholesaler_receipt_id: string;
    wholesaler_price_discount_id?: string | null;
    wholesaler_quantity_discount_id?: string | null;
    suggested_quantity: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}

interface UpdateCampaignItemPayload {
    item_id: string;
    wholesaler_price_discount_id?: string | null;
    wholesaler_quantity_discount_id?: string | null;
    suggested_quantity?: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}

interface AddCampaignAudiencePayload {
    campaign_id: string;
    retailer_id: string;
}

interface RemoveCampaignAudiencePayload {
    audience_id: string;
}

interface CampaignActionPayload {
    campaign_id: string;
}

interface ProjectCampaignPayload {
    campaign_id: string;
    markup_pct?: string;
    items: Array<{ item_id: string; quantity: number }>;
}

interface OptInCampaignPayload {
    campaign_id: string;
    markup_pct?: string;
    items: Array<{ item_id: string; quantity: number }>;
}

/* =========================================================
 * Campaign response types
 * ======================================================= */

interface CampaignProjectionRow {
    item_id: string;
    receipt_id: string;
    product_title: string;
    quantity: number;
    published_unit_price: string;
    published_bonus_quantity: number;
    profit_estimate: string;
}

interface OptInResult {
    indent_id: string;
    indent_number: string;
    items_created: number;
}

/* =========================================================
 * Product request types — wholesaler side
 * ======================================================= */

type ProductRequestUrgency = "low" | "medium" | "high";

type ProductRequestStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "PARTIALLY_FULFILLED"
    | "FULFILLED"
    | "CANCELLED"
    | "EXPIRED";

interface RespondAcceptedLine {
    item_id: string;
    receipt_id?: string;
    receipt?: Record<string, any>;
}

interface RespondRejectedLine {
    item_id: string;
}

/* =========================================================
 * API contract
 * ======================================================= */

interface WholesalersApiContract {
    getWholesaleInventoryAction: (params?: { action: string }) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleStaffAction: (data?: Record<string, any>) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleReceiptsAction: (data: WholesalerReceiptsDispatch) => Promise<ApiResponse<any>>;
    wholesaleRetailerOrdersAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;
    wholesaleRetailerOrdersStaffAction: (data: CreateStaffRetailerOrderPayload) => Promise<ApiResponse<CreateStaffRetailerOrderResponse>>;

    /* ---- Wholesaler receipt-returns ---- */
    receiptReturnsAction: (data: WholesalerReturnDispatch) => Promise<ApiResponse<any>>;
    initiateReturnAction: (data: InitiateReturnPayload) => Promise<ApiResponse<any>>;
    listReturnsAction: (data?: ListReturnsPayload) => Promise<ApiResponse<any>>;
    getReturnDetailsAction: (data: GetReturnDetailsPayload) => Promise<ApiResponse<any>>;
    acceptReturnAction: (data: AcceptReturnPayload) => Promise<ApiResponse<any>>;
    rejectReturnAction: (data: RejectReturnPayload) => Promise<ApiResponse<any>>;
    cancelReturnAction: (data: CancelReturnPayload) => Promise<ApiResponse<any>>;

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

const wholesaleRetailerOrdersStaffAction = (data: CreateStaffRetailerOrderPayload): Promise<ApiResponse<CreateStaffRetailerOrderResponse>> => {
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

interface GetWholesalerTaggedRequestsPayload {
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

interface GetWholesalerRequestDetailsPayload {
    request_id: string;
}

const getWholesalerRequestDetailsAction = (
    data: GetWholesalerRequestDetailsPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "GetRequestDetails",
        ...data,
    });

interface CreateWholesalerOfferPayload {
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

interface WithdrawWholesalerOfferPayload {
    offer_id: string;
}

const withdrawWholesalerOfferAction = (
    data: WithdrawWholesalerOfferPayload
): Promise<ApiResponse<any>> =>
    wholesalerProductRequestsAction({
        action: "WithdrawOffer",
        ...data,
    });

interface RespondToProductRequestPayload {
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

    /* ---- Wholesaler receipt-returns ---- */
    receiptReturnsAction,
    initiateReturnAction,
    listReturnsAction,
    getReturnDetailsAction,
    acceptReturnAction,
    rejectReturnAction,
    cancelReturnAction,

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