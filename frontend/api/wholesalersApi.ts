// api/wholesalersApi.ts

import { ApiResponse } from "apisauce";
import client from "./client";
import clientMultipart from "./multipartClient";

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
 * ======================================================= */

export interface CreateCampaignPayload {
    title: string;
    description?: string;
    start: string;
    end: string;
    budget_cap?: string | null;
    banner?: FormData | any;
}

export interface UpdateCampaignPayload {
    campaign_id: string;
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    budget_cap?: string | null;
    banner?: FormData | any;
}

export interface AddCampaignItemPayload {
    campaign_id: string;
    wholesaler_receipt: string;
    wholesaler_price_discount?: string | null;
    wholesaler_quantity_discount?: string | null;
    suggested_quantity: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}

export interface UpdateCampaignItemPayload {
    item_id: string;
    wholesaler_price_discount?: string | null;
    wholesaler_quantity_discount?: string | null;
    suggested_quantity?: number;
    per_retailer_limit?: number | null;
    retail_price_hint?: string | null;
}

export interface AddCampaignAudiencePayload {
    campaign_id: string;
    retailer_ids: string[];
}

export interface RemoveCampaignAudiencePayload {
    campaign_id: string;
    retailer_ids: string[];
}

export interface CampaignActionPayload {
    campaign_id: string;
}

export interface ProjectCampaignPayload {
    campaign_id: string;
    markup_percentage?: number;
    quantities?: Record<string, number>;
}

export interface OptInCampaignPayload {
    campaign_id: string;
    quantities?: Record<string, number>;
}

/* =========================================================
 * Campaign response types
 * ======================================================= */

export interface CampaignProjectionRow {
    item_id: string;
    wholesaler_receipt: string;
    product_title: string;
    quantity: number;
    unit_price: string;
    bonus_units: number;
    total_cost: string;
    total_revenue: string;
    total_profit: string;
}

export interface OptInResult {
    indent_id: string;
    indent_number: string;
    items_created: number;
}

/* =========================================================
 * API contract
 * ======================================================= */

export interface WholesalersApiContract {
    // existing
    getWholesaleInventoryAction: (params?: { action: string }) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleStaffAction: (data?: Record<string, any>) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleReceiptsAction: (data: { action: "GetRetailEntities" } | Record<string, any>) => Promise<ApiResponse<RetailEntityItem[]>>;
    wholesaleRetailerOrdersAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;
    wholesaleRetailerOrdersStaffAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;
    priceDiscountCreateAction: (data: FormData) => Promise<ApiResponse<any>>;
    priceDiscountUpdateAction: (data: FormData, id: string) => Promise<ApiResponse<any>>;
    quantityDiscountCreateAction: (data: FormData) => Promise<ApiResponse<any>>;
    quantityDiscountUpdateAction: (data: FormData, id: string) => Promise<ApiResponse<any>>;

    // campaigns
    createCampaignAction: (data: CreateCampaignPayload) => Promise<ApiResponse<WholesalerCampaign>>;
    updateCampaignAction: (data: UpdateCampaignPayload) => Promise<ApiResponse<WholesalerCampaign>>;
    deleteCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<{ success: boolean }>>;
    publishCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaign>>;
    closeCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaign>>;
    getEntityCampaignsAction: (data?: { status?: CampaignStatus; search?: string }) => Promise<ApiResponse<WholesalerCampaign[]>>;
    getCampaignDetailsAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaign>>;

    // campaign items
    addCampaignItemAction: (data: AddCampaignItemPayload) => Promise<ApiResponse<WholesalerCampaignItem>>;
    updateCampaignItemAction: (data: UpdateCampaignItemPayload) => Promise<ApiResponse<WholesalerCampaignItem>>;
    deleteCampaignItemAction: (data: { item_id: string }) => Promise<ApiResponse<{ success: boolean }>>;
    getCampaignItemsAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaignItem[]>>;

    // campaign audience
    addCampaignAudienceAction: (data: AddCampaignAudiencePayload) => Promise<ApiResponse<WholesalerCampaignAudience[]>>;
    removeCampaignAudienceAction: (data: RemoveCampaignAudiencePayload) => Promise<ApiResponse<{ success: boolean }>>;
    getCampaignAudienceAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaignAudience[]>>;

    // retailer-facing
    getMyCampaignsAction: (data?: { status?: CampaignStatus }) => Promise<ApiResponse<WholesalerCampaign[]>>;
    projectCampaignAction: (data: ProjectCampaignPayload) => Promise<ApiResponse<CampaignProjectionRow[]>>;
    optInCampaignAction: (data: OptInCampaignPayload) => Promise<ApiResponse<OptInResult>>;
    optOutCampaignAction: (data: CampaignActionPayload) => Promise<ApiResponse<WholesalerCampaignAudience>>;
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

const wholesaleReceiptsAction = (data: { action: "GetRetailEntities" } | Record<string, any>): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/receipts", data);
};

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
 * Campaign actions — unified dispatcher
 * ======================================================= */

const campaignsAction = (data: {
    action: string;
    [key: string]: any;
}): Promise<ApiResponse<any>> => {
    return client.post("/wholesalers/campaigns", data);
};

/* ---- Campaign lifecycle ---- */

const createCampaignAction = (
    data: CreateCampaignPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "CreateCampaign", ...data });

const updateCampaignAction = (
    data: UpdateCampaignPayload
): Promise<ApiResponse<any>> =>
    campaignsAction({ action: "UpdateCampaign", ...data });

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

/* ---- Retailer-facing ---- */

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
 * Default export
 * ======================================================= */

const apiExportInstance: WholesalersApiContract = {
    // existing
    getWholesaleInventoryAction,
    priceDiscountUpdateAction,
    priceDiscountCreateAction,
    quantityDiscountUpdateAction,
    quantityDiscountCreateAction,
    wholesaleStaffAction,
    wholesaleReceiptsAction,
    wholesaleRetailerOrdersAction,
    wholesaleRetailerOrdersStaffAction,

    // campaigns
    createCampaignAction,
    updateCampaignAction,
    deleteCampaignAction,
    publishCampaignAction,
    closeCampaignAction,
    getEntityCampaignsAction,
    getCampaignDetailsAction,

    // campaign items
    addCampaignItemAction,
    updateCampaignItemAction,
    deleteCampaignItemAction,
    getCampaignItemsAction,

    // campaign audience
    addCampaignAudienceAction,
    removeCampaignAudienceAction,
    getCampaignAudienceAction,

    // retailer-facing
    getMyCampaignsAction,
    projectCampaignAction,
    optInCampaignAction,
    optOutCampaignAction,
};

export default apiExportInstance;