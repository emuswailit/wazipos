import retailersApi from '@/api/retailersApi';
import { db, dbInstance } from '@/databases/db';
import useApi from '@/hooks/useApi';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

export function useRecordCustomerPayment(orderId: string, onSuccessCallback: () => void) {
    const paymentMethodsApi = useApi(retailersApi.retailerOrdersAction);
    const submitPaymentApi = useApi(retailersApi.retailerOrdersAction);

    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [selectedMethod, setSelectedMethod] = useState<any>(null);
    const [mobileNumber, setMpesaNumber] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isPollingOpen, setIsPollingOpen] = useState(false);
    const [pollingError, setPollingError] = useState<string | null>(null);

    const isWeb = Platform.OS === 'web';

    // 1. Fetch available payment channels from local cache or remote server
    useEffect(() => {
        const fetchMethods = async () => {
            try {
                if (db?.paymentMethods?.getAll) {
                    const cached = await db.paymentMethods.getAll();
                    if (cached?.length) setPaymentMethods(cached);
                }
                const res = await paymentMethodsApi.request({ action: "RetrievePaymentMethods" });
                const data = res?.data?.results || res?.data;
                if (res?.ok && Array.isArray(data)) {
                    setPaymentMethods(data);
                    if (db?.paymentMethods?.saveAll) await db.paymentMethods.saveAll(data);
                }
            } catch (e) { console.error("Failed to load payment methods:", e); }
        };
        fetchMethods();
    }, []);

    // 2. Main Payment Receipt Submission Protocol Engine
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

        // 🛑 OFFLINE ARCHITECTURE RULE: Prevent Mobile Money STK triggers if offline
        if (!hasNet && isMpesaChannel) {
            Alert.alert("Action Restricted", "🛑 Mobile Money payments cannot be initialized without active internet. Please switch to Cash or Credit.");
            return;
        }

        // Fetch the corresponding local order from cache storage layers
        let cachedOrdersList = isWeb
            ? await dbInstance.customerOrders.toArray()
            : JSON.parse(await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload') || '[]');

        const targetOrder = cachedOrdersList.find((o: any) => o.draftId === orderId);
        if (!targetOrder) {
            Alert.alert("System Error", "❌ The referenced order key record could not be found locally.");
            return;
        }

        // Exact server contract transaction blueprint configuration [INDEX]
        const payload = {
            action: "MakeCustomerOrderPayment",
            payment_method: String(selectedMethod.id),
            mobile_money_phone: isMpesaChannel ? mobileNumber.trim() : "",
            retailer_order: String(targetOrder.order_number || targetOrder.draftId)
        };

        if (!hasNet) {
            // 📦 OFFLINE FIRST FLOW: Upsert state changes locally with synced flags mapped to false [INDEX]
            targetOrder.is_paid = true;
            targetOrder.selectedPaymentMethodId = selectedMethod.id;
            targetOrder.paymentAccountNumber = mobileNumber.trim();
            targetOrder.updatedAt = new Date().toISOString();

            if (db?.upsertOrder) await db.upsertOrder(targetOrder);

            Alert.alert("Payment Recorded", "🎉 Payment preserved locally in device cache. Order marked as settled offline.");
            onSuccessCallback();
            return;
        }

        // 🌐 ONLINE FLOW: Dispatch push instructions natively down to endpoint gateway [INDEX]
        setToastMessage("Processing payment request...");
        if (isMpesaChannel) setIsPollingOpen(true);

        const res = await submitPaymentApi.request(payload);

        if (res?.ok || res?.status === 200 || res?.status === 201) {
            targetOrder.is_paid = true;
            targetOrder.selectedPaymentMethodId = selectedMethod.id;
            targetOrder.paymentAccountNumber = mobileNumber.trim();
            targetOrder.updatedAt = new Date().toISOString();

            if (isMpesaChannel) {
                // If Mobile money, update flags; polling modal handles closing and callback execution routines [INDEX]
                targetOrder.status = 'COMPLETED';
            } else {
                setToastMessage("Success: Payment processed successfully!");
                Alert.alert("Payment Complete", "✓ Payment receipt applied to ledger rows safely.");
                onSuccessCallback();
            }
            if (db?.upsertOrder) await db.upsertOrder(targetOrder);
        } else {
            const serverErr = res?.data?.message || res?.message || "Gateway processing fault.";
            if (isMpesaChannel) {
                setPollingError(serverErr);
            } else {
                setToastMessage(`Error: ${serverErr}`);
                Alert.alert("Transaction Aborted", `⚠️ ${serverErr}`);
            }
        }
    }, [selectedMethod, mobileNumber, orderId, isWeb, onSuccessCallback, submitPaymentApi]);

    return {
        paymentMethods, selectedMethod, setSelectedMethod, mobileNumber, setMpesaNumber, toastMessage,
        isProcessing: submitPaymentApi.loading, isFetchLoading: paymentMethodsApi.loading,
        isPollingOpen, setIsPollingOpen, pollingError, executeSubmitPaymentReceipt
    };
}
