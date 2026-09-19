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

// api/retailersApi.ts — append

const productRequestsAction = (data: {
    action: string;
    [key: string]: any;
}) => client.post("/retailers/product-requests", data);

const createProductRequestAction = (data: {
    items: Array<{
        product_id: string;
        requested_quantity: number;
        urgency?: "low" | "medium" | "high";
        note?: string;
    }>;
    urgency?: "low" | "medium" | "high";
    note?: string;
}) => productRequestsAction({ action: "CreateRequest", ...data });

const getMyProductRequestsAction = (data?: {
    status?: "OPEN" | "ACKNOWLEDGED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED" | "EXPIRED";
}) => productRequestsAction({ action: "GetMyRequests", ...(data ?? {}) });

const getProductRequestDetailsAction = (data: { request_id: string }) =>
    productRequestsAction({ action: "GetRequestDetails", ...data });

const confirmProductRequestOffersAction = (data: {
    request_id: string;
    confirmations: Array<{ offer_id: string; response_note?: string }>;
    declinations: Array<{ offer_id: string; reason?: string }>;
    note?: string;
}) => productRequestsAction({ action: "ConfirmOffers", ...data });

const cancelProductRequestAction = (data: { request_id: string }) =>
    productRequestsAction({ action: "CancelRequest", ...data });

const cancelProductRequestItemAction = (data: { item_id: string }) =>
    productRequestsAction({ action: "CancelRequestItem", ...data });

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
    createProductRequestAction,
    getMyProductRequestsAction,
    getProductRequestDetailsAction,
    confirmProductRequestOffersAction,
    cancelProductRequestAction,
    cancelProductRequestItemAction,
};