// hooks/useRecordPayment.ts

import retailerPrescriptionsApi from '@/api/retailerPrescriptionsApi';
import retailersApi from '@/api/retailersApi';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface BuildPaymentPayloadContext {
    orderId: string;
    selectedMethod: PaymentMethod;
    mobileNumber: string;
    isMobileMoney: boolean;
    orderItems?: any[];
    paymentDetails?: any;
}

export interface RecordPaymentConfig {
    paymentAction: string;
    statusAction: string;
    orderParamKey: string;
    api: 'retailStaff' | 'retailClient' | 'retailOrders' | 'retailPrescriptions';
    buildPaymentPayload?: (ctx: BuildPaymentPayloadContext) => Record<string, any>;
    buildPaymentStatusWsUrl?: (referenceNumber: string) => string;
    /** Only offer these payment method titles (e.g. ['MOBILE MONEY']). Omit = all active methods. */
    allowedMethodTitles?: string[];
}

export interface PaymentMethod {
    id: string;
    title: string;
    [key: string]: any;
}

interface UseRecordPaymentResult {
    paymentMethods: PaymentMethod[];
    selectedMethod: PaymentMethod | null;
    setSelectedMethod: (m: PaymentMethod | null) => void;
    mobileNumber: string;
    setMobileNumber: (v: string) => void;
    isLoadingMethods: boolean;
    isSubmitting: boolean;
    errorMessage: string | null;
    clearError: () => void;
    submit: (overrideCtx?: { orderItems?: any[]; paymentDetails?: any }) => Promise<any>;
}

export const CUSTOMER_ORDER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'MakeCustomerOrderPayment',
    statusAction: 'CheckCustomerOrderPaymentStatus',
    orderParamKey: 'customer_order',
    api: 'retailOrders',
    buildPaymentPayload: (ctx) => {
        return {
            action: 'MakeCustomerOrderPayment',
            customer_order: ctx.orderId,
            payment_method: String(ctx.selectedMethod.id),
            mobile_money_phone: ctx.mobileNumber || '',
        };
    },
    buildPaymentStatusWsUrl: (ref) => `wss://api.wazipos.co.ke/ws/retailers/orders/payment/${ref}/`,
};

export const CUSTOMER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'CreateCustomerOrder',
    statusAction: 'CheckCustomerOrderPaymentStatus',
    orderParamKey: 'draft_id',
    api: 'retailStaff',
    buildPaymentPayload: (ctx) => {
        const { orderId, selectedMethod, mobileNumber, orderItems, paymentDetails } = ctx;
        const safeOrderItems = (orderItems || []).map((item: any) => ({
            retailer_receipt: String(item.retailer_receipt || item.selectedProduct || ''),
            purchased_quantity: Number(item.purchased_quantity || item.quantity || 1),
            unit_selling_price: Number(item.unit_selling_price || item.price || 0),
            final_unit_selling_price: Number(item.final_unit_selling_price || item.price || 0),
            item_discount: Number(item.item_discount || item.discount || 0),
        }));
        return {
            action: 'CreateCustomerOrder',
            customer_order_details: {
                draft_id: orderId,
                payment_method: String(selectedMethod.id),
                payment_account_number: mobileNumber || '',
                customer_name: paymentDetails?.customerName || 'Walk-in Customer',
                customer_phone: paymentDetails?.customerPhone || mobileNumber || '',
                order_channel: 'WEB',
                order_origin: 'WEB',
                delivery_method: paymentDetails?.deliveryMethod || 'SELF',
                shipping_amount: "0.00",
                order_items: safeOrderItems,
            }
        };
    },
    buildPaymentStatusWsUrl: (ref) => `wss://api.wazipos.co.ke/ws/retailers/orders/payment/${ref}/`,
};

