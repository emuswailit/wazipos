import paymentMethodsApi from '@/api/paymentMethodsApi';
import retailersApi from '@/api/retailersApi';
import useApi from '@/hooks/useApi';
import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

export function useRecordPayment(orderId: string, onSuccessCallback: () => void) {
    const [selectedMethod, setSelectedMethod] = useState<any | null>(null);
    const [mobileNumber, setMpesaNumber] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isPollingOpen, setIsPollingOpen] = useState(false);
    const [pollingError, setPollingError] = useState<string | null>(null);

    const getMethodsApi = useApi<any>(async () => await paymentMethodsApi.getPaymentMethodsAction({ action: "GetAllPaymentMethods" }));
    const postPaymentApi = useApi<any>(async (payload: any) => await retailersApi.retailStaffAction(payload));

    useEffect(() => { getMethodsApi.request(); }, []);
    const paymentMethods = getMethodsApi.data?.payment_methods || getMethodsApi.data || [];

    const executeSubmitPaymentReceipt = async () => {
        if (!selectedMethod) {
            setToastMessage("Select Method ⚠️");
            return setTimeout(() => setToastMessage(null), 3000);
        }
        if (selectedMethod.title === 'MOBILE MONEY' && !mobileNumber.trim()) {
            setToastMessage("Phone Required ⚠️");
            return setTimeout(() => setToastMessage(null), 3000);
        }

        const requestPayload = {
            action: "MakeRetailerOrderPayment",
            payment_method: selectedMethod.id,
            mobile_money_phone: mobileNumber.trim(),
            retailer_order: orderId
        };

        console.log("[OUTBOUND POST_PAYMENT_API REQUEST PAYLOAD]:", JSON.stringify(requestPayload, null, 2));
        setPollingError(null);

        if (selectedMethod.title === 'MOBILE MONEY') {
            setIsPollingOpen(true);
            const res = await postPaymentApi.request(requestPayload);
            console.log("[RAW MOBILE MONEY INITIALIZATION RESPONSE]:", JSON.stringify(res));

            // 🚀 PARSING SERVER ERROR & MESSAGE RESPONSES FOR MOBILE MONEY
            if (res?.data?.errors && Array.isArray(res.data.errors) && res.data.errors.length > 0) {
                setPollingError(res.data.errors.join(' | '));
            } else if (res?.data?.response_message) {
                setPollingError(res.data.response_message);
            }
            return;
        }

        const res = await postPaymentApi.request(requestPayload);
        console.log("[RAW TRADITIONAL TRANSACTION LOG RESPONSE]:", JSON.stringify(res));

        if (res?.ok || res?.status === 200 || res?.status === 201 || res?.data?.success === true) {
            const successMsg = res?.data?.response_message || "Traditional settlement noted.";
            if (Platform.OS === 'web') {
                window.alert(`Success 🎉\n\n${successMsg}`);
                onSuccessCallback();
            } else {
                Alert.alert("Success 🎉", successMsg, [{ text: "OK", onPress: () => onSuccessCallback() }]);
            }
        } else {
            // 🚀 PARSING SERVER ERROR & MESSAGE RESPONSES FOR TRADITIONAL FALLBACKS
            let errorMsg = "Payment declined.";
            if (res?.data?.errors && Array.isArray(res.data.errors) && res.data.errors.length > 0) {
                errorMsg = res.data.errors.join(' | ');
            } else if (res?.data?.response_message) {
                errorMsg = res.data.response_message;
            } else if (postPaymentApi.errorMessage) {
                errorMsg = postPaymentApi.errorMessage;
            }

            if (Platform.OS === 'web') {
                window.alert(`Failure ⚠️\n\n${errorMsg}`);
            } else {
                Alert.alert("Failure ⚠️", errorMsg);
            }
        }
    };

    return {
        paymentMethods, selectedMethod, setSelectedMethod, mobileNumber, setMpesaNumber,
        toastMessage, isProcessing: postPaymentApi.loading, isFetchLoading: getMethodsApi.loading,
        isPollingOpen, setIsPollingOpen, pollingError, executeSubmitPaymentReceipt
    };
}
