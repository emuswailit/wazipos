import { Platform } from 'react-native';

export function useOrderSubmission(submitOrderApi: any, isOnline: boolean) {
    const submitOrderToRemote = async (payload: { paymentDetails: any; selectedPaymentMethodId: string; deliveryMethod: string; activeMethodTitle: string; generatedDraftId: string; orderItemsPayload: any[] }) => {
        console.log("🌐 [NETWORK WORKER] Initiating outward Customer Order payload transmission thread...");

        if (!submitOrderApi || typeof submitOrderApi.request !== 'function') {
            console.warn("⚠️ [NETWORK WORKER] Sync rejected: uninitialized abstraction layer.");
            return { ok: false, offline: true };
        }
        if (!isOnline) {
            console.log("🗒️ [NETWORK WORKER] Device offline. Redirecting directly to local disk cache.");
            return { ok: false, offline: true };
        }

        try {
            const { paymentDetails, generatedDraftId, deliveryMethod, selectedPaymentMethodId, activeMethodTitle, orderItemsPayload } = payload;
            const isWeb = Platform.OS === 'web';

            const apiRequestPayload = {
                action: "CreateCustomerOrder",
                customer_order_details: {
                    city_name: "",
                    customer_name: paymentDetails.customerName || 'Walk-in Customer',
                    customer_phone: paymentDetails.customerPhone || '',
                    destination_latitude: 0, destination_longitude: 0,
                    draft_id: generatedDraftId, farness: "",
                    order_channel: isWeb ? "WEB" : "ANDROID",
                    order_origin: isWeb ? "WEB" : Platform.OS.toUpperCase(),
                    delivery_method: deliveryMethod, shipping_amount: "0.00",
                    payment_method: String(selectedPaymentMethodId || ''),
                    payment_account_number: activeMethodTitle === 'MOBILE MONEY' ? paymentDetails.mobileMoneyNumber : '',
                    credit_due_date: activeMethodTitle === 'CREDIT' ? paymentDetails.dueDate : null,
                    vendor_session_id: null,
                    order_items: orderItemsPayload
                }
            };

            console.log("📦 [NETWORK WORKER] OUTBOUND JSON BODY PAYLOAD:", JSON.stringify(apiRequestPayload, null, 2));
            const response = await submitOrderApi.request(apiRequestPayload);

            console.log("📡 [NETWORK WORKER] INBOUND HTTP METRIC RESPONSE:", JSON.stringify({
                ok: response?.ok,
                status: response?.status,
                hasServerErrors: !!response?.data?.errors,
                orderNumberSignature: response?.data?.data?.order_number || response?.data?.order_number || "NONE"
            }, null, 2));

            if (response?.ok && !response?.data?.errors) {
                console.log("✅ [NETWORK WORKER] Remote server reconciled transaction successfully.");
                return { ok: true, data: response.data };
            }

            if (response?.data?.errors) {
                // ✅ Fixed: Added missing JSON.stringify() wrapper to avoid parsing crash
                console.error("❌ [NETWORK WORKER] Remote endpoint rejected validation rows:", JSON.stringify(response.data.errors, null, 2));
                return { ok: false, errors: response.data.errors };
            }

            return { ok: false };
        } catch (error) {
            console.error("🚨 [NETWORK WORKER] Critical gateway transport failure:", error);
            return { ok: false, offline: true };
        }
    };

    return { submitOrderToRemote };
}
