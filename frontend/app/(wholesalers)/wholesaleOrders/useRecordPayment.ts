import paymentMethodsApi from '@/api/paymentMethodsApi';
import wholesalersApi from '@/api/wholesalersApi';
import { useApi } from '@/hooks/useApi';
import { useEffect, useState } from 'react';

export function useRecordPayment(orderId: string, onPaymentSuccess?: () => void) {
    const [selectedMethod, setSelectedMethod] = useState<any>(null);
    const [mobileNumber, setMpesaNumber] = useState('');
    const [toastMessage, setToastToast] = useState<string | null>(null);
    const paymentMethodsApiCall = useApi<any>(paymentMethodsApi.getPaymentMethodsAction);
    const orderPaymentApi = useApi(wholesalersApi.wholesaleRetailerOrdersAction);

    useEffect(() => {
        paymentMethodsApiCall.request({ action: "GetAllPaymentMethods" });
    }, []);

    useEffect(() => {
        if (paymentMethodsApiCall.data && Array.isArray(paymentMethodsApiCall.data) && paymentMethodsApiCall.data.length > 0 && !selectedMethod) {
            setSelectedMethod(paymentMethodsApiCall.data);
        }
    }, [paymentMethodsApiCall.data]);

    const triggerModalToast = (msg: string) => {
        setToastToast(msg);
        setTimeout(() => setToastToast(null), 5000);
    };

    const executeSubmitPaymentReceipt = async () => {
        if (!selectedMethod) {
            const msg = '⚠️ Select a valid payment method settlement.';
            alert(msg);
            triggerModalToast(msg);
            return;
        }
        let formattedPhone = null;
        if (selectedMethod.title === 'MOBILE MONEY') {
            const cleanPhone = mobileNumber.trim();
            if (!cleanPhone) {
                const msg = '⚠️ Subscriber phone configuration is required.';
                alert(msg);
                triggerModalToast(msg);
                return;
            }
            formattedPhone = cleanPhone.startsWith('0') ? `254${cleanPhone.substring(1)}` : cleanPhone;
            if (!/^254\d{9}$/.test(formattedPhone)) {
                const msg = '⚠️ Enter a valid Kenyan subscriber number.';
                alert(msg);
                triggerModalToast(msg);
                return;
            }
        }
        const structuredPayload = {
            action: "ProcessRetailerOrderPayment",
            retailer_order: orderId,
            payment_method: selectedMethod.id,
            mobile_money_phone: formattedPhone
        };
        console.log('====================================');
        console.log('🚀 [PAYLOAD LOG] INCOMING TRANSACTION DATA:');
        console.log(JSON.stringify(structuredPayload, null, 2));
        console.log('====================================');
        const result = await orderPaymentApi.request(structuredPayload);
        console.log('====================================');
        console.log('🔍 [RESPONSE LOG] orderPaymentApi OUTCOME:');
        console.log('Status Code:', result.status);
        console.log('Network OK:', result.ok);
        console.log('Payload Data:', JSON.stringify(result.data, null, 2));
        console.log('====================================');
        const resData = result.data as any;
        const responseCodeString = String(resData?.response_code || '');

        if (result.ok && responseCodeString !== '1') {
            triggerModalToast(`🎉 Success: ${resData?.response_message || 'Payment processed successfully.'}`);
            setMpesaNumber('');
            if (onPaymentSuccess) {
                setTimeout(onPaymentSuccess, 1200);
            }
        } else {
            let combinedErrorMessage = resData?.response_message || orderPaymentApi.errorMessage || 'Transaction exception occurred.';
            if (resData?.errors) {
                const errorsPayload = resData.errors;
                let detailedErrorStrings: string[] = [];
                if (Array.isArray(errorsPayload)) {
                    detailedErrorStrings = errorsPayload.map((err: any) => typeof err === 'string' ? err : JSON.stringify(err));
                } else if (typeof errorsPayload === 'object') {
                    Object.entries(errorsPayload).forEach(([fieldKey, errorValue]) => {
                        const formattedValue = Array.isArray(errorValue) ? errorValue.join(', ') : String(errorValue);
                        detailedErrorStrings.push(`${fieldKey}: ${formattedValue}`);
                    });
                }
                if (detailedErrorStrings.length > 0) {
                    combinedErrorMessage = `${combinedErrorMessage} -> ${detailedErrorStrings.join(' | ')}`;
                }
            }
            alert(`Payment Processing Error\n\n${combinedErrorMessage}`);
            triggerModalToast(`❌ Failed: ${combinedErrorMessage}`);
        }
    };

    return {
        paymentMethods: paymentMethodsApiCall.data || [],
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMpesaNumber,
        toastMessage,
        isProcessing: orderPaymentApi.loading,
        isFetchLoading: paymentMethodsApiCall.loading,
        executeSubmitPaymentReceipt
    };
}
