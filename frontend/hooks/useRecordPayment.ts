// hooks/useRecordPayment.ts
//
// Payment submission hook — generic across retailer and customer
// order payment flows. Callers pass a `RecordPaymentConfig` that
// names the initiate action, the status-check action, the order
// parameter key, and which API client to invoke.
//
// Payment methods come from PaymentMethodsSyncContext — this hook
// does not fetch them itself.

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import retailersApi from '@/api/retailersApi';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';

/* =========================================================
 * Config
 * ======================================================= */

export interface RecordPaymentConfig {
    /** Initiate action name, e.g. 'MakeRetailerOrderPayment'. */
    paymentAction: string;
    /** Poll action name, e.g. 'CheckRetailerOrderPaymentStatus'. */
    statusAction: string;
    /** Order param key, e.g. 'retailer_order' | 'customer_order'. */
    orderParamKey: string;
    /** Which API client method to invoke. */
    api: 'retailStaff' | 'retailerOrders';
}

export const RETAILER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'MakeRetailerOrderPayment',
    statusAction: 'CheckRetailerOrderPaymentStatus',
    orderParamKey: 'retailer_order',
    api: 'retailStaff',
};

export const CUSTOMER_PAYMENT_CONFIG: RecordPaymentConfig = {
    paymentAction: 'MakeCustomerOrderPayment',
    statusAction: 'CheckCustomerOrderPaymentStatus',
    orderParamKey: 'customer_order',
    api: 'retailerOrders',
};

/* =========================================================
 * Shapes
 * ======================================================= */

export interface PaymentMethod {
    id: string;
    title: string;
    psp?: string;
    [key: string]: any;
}

export interface RetailerPaymentPollingResponse {
    response_code: string | null;
    response_message: string | null;
    errors: any;
}

export interface PaymentStatusCheckResult {
    state: 'PENDING' | 'SUCCESS' | 'FAILED';
    response_code: string | null;
    response_message: string | null;
    errors: any;
    raw: any;
}

export interface UseRecordPaymentResult {
    paymentMethods: PaymentMethod[];
    selectedMethod: PaymentMethod | null;
    setSelectedMethod: (m: PaymentMethod | null) => void;
    mobileNumber: string;
    setMobileNumber: (v: string) => void;

    isLoadingMethods: boolean;
    isSubmitting: boolean;
    errorMessage: string | null;
    clearError: () => void;

    isPollingOpen: boolean;
    pollingResponse: RetailerPaymentPollingResponse | null;
    pollingError: string | null;
    checkPaymentStatus: () => Promise<PaymentStatusCheckResult>;
    closePolling: () => void;

    submit: () => Promise<void>;
}

/* =========================================================
 * Constants
 * ======================================================= */

const MOBILE_MONEY_TITLE = 'MOBILE MONEY';

/* =========================================================
 * Helpers
 * ======================================================= */

function extractResponseMessage(res: any): string | null {
    const data = res?.data ?? res;
    if (!data) return null;

    if (Array.isArray(data.errors) && data.errors.length > 0) {
        return data.errors
            .map((e: any) =>
                typeof e === 'string' ? e : JSON.stringify(e)
            )
            .join(' · ');
    }
    if (typeof data.response_message === 'string') {
        return data.response_message;
    }
    if (typeof data.message === 'string') {
        return data.message;
    }
    if (typeof data.detail === 'string') {
        return data.detail;
    }
    return null;
}

function extractThrownMessage(e: any): string {
    if (!e) return 'Unexpected error.';

    if (e.code === 'ECONNABORTED') {
        return 'Request timed out. Check your connection.';
    }
    if (e.name === 'AbortError' || e.name === 'CanceledError') {
        return 'Request was cancelled.';
    }

    const fromBody = extractResponseMessage(e?.response);
    if (fromBody) return fromBody;

    if (e?.message === 'Network Error' || e?.code === 'ERR_NETWORK') {
        return 'Could not reach the server.';
    }
    if (typeof e === 'string') return e;
    if (e?.message) return String(e.message);

    return 'Unexpected error.';
}

function isResponseOk(res: any): boolean {
    if (!res) return false;

    const code = res?.data?.response_code;
    if (code !== undefined && code !== null) {
        return String(code) === '0';
    }
    if (res.status === 201) return true;
    if (res.data?.success === true) return true;
    if (res.ok === true && res.status === 200) return true;
    return false;
}

