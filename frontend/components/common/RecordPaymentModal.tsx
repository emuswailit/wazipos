// components/common/RecordPaymentModal.tsx

import { useAuth } from '@/context/AuthContext';
import {
    CUSTOMER_ORDER_PAYMENT_CONFIG,
    useRecordPayment,
    type PaymentMethod,
    type RecordPaymentConfig,
} from '@/hooks/useRecordPayment';
import { AlertTriangle, CheckCircle2, Smartphone, X, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

interface Props {
    isOpen: boolean;
    orderId: string;
    orderRef: string;
    config?: RecordPaymentConfig;
    onClose: () => void;
    onRefreshParentLedger?: () => void;
    onSuccess?: (ctx: { method: PaymentMethod | null }) => void | Promise<void>;
    onlineOnly?: boolean;
}

const MOBILE_MONEY_TITLE = 'MOBILE MONEY';

export default function RecordPaymentModal({
    isOpen,
    orderId,
    orderRef,
    config = CUSTOMER_ORDER_PAYMENT_CONFIG,
    onClose,
    onRefreshParentLedger,
    onSuccess,
    onlineOnly = false,
}: Props) {
    const { theme, isDarkMode, token } = useAuth();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const {
        paymentMethods,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMobileNumber,
        isLoadingMethods,
        errorMessage,
        clearError,
        submit,
    } = useRecordPayment(orderId, config);

    const [loading, setLoading] = useState(false);
    const [waitingForPin, setWaitingForPin] = useState(false);
    const [success, setSuccess] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const [failed, setFailed] = useState(false);
    const [paymentDescription, setPaymentDescription] = useState<string | null>(null);
    const [lastWsData, setLastWsData] = useState<any>(null);
    const [countdown, setCountdown] = useState(60);

    const wsRef = useRef<WebSocket | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const waitingForPinRef = useRef(false);
    const timedOutRef = useRef(false);

    useEffect(() => { waitingForPinRef.current = waitingForPin; }, [waitingForPin]);
    useEffect(() => { timedOutRef.current = timedOut; }, [timedOut]);

    useEffect(() => {
        if (!isOpen) {
            wsRef.current?.close();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);

            setTimeout(() => {
                setLoading(false);
                setWaitingForPin(false);
                setSuccess(false);
                setTimedOut(false);
                setFailed(false);
                setPaymentDescription(null);
                setLastWsData(null);
                setCountdown(60);
                clearError();
            }, 300);
        }
    }, [isOpen]);

    const startTimeout = () => {
        setCountdown(60);
        if (countdownRef.current) clearInterval(countdownRef.current);

        countdownRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    if (countdownRef.current) clearInterval(countdownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        timeoutRef.current = setTimeout(() => {
            wsRef.current?.close();
            setWaitingForPin(false);
            setTimedOut(true);
        }, 60000);
    };

    const handleSubmit = async () => {
        if (!selectedMethod) return;

        setLoading(true);
        setTimedOut(false);
        setFailed(false);
        setPaymentDescription(null);
        setLastWsData(null);
        clearError();

        try {
            const resData = await submit();
            setLoading(false);

            if (resData?.payment?.status === "SUCCESS") {
                setSuccess(true);
                if (typeof onSuccess === 'function') onSuccess({ method: selectedMethod });
                if (typeof onRefreshParentLedger === 'function') onRefreshParentLedger();
                return;
            }

            if (resData?.payment?.status === "FAILED") {
                setFailed(true);
                setPaymentDescription(resData?.payment?.description || "The payment was rejected.");
                return;
            }

            const titleUpper = selectedMethod.title.toUpperCase();
            const isMobileMoney = titleUpper.includes('MOBILE') || titleUpper.includes('M-PESA') || titleUpper.includes('MPESA');

            if (isMobileMoney) {
                const finalRefToPoll = resData?.extracted_reference_number;

                if (!finalRefToPoll) {
                    throw new Error("Payment initiated, but no reference number was returned.");
                }

                if (!config.buildPaymentStatusWsUrl || !token) {
                    throw new Error("Failed to initiate WebSocket. Missing token or URL builder.");
                }

                setWaitingForPin(true);
                startTimeout();

                const baseWsUrl = config.buildPaymentStatusWsUrl!(encodeURIComponent(String(finalRefToPoll)));
                const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}`;

                wsRef.current = new WebSocket(wsUrl);

                wsRef.current.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.payment) {
                            setLastWsData(data.payment);
                            const wsStatus = data.payment.status?.toUpperCase();
                            const wsDescription =
                                data.payment.description ||
                                data.payment.jambopay_response?.description ||
                                "The payment was cancelled or rejected.";

                            setPaymentDescription(wsDescription);

                            if (wsStatus === "SUCCESS") {
                                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                                if (countdownRef.current) clearInterval(countdownRef.current);
                                wsRef.current?.close();
                                setWaitingForPin(false);
                                setSuccess(true);
                                if (typeof onSuccess === 'function') onSuccess({ method: selectedMethod });
                                if (typeof onRefreshParentLedger === 'function') onRefreshParentLedger();
                            } else if (wsStatus && wsStatus !== "PENDING") {
                                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                                if (countdownRef.current) clearInterval(countdownRef.current);
                                wsRef.current?.close();
                                setWaitingForPin(false);
                                setFailed(true);
                            }
                        }
                    } catch (err) {
                        console.error("❌ WS PARSE ERROR:", err);
                    }
                };

                wsRef.current.onclose = (event) => {
                    if (waitingForPinRef.current && !timedOutRef.current && !failed) {
                        if (timeoutRef.current) clearTimeout(timeoutRef.current);
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        setWaitingForPin(false);
                        if (event.code !== 1000) {
                            setFailed(true);
                            setPaymentDescription("Connection dropped unexpectedly.");
                        }
                    }
                };
            } else {
                setSuccess(true);
                if (typeof onSuccess === 'function') onSuccess({ method: selectedMethod });
                if (typeof onRefreshParentLedger === 'function') onRefreshParentLedger();
            }
        } catch (err: any) {
            console.error("💥 [RecordPaymentModal] ERROR IN handleSubmit:", err);
            setLoading(false);
        }
    };

    const handleCancelWait = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        wsRef.current?.close();
        onClose();
    };

    const handleRetry = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        wsRef.current?.close();
        setWaitingForPin(false);
        setTimedOut(false);
        setFailed(false);
        setPaymentDescription(null);
        setLastWsData(null);
        setCountdown(60);
        clearError();
    };

    if (!isOpen) return null;

    const isMobileMoney = selectedMethod?.title === MOBILE_MONEY_TITLE;
    const submitDisabled = loading || isLoadingMethods || !selectedMethod || (isMobileMoney && !mobileNumber.trim());

    return (
        <Modal visible={isOpen} transparent animationType="fade" onRequestClose={!loading && !waitingForPin ? onClose : undefined}>
            <KeyboardAvoidingView
                className="flex-1 items-center justify-center bg-black/60"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ padding: 16 }}
            >
                <View
                    className="w-full sm:max-w-[480px] rounded-2xl border flex-col overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                        maxHeight: (Platform.OS === 'web' ? '85vh' : '90%') as any
                    }}
                >
                    {/* 🟢 Header (Fixed) */}
                    <View className="flex-row items-center justify-between p-4 sm:p-5 border-b flex-shrink-0" style={{ borderBottomColor: borderColor }}>
                        <View className="flex-1 mr-4 min-w-0">
                            <Text className="text-base sm:text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>
                                Record payment
                            </Text>
                            <Text className="mt-0.5 uppercase tracking-widest text-[10px]" style={{ fontFamily: theme.font.mono, color: theme.textDark }} numberOfLines={1}>
                                {orderRef}
                            </Text>
                        </View>
                        <Pressable onPress={onClose} disabled={loading || waitingForPin} className="p-1.5 sm:p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                            <X size={18} color={theme.textDark} />
                        </Pressable>
                    </View>

                    {/* 🟢 Body (Scrollable) */}
                    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                        {success ? (
                            <View className="flex-1 items-center justify-center py-8">
                                <CheckCircle2 size={52} color="#10b981" />
                                <Text className="mt-4 text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>
                                    Payment Successful!
                                </Text>
                                <Text className="mt-2 text-center text-[13px]" style={{ fontFamily: theme.font.regular, color: theme.textDark }}>
                                    The order has been paid.
                                </Text>
                                <Pressable onPress={onClose} className="mt-8 px-8 py-3 rounded-xl border" style={{ borderColor }}>
                                    <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                                        Close
                                    </Text>
                                </Pressable>
                            </View>
                        ) : failed ? (
                            <View className="flex-1 items-center justify-center py-4">
                                <XCircle size={52} color="#f43f5e" />
                                <Text className="mt-4 text-base sm:text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>
                                    Payment Failed
                                </Text>
                                <View className="mt-4 p-4 rounded-xl w-full border flex-row justify-between items-center" style={{ backgroundColor: inputBg, borderColor: borderColor }}>
                                    <View>
                                        <Text className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>
                                            Status
                                        </Text>
                                        <Text className="text-sm font-bold uppercase" style={{ fontFamily: theme.font.bold, color: '#f43f5e' }}>
                                            {lastWsData?.status || 'FAILED'}
                                        </Text>
                                    </View>
                                    <View className="w-2/3 pl-4 border-l" style={{ borderLeftColor: borderColor }}>
                                        <Text className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>
                                            Description
                                        </Text>
                                        <Text className="text-sm font-medium" style={{ fontFamily: theme.font.medium, color: theme.text }}>
                                            {lastWsData?.description || paymentDescription || 'No description provided.'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="flex-col sm:flex-row gap-3 w-full mt-8">
                                    <Pressable onPress={handleCancelWait} className="flex-1 py-3 rounded-xl border items-center justify-center" style={{ borderColor }}>
                                        <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>Close</Text>
                                    </Pressable>
                                    <Pressable onPress={handleRetry} className="flex-1 py-3 rounded-xl items-center justify-center" style={{ backgroundColor: theme.primary }}>
                                        <Text className="uppercase tracking-wide text-[12px] font-bold text-white" style={{ fontFamily: theme.font.bold }}>Try Again</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : timedOut ? (
                            <View className="flex-1 items-center justify-center py-4">
                                <AlertTriangle size={52} color="#f59e0b" />
                                <Text className="mt-4 text-base sm:text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>
                                    Request Timed Out
                                </Text>
                                <View className="mt-4 p-4 rounded-xl w-full border flex-row justify-between items-center" style={{ backgroundColor: inputBg, borderColor: borderColor }}>
                                    <View>
                                        <Text className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>
                                            Status
                                        </Text>
                                        <Text className="text-sm font-bold uppercase" style={{ fontFamily: theme.font.bold, color: '#f59e0b' }}>
                                            {lastWsData?.status || 'PENDING'}
                                        </Text>
                                    </View>
                                    <View className="w-2/3 pl-4 border-l" style={{ borderLeftColor: borderColor }}>
                                        <Text className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>
                                            Description
                                        </Text>
                                        <Text className="text-sm font-medium" style={{ fontFamily: theme.font.medium, color: theme.text }}>
                                            {lastWsData?.description || paymentDescription || "We didn't receive a confirmation from your phone."}
                                        </Text>
                                    </View>
                                </View>
                                <View className="flex-col sm:flex-row gap-3 w-full mt-8">
                                    <Pressable onPress={handleCancelWait} className="flex-1 py-3 rounded-xl border items-center justify-center" style={{ borderColor }}>
                                        <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>Close</Text>
                                    </Pressable>
                                    <Pressable onPress={handleRetry} className="flex-1 py-3 rounded-xl items-center justify-center" style={{ backgroundColor: theme.primary }}>
                                        <Text className="uppercase tracking-wide text-[12px] font-bold text-white" style={{ fontFamily: theme.font.bold }}>Try Again</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : waitingForPin ? (
                            <View className="flex-1 items-center justify-center py-4">
                                <ActivityIndicator size="large" color={theme.primary} />
                                <Text className="mt-4 text-base sm:text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>
                                    Check your phone
                                </Text>
                                <Text className="mt-2 text-center text-[13px] px-4" style={{ fontFamily: theme.font.regular, color: theme.textDark }}>
                                    Please enter your PIN to authorize the {lastWsData?.payment_method_title || 'M-Pesa'} payment.
                                </Text>
                                <Text className="mt-4 text-center text-[11px] font-bold" style={{ fontFamily: theme.font.bold, color: '#f59e0b' }}>
                                    Time remaining: {countdown}s
                                </Text>
                                {paymentDescription && (
                                    <Text className="mt-2 text-center text-xs italic" style={{ fontFamily: theme.font.medium, color: theme.textDark }}>
                                        Status: {paymentDescription}
                                    </Text>
                                )}
                                <View className="flex-col sm:flex-row gap-3 w-full mt-8">
                                    <Pressable onPress={handleCancelWait} className="flex-1 py-3 rounded-xl border items-center justify-center" style={{ borderColor }}>
                                        <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>Cancel</Text>
                                    </Pressable>
                                    <Pressable onPress={handleRetry} className="flex-1 py-3 rounded-xl items-center justify-center" style={{ backgroundColor: theme.background }}>
                                        <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.primary, fontFamily: theme.font.bold }}>Retry</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <>
                                {isLoadingMethods ? (
                                    <View className="py-8 items-center">
                                        <ActivityIndicator color={theme.primary} />
                                    </View>
                                ) : (
                                    <>
                                        <Text className="uppercase tracking-widest mb-2" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10 }}>
                                            Settlement method
                                        </Text>
                                        {paymentMethods.map((m) => {
                                            const active = selectedMethod?.id === m.id;
                                            return (
                                                <Pressable
                                                    key={m.id}
                                                    disabled={loading}
                                                    onPress={() => setSelectedMethod(m)}
                                                    className="py-3 px-3 rounded-xl border mb-2 flex-row items-center justify-between"
                                                    style={{ borderColor: active ? theme.primary : borderColor, backgroundColor: active ? `${theme.primary}10` : 'transparent', opacity: loading ? 0.6 : 1 }}
                                                >
                                                    <Text style={{ color: theme.text, fontFamily: active ? theme.font.bold : theme.font.medium, fontSize: theme.fontSize.sm, flex: 1, minWidth: 0 }} numberOfLines={1}>
                                                        {m.title || 'Payment Method'}
                                                    </Text>
                                                    <View className="w-4 h-4 rounded-full border-2 ml-2" style={{ borderColor: active ? theme.primary : theme.textDark, backgroundColor: active ? theme.primary : 'transparent' }} />
                                                </Pressable>
                                            );
                                        })}

                                        {isMobileMoney ? (
                                            <View className="mt-3">
                                                <Text className="uppercase tracking-widest mb-2" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10 }}>
                                                    M-Pesa phone number
                                                </Text>
                                                <View className="flex-row items-center rounded-xl border px-3 h-11" style={{ borderColor, backgroundColor: inputBg }}>
                                                    <Smartphone size={16} color={theme.textDark} />
                                                    <TextInput
                                                        value={mobileNumber}
                                                        onChangeText={setMobileNumber}
                                                        editable={!loading}
                                                        placeholder="07XXXXXXXX"
                                                        placeholderTextColor="#94a3b8"
                                                        keyboardType="phone-pad"
                                                        autoCorrect={false}
                                                        className="flex-1 h-full ml-2 text-sm outline-none"
                                                        style={{ color: theme.text, fontFamily: theme.font.medium }}
                                                    />
                                                </View>
                                            </View>
                                        ) : null}

                                        {errorMessage ? (
                                            <View className="rounded-xl px-3 py-2.5 mt-3 border" style={{ backgroundColor: 'rgba(244,63,94,0.08)', borderColor: 'rgba(244,63,94,0.20)' }}>
                                                <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }}>{errorMessage}</Text>
                                            </View>
                                        ) : null}
                                    </>
                                )}
                            </>
                        )}
                    </ScrollView>

                    {/* 🟢 Footer (Fixed) */}
                    {!waitingForPin && !success && !timedOut && !failed && (
                        <View className="p-4 sm:p-5 border-t flex-row justify-end gap-3 flex-shrink-0" style={{ borderTopColor: borderColor }}>
                            <Pressable onPress={onClose} disabled={loading} className="px-5 py-2.5 rounded-xl border items-center justify-center" style={{ borderColor }}>
                                <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                                    Cancel
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleSubmit}
                                disabled={submitDisabled}
                                className="px-6 py-2.5 rounded-xl flex-row items-center justify-center gap-2"
                                style={{ backgroundColor: theme.primary, opacity: submitDisabled ? 0.7 : 1 }}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text className="uppercase tracking-wide text-white text-[12px] font-bold" style={{ fontFamily: theme.font.bold }}>
                                        Record Payment
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export { CUSTOMER_ORDER_PAYMENT_CONFIG };
