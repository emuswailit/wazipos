import { ApiResponse } from "apisauce";
import client from "./client";
import clientMultipart from "./multipartClient";

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

export interface WholesalersApiContract {
    getWholesaleInventoryAction: (params?: { action: string }) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleStaffAction: (data?: Record<string, any>) => Promise<ApiResponse<WholesalerReceiptItem[]>>;
    wholesaleReceiptsAction: (data: { action: "GetRetailEntities" } | Record<string, any>) => Promise<ApiResponse<RetailEntityItem[]>>;
    wholesaleRetailerOrdersAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;
    wholesaleRetailerOrdersStaffAction: (data: WholesaleOrderPayload) => Promise<ApiResponse<{ success: boolean }>>;
    priceDiscountCreateAction: (data: FormData) => Promise<ApiResponse<any>>;
    priceDiscountUpdateAction: (data: FormData, id: string) => Promise<ApiResponse<any>>;
    quantityDiscountCreateAction: (data: FormData) => Promise<ApiResponse<any>>;
    quantityDiscountUpdateAction: (data: FormData, id: string) => Promise<ApiResponse<any>>;
}

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

const apiExportInstance: WholesalersApiContract = {
    getWholesaleInventoryAction,
    priceDiscountUpdateAction,
    priceDiscountCreateAction,
    quantityDiscountUpdateAction,
    quantityDiscountCreateAction,
    wholesaleStaffAction,
    wholesaleReceiptsAction,
    wholesaleRetailerOrdersAction,
    wholesaleRetailerOrdersStaffAction
};

export default apiExportInstance;