function extractPollingResponse(
    res: any
): RetailerPaymentPollingResponse {
    const data = res?.data ?? res ?? {};

    const response_code =
        data?.response_code !== undefined &&
            data?.response_code !== null
            ? String(data.response_code)
            : null;

    const response_message =
        typeof data?.response_message === 'string'
            ? data.response_message
            : null;

    const errors =
        data?.errors !== undefined && data?.errors !== null
            ? data.errors
            : null;

    return {
        response_code,
        response_message,
        errors,
    };
}

function classifyStatusCheck(res: any): PaymentStatusCheckResult {
    const data = res?.data ?? res ?? {};

    const response_code =
        data?.response_code !== undefined &&
            data?.response_code !== null
            ? String(data.response_code)
            : null;

    const response_message =
        typeof data?.response_message === 'string'
            ? data.response_message
            : null;

    const errors =
        data?.errors !== undefined && data?.errors !== null
            ? data.errors
            : null;

    const statusRaw = String(
        data?.status ?? data?.payment_status ?? ''
    )
        .trim()
        .toUpperCase();

    const SUCCESS_TOKENS = new Set([
        'SUCCESS',
        'PAID',
        'COMPLETED',
        'COMPLETE',
        'CONFIRMED',
        'SETTLED',
    ]);

    const FAILED_TOKENS = new Set([
        'FAILED',
        'FAILURE',
        'CANCELLED',
        'CANCELED',
        'REJECTED',
        'DECLINED',
        'TIMEOUT',
        'EXPIRED',
        'ABORTED',
    ]);

    let state: PaymentStatusCheckResult['state'] = 'PENDING';

    if (SUCCESS_TOKENS.has(statusRaw)) {
        state = 'SUCCESS';
    } else if (FAILED_TOKENS.has(statusRaw)) {
        state = 'FAILED';
    } else if (data?.is_paid === true) {
        state = 'SUCCESS';
    } else if (response_code !== null && response_code !== '0') {
        state = 'FAILED';
    }

    return {
        state,
        response_code,
        response_message,
        errors,
        raw: res,
    };
}

/* =========================================================
 * Hook
 * ======================================================= */

