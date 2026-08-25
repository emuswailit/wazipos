import { ApiResponse } from "apisauce";
import client from "./client";
import clientWithCache from "./clientWithCache";

export interface PaymentMethodItem {
    id: string;
    title: string;
    description?: string;
}

export interface PaymentAccountItem {
    id: string;
    account_name: string;
    account_number: string;
    provider_name: string;
}

export interface PaymentsApiContract {
    getPaymentMethodsAction: (data?: Record<string, any>) => Promise<ApiResponse<PaymentMethodItem[]>>;
    getPaymentAccountsAction: (data?: Record<string, any>) => Promise<ApiResponse<PaymentAccountItem[]>>;
}

const getPaymentMethodsAction = (data?: Record<string, any>): Promise<ApiResponse<any>> => {
    return clientWithCache.post("/payments/methods/filter", data);
};

const getPaymentAccountsAction = (data?: Record<string, any>): Promise<ApiResponse<any>> => {
    return client.post("/payments/accounts", data);
};

const apiExportInstance: PaymentsApiContract = {
    getPaymentMethodsAction,
    getPaymentAccountsAction
};

export default apiExportInstance;
