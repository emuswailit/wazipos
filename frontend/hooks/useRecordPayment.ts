// hooks/useRecordPayment.ts

import retailerPrescriptionsApi from '@/api/retailerPrescriptionsApi';
import retailersApi from '@/api/retailersApi';
import wholesalersApi from '@/api/wholesalersApi';
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
    api: 'retailStaff' | 'retailClient' | 'retailOrders' | 'retailPrescriptions' | 'wholesaleOrders';
    buildPaymentPayload?: (ctx: BuildPaymentPayloadContext) => Record<string, any>;
    buildPaymentStatusWsUrl?: (referenceNumber: string) => string;
    /** Only offer these payment method titles (e.g. ['MOBILE MONEY']). Omit = all active methods. */
    allowedMethodTitles?: string[];
    /** Key of the order in a successful response. Default 'customer_order'. */
    responseKey?: string;
    /** Field of that order holding the payment reference to follow. Default 'reference_number'. */
    referenceKey?: string;
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
    /** Why the methods could not be loaded (none on hand and the fetch failed). */
    methodsError: string | null;
    /** Fetch the payment methods again (the dialog calls it when the list is empty). */
    reloadMethods: () => Promise<void>;
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

/**
 * Retailer pays for a requisition (RetailerOrder) — `MakeRetailerOrderPayment`
 * on /retailers/orders/staff. orderId = retailer order id.
 * Mobile money goes into the WaziPOS system till (the wholesaler is paid out
 * to their payout account); the dialog follows the payment on
 * ws/requisitions/payment/<ref>/ (backend RetailerOrderPaymentConsumer).
 */
export const RETAILER_ORDER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'MakeRetailerOrderPayment',
    statusAction: '',
    orderParamKey: 'retailer_order',
    api: 'retailStaff',
    responseKey: 'retailer_order',
    referenceKey: 'payment_reference_number',
    // Retailers pay their orders by mobile money only (enforced by the backend too).
    allowedMethodTitles: ['MOBILE MONEY'],
    buildPaymentStatusWsUrl: (ref) => `wss://api.wazipos.co.ke/ws/requisitions/payment/${ref}/`,
    buildPaymentPayload: (ctx) => ({
        action: 'MakeRetailerOrderPayment',
        retailer_order: ctx.orderId,
        payment_method: String(ctx.selectedMethod.id),
        mobile_money_phone: ctx.isMobileMoney ? ctx.mobileNumber.trim() : '',
    }),
};

/**
 * Wholesaler staff take or retry payment for a retailer order sent to them —
 * `ProcessRetailerOrderPayment` on /wholesalers/retailers/orders. Any payment
 * method: mobile money prompts the retailer's phone (into the system till,
 * followed live on the same socket as the retailer's own payments); cash,
 * credit etc. are recorded as paid at once.
 */
export const WHOLESALER_RETAILER_ORDER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'ProcessRetailerOrderPayment',
    statusAction: '',
    orderParamKey: 'retailer_order',
    api: 'wholesaleOrders',
    responseKey: 'retailer_order',
    referenceKey: 'payment_reference_number',
    buildPaymentStatusWsUrl: (ref) => `wss://api.wazipos.co.ke/ws/requisitions/payment/${ref}/`,
    buildPaymentPayload: (ctx) => ({
        action: 'ProcessRetailerOrderPayment',
        retailer_order: ctx.orderId,
        payment_method: String(ctx.selectedMethod.id),
        mobile_money_phone: ctx.isMobileMoney ? ctx.mobileNumber.trim() : '',
    }),
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
    const { paymentMethodsList, isPaymentSyncing, paymentMethodsError, triggerPaymentMethodsFetch } = usePaymentMethodsSync();

    const allowed = config.allowedMethodTitles;
    const paymentMethods = useMemo(() => {
        // Titles compared loosely ("Mobile Money" = "MOBILE MONEY"), so a stored
        // copy or a renamed method is not filtered out of the dialog.
        const norm = (t: unknown) => String(t ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
        const allowedSet = allowed ? new Set(allowed.map(norm)) : null;
        return paymentMethodsList
            .filter((m) => m.active !== false)
            .filter((m) => !allowedSet || allowedSet.has(norm(m.title)))
            .map((m) => ({ id: String(m.id), title: String(m.title) }));
    }, [paymentMethodsList, allowed]);
    const methodsError = paymentMethods.length === 0 ? paymentMethodsError : null;

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
        if (config.api === 'wholesaleOrders') return wholesalersApi.wholesaleRetailerOrdersAction(payload);
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
                const returnedOrder = res.data[config.responseKey ?? 'customer_order'] || {};
                const newReferenceNumber = returnedOrder[config.referenceKey ?? 'reference_number'];

                // The reference is only needed to follow a mobile-money payment
                // live. The server accepted the request, so a missing one is not
                // an error: the dialog then says "check your phone" instead.

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
            // warn, not error: the dialog already shows the message, and console.error
            // opens the dev error overlay for an expected outcome (refused payment).
            console.warn("[useRecordPayment] payment request failed:", e?.message ?? e);
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
        methodsError,
        reloadMethods: triggerPaymentMethodsFetch,
        isSubmitting,
        errorMessage,
        clearError: () => setErrorMessage(null),
        submit,
    };
}