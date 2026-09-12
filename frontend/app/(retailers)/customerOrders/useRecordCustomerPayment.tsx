import retailersApi from '@/api/retailersApi'; // ✅ Imports your genuine API endpoints
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import useApi from '@/hooks/useApi'; // ✅ Imports your authentic API hook
import * as Network from 'expo-network';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { storageService } from './storageService';

export function useRecordCustomerPayment(orderId: string, onSuccessCallback: () => void) {
    const { paymentMethodsList, isPaymentSyncing, triggerPaymentMethodsFetch } = usePaymentMethodsSync();

    // ✅ GENUINE WIRE API CALL DISPATCHER: Connected straight to your backend network actions
    const submitPaymentApi = useApi(retailersApi.retailerOrdersAction);

    const [selectedMethod, setSelectedMethod] = useState<any>(null);
    const [mobileNumber, setMpesaNumber] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isPollingOpen, setIsPollingOpen] = useState(false);
    const [pollingError, setPollingError] = useState<string | null>(null);

    const isWeb = Platform.OS === 'web';

    useEffect(() => {
        if (!paymentMethodsList || paymentMethodsList.length === 0) {
            triggerPaymentMethodsFetch();
        }
    }, [paymentMethodsList]);

    const executeSubmitPaymentReceipt = useCallback(async () => {
        if (!selectedMethod) {
            setToastMessage("Error: Please select a settlement method.");
            return;
        }
        const isMpesaChannel = selectedMethod?.title?.toUpperCase().includes('MOBILE MONEY') || selectedMethod?.title?.toUpperCase().includes('MPESA');
        if (isMpesaChannel && !mobileNumber.trim()) {
            setToastMessage("Error: M-Pesa phone number line is required.");
            return;
        }

        const hasNet = isWeb ? navigator.onLine : (await Network.getNetworkStateAsync()).isConnected;

        if (!hasNet && isMpesaChannel) {
            Alert.alert("Action Restricted", "🛑 Mobile Money payments cannot be initialized without active internet. Please switch to Cash.");
            return;
        }

        const cachedOrdersList = await storageService.getAllOrders();
        const targetOrder = cachedOrdersList.find((o: any) => o.id === orderId || o.draft_id === orderId);

        if (!targetOrder) {
            Alert.alert("System Error", "❌ The referenced order key record could not be found inside the local cache registers.");
            return;
        }

        const payload = {
            action: "MakeCustomerOrderPayment",
            payment_method: String(selectedMethod.id),
            mobile_money_phone: isMpesaChannel ? mobileNumber.trim() : "",
            customer_order: String(targetOrder.id)
        };

        // =========================================================================
        // 📦 OFFLINE PERSISTENCE QUEUE
        // =========================================================================
        if (!hasNet) {
            targetOrder.is_paid = "true";
            targetOrder.selected_payment_method = selectedMethod.id;
            targetOrder.selected_payment_method_title = selectedMethod.title;
            targetOrder.synced = "FALSE";
            targetOrder.updated = new Date().toISOString();

            await storageService.syncIncomingOrders([targetOrder]);
            Alert.alert("Payment Recorded", "🎉 Payment preserved locally in device cache. Order marked as settled offline.");
            onSuccessCallback();
            return;
        }

        // =========================================================================
        // 🌐 GENUINE LIVE NETWORK TRANSMISSION WIRE DISPATCH
        // =========================================================================
        setToastMessage("Processing payment request...");
        if (isMpesaChannel) setIsPollingOpen(true);

        console.log("================ 🚀 MAKE CUSTOMER ORDER PAYMENT LIVE REQUEST ================");
        console.log("📦 Dispatching request data to endpoint channel...", JSON.stringify(payload, null, 2));

        // ✅ CALLING REAL NETWORK API METHOD: Triggers your real axio/fetch call inside useApi
        const res = await submitPaymentApi.request(payload);

        console.log("📥 Live API Processing Response Status intercepted:", res?.status);

        if (res?.ok || res?.status === 200 || res?.status === 201) {
            targetOrder.is_paid = "true";
            targetOrder.selected_payment_method = selectedMethod.id;
            targetOrder.selected_payment_method_title = selectedMethod.title;
            targetOrder.updated = new Date().toISOString();
            targetOrder.synced = "TRUE";

            if (isMpesaChannel) {
                targetOrder.status = 'COMPLETED';
            } else {
                setToastMessage("Success: Payment processed successfully!");
                Alert.alert("Payment Complete", "✓ Payment receipt applied to ledger rows safely.");
                onSuccessCallback();
            }
            await storageService.syncIncomingOrders([targetOrder]);
        } else {
            const serverErr = res?.data?.message || res?.message || "Gateway processing fault.";
            console.error("❌ Live API Gateway processing fault failure stack:", serverErr);

            if (isMpesaChannel) {
                setPollingError(serverErr);
            } else {
                setToastMessage(`Error: ${serverErr}`);
                Alert.alert("Transaction Aborted", `⚠️ ${serverErr}`);
            }
        }
    }, [selectedMethod, mobileNumber, orderId, isWeb, onSuccessCallback, paymentMethodsList, submitPaymentApi]);

    return {
        paymentMethods: paymentMethodsList,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMpesaNumber,
        toastMessage,
        isProcessing: submitPaymentApi.loading, // ✅ Re-linked to your live API wrapper states
        isFetchLoading: isPaymentSyncing,
        isPollingOpen,
        setIsPollingOpen,
        pollingError,
        executeSubmitPaymentReceipt
    };
}