/** Customer pays the priced items of a digitized prescription (its PROCESSING order). orderId = prescription id. */
export const PRESCRIPTION_ORDER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'MakePrescriptionOrderPayment',
    statusAction: 'CheckCustomerOrderPaymentStatus',
    orderParamKey: 'prescription',
    api: 'retailPrescriptions',
    // Remote prescription purchases: mobile money only (enforced by the backend too).
    allowedMethodTitles: ['MOBILE MONEY'],
    buildPaymentPayload: (ctx) => ({
        action: 'MakePrescriptionOrderPayment',
        prescription: ctx.orderId,
        payment_method: String(ctx.selectedMethod.id),
        mobile_money_phone: ctx.mobileNumber || '',
    }),
    buildPaymentStatusWsUrl: (ref) => `wss://api.wazipos.co.ke/ws/retailers/orders/payment/${ref}/`,
};

export function useRecordPayment(
    orderId: string,
    config: RecordPaymentConfig = CUSTOMER_ORDER_PAYMENT_CONFIG,
): UseRecordPaymentResult {
    const { paymentMethodsList, isPaymentSyncing } = usePaymentMethodsSync();

    const allowed = config.allowedMethodTitles;
    const paymentMethods = useMemo(
        () => paymentMethodsList
            .filter((m) => m.active !== false)
            .filter((m) => !allowed || allowed.includes(String(m.title)))
            .map((m) => ({ id: String(m.id), title: String(m.title) })),
        [paymentMethodsList, allowed]
    );

    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    // A single allowed method (e.g. mobile money for prescriptions) is pre-selected.
    useEffect(() => {
        if (!selectedMethod && paymentMethods.length === 1) setSelectedMethod(paymentMethods[0]);
    }, [paymentMethods, selectedMethod]);
    const [mobileNumber, setMobileNumber] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const callApi = useCallback(async (payload: any) => {
        if (config.api === 'retailOrders') return retailersApi.retailOrdersAction(payload);
        if (config.api === 'retailStaff') return retailersApi.retailStaffAction(payload);
        if (config.api === 'retailPrescriptions') return retailerPrescriptionsApi.makePrescriptionOrderPaymentAction(payload);
        return retailersApi.clientOrdersAction(payload);
    }, [config.api]);

    const submit = useCallback(async (overrideCtx?: { orderItems?: any[]; paymentDetails?: any }) => {
        setErrorMessage(null);
        if (!selectedMethod) {
            setErrorMessage('Select a settlement method.');
            throw new Error('Select a settlement method.');
        }

        setIsSubmitting(true);
        try {
            const requestPayload = config.buildPaymentPayload
                ? config.buildPaymentPayload({
                    orderId,
                    selectedMethod,
                    mobileNumber,
                    isMobileMoney: selectedMethod.title === 'MOBILE MONEY',
                    orderItems: overrideCtx?.orderItems || [],
                    paymentDetails: overrideCtx?.paymentDetails || {},
                })
                : {
                    action: config.paymentAction,
                    payment_method: String(selectedMethod.id),
                    mobile_money_phone: selectedMethod.title === 'MOBILE MONEY' ? mobileNumber.trim() : '',
                    [config.orderParamKey]: orderId,
                };

            const res: any = await callApi(requestPayload);

            console.log("💰 [useRecordPayment] API RESPONSE:", res);

            if (String(res?.data?.response_code) === '0') {
                const returnedOrder = res.data.customer_order || {};
                const newReferenceNumber = returnedOrder.reference_number;

                if (!newReferenceNumber) {
                    throw new Error("Backend failed to generate a payment reference number.");
                }

                return {
                    ...res.data,
                    extracted_reference_number: newReferenceNumber
                };
            } else {
                const backendError =
                    res?.data?.errors?.join(' · ') ||
                    res?.data?.response_message ||
                    'Payment initiation failed.';
                throw new Error(backendError);
            }
        } catch (e: any) {
            console.error("💥 [useRecordPayment] CATCH BLOCK ERROR:", e);
            setErrorMessage(e?.message || 'Network error occurred.');
            throw e;
        } finally {
            setIsSubmitting(false);
        }
    }, [selectedMethod, mobileNumber, orderId, config, callApi]);

    return {
        paymentMethods,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMobileNumber,
        isLoadingMethods: isPaymentSyncing,
        isSubmitting,
        errorMessage,
        clearError: () => setErrorMessage(null),
        submit,
    };
}