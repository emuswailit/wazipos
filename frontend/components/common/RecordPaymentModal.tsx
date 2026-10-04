// components/common/RecordPaymentModal.tsx
//
// Generic payment modal — works for any flow that names its
// initiate / status-check actions via RecordPaymentConfig.
//
// Side effects the caller owns (offline recording, cache mutation)
// are provided as optional callbacks:
//
//   onSuccess({ method })          → after server confirms payment
//   onOfflineRecord({ method, id }) → when offline and method is not MoMo

import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import {
    CUSTOMER_PAYMENT_CONFIG,
    RETAILER_PAYMENT_CONFIG,
    useRecordPayment,
    type PaymentMethod,
    type RecordPaymentConfig,
    type RetailerPaymentPollingResponse,
} from '@/hooks/useRecordPayment';
import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import ApiResponseModal, {
    routeEnvelope,
} from './ApiResponseModal';
import PaymentPollingModal from './PaymentPollingModal';

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    isOpen: boolean;
    orderId: string;
    orderRef: string;
    config?: RecordPaymentConfig;
    onClose: () => void;
    onRefreshParentLedger?: () => void;
    onSuccess?: (ctx: {
        method: PaymentMethod | null;
    }) => void | Promise<void>;
    onOfflineRecord?: (ctx: {
        method: PaymentMethod;
        orderId: string;
    }) => Promise<void>;
}

const MOBILE_MONEY_TITLE = 'MOBILE MONEY';
const NOOP = () => { };

/* =========================================================
 * Component
 * ======================================================= */

