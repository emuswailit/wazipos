// api/utilsApi.ts
//
// Utility actions on /authentication/utils (backend: authentication.views.utilsAPIView).

import { ApiResponse } from "apisauce";
import client from "./client";

const UTILS_ENDPOINT = "/authentication/utils";

interface SendOrderReminderResult {
    customer_order: string;
    phone_number: string;
    message: string;
    sent_at: string;
    next_reminder_at: string;
    balance_due: number;
    days_overdue: number;
}

interface UtilsResponse<T> {
    response_code: number;
    response_message: string;
    errors?: string[];
    sms?: T;
}

/**
 * Send an SMS payment reminder for an unpaid, overdue CREDIT customer order.
 * The server writes the message; at most one reminder per order every 12 hours.
 */
const sendCustomerOrderReminder = (
    customerOrderId: string
): Promise<ApiResponse<UtilsResponse<SendOrderReminderResult>>> =>
    client.post<UtilsResponse<SendOrderReminderResult>>(
        UTILS_ENDPOINT,
        { action: "SendSMS", purpose: "CUSTOMER_ORDER_REMINDER", customer_order: customerOrderId },
        // The server authenticates with the SMS provider and then sends; allow for both.
        { timeout: 45000 }
    );

const utilsApi = { sendCustomerOrderReminder };
export default utilsApi;
