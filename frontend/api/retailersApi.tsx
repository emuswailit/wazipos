// api/retailersApi.ts

import client from "./client";
import multipartClient from "./multipartClient";

const retailStaffAction = (data) => {
    return client.post("/retailers/orders/staff", data);
};

const retailAdminAction = (data) => {
    return client.post("/retailers/orders/admin", data);
};

const retailerOrdersAction = (data) => {
    return client.post("/retailers/orders", data);
};

const retailerReceiptsAction = (data) => {
    return client.post("/retailers/receipts/joint", data);
};

const retailerReceiptsAdminAction = (data) => {
    return client.post("/retailers/receipts/admin", data);
};

const retailCientAction = (data) => {
    return client.post("/retailers/orders/client", data);
};

const wholesaleRequisitionsAction = (data) => {
    return client.post("/wholesalers/receipts", data);
};

const wholesaleOrdersAction = (data) => {
    return client.post("/wholesalers/retailers/orders", data);
};

const userPrescriptionsAction = (data) => {
    return client.post("/retailers/prescriptions", data);
};

const createPrescriptionAction = (data) => {
    return multipartClient.post("/retailers/prescriptions/create", data);
};

const getProcurementPredictionsAction = (data) => {
    return client.get("/retailers/procurement/predictions", data);
};

const postCloseAndGenerateOrdersAction = (data: {
    indent_id: string;
    items: any[];
}) => {
    return client.post("/retailers/procurement/ordering", data);
};

const retailerIndentParamsUpdateAction = (data: {
    indent_id: string;
    [key: string]: any;
}) => {
    const { indent_id, ...body } = data;
    return client.patch(
        `/retailers/indents/${indent_id}/params/`,
        body
    );
};

const retailerIndentItemParamsUpdateAction = (data: {
    item_id: string;
    [key: string]: any;
}) => {
    const { item_id, ...body } = data;
    return client.patch(
        `/retailers/indent-items/${item_id}/params/`,
        body
    );
};

const outOfStocksAction = (data: {
    action:
    | "RetrieveOutOfStockItems"
    | "CreateOutOfStockItem"
    | "UpdateOutOfStockItem";
    product?: string;
    required_quantity?: number;
    item_id?: string;
    search?: string;
    is_ordered?: "true" | "false";
    customer_name?: string | null;
    customer_phone?: string | null;
}) => {
    return client.post("/retailers/orders/staff", data);
};

/* =====================================================================
 * Product requests — retailer side
 *
 * All actions POST to the same endpoint and dispatch by `action`.
 * Handler map (matches retailers/services/product_requests.py):
 *
 *   CreateRequest       — retailer creates a new request
 *   GetMyRequests       — retailer fetches their own requests
 *   GetRequestDetails   — either side fetches one request
 *   ConfirmOffers       — retailer confirms / declines incoming offers
 *   CancelRequest       — retailer cancels an entire request
 *   CancelRequestItem   — retailer cancels a single line
 *
 * Wholesaler-only actions (CreateOffer, WithdrawOffer, Respond,
 * GetWholesalerTaggedRequests) live in wholesalersApi.ts.
 * =================================================================== */

/**
 * Canonical request statuses on the server.
 * Source: WS payloads — `status` field on WholesalerProductRequest.
 */
export type ProductRequestStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "PARTIALLY_FULFILLED"
    | "FULFILLED"
    | "CANCELLED"
    | "EXPIRED";

export type ProductRequestUrgency =
    | "low"
    | "medium"
    | "high";

export interface ProductRequestActionEnvelope {
    action: string;
    [key: string]: any;
}

/**
 * Raw dispatcher call. Every helper below funnels through this, so
 * the endpoint URL is defined once. Matches the view
 * `productRequestsAPIView` in retailers/views.py.
 */
const productRequestsAction = (
    data: ProductRequestActionEnvelope
) => client.post("/retailers/product-requests", data);

/* -------------------- CreateRequest -------------------- */

export interface CreateProductRequestItemPayload {
    product_id: string;
    requested_quantity: number;
    urgency?: ProductRequestUrgency;
    note?: string;
    /**
     * Wholesalers this line is targeted at. At least one is
     * required by the client; empty arrays are rejected.
     */
    target_wholesaler_ids?: string[];
}

export interface CreateProductRequestPayload {
    /**
     * Offline-first idempotency key. Required by the backend —
     * the server rejects requests without one and enforces
     * uniqueness on the column.
     *
     * Format used across the app:
     *   `<user_id>:<entity_id>:<ms_timestamp>`
     */
    draft_id: string;