export default function RecordPaymentModal({
    isOpen,
    orderId,
    orderRef,
    config = RETAILER_PAYMENT_CONFIG,
    onClose,
    onRefreshParentLedger,
    onSuccess,
    onOfflineRecord,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const { isOnline } = useNetworkStatus();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const safeRefresh = onRefreshParentLedger ?? NOOP;

    /* Refs so callbacks don't capture stale values. */
    const selectedMethodRef = useRef<PaymentMethod | null>(null);
    const onSuccessRef = useRef(onSuccess);
    useEffect(() => {
        onSuccessRef.current = onSuccess;
    }, [onSuccess]);

    const handleSuccess = useCallback(async () => {
        try {
            await onSuccessRef.current?.({
                method: selectedMethodRef.current,
            });
        } finally {
            safeRefresh();
            onClose();
        }
    }, [safeRefresh, onClose]);

    const {
        paymentMethods,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMobileNumber,
        isLoadingMethods,
        isSubmitting,
        errorMessage,
        clearError,
        isPollingOpen,
        pollingResponse,
        pollingError,
        checkPaymentStatus,
        closePolling,
        submit,
    } = useRecordPayment(orderId, config, handleSuccess);

    useEffect(() => {
        selectedMethodRef.current = selectedMethod;
    }, [selectedMethod]);

    useEffect(() => {
        if (!isOpen) clearError();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    /* ---------------------------------------------------------
     * Local error state — offline MoMo block + pre-submit checks.
     * ------------------------------------------------------- */
    const [localError, setLocalError] =
        useState<RetailerPaymentPollingResponse | null>(null);

    useEffect(() => {
        setLocalError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMethod]);

    if (!isOpen) return null;

    const isMobileMoney =
        selectedMethod?.title === MOBILE_MONEY_TITLE;

    const kind = routeEnvelope(pollingResponse);
    const showPolling = isPollingOpen && kind === 'success';
    const showError = isPollingOpen && kind === 'error';

    /* ---------------------------------------------------------
     * Submit wrapper — offline branch, then the hook's submit.
     * ------------------------------------------------------- */
    const handleSubmit = async () => {
        if (!selectedMethod) return;

        if (!isOnline) {
            if (isMobileMoney) {
                setLocalError({
                    response_code: null,
                    response_message:
                        'Mobile Money requires an active internet connection. Switch to Cash to record this payment offline.',
                    errors: null,
                });
                return;
            }
            if (onOfflineRecord) {
                try {
                    await onOfflineRecord({
                        method: selectedMethod,
                        orderId,
                    });
                } finally {
                    safeRefresh();
                    onClose();
                }
                return;
            }
            setLocalError({
                response_code: null,
                response_message:
                    'You are offline and this payment method cannot be recorded without internet.',
                errors: null,
            });
            return;
        }

        void submit();
    };

    return (
        <>
            {/* ==================== Payment form ==================== */}
            <Modal
                visible={isOpen && !isPollingOpen}
                transparent
                animationType="fade"
                onRequestClose={onClose}
            >
                <View className="flex-1 bg-black/50 justify-center items-center p-4">
                    <View
                        className="w-full max-w-md rounded-2xl overflow-hidden"
                        style={{ backgroundColor: theme.panel }}
                    >
                        <View
                            className="px-5 py-3.5 border-b"
                            style={{ borderBottomColor: borderColor }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                            >
                                Record payment
                            </Text>
                            <Text
                                className="mt-0.5 uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.mono,
                                    fontSize: theme.fontSize.xs,
                                }}
                                numberOfLines={1}
                            >
                                {orderRef}
                            </Text>
                        </View>

                        <ScrollView
                            className="px-5 py-4"
                            style={{ maxHeight: 420 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {isLoadingMethods ? (
                                <View className="py-6 items-center">
                                    <ActivityIndicator
                                        color={theme.primary}
                                    />
                                </View>
                            ) : (
                                <>
                                    <Text
                                        className="uppercase tracking-widest mb-2"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.bold,
                                            fontSize: 10,
                                        }}
                                    >
                                        Settlement method
                                    </Text>

                                    {paymentMethods.map((m) => {
                                        const active =
                                            selectedMethod?.id === m.id;
                                        return (
                                            <Pressable
                                                key={m.id}
                                                onPress={() =>
                                                    setSelectedMethod(m)
                                                }
                                                className="py-3 px-3 rounded-xl border mb-2 flex-row items-center justify-between"
                                                style={{
                                                    borderColor: active
                                                        ? theme.primary
                                                        : borderColor,
                                                    backgroundColor: active
                                                        ? `${theme.primary}10`
                                                        : 'transparent',
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        color: theme.text,
                                                        fontFamily: active
                                                            ? theme.font.bold
                                                            : theme.font.medium,
                                                        fontSize:
                                                            theme.fontSize.sm,
                                                    }}
                                                >
                                                    {m.title}
                                                </Text>
                                                <View
                                                    className="w-4 h-4 rounded-full border-2"
                                                    style={{
                                                        borderColor: active
                                                            ? theme.primary
                                                            : theme.textDark,
                                                        backgroundColor: active
                                                            ? theme.primary
                                                            : 'transparent',
                                                    }}
                                                />
                                            </Pressable>
                                        );
                                    })}

                                    {isMobileMoney ? (
                                        <View className="mt-3">
                                            <Text
                                                className="uppercase tracking-widest mb-2"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                M-Pesa phone number
                                            </Text>
                                            <TextInput
                                                value={mobileNumber}
                                                onChangeText={
                                                    setMobileNumber
                                                }
                                                placeholder="07XXXXXXXX"
                                                placeholderTextColor="#94a3b8"
                                                keyboardType="phone-pad"
                                                autoCorrect={false}
                                                className="h-11 rounded-xl border px-3.5"
                                                style={{
                                                    borderColor,
                                                    backgroundColor: inputBg,
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.medium,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                            />
                                        </View>
                                    ) : null}

                                    {errorMessage ? (
                                        <View
                                            className="rounded-xl px-3 py-2.5 mt-3"
                                            style={{
                                                backgroundColor:
                                                    'rgba(244,63,94,0.08)',
                                                borderWidth: 1,
                                                borderColor:
                                                    'rgba(244,63,94,0.20)',
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: '#f43f5e',
                                                    fontFamily:
                                                        theme.font.medium,
                                                    fontSize:
                                                        theme.fontSize.xs,
                                                }}
                                            >
                                                {errorMessage}
                                            </Text>
                                        </View>
                                    ) : null}
                                </>
                            )}
                        </ScrollView>

                        <View
                            className="p-4 border-t flex-row gap-2"
                            style={{
                                borderTopColor: borderColor,
                                backgroundColor: theme.background,
                            }}
                        >
                            <Pressable
                                onPress={onClose}
                                className="flex-1 h-10 rounded-xl border items-center justify-center"
                                style={{ borderColor }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Cancel
                                </Text>
                            </Pressable>

                            <Pressable
                                onPress={handleSubmit}
                                disabled={
                                    isSubmitting ||
                                    isLoadingMethods ||
                                    !selectedMethod ||
                                    (isMobileMoney &&
                                        !mobileNumber.trim())
                                }
                                className="flex-1 h-10 rounded-xl items-center justify-center"
                                style={{
                                    backgroundColor: theme.primary,
                                    opacity:
                                        isSubmitting ||
                                            isLoadingMethods ||
                                            !selectedMethod ||
                                            (isMobileMoney &&
                                                !mobileNumber.trim())
                                            ? 0.5
                                            : 1,
                                }}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text
                                        className="uppercase tracking-wide text-white"
                                        style={{
                                            fontFamily: theme.font.bold,
                                            fontSize: theme.fontSize.xs,
                                        }}
                                    >
                                        Record payment
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ==================== Poller ==================== */}
            <PaymentPollingModal
                isOpen={showPolling}
                orderRef={orderRef}
                mobileNumber={mobileNumber}
                serverResponse={pollingResponse}
                checkPaymentStatus={checkPaymentStatus}
                onClose={async () => {
                    closePolling();
                    safeRefresh();
                    onClose();
                }}
                onSuccess={() => {
                    closePolling();
                    void handleSuccess();
                }}
            />

            {/* ==================== Server error modal ==================== */}
            <ApiResponseModal
                isOpen={showError}
                variant="error"
                title="Payment failed"
                subtitle={orderRef}
                envelope={pollingResponse}
                fallbackMessage={pollingError}
                onRetry={() => {
                    closePolling();
                }}
                onClose={() => {
                    closePolling();
                    safeRefresh();
                    onClose();
                }}
            />

            {/* ==================== Local validation ==================== */}
            <ApiResponseModal
                isOpen={!!localError}
                variant="error"
                title="Cannot record payment"
                subtitle={orderRef}
                envelope={localError}
                onClose={() => setLocalError(null)}
                closeLabel="OK"
            />
        </>
    );
}

export { CUSTOMER_PAYMENT_CONFIG, RETAILER_PAYMENT_CONFIG };