export function useRecordPayment(
    orderId: string,
    config: RecordPaymentConfig = RETAILER_PAYMENT_CONFIG,
    onSuccess: () => void
): UseRecordPaymentResult {
    /* ---------------- Methods from context ---------------- */

    const {
        paymentMethodsList,
        isPaymentSyncing,
        triggerPaymentMethodsFetch,
    } = usePaymentMethodsSync();

    /* Nudge the context if it's cold and empty. */
    useEffect(() => {
        if (paymentMethodsList.length === 0) {
            void triggerPaymentMethodsFetch();
        }
    }, [
        paymentMethodsList.length,
        triggerPaymentMethodsFetch,
    ]);

    /* Adapt context items to the shape this hook and its views use. */
    const paymentMethods: PaymentMethod[] = useMemo(
        () =>
            paymentMethodsList
                .filter((m) => m.active !== false)
                .map((m) => ({
                    id: String(m.id),
                    title: String(m.title),
                })),
        [paymentMethodsList]
    );

    /* ---------------- Local state ---------------- */

    const [selectedMethod, setSelectedMethod] =
        useState<PaymentMethod | null>(null);
    const [mobileNumber, setMobileNumber] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(
        null
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPollingOpen, setIsPollingOpen] = useState(false);
    const [pollingResponse, setPollingResponse] =
        useState<RetailerPaymentPollingResponse | null>(null);
    const [pollingError, setPollingError] = useState<string | null>(
        null
    );

    const checkoutIdRef = useRef<string | null>(null);

    /* ---------------- API ---------------- */

    const callApi = useCallback(
        async (payload: any) => {
            if (config.api === 'retailStaff') {
                return retailersApi.retailStaffAction(payload);
            }
            return retailersApi.retailerOrdersAction(payload);
        },
        [config.api]
    );

    /* ---------------- Transient helpers ---------------- */

    const clearError = useCallback(() => {
        setErrorMessage(null);
    }, []);

    const closePolling = useCallback(() => {
        setIsPollingOpen(false);
        setPollingResponse(null);
        setPollingError(null);
        checkoutIdRef.current = null;
    }, []);

    /* ---------------- Status check ---------------- */

    const checkPaymentStatus = useCallback(
        async (): Promise<PaymentStatusCheckResult> => {
            const requestPayload: Record<string, any> = {
                action: config.statusAction,
                [config.orderParamKey]: orderId,
            };

            if (checkoutIdRef.current) {
                requestPayload.checkout_request_id =
                    checkoutIdRef.current;
            }

            if (__DEV__) {
                console.log(
                    '[useRecordPayment] checkPaymentStatus →',
                    requestPayload
                );
            }

            try {
                const res: any = await callApi(requestPayload);


                if (__DEV__) {
                    console.log(
                        '[checkPaymentStatus] raw response',
                        {
                            data: res?.data,
                            keys: res?.data ? Object.keys(res.data) : null,
                            status: res?.data?.status,
                            payment_status: res?.data?.payment_status,
                            is_paid: res?.data?.is_paid,
                            response_code: res?.data?.response_code,
                        }
                    );
                }
                if (__DEV__) {
                    console.log(
                        '[useRecordPayment] checkPaymentStatus ←',
                        res
                    );
                }

                return classifyStatusCheck(res);
            } catch (e: any) {
                const msg = extractThrownMessage(e);

                if (__DEV__) {
                    console.error(
                        '[useRecordPayment] checkPaymentStatus threw',
                        e,
                        msg
                    );
                }

                return {
                    state: 'PENDING',
                    response_code: null,
                    response_message: msg,
                    errors: null,
                    raw: e,
                };
            }
        },
        [orderId, config.statusAction, config.orderParamKey, callApi]
    );

    /* ---------------- Submit ---------------- */

    const submit = useCallback(async () => {
        setErrorMessage(null);
        setPollingResponse(null);
        setPollingError(null);
        checkoutIdRef.current = null;

        if (!selectedMethod) {
            setErrorMessage('Select a settlement method.');
            return;
        }

        const isMobileMoney =
            selectedMethod.title === MOBILE_MONEY_TITLE;

        if (isMobileMoney && !mobileNumber.trim()) {
            setIsPollingOpen(true);
            setPollingResponse(null);
            setPollingError('Enter the M-Pesa phone number.');
            return;
        }

        const requestPayload: Record<string, any> = {
            action: config.paymentAction,
            payment_method: String(selectedMethod.id),
            mobile_money_phone: isMobileMoney
                ? mobileNumber.trim()
                : '',
            [config.orderParamKey]: orderId,
        };

        if (__DEV__) {
            console.log(
                '[useRecordPayment] submit →',
                requestPayload
            );
        }

        setIsSubmitting(true);
        try {
            const res: any = await callApi(requestPayload);

            if (__DEV__) {
                console.log(
                    '[useRecordPayment] ← response',
                    res
                );
            }

            const success = isResponseOk(res);
            const structured = extractPollingResponse(res);

            /* ---------------- Mobile money ---------------- */
            if (isMobileMoney) {
                const data = res?.data ?? res ?? {};
                checkoutIdRef.current =
                    data?.checkout_request_id ??
                    data?.merchant_request_id ??
                    data?.payment_id ??
                    data?.retailer_order_payment?.id ??
                    data?.retailer_order_payment?.remote_id ??
                    data?.customer_order_payment?.id ??
                    data?.customer_order_payment?.remote_id ??
                    null;

                setIsPollingOpen(true);
                setPollingResponse(structured);
                setPollingError(null);
                return;
            }

            /* ---------------- Traditional ---------------- */
            if (success) {
                onSuccess();
            } else {
                setErrorMessage(
                    structured.response_message ??
                    extractResponseMessage(res) ??
                    'Payment was declined.'
                );
            }
        } catch (e: any) {
            const msg = extractThrownMessage(e);

            if (__DEV__) {
                console.error('[useRecordPayment] threw', e, msg);
            }

            if (isMobileMoney) {
                setIsPollingOpen(true);
                setPollingResponse(null);
                setPollingError(msg);
            } else {
                setErrorMessage(msg);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [
        selectedMethod,
        mobileNumber,
        orderId,
        config.paymentAction,
        config.orderParamKey,
        callApi,
        onSuccess,
    ]);

    /* ---------------- Return ---------------- */

    return {
        paymentMethods,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMobileNumber,
        isLoadingMethods: isPaymentSyncing,
        isSubmitting,
        errorMessage,
        clearError,
        isPollingOpen,
        pollingResponse,
        pollingError,
        checkPaymentStatus,
        closePolling,
        submit,
    };
}