    items: CreateProductRequestItemPayload[];

    /** Request-level urgency. Defaults from the highest line. */
    urgency?: ProductRequestUrgency;

    /** Optional request-level note shown to every targeted
     *  wholesaler. */
    note?: string;
}

/**
 * POST { action: "CreateRequest", ...payload }
 *
 * Success envelope (payload_key = "request"):
 *   { response_code: 0, message, request: { request_id, request_number } }
 *
 * Note: the `action` field is injected by this helper. Callers pass
 * only the payload — do NOT include `action` in `data`.
 */
const createProductRequestAction = (
    data: CreateProductRequestPayload
) => productRequestsAction({ action: "CreateRequest", ...data });

/* -------------------- GetMyRequests -------------------- */

export interface GetMyProductRequestsPayload {
    status?: ProductRequestStatus;
    page?: number;
    page_size?: number;
}

/**
 * POST { action: "GetMyRequests", ...filters }
 *
 * Success envelope (payload_key = "requests"):
 *   { response_code: 0, message, requests: [ ... ] }
 */
const getMyProductRequestsAction = (
    data?: GetMyProductRequestsPayload
) => productRequestsAction({ action: "GetMyRequests", ...(data ?? {}) });

/* -------------------- GetRequestDetails -------------------- */

export interface GetProductRequestDetailsPayload {
    request_id: string;
}

/**
 * POST { action: "GetRequestDetails", request_id }
 *
 * Success envelope (payload_key = "request"):
 *   { response_code: 0, message, request: { ...full request... } }
 */
const getProductRequestDetailsAction = (
    data: GetProductRequestDetailsPayload
) => productRequestsAction({ action: "GetRequestDetails", ...data });

/* -------------------- ConfirmOffers -------------------- */

export interface ConfirmProductRequestOffersPayload {
    request_id: string;
    confirmations: Array<{
        offer_id: string;
        response_note?: string;
    }>;
    declinations: Array<{
        offer_id: string;
        reason?: string;
    }>;
    note?: string;
}

/**
 * POST { action: "ConfirmOffers", ...payload }
 *
 * Success envelope (payload_key = "request"):
 *   { response_code: 0, message,
 *     request: { request_id, confirmed_offer_count,
 *                declined_offer_count, indent_id,
 *                created_new_indent, items_added } }
 */
const confirmProductRequestOffersAction = (
    data: ConfirmProductRequestOffersPayload
) => productRequestsAction({ action: "ConfirmOffers", ...data });

/* -------------------- CancelRequest -------------------- */

export interface CancelProductRequestPayload {
    request_id: string;
    reason?: string;
}

/**
 * POST { action: "CancelRequest", request_id, reason? }
 *
 * Success envelope (payload_key = "request"):
 *   { response_code: 0, message, request: { request_id, status: "CANCELLED" } }
 */
const cancelProductRequestAction = (
    data: CancelProductRequestPayload
) => productRequestsAction({ action: "CancelRequest", ...data });

/* -------------------- CancelRequestItem -------------------- */

export interface CancelProductRequestItemPayload {
    request_id: string;
    item_id: string;
    reason?: string;
}

/**
 * POST { action: "CancelRequestItem", request_id, item_id, reason? }
 *
 * Success envelope (payload_key = "request"):
 *   { response_code: 0, message,
 *     request: { request_id, cancelled_item_id } }
 */
const cancelProductRequestItemAction = (
    data: CancelProductRequestItemPayload
) => productRequestsAction({ action: "CancelRequestItem", ...data });

export default {
    retailCientAction,
    retailerOrdersAction,
    retailStaffAction,
    userPrescriptionsAction,
    retailerReceiptsAction,
    retailerReceiptsAdminAction,
    createPrescriptionAction,
    retailAdminAction,
    wholesaleRequisitionsAction,
    wholesaleOrdersAction,
    getProcurementPredictionsAction,
    postCloseAndGenerateOrdersAction,
    retailerIndentParamsUpdateAction,
    retailerIndentItemParamsUpdateAction,
    outOfStockAction: outOfStocksAction,
    productRequestsAction,
    createProductRequestAction,
    getMyProductRequestsAction,
    getProductRequestDetailsAction,
    confirmProductRequestOffersAction,
    cancelProductRequestAction,
    cancelProductRequestItemAction,
};