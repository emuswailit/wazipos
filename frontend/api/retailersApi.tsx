// api/retailersApi.ts

import { ApiResponse } from "apisauce";
import client from "./client";
import clientMultipart from "./multipartClient";

/* =========================================================
 * Debug logging
 * ======================================================= */

const LOG = (...args: any[]) => {
    if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[retailersApi]", ...args);
    }
};

/* =========================================================
 * Common types
 * ======================================================= */

interface RetailerReceiptsDispatch {
    action: string;
    [key: string]: any;
}

/* =========================================================
 * Staff Orders dispatcher — /retailers/orders/staff
 * ======================================================= */

const STAFF_ORDERS_ENDPOINT = "/retailers/orders/staff";

const retailStaffAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => {
    LOG("retailStaffAction →", { action: data.action, payload: data });
    return client.post(STAFF_ORDERS_ENDPOINT, data).then((res) => {
        LOG("retailStaffAction ←", {
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

/* =========================================================
 * Retail Orders dispatcher — /retailers/orders
 * ======================================================= */

const RETAIL_ORDERS_ENDPOINT = "/retailers/orders";

const retailOrdersAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => {
    LOG("retailOrdersAction →", { action: data.action, payload: data });
    return client.post(RETAIL_ORDERS_ENDPOINT, data).then((res) => {
        LOG("retailOrdersAction ←", {
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

/* =========================================================
 * Client Orders dispatcher — /retailers/orders/client
 * ======================================================= */

const CLIENT_ORDERS_ENDPOINT = "/retailers/orders/client";

const clientOrdersAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => {
    LOG("clientOrdersAction →", { action: data.action, payload: data });
    return client.post(CLIENT_ORDERS_ENDPOINT, data).then((res) => {
        LOG("clientOrdersAction ←", {
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

/* =========================================================
 * Client Orders — typed wrappers
 * ======================================================= */

interface CreateCustomerOrderPayload {
    customer_order_details: {
        order_origin: "CUSTOMER" | "STAFF";
        payment_method: string;
        delivery_method: "DELIVERY" | "PICKUP" | "COURIER";
        shipping_cost?: number;
        entity: string;
        draft_id?: string;
        origin_latitude?: number;
        origin_longitude?: number;
        destination_latitude?: number;
        destination_longitude?: number;
        farness?: number;
        recipient_name?: string;
        recipient_phone?: string;
        order_items: Array<{
            retailer_receipt: string;
            purchased_quantity: number;
            final_unit_selling_price: number;
            item_price_discount?: number;
        }>;
    };
    [key: string]: any;
}

const createCustomerOrderByCustomerAction = (
    data: CreateCustomerOrderPayload,
): Promise<ApiResponse<any>> =>
    clientOrdersAction({ action: "CreateCustomerOrderByCustomer", ...data });

const getRetailerReceiptsForEntityAction = (data: {
    entity: string;
    [key: string]: any;
}): Promise<ApiResponse<any>> =>
    clientOrdersAction({ action: "GetRetailerReceiptsForEntity", ...data });

const getClientOwnOrdersAction = (data?: {
    page?: number;
    page_size?: number;
    [key: string]: any;
}): Promise<ApiResponse<any>> =>
    clientOrdersAction({ action: "RetrieveOwnOrders", ...(data ?? {}) });

const getClientDashboardAction = (data?: {
    entity_id?: string;
    [key: string]: any;
}): Promise<ApiResponse<any>> =>
    clientOrdersAction({ action: "GetClientDashboard", ...(data ?? {}) });

/* =========================================================
 * Prescriptions — dispatcher
 * ======================================================= */

const RETAILER_PRESCRIPTIONS_REMOTE_ENDPOINT = "/retailers/prescriptions/remote";

const retailerPrescriptionsAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => {
    LOG("retailerPrescriptionsAction →", { action: data.action, payload: data });
    return client.post(RETAILER_PRESCRIPTIONS_REMOTE_ENDPOINT, data).then((res) => {
        LOG("retailerPrescriptionsAction ←", {
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

interface VerifyPrescriptionItemPayload {
    prescription_item: string;
}

const verifyPrescriptionItemAction = (
    data: VerifyPrescriptionItemPayload,
): Promise<ApiResponse<any>> =>
    retailerPrescriptionsAction({ action: "VerifyPrescriptionItem", ...data });

/* =========================================================
 * Retailer receipts dispatcher — /retailer/receipts/joint
 * ======================================================= */

const RETAILER_RECEIPTS_ENDPOINT = "/retailers/receipts/joint";

const retailerReceiptsAction = (
    data: RetailerReceiptsDispatch,
): Promise<ApiResponse<any>> => {
    LOG("retailerReceiptsAction →", { action: data.action, payload: data });
    return client.post(RETAILER_RECEIPTS_ENDPOINT, data).then((res) => {
        LOG("retailerReceiptsAction ←", {
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

/* =========================================================
 * Retailer receipts — typed wrappers
 * ======================================================= */

interface CreateRetailerReceiptPayload {
    product: string;
    received_unit_quantity: number;
    unit_buying_price?: string;
    unit_selling_price?: string;
    batch?: string;
    supplier_invoice?: string;
    manufacture_date?: string;
    expiry_date?: string;
    wholesaler_receipt?: string;
    received_from?: string;
    in_placement?: boolean;
    [key: string]: any;
}

const createRetailerReceiptAction = (
    data: CreateRetailerReceiptPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "CreateRetailerReceipt", ...data });

const getRetailerReceiptsAction = (
    data?: { page?: number; page_size?: number;[key: string]: any },
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetRetailerReceipts", ...(data ?? {}) });

const getProductMovementAction = (
    data?: { product?: string;[key: string]: any },
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetProductMovement", ...(data ?? {}) });

const getRetailerReceiptsByCategoryAction = (
    data?: { category?: string;[key: string]: any },
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "RetailerReceiptsByCategory",
        ...(data ?? {}),
    });

interface UpdateRetailerReceiptPayload {
    retailer_receipt: string;
    [key: string]: any;
}

const updateRetailerReceiptAction = (
    data: UpdateRetailerReceiptPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "UpdateRetailerReceipt", ...data });

interface GetRetailersByCountyAndCategoriesPayload {
    county: string;
    categories: string[];
}

const getRetailersByCountyAndCategoriesAction = (
    data: GetRetailersByCountyAndCategoriesPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetRetailersByCountyAndCategories", ...data });

const getCourierEntitiesAction = (
    data?: { [key: string]: any }
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetCourierEntities", ...(data ?? {}) });

const getDeliveryEntitiesAction = (
    data?: { [key: string]: any }
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetDeliveryEntities", ...(data ?? {}) });

interface GetCollectionPointsPayload {
    county?: string;
    courier_id: string;
}

const getCollectionPointsAction = (
    data: GetCollectionPointsPayload
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetCollectionPoints", ...data });

interface CalculateShippingRatePayload {
    origin_latitude: number;
    origin_longitude: number;
    destination_latitude: number;
    destination_longitude: number;
    delivery_method: string;
    order_total?: number;
    total_weight_kg?: number;
}

const calculateShippingRateAction = (
    data: CalculateShippingRatePayload
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "CalculateShippingRate", ...data });

/* =========================================================
 * Wholesaler returns — retailer-initiated
 * ======================================================= */

const initiateWholesalerReturnAction = (data: {
    retailer_receipt: string;
    quantity: number;
    reason: string;
    justification: string;
    return_type?: string;
    unit_price_refunded?: string;
    restocking_fee_percent?: string;
}): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "InitiateWholesalerReturn", ...data });

const cancelWholesalerReturnAction = (data: {
    return_id: string;
    reason?: string;
}): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "CancelWholesalerReturn", ...data });

const getPurchasesReturnsAction = (data?: {
    page?: number;
    page_size?: number;
    status?: string;
    [key: string]: any;
}): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetPurchasesReturns", ...(data ?? {}) });

/* =========================================================
 * Sales returns
 * ======================================================= */

interface CreateSalesReturnPayload {
    retailer_receipt: string;
    customer_order?: string | null;
    quantity: number;
    justification: string;
    draft_id?: string;
}

interface UpdateSalesReturnPayload {
    sales_return: string;
    retailer_receipt?: string;
    customer_order?: string | null;
    quantity?: number;
    justification?: string;
}

interface DeleteSalesReturnPayload {
    sales_return: string;
}

interface GetSalesReturnsPayload {
    page?: number;
    page_size?: number;
    [key: string]: any;
}

const createSalesReturnAction = (
    data: CreateSalesReturnPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "CreateSalesReturn", ...data });

const getSalesReturnsAction = (
    data?: GetSalesReturnsPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetSalesReturns", ...(data ?? {}) });

const updateSalesReturnAction = (
    data: UpdateSalesReturnPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "UpdateSalesReturn", ...data });

const deleteSalesReturnAction = (
    data: DeleteSalesReturnPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "DeleteSalesReturn", ...data });

/* =========================================================
 * Stock adjustments
 * ======================================================= */

type StockAdjustmentReturnIntentValue =
    | "NONE"
    | "WHOLESALER_RETURN"
    | "CUSTOMER_RETURN"
    | "EXPIRY_WRITE_OFF"
    | "DAMAGE_WRITE_OFF"
    | "INTERNAL_CORRECTION";

interface CreateStockAdjustmentPayload {
    retailer_receipt: string;
    quantity: number;
    direction: "INCREMENT" | "DECREMENT";
    justification: string;
    return_intent?: StockAdjustmentReturnIntentValue;
    draft_id?: string;
}

/** Backend UpdateStockAdjustment: reverses the old stock effect and applies the new one. */
interface UpdateStockAdjustmentPayload {
    stock_adjustment: string;
    retailer_receipt?: string;
    quantity?: number;
    direction?: "INCREMENT" | "DECREMENT";
    justification?: string;
    return_intent?: StockAdjustmentReturnIntentValue;
}

/** Backend DeleteStockAdjustment: reverses the stock effect, then deletes. */
interface DeleteStockAdjustmentPayload {
    stock_adjustment: string;
}

const createStockAdjustmentAction = (
    data: CreateStockAdjustmentPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "CreateStockAdjustment", ...data });

const getStockAdjustmentsAction = (data?: {
    page?: number;
    page_size?: number;
    [key: string]: any;
}): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "GetStockAdjustments", ...(data ?? {}) });

const updateStockAdjustmentAction = (
    data: UpdateStockAdjustmentPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "UpdateStockAdjustment", ...data });

const deleteStockAdjustmentAction = (
    data: DeleteStockAdjustmentPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({ action: "DeleteStockAdjustment", ...data });

/* =========================================================
 * Retailer orders (requisitions), receipts admin, indent params
 * (restored: these were dropped from this file but are still used)
 * ======================================================= */

/** POST /retailers/orders — retailer orders (requisitions) action endpoint. */
const retailerOrdersAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => client.post("/retailers/orders", data);

/** POST /retailers/receipts/admin — admin-level retailer receipts actions. */
const retailerReceiptsAdminAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => client.post("/retailers/receipts/admin", data);

/** PATCH /retailers/indents/<indent_id>/params/ — update an indent's settings. */
const retailerIndentParamsUpdateAction = (data: {
    indent_id: string;
    [key: string]: any;
}): Promise<ApiResponse<any>> => {
    const { indent_id, ...body } = data;
    return client.patch(`/retailers/indents/${indent_id}/params/`, body);
};

/* =========================================================
 * Product requests (backend: productRequestsAPIView)
 *
 *   CreateRequest / GetMyRequests / GetRequestDetails /
 *   ConfirmOffers / CancelRequest / CancelRequestItem
 *
 * Wholesaler-only actions live in wholesalersApi.ts.
 * ======================================================= */

type ProductRequestStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "PARTIALLY_FULFILLED"
    | "FULFILLED"
    | "CANCELLED"
    | "EXPIRED";

export type ProductRequestUrgency = "low" | "medium" | "high";

interface ProductRequestActionEnvelope {
    action: string;
    [key: string]: any;
}

const productRequestsAction = (
    data: ProductRequestActionEnvelope,
): Promise<ApiResponse<any>> => client.post("/retailers/product-requests", data);

export interface CreateProductRequestItemPayload {
    product_id: string;
    requested_quantity: number;
    urgency?: ProductRequestUrgency;
    note?: string;
    /** Wholesalers this line is targeted at (at least one). */
    target_wholesaler_ids?: string[];
}

export interface CreateProductRequestPayload {
    /** Offline-first idempotency key, `<user_id>:<entity_id>:<ms_timestamp>`. Required. */
    draft_id: string;
    items: CreateProductRequestItemPayload[];
    urgency?: ProductRequestUrgency;
    note?: string;
}

/** Success: { response_code: 0, request: { request_id, request_number } } */
const createProductRequestAction = (
    data: CreateProductRequestPayload,
): Promise<ApiResponse<any>> => productRequestsAction({ action: "CreateRequest", ...data });

interface GetMyProductRequestsPayload {
    status?: ProductRequestStatus;
    page?: number;
    page_size?: number;
}

const getMyProductRequestsAction = (
    data?: GetMyProductRequestsPayload,
): Promise<ApiResponse<any>> => productRequestsAction({ action: "GetMyRequests", ...(data ?? {}) });

const getProductRequestDetailsAction = (data: {
    request_id: string;
}): Promise<ApiResponse<any>> => productRequestsAction({ action: "GetRequestDetails", ...data });

interface ConfirmProductRequestOffersPayload {
    request_id: string;
    confirmations: Array<{ offer_id: string; response_note?: string }>;
    declinations: Array<{ offer_id: string; reason?: string }>;
    note?: string;
}

/** Success: { response_code: 0, request: { request_id, confirmed_offer_count, ..., indent_id } } */
const confirmProductRequestOffersAction = (
    data: ConfirmProductRequestOffersPayload,
): Promise<ApiResponse<any>> => productRequestsAction({ action: "ConfirmOffers", ...data });

const cancelProductRequestAction = (data: {
    request_id: string;
    reason?: string;
}): Promise<ApiResponse<any>> => productRequestsAction({ action: "CancelRequest", ...data });

const cancelProductRequestItemAction = (data: {
    request_id: string;
    item_id: string;
    reason?: string;
}): Promise<ApiResponse<any>> => productRequestsAction({ action: "CancelRequestItem", ...data });

/* =========================================================
 * Reports — daily sales
 * ======================================================= */

interface GetDailySalesReportPayload {
    date?: string;
    from?: string;
    to?: string;
    entity_id?: string;
    include_cancelled?: boolean;
}

const getDailySalesReportAction = (
    data?: GetDailySalesReportPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "GetDailySalesReport",
        ...(data ?? {}),
    });

/* =========================================================
 * Reports — profit & loss
 * ======================================================= */

interface GetProfitAndLossPayload {
    from?: string;
    to?: string;
    year?: number;
    month?: number;
    entity_id?: string;
}

const getProfitAndLossAction = (
    data?: GetProfitAndLossPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "GetProfitAndLoss",
        ...(data ?? {}),
    });

/* =========================================================
 * Reports — expiries
 * ======================================================= */

type ExpiryBucketKey =
    | "EXPIRED"
    | "0_7"
    | "8_30"
    | "31_60"
    | "61_90"
    | "91_PLUS";

interface GetExpiryReportPayload {
    days?: number;
    bucket?: ExpiryBucketKey;
    product?: string;
    wholesaler?: string;
    search?: string;
    entity_id?: string;
}

const getExpiryReportAction = (
    data?: GetExpiryReportPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "GetExpiryReport",
        ...(data ?? {}),
    });

/* =========================================================
 * Reports — stock
 * ======================================================= */

interface GetStockReportPayload {
    dead_days?: number;
    category?: string;
    sub_category?: string;
    search?: string;
    dead_only?: boolean;
    expiring_within?: number;
    entity_id?: string;
}

const getStockReportAction = (
    data?: GetStockReportPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "GetStockReport",
        ...(data ?? {}),
    });

/* =========================================================
 * Reports — low stock / reorder
 * ======================================================= */

interface GetLowStockReportPayload {
    lookback_days?: number;
    cover_days?: number;
    category?: string;
    wholesaler?: string;
    search?: string;
    only_danger?: boolean;
    include_zero_velocity?: boolean;
    include_offers?: boolean;
    offers_per_product?: number;
    entity_id?: string;
}

const getLowStockReportAction = (
    data?: GetLowStockReportPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "GetLowStockReport",
        ...(data ?? {}),
    });

/* =========================================================
 * Reports — product movement ledger
 * ======================================================= */

export type ProductMovementType =
    | "RECEIPT"
    | "SALE"
    | "ADJUSTMENT"
    | "CORRECTION"
    | "EXPIRY_WRITE_OFF"
    | "DAMAGE_WRITE_OFF"
    | "WHOLESALER_RETURN"
    | "CUSTOMER_RETURN";

interface GetProductMovementReportPayload {
    product: string;
    from?: string;
    to?: string;
    retailer_receipt?: string;
    movement_types?: ProductMovementType[];
    entity_id?: string;
}

const getProductMovementReportAction = (
    data: GetProductMovementReportPayload,
): Promise<ApiResponse<any>> =>
    retailerReceiptsAction({
        action: "GetProductMovementReport",
        ...data,
    });

/* =========================================================
 * Raw uploads (multipart) — retailer side
 * ======================================================= */

const retailerReceiptCreateMultipartAction = (
    data: FormData,
): Promise<ApiResponse<any>> =>
    clientMultipart.post("/retailers/receipts/create", data);

const retailerReceiptUpdateMultipartAction = (
    data: FormData,
    id: string,
): Promise<ApiResponse<any>> =>
    clientMultipart.patch(`/retailers/receipts/${id}/update`, data);

const createPrescriptionMultipartAction = (
    data: FormData,
): Promise<ApiResponse<any>> =>
    clientMultipart.post("/retailers/prescriptions/create", data);

/* =========================================================
 * API contract
 * ======================================================= */

interface RetailersApiContract {
    /* ---- Staff Orders ---- */
    retailStaffAction: (
        data: { action: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;

    /** Staff SearchCustomerOrders: paginated { results } of the entity's customer orders. */
    searchCustomerOrdersAction: (data: {
        search_param?: string;
        receipt_id?: string;
        page?: number;
        page_size?: number;
    }) => Promise<ApiResponse<any>>;

    /** Customer orders admin endpoint (/retailers/orders/admin), e.g. RetrieveEntityOrders. */
    customerOrdersAdminAction: (
        data: { action: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;

    /** UpdateCustomerOrder with only due_date (super admins only). */
    updateCustomerOrderDueDate: (
        customerOrderId: string,
        dueDate: string,
    ) => Promise<ApiResponse<any>>;

    /* ---- Retail Orders ---- */
    retailOrdersAction: (
        data: { action: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;

    /* ---- Client Orders ---- */
    clientOrdersAction: (
        data: { action: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;
    createCustomerOrderByCustomerAction: (
        data: CreateCustomerOrderPayload,
    ) => Promise<ApiResponse<any>>;
    getRetailerReceiptsForEntityAction: (
        data: { entity: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;
    getClientOwnOrdersAction: (
        data?: { page?: number; page_size?: number;[key: string]: any },
    ) => Promise<ApiResponse<any>>;
    getClientDashboardAction: (data?: {
        entity_id?: string;
        [key: string]: any;
    }) => Promise<ApiResponse<any>>;

    /* ---- Retailer receipts ---- */
    retailerReceiptsAction: (
        data: RetailerReceiptsDispatch,
    ) => Promise<ApiResponse<any>>;
    createRetailerReceiptAction: (
        data: CreateRetailerReceiptPayload,
    ) => Promise<ApiResponse<any>>;
    getRetailerReceiptsAction: (data?: {
        page?: number;
        page_size?: number;
    }) => Promise<ApiResponse<any>>;
    getProductMovementAction: (data?: {
        product?: string;
    }) => Promise<ApiResponse<any>>;
    getRetailerReceiptsByCategoryAction: (data?: {
        category?: string;
    }) => Promise<ApiResponse<any>>;
    updateRetailerReceiptAction: (
        data: UpdateRetailerReceiptPayload,
    ) => Promise<ApiResponse<any>>;
    getRetailersByCountyAndCategoriesAction: (
        data: GetRetailersByCountyAndCategoriesPayload,
    ) => Promise<ApiResponse<any>>;
    getCourierEntitiesAction: (
        data?: { [key: string]: any }
    ) => Promise<ApiResponse<any>>;
    getDeliveryEntitiesAction: (
        data?: { [key: string]: any }
    ) => Promise<ApiResponse<any>>;
    getCollectionPointsAction: (
        data: GetCollectionPointsPayload
    ) => Promise<ApiResponse<any>>;
    calculateShippingRateAction: (
        data: CalculateShippingRatePayload
    ) => Promise<ApiResponse<any>>;

    /* ---- Prescriptions ---- */
    verifyPrescriptionItemAction: (
        data: VerifyPrescriptionItemPayload,
    ) => Promise<ApiResponse<any>>;

    /* ---- Wholesaler returns (retailer-initiated) ---- */
    initiateWholesalerReturnAction: (data: {
        retailer_receipt: string;
        quantity: number;
        reason: string;
        justification: string;
        return_type?: string;
        unit_price_refunded?: string;
        restocking_fee_percent?: string;
    }) => Promise<ApiResponse<any>>;
    cancelWholesalerReturnAction: (data: {
        return_id: string;
        reason?: string;
    }) => Promise<ApiResponse<any>>;
    getPurchasesReturnsAction: (data?: {
        page?: number;
        page_size?: number;
    }) => Promise<ApiResponse<any>>;

    /* ---- Sales returns ---- */
    createSalesReturnAction: (
        data: CreateSalesReturnPayload,
    ) => Promise<ApiResponse<any>>;
    getSalesReturnsAction: (
        data?: GetSalesReturnsPayload,
    ) => Promise<ApiResponse<any>>;
    updateSalesReturnAction: (
        data: UpdateSalesReturnPayload,
    ) => Promise<ApiResponse<any>>;
    deleteSalesReturnAction: (
        data: DeleteSalesReturnPayload,
    ) => Promise<ApiResponse<any>>;

    /* ---- Stock adjustments ---- */
    createStockAdjustmentAction: (
        data: CreateStockAdjustmentPayload,
    ) => Promise<ApiResponse<any>>;
    getStockAdjustmentsAction: (data?: {
        page?: number;
        page_size?: number;
    }) => Promise<ApiResponse<any>>;
    updateStockAdjustmentAction: (
        data: UpdateStockAdjustmentPayload,
    ) => Promise<ApiResponse<any>>;
    deleteStockAdjustmentAction: (
        data: DeleteStockAdjustmentPayload,
    ) => Promise<ApiResponse<any>>;

    /* ---- Retailer orders / receipts admin / indent params ---- */
    retailerOrdersAction: (
        data: { action: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;
    retailerReceiptsAdminAction: (
        data: { action: string;[key: string]: any },
    ) => Promise<ApiResponse<any>>;
    retailerIndentParamsUpdateAction: (data: {
        indent_id: string;
        [key: string]: any;
    }) => Promise<ApiResponse<any>>;

    /* ---- Product requests ---- */
    productRequestsAction: (
        data: ProductRequestActionEnvelope,
    ) => Promise<ApiResponse<any>>;
    createProductRequestAction: (
        data: CreateProductRequestPayload,
    ) => Promise<ApiResponse<any>>;
    getMyProductRequestsAction: (
        data?: GetMyProductRequestsPayload,
    ) => Promise<ApiResponse<any>>;
    getProductRequestDetailsAction: (data: {
        request_id: string;
    }) => Promise<ApiResponse<any>>;
    confirmProductRequestOffersAction: (
        data: ConfirmProductRequestOffersPayload,
    ) => Promise<ApiResponse<any>>;
    cancelProductRequestAction: (data: {
        request_id: string;
        reason?: string;
    }) => Promise<ApiResponse<any>>;
    cancelProductRequestItemAction: (data: {
        request_id: string;
        item_id: string;
        reason?: string;
    }) => Promise<ApiResponse<any>>;

    /* ---- Reports ---- */
    getDailySalesReportAction: (
        data?: GetDailySalesReportPayload,
    ) => Promise<ApiResponse<any>>;
    getProfitAndLossAction: (
        data?: GetProfitAndLossPayload,
    ) => Promise<ApiResponse<any>>;
    getExpiryReportAction: (
        data?: GetExpiryReportPayload,
    ) => Promise<ApiResponse<any>>;
    getStockReportAction: (
        data?: GetStockReportPayload,
    ) => Promise<ApiResponse<any>>;
    getLowStockReportAction: (
        data?: GetLowStockReportPayload,
    ) => Promise<ApiResponse<any>>;
    getProductMovementReportAction: (
        data: GetProductMovementReportPayload,
    ) => Promise<ApiResponse<any>>;

    /* ---- Multipart ---- */
    retailerReceiptCreateMultipartAction: (
        data: FormData,
    ) => Promise<ApiResponse<any>>;
    retailerReceiptUpdateMultipartAction: (
        data: FormData,
        id: string,
    ) => Promise<ApiResponse<any>>;
    createPrescriptionMultipartAction: (
        data: FormData,
    ) => Promise<ApiResponse<any>>;
}

/* =========================================================
 * Customer orders admin (backend: customerOrdersAdminAPIView)
 * ======================================================= */

const CUSTOMER_ORDERS_ADMIN_ENDPOINT = "/retailers/orders/admin";

/**
 * Search the entity's customer orders (order number, customer name/phone, references),
 * optionally only those containing a given retailer receipt. Backend: staff
 * SearchCustomerOrders -> retailer_utils.search_customer_orders.
 */
const searchCustomerOrdersAction = (data: {
    search_param?: string;
    receipt_id?: string;
    page?: number;
    page_size?: number;
}): Promise<ApiResponse<any>> =>
    retailStaffAction({ action: "SearchCustomerOrders", ...data });

/** Actions: RetrieveEntityOrders, RetrieveEmployeeOrders, RetrieveCustomerOrderPayments, ... */
const customerOrdersAdminAction = (
    data: { action: string;[key: string]: any },
): Promise<ApiResponse<any>> => client.post(CUSTOMER_ORDERS_ADMIN_ENDPOINT, data);

/**
 * Change the due date (YYYY-MM-DD) of an unpaid CREDIT customer order via the staff
 * UpdateCustomerOrder action. Super admins only (enforced by the backend).
 */
const updateCustomerOrderDueDate = (
    customerOrderId: string,
    dueDate: string,
): Promise<ApiResponse<any>> =>
    retailStaffAction({
        action: "UpdateCustomerOrder",
        customer_order_details: { customer_order: customerOrderId, due_date: dueDate },
    });

/* =========================================================
 * Default export
 * ======================================================= */

const apiExportInstance: RetailersApiContract = {
    /* ---- Staff Orders ---- */
    retailStaffAction,
    searchCustomerOrdersAction,
    customerOrdersAdminAction,
    updateCustomerOrderDueDate,

    /* ---- Retail Orders ---- */
    retailOrdersAction,

    /* ---- Client Orders ---- */
    clientOrdersAction,
    createCustomerOrderByCustomerAction,
    getRetailerReceiptsForEntityAction,
    getClientOwnOrdersAction,
    getClientDashboardAction,

    /* ---- Retailer receipts ---- */
    retailerReceiptsAction,
    createRetailerReceiptAction,
    getRetailerReceiptsAction,
    getProductMovementAction,
    getRetailerReceiptsByCategoryAction,
    updateRetailerReceiptAction,
    getRetailersByCountyAndCategoriesAction,
    getCourierEntitiesAction,
    getDeliveryEntitiesAction,
    getCollectionPointsAction,
    calculateShippingRateAction,

    /* ---- Prescriptions ---- */
    verifyPrescriptionItemAction,

    /* ---- Wholesaler returns ---- */
    initiateWholesalerReturnAction,
    cancelWholesalerReturnAction,
    getPurchasesReturnsAction,

    /* ---- Sales returns ---- */
    createSalesReturnAction,
    getSalesReturnsAction,
    updateSalesReturnAction,
    deleteSalesReturnAction,

    /* ---- Stock adjustments ---- */
    createStockAdjustmentAction,
    getStockAdjustmentsAction,
    updateStockAdjustmentAction,
    deleteStockAdjustmentAction,

    /* ---- Retailer orders / receipts admin / indent params ---- */
    retailerOrdersAction,
    retailerReceiptsAdminAction,
    retailerIndentParamsUpdateAction,

    /* ---- Product requests ---- */
    productRequestsAction,
    createProductRequestAction,
    getMyProductRequestsAction,
    getProductRequestDetailsAction,
    confirmProductRequestOffersAction,
    cancelProductRequestAction,
    cancelProductRequestItemAction,

    /* ---- Reports ---- */
    getDailySalesReportAction,
    getProfitAndLossAction,
    getExpiryReportAction,
    getStockReportAction,
    getLowStockReportAction,
    getProductMovementReportAction,

    /* ---- Multipart ---- */
    retailerReceiptCreateMultipartAction,
    retailerReceiptUpdateMultipartAction,
    createPrescriptionMultipartAction,
};

export default apiExportInstance;
