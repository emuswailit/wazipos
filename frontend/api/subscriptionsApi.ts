// api/subscriptionsApi.ts

import { ApiResponse } from "apisauce";
import client from "./client";

const LOG = (...args: any[]) => {
    if (__DEV__) {
        console.log("[subscriptionsApi]", ...args);
    }
};

const SUBSCRIPTIONS_ENDPOINT = "/subscriptions/entity/";

/* =========================================================
 * Payload Types
 * ======================================================= */

interface GetEntitySubscriptionPayload {
    action: "GetEntitySubscriptions";
    page?: number;
    page_size?: number;
}

interface InitiateSubscriptionPayload {
    action: "InitiateSubscriptionPayment";
    phone_number: string;
    /** Number of months to renew for (1–12). The backend charges monthly fee × months. */
    months: number;
}

interface GetEntitySubscriptionPaymentsPayload {
    action: "GetEntitySubscriptionPayments";
    page?: number;
    page_size?: number;
}

/* =========================================================
 * API Actions
 * ======================================================= */

/**
 * Fetches the paginated subscription history for the logged-in user's entity.
 */
const getEntitySubscriptionAction = (
    data: GetEntitySubscriptionPayload
): Promise<ApiResponse<any>> => {
    LOG("getEntitySubscriptionAction →", data);

    return client.post<any>(SUBSCRIPTIONS_ENDPOINT, data).then((res) => {
        LOG("getEntitySubscriptionAction ←", {
            ok: res.ok,
            status: res.status,
            count: res.data?.subscriptions?.count ?? res.data?.subscriptions?.length ?? 0,
        });
        return res;
    });
};

/**
 * Triggers an STK Push for subscription renewal and polls for status.
 */
const initiateSubscriptionPaymentAction = (
    data: InitiateSubscriptionPayload
): Promise<ApiResponse<any>> => {
    LOG("initiateSubscriptionPaymentAction →", {
        action: data.action,
        phone_number: data.phone_number,
        months: data.months,
    });

    return client.post<any>(SUBSCRIPTIONS_ENDPOINT, data).then((res) => {
        LOG("initiateSubscriptionPaymentAction ←", {
            ok: res.ok,
            status: res.status,
            message: res.data?.response_message,
            reference: res.data?.payment?.reference_number,
        });
        return res;
    });
};

/**
 * Fetches the paginated payment history for the logged-in user's entity.
 */
const getEntitySubscriptionPaymentsAction = (
    data: GetEntitySubscriptionPaymentsPayload
): Promise<ApiResponse<any>> => {
    LOG("getEntitySubscriptionPaymentsAction →", data);

    return client.post<any>(SUBSCRIPTIONS_ENDPOINT, data).then((res) => {
        LOG("getEntitySubscriptionPaymentsAction ←", {
            ok: res.ok,
            status: res.status,
            count: res.data?.payments?.count ?? res.data?.payments?.length ?? 0,
        });
        return res;
    });
};

/* =========================================================
 * Contract & Export
 * ======================================================= */

interface SubscriptionsApiContract {
    getEntitySubscriptionAction: (
        data: GetEntitySubscriptionPayload
    ) => Promise<ApiResponse<any>>;

    initiateSubscriptionPaymentAction: (
        data: InitiateSubscriptionPayload
    ) => Promise<ApiResponse<any>>;

    getEntitySubscriptionPaymentsAction: (
        data: GetEntitySubscriptionPaymentsPayload
    ) => Promise<ApiResponse<any>>;
}

const apiExportInstance: SubscriptionsApiContract = {
    getEntitySubscriptionAction,
    initiateSubscriptionPaymentAction,
    getEntitySubscriptionPaymentsAction,
};

export default apiExportInstance;