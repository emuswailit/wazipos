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

const postCloseAndGenerateOrdersAction = (data: { indent_id: string; items: any[] }) => {
    return client.post("/retailers/procurement/ordering", data);
};

/**
 * 🚀 GENERIC PIPELINE CONTROLLER: outOfStocksAction
 * Completely dynamic to pass clean parameters for Retrieve, Create, and Update 
 * tasks straight to the /retailers/orders/staff backend view path routing.
 */
const outOfStocksAction = (data: {
    action: "RetrieveOutOfStockItems" | "CreateOutOfStockItem" | "UpdateOutOfStockItem";
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
    outOfStockAction: outOfStocksAction // ✅ Updated property alias signature key mapping
};
