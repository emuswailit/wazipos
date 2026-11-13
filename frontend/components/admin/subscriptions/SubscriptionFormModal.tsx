// components/admin/subscriptions/SubscriptionFormModal.tsx

import subscriptionsApi from "@/api/subscriptionsApi";
import { useAuth } from "@/context/AuthContext";
import { AlertTriangle, CalendarDays, CheckCircle2, Minus, Plus, Smartphone } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { AdminSheet, SheetButton, useSheetIsWide } from "@/components/admin/kit";
import ApiResponseModal, { extractEnvelope } from "@/components/common/ApiResponseModal";

interface Props {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const MIN_MONTHS = 1;
const MAX_MONTHS = 12; // matches MAX_RENEWAL_MONTHS on the backend

export function SubscriptionFormModal({ visible, onClose, onSuccess }: Props) {
    const { theme, isDarkMode, token, user } = useAuth();
    const sheetWide = useSheetIsWide();

    const [phone, setPhone] = useState("");
    const [months, setMonths] = useState(MIN_MONTHS);
    // Raw text while typing, so the field can be briefly empty without snapping back to 1.
    const [monthsText, setMonthsText] = useState(String(MIN_MONTHS));

    const monthlyFee = Number(user?.monthly_subscription);
    const hasMonthlyFee = !isNaN(monthlyFee) && monthlyFee > 0;
    const totalAmount = hasMonthlyFee ? monthlyFee * months : null;

    const applyMonths = (value: number) => {
        const clamped = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.round(value)));
        setMonths(clamped);
        setMonthsText(String(clamped));
    };

    const handleMonthsTextChange = (text: string) => {
        const digits = text.replace(/[^0-9]/g, "").slice(0, 2);
        setMonthsText(digits);
        const parsed = parseInt(digits, 10);
        if (!isNaN(parsed)) setMonths(Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, parsed)));
    };
    const [loading, setLoading] = useState(false);

    const [apiError, setApiError] = useState<{
        isOpen: boolean;
        title: string;
        envelope: any | null;
        fallbackMessage: string | null;
    }>({ isOpen: false, title: "", envelope: null, fallbackMessage: null });

    const [waitingForPin, setWaitingForPin] = useState(false);
    const [success, setSuccess] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const [amount, setAmount] = useState<number | null>(null);
    const [paymentDescription, setPaymentDescription] = useState<string | null>(null);
    const [lastWsData, setLastWsData] = useState<any>(null); // 🌟 Track raw WS response
    const [countdown, setCountdown] = useState(60);

    const wsRef = useRef<WebSocket | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const borderColor = theme.colors.border;
    const inputBg = isDarkMode ? theme.colors.background : theme.colors.surfaceAlt;

    useEffect(() => {
        if (!visible) {
            wsRef.current?.close();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            if (connectDelayRef.current) clearTimeout(connectDelayRef.current);

            setTimeout(() => {
                setPhone("");
                setMonths(MIN_MONTHS);
                setMonthsText(String(MIN_MONTHS));
                setLoading(false);
                setWaitingForPin(false);
                setSuccess(false);
                setTimedOut(false);
                setAmount(null);
                setPaymentDescription(null);
                setLastWsData(null);
                setCountdown(60);
                setApiError({ isOpen: false, title: "", envelope: null, fallbackMessage: null });
            }, 300);
        }
    }, [visible]);

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

    const handlePay = async () => {
        if (!phone || phone.length < 10) {
            setApiError({
                isOpen: true,
                title: "Invalid Phone Number",
                envelope: null,
                fallbackMessage: "Please enter a valid 10-digit phone number.",
            });
            return;
        }

        if (!Number.isInteger(months) || months < MIN_MONTHS || months > MAX_MONTHS) {
            setApiError({
                isOpen: true,
                title: "Invalid Number of Months",
                envelope: null,
                fallbackMessage: `Choose between ${MIN_MONTHS} and ${MAX_MONTHS} months.`,
            });
            return;
        }
        applyMonths(months); // normalise the text field if it was left empty

        setLoading(true);
        setApiError({ isOpen: false, title: "", envelope: null, fallbackMessage: null });
        setTimedOut(false);
        setPaymentDescription(null);
        setLastWsData(null);

        try {
            const res = await subscriptionsApi.initiateSubscriptionPaymentAction({
                action: "InitiateSubscriptionPayment",
                phone_number: phone,
                months,
            });

            if (res.data?.payment) {
                console.log("=========================================");
                console.log("[SubscriptionFormModal] PAYMENT EMITTED RAW JSON:");
                console.log(JSON.stringify(res.data.payment, null, 2));
                console.log("=========================================");
            }

            if (res.status === 400 || res.status === 500) {
                const env = extractEnvelope(res);
                setApiError({
                    isOpen: true,
                    title: env.response_message || "Error",
                    envelope: env,
                    fallbackMessage: null,
                });
                setLoading(false);
                return;
            }

            if (res.ok && res.data?.payment) {
                const { status, reference_number, amount, description } = res.data.payment;

                setLoading(false);
                setAmount(amount);
                if (description) setPaymentDescription(description);

                if (status === "SUCCESS") {
                    setSuccess(true);
                    setTimeout(() => {
                        onSuccess();
                        onClose();
                    }, 2000);
                    return;
                }

                if (status !== "PENDING") {
                    setApiError({
                        isOpen: true,
                        title: status,
                        envelope: null,
                        fallbackMessage: description,
                    });
                    return;
                }

                setWaitingForPin(true);
                startTimeout();

                connectDelayRef.current = setTimeout(() => {
                    const wsUrl = `wss://api.wazipos.co.ke/ws/subscriptions/payment/${reference_number}/?token=${token}`;
                    wsRef.current = new WebSocket(wsUrl);

                    wsRef.current.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);

                            if (data.payment) {
                                console.log("=========================================");
                                console.log("[SubscriptionFormModal] WEBSOCKET EMITTED PAYMENT RAW JSON:");
                                console.log(JSON.stringify(data.payment, null, 2));
                                console.log("=========================================");

                                // 🌟 Save the WS data so we can display it on timeout
                                setLastWsData(data.payment);

                                const wsStatus = data.payment.status?.toUpperCase();
                                const wsDescription = data.payment.description;

                                if (wsDescription) setPaymentDescription(wsDescription);

                                if (wsStatus === "SUCCESS") {
                                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                                    if (countdownRef.current) clearInterval(countdownRef.current);
                                    wsRef.current?.close();
                                    setWaitingForPin(false);
                                    setSuccess(true);
                                    setTimeout(() => {
                                        onSuccess();
                                        onClose();
                                    }, 2000);
                                }
                                else if (wsStatus && wsStatus !== "PENDING") {
                                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                                    if (countdownRef.current) clearInterval(countdownRef.current);
                                    wsRef.current?.close();
                                    setWaitingForPin(false);
                                    setApiError({
                                        isOpen: true,
                                        title: wsStatus,
                                        envelope: null,
                                        fallbackMessage: wsDescription,
                                    });
                                }
                            }
                        } catch (err) {
                            console.error("WS parse error", err);
                        }
                    };

                    wsRef.current.onclose = () => {
                        // Only trigger error if we're still waiting and haven't timed out yet
                        if (waitingForPin && !timedOut) {
                            if (timeoutRef.current) clearTimeout(timeoutRef.current);
                            if (countdownRef.current) clearInterval(countdownRef.current);
                            setWaitingForPin(false);
                            setApiError({
                                isOpen: true,
                                title: "Connection Lost",
                                envelope: null,
                                fallbackMessage: "The live connection dropped. Please check your M-Pesa and try again.",
                            });
                        }
                    };
                }, 3000);

            } else {
                setApiError({
                    isOpen: true,
                    title: "Unexpected Response",
                    envelope: null,
                    fallbackMessage: res.data?.response_message || "The server returned an invalid response.",
                });
                setLoading(false);
            }
        } catch (err: any) {
            setApiError({
                isOpen: true,
                title: "Connection Error",
                envelope: null,
                fallbackMessage: err?.message || "Could not connect to the server.",
            });
            setLoading(false);
        }
    };

    const handleCancelWait = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (connectDelayRef.current) clearTimeout(connectDelayRef.current);
        wsRef.current?.close();
        onClose();
    };

    const handleRetry = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (connectDelayRef.current) clearTimeout(connectDelayRef.current);
        wsRef.current?.close();
        setWaitingForPin(false);
        setTimedOut(false);
        setAmount(null);
        setPaymentDescription(null);
        setLastWsData(null);
        setCountdown(60);
        setApiError({ isOpen: false, title: "", envelope: null, fallbackMessage: null });
    };

    if (!visible) return null;

    return (
        <>
            <AdminSheet
                visible={visible}
                onClose={onClose}
                title="Renew subscription"
                subtitle={user?.entity_title ?? null}
                icon="card-outline"
                width={520}
                dismissible={!loading && !waitingForPin}
                footer={
                    !waitingForPin && !success && !timedOut ? (
                        <>
                            <SheetButton label="Cancel" variant="ghost" onPress={onClose} disabled={loading} grow={!sheetWide} />
                            <SheetButton label="Charge now" icon="phone-portrait-outline" onPress={handlePay} loading={loading} loadingLabel="Sending…" grow={!sheetWide} />
                        </>
                    ) : undefined
                }
            >
                            {success ? (
                                <View className="items-center py-8">
                                    <CheckCircle2 size={48} color={theme.colors.success} />
                                    <Text className="mt-4 text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.colors.text }}>
                                        Payment Successful!
                                    </Text>
                                    <Text className="mt-2 text-center text-[13px]" style={{ fontFamily: theme.font.regular, color: theme.colors.textMuted }}>
                                        Your subscription has been renewed.
                                    </Text>
                                </View>
                            ) : timedOut ? (
                                <View className="items-center py-6">
                                    <AlertTriangle size={48} color={theme.colors.warning} />
                                    <Text className="mt-4 text-base font-bold" style={{ fontFamily: theme.font.bold, color: theme.colors.text }}>
                                        Request Timed Out
                                    </Text>

                                    {/* 🌟 DISPLAY THE LAST WEBSOCKET RESPONSE */}
                                    <Text className="mt-2 text-center text-[13px] px-4" style={{ fontFamily: theme.font.regular, color: theme.colors.textMuted }}>
                                        {paymentDescription || "We didn't receive a confirmation from your phone."}
                                    </Text>

                                    {lastWsData && (
                                        <View className="mt-4 p-3 rounded-lg w-full" style={{ backgroundColor: theme.colors.surfaceAlt }}>
                                            <Text className="text-[10px] font-bold mb-1" style={{ fontFamily: theme.font.bold, color: theme.colors.textMuted }}>
                                                LAST WEBSOCKET DATA:
                                            </Text>
                                            <Text className="text-[10px] font-mono" style={{ color: theme.colors.text }}>
                                                {JSON.stringify(lastWsData, null, 2)}
                                            </Text>
                                        </View>
                                    )}

                                    <View className="flex-row gap-3 mt-6">
                                        <Pressable onPress={handleCancelWait} className="px-5 py-2.5 rounded-xl border" style={{ borderColor }}>
                                            <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.colors.textMuted, fontFamily: theme.font.bold }}>Close</Text>
                                        </Pressable>
                                        <Pressable onPress={handleRetry} className="px-5 py-2.5 rounded-xl" style={{ backgroundColor: theme.colors.primary }}>
                                            <Text className="uppercase tracking-wide text-[12px] font-bold text-white" style={{ fontFamily: theme.font.bold }}>Try Again</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            ) : waitingForPin ? (
                                <View className="items-center py-6">
                                    <ActivityIndicator size="large" color={theme.colors.primary} />
                                    <Text className="mt-4 text-base font-bold" style={{ fontFamily: theme.font.bold, color: theme.colors.text }}>
                                        Check your phone
                                    </Text>
                                    <Text className="mt-2 text-center text-[13px] px-4" style={{ fontFamily: theme.font.regular, color: theme.colors.textMuted }}>
                                        Please enter your M-Pesa/Airtel PIN to authorize the payment of {amount ? `KES ${amount.toLocaleString()}` : 'the subscription'} for {months} {months === 1 ? 'month' : 'months'}.
                                    </Text>

                                    <Text className="mt-4 text-center text-[11px] font-bold" style={{ fontFamily: theme.font.bold, color: theme.colors.warning }}>
                                        Time remaining: {countdown}s
                                    </Text>

                                    {paymentDescription && (
                                        <Text className="mt-2 text-center text-xs italic" style={{ fontFamily: theme.font.medium, color: theme.colors.textMuted }}>
                                            Status: {paymentDescription}
                                        </Text>
                                    )}

                                    <View className="flex-row gap-3 mt-6">
                                        <Pressable onPress={handleCancelWait} className="px-5 py-2.5 rounded-xl border" style={{ borderColor }}>
                                            <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.colors.textMuted, fontFamily: theme.font.bold }}>
                                                Cancel
                                            </Text>
                                        </Pressable>
                                        <Pressable onPress={handleRetry} className="px-5 py-2.5 rounded-xl" style={{ backgroundColor: theme.colors.primarySoft }}>
                                            <Text className="uppercase tracking-wide text-[12px] font-bold" style={{ color: theme.colors.primary, fontFamily: theme.font.bold }}>
                                                Retry
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>
                            ) : (
                                <>
                                    <Text className="text-[13px] mb-4" style={{ fontFamily: theme.font.regular, color: theme.colors.textMuted }}>
                                        Enter your M-Pesa or Airtel Money number. You will receive an STK push to authorize the payment.
                                    </Text>

                                    <View className="flex-row items-center rounded-xl border px-3 h-12" style={{ borderColor, backgroundColor: inputBg }}>
                                        <Smartphone size={18} color={theme.colors.textMuted} />
                                        <TextInput
                                            placeholder="e.g. 0712345678"
                                            placeholderTextColor={theme.colors.textSubtle}
                                            keyboardType="phone-pad"
                                            value={phone}
                                            onChangeText={setPhone}
                                            editable={!loading}
                                            className="flex-1 h-full ml-2 text-base md:text-sm outline-none"
                                            style={{ fontFamily: theme.font.medium, color: theme.colors.text }}
                                        />
                                    </View>

                                    {/* Number of months */}
                                    <Text className="text-[13px] mt-5 mb-2 font-bold" style={{ fontFamily: theme.font.bold, color: theme.colors.text }}>
                                        Renew for
                                    </Text>
                                    <View className="flex-row items-center gap-2">
                                        <Pressable
                                            onPress={() => applyMonths(months - 1)}
                                            disabled={loading || months <= MIN_MONTHS}
                                            accessibilityRole="button"
                                            accessibilityLabel="Fewer months"
                                            className="w-12 h-12 rounded-xl border items-center justify-center"
                                            style={{ borderColor, backgroundColor: inputBg, opacity: months <= MIN_MONTHS ? 0.4 : 1 }}
                                        >
                                            <Minus size={18} color={theme.colors.text} />
                                        </Pressable>

                                        <View className="flex-1 flex-row items-center rounded-xl border px-3 h-12" style={{ borderColor, backgroundColor: inputBg }}>
                                            <CalendarDays size={18} color={theme.colors.textMuted} />
                                            <TextInput
                                                keyboardType="number-pad"
                                                value={monthsText}
                                                onChangeText={handleMonthsTextChange}
                                                onBlur={() => applyMonths(months)}
                                                editable={!loading}
                                                maxLength={2}
                                                selectTextOnFocus
                                                accessibilityLabel="Number of months"
                                                className="flex-1 h-full ml-2 text-base md:text-sm text-center outline-none"
                                                style={{ fontFamily: theme.font.bold, color: theme.colors.text }}
                                            />
                                            <Text className="text-[13px]" style={{ fontFamily: theme.font.medium, color: theme.colors.textMuted }}>
                                                {months === 1 ? "month" : "months"}
                                            </Text>
                                        </View>

                                        <Pressable
                                            onPress={() => applyMonths(months + 1)}
                                            disabled={loading || months >= MAX_MONTHS}
                                            accessibilityRole="button"
                                            accessibilityLabel="More months"
                                            className="w-12 h-12 rounded-xl border items-center justify-center"
                                            style={{ borderColor, backgroundColor: inputBg, opacity: months >= MAX_MONTHS ? 0.4 : 1 }}
                                        >
                                            <Plus size={18} color={theme.colors.text} />
                                        </Pressable>
                                    </View>
                                    <Text className="text-xs mt-1.5 ml-1" style={{ fontFamily: theme.font.regular, color: theme.colors.textSubtle }}>
                                        {MIN_MONTHS}–{MAX_MONTHS} months · added on top of any time you have left
                                    </Text>

                                    {/* Total */}
                                    {totalAmount !== null && (
                                        <View className="mt-4 p-3 rounded-xl flex-row items-center justify-between" style={{ backgroundColor: theme.colors.surfaceAlt }}>
                                            <Text className="text-[13px]" style={{ fontFamily: theme.font.medium, color: theme.colors.textMuted }}>
                                                KES {monthlyFee.toLocaleString()} × {months}
                                            </Text>
                                            <Text className="text-base font-bold" style={{ fontFamily: theme.font.bold, color: theme.colors.text }}>
                                                KES {totalAmount.toLocaleString()}
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}
            </AdminSheet>

            <ApiResponseModal
                isOpen={apiError.isOpen}
                variant="error"
                title={apiError.title}
                envelope={apiError.envelope}
                fallbackMessage={apiError.fallbackMessage}
                onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                closeLabel="Dismiss"
            />
        </>
    );
}