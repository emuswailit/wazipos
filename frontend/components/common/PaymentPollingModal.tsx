// components/common/PaymentPollingModal.tsx
//
// Polling status surface for an M-Pesa STK push.
//
// Lifecycle:
//   1. Modal opens with `serverResponse` = the initiate response.
//   2. If `serverResponse.response_code !== "0"` (or `serverError`
//      is set), jump to FAILED immediately. Do NOT poll.
//   3. If `serverResponse.response_code === "0"`, poll
//      `checkPaymentStatus()` every 3 s until SUCCESS / FAILED,
//      or the max polling window elapses.
//
// Failure is authoritative: any server error — at initiate or
// during polling — lands in FAILED, never in SUCCESS.

import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import type {
    PaymentStatusCheckResult,
    RetailerPaymentPollingResponse,
} from '@/hooks/useRecordPayment';

/* =========================================================
 * Constants
 * ======================================================= */

const TICK_MS = 3000;
const MAX_POLL_MS = 90_000;
const SUCCESS_LINGER_MS = 1500;

type Stage = 'SENDING' | 'WAITING' | 'SUCCESS' | 'FAILED';

interface StageConfig {
    title: string;
    description: (ctx: { mobileNumber: string }) => string;
    primary: string;
}

const STAGE_CONFIG: Record<Stage, StageConfig> = {
    SENDING: {
        title: 'Initiating STK push',
        description: ({ mobileNumber }) =>
            `Dispatching payment request to ${mobileNumber}…`,
        primary: '#0ea5e9',
    },
    WAITING: {
        title: 'Awaiting customer PIN',
        description: () =>
            'A prompt was sent to your phone. Enter your ' +
            'M-Pesa PIN on the handset to authorise the payment.',
        primary: '#0ea5e9',
    },
    SUCCESS: {
        title: 'Payment confirmed',
        description: () =>
            'Verification complete. The order ledger has been updated.',
        primary: '#10b981',
    },
    FAILED: {
        title: 'Transaction failed',
        description: () =>
            'The payment confirmation could not be completed.',
        primary: '#f43f5e',
    },
};

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    isOpen: boolean;
    orderRef: string;
    mobileNumber: string;
    serverResponse: RetailerPaymentPollingResponse | null;
    serverError: string | null;
    checkPaymentStatus: () => Promise<PaymentStatusCheckResult>;
    onClose: () => void;
    onSuccess: () => void;
}

/* =========================================================
 * Initiate gate
 * ======================================================= */

function initiateFailed(
    r: RetailerPaymentPollingResponse | null
): boolean {
    if (!r) return false;

    if (
        r.response_code !== null &&
        String(r.response_code) !== '0'
    ) {
        return true;
    }

    if (r.errors) {
        if (Array.isArray(r.errors) && r.errors.length > 0) return true;
        if (
            typeof r.errors === 'object' &&
            !Array.isArray(r.errors) &&
            Object.keys(r.errors).length > 0
        ) {
            return true;
        }
    }

    return false;
}

/* =========================================================
 * Component
 * ======================================================= */

export default function PaymentPollingModal({
    isOpen,
    orderRef,
    mobileNumber,
    serverResponse,
    serverError,
    checkPaymentStatus,
    onClose,
    onSuccess,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const [stage, setStage] = useState<Stage>('SENDING');
    const [ticks, setTicks] = useState(0);
    const [terminal, setTerminal] =
        useState<PaymentStatusCheckResult | null>(null);
    const [pollFailure, setPollFailure] = useState<string | null>(
        null
    );

    const onSuccessRef = useRef(onSuccess);
    useEffect(() => {
        onSuccessRef.current = onSuccess;
    });

    /* ---------------------------------------------------------
     * Gate
     * ------------------------------------------------------- */
    const gateFailed =
        !!serverError || initiateFailed(serverResponse);

    /* ---------------------------------------------------------
     * Lifecycle
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        setStage('SENDING');
        setTicks(0);
        setTerminal(null);
        setPollFailure(null);

        // Defensive: if the mount forgot to wire the checker,
        // fail with a clear reason rather than crashing.
        if (typeof checkPaymentStatus !== 'function') {
            setStage('FAILED');
            setPollFailure(
                'Payment status checker is unavailable. Contact support.'
            );
            return;
        }

        // Gate: do not poll if the initiate failed.
        if (gateFailed) {
            setStage('FAILED');
            return;
        }

        const startedAt = Date.now();
        let localTicks = 0;
        let stopped = false;

        const intervalRef: {
            current: ReturnType<
                typeof setInterval
            > | null
        } = { current: null };
        const lingerRef: {
            current: ReturnType<
                typeof setTimeout
            > | null
        } = { current: null };

        const stop = () => {
            if (stopped) return;
            stopped = true;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (lingerRef.current) {
                clearTimeout(lingerRef.current);
                lingerRef.current = null;
            }
        };

        const tick = async () => {
            if (stopped) return;

            localTicks += 1;
            setTicks(localTicks);

            if (Date.now() - startedAt >= MAX_POLL_MS) {
                setStage('FAILED');
                setPollFailure(
                    'Still pending after 90 seconds. Check your M-Pesa messages, then retry.'
                );
                stop();
                return;
            }

            if (localTicks === 1) {
                setStage('WAITING');
            }

            let result: PaymentStatusCheckResult;
            try {
                result = await checkPaymentStatus();
            } catch (e: any) {
                setStage('FAILED');
                setPollFailure(
                    e?.message ?? 'Status check failed.'
                );
                stop();
                return;
            }

            if (stopped) return;

            if (result.state === 'SUCCESS') {
                setTerminal(result);
                setStage('SUCCESS');
                lingerRef.current = setTimeout(() => {
                    onSuccessRef.current?.();
                }, SUCCESS_LINGER_MS);
                stop();
                return;
            }

            if (result.state === 'FAILED') {
                setTerminal(result);
                setStage('FAILED');
                stop();
                return;
            }
        };

        intervalRef.current = setInterval(tick, TICK_MS);

        return () => {
            stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, gateFailed, checkPaymentStatus]);

    /* ---------------------------------------------------------
     * Fail-fast if the gate flips mid-flight.
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;
        if (!gateFailed) return;
        setStage('FAILED');
    }, [gateFailed, isOpen]);

    /* ---------------- Derived ---------------- */

    const config = useMemo(() => STAGE_CONFIG[stage], [stage]);
    const elapsedSeconds = ticks * (TICK_MS / 1000);

    const onDismiss = useCallback(() => {
        onClose();
    }, [onClose]);

    if (!isOpen) return null;

    const showSpinner = stage === 'SENDING' || stage === 'WAITING';
    const showTelemetry = showSpinner;
    const showError = stage === 'FAILED';
    const showAction = stage === 'FAILED' || stage === 'SUCCESS';

    return (
        <Modal
            visible={isOpen}
            animationType="slide"
            transparent
            onRequestClose={onDismiss}
        >
            <View className="flex-1 justify-center items-center p-4 bg-black/60">
                <View
                    className="w-full max-w-sm rounded-2xl p-6 border items-center flex-col"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    <StageIcon
                        stage={stage}
                        theme={theme}
                        tint={config.primary}
                    />

                    <Text
                        className="uppercase tracking-wide text-center"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.lg,
                        }}
                    >
                        {config.title}
                    </Text>

                    <Text
                        className="text-center mt-1 px-2"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {config.description({ mobileNumber })}
                    </Text>

                    {orderRef ? (
                        <Text
                            className="mt-2 uppercase tracking-widest"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.mono,
                                fontSize: theme.fontSize.xs,
                                opacity: 0.7,
                            }}
                            numberOfLines={1}
                        >
                            {orderRef}
                        </Text>
                    ) : null}

                    {showTelemetry ? (
                        <Text
                            className="mt-3 uppercase tracking-wider"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.mono,
                                fontSize: theme.fontSize.xs,
                                opacity: 0.6,
                            }}
                        >
                            Polling… ({elapsedSeconds}s)
                        </Text>
                    ) : null}

                    {showError ? (
                        <FailurePanel
                            theme={theme}
                            serverResponse={serverResponse}
                            terminal={terminal}
                            pollFailure={pollFailure}
                            serverError={serverError}
                        />
                    ) : null}

                    {showAction ? (
                        <Pressable
                            onPress={onDismiss}
                            accessibilityRole="button"
                            accessibilityLabel={
                                stage === 'SUCCESS'
                                    ? 'Dismiss'
                                    : 'Return to safe screen'
                            }
                            className="w-full h-11 rounded-xl items-center justify-center mt-5"
                            style={{
                                backgroundColor:
                                    stage === 'SUCCESS'
                                        ? config.primary
                                        : theme.primary,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {stage === 'SUCCESS'
                                    ? 'Dismiss'
                                    : 'Return to safe screen'}
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Icon
 * ======================================================= */

function StageIcon({
    stage,
    theme,
    tint,
}: {
    stage: Stage;
    theme: ThemeShape;
    tint: string;
}) {
    const spinner = stage === 'SENDING' || stage === 'WAITING';

    return (
        <View
            className="w-14 h-14 rounded-full items-center justify-center mb-4"
            style={{
                backgroundColor: `${tint}1a`,
                borderWidth: 1,
                borderColor: `${tint}33`,
            }}
        >
            {spinner ? (
                <ActivityIndicator size="large" color={tint} />
            ) : (
                <Text
                    style={{
                        color: tint,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.xl,
                    }}
                >
                    {stage === 'SUCCESS' ? '✓' : '✕'}
                </Text>
            )}
        </View>
    );
}

/* =========================================================
 * Failure panel
 * ======================================================= */

function hasErrors(errors: any): boolean {
    if (!errors) return false;
    if (Array.isArray(errors)) return errors.length > 0;
    if (typeof errors === 'object') {
        return Object.keys(errors).length > 0;
    }
    return false;
}

function FailurePanel({
    theme,
    serverResponse,
    terminal,
    pollFailure,
    serverError,
}: {
    theme: ThemeShape;
    serverResponse: RetailerPaymentPollingResponse | null;
    terminal: PaymentStatusCheckResult | null;
    pollFailure: string | null;
    serverError: string | null;
}) {
    // Structured source — prefer the initiate response.
    const primary = serverResponse ?? null;
    const fallbackTerminal = terminal;

    const message =
        primary?.response_message ??
        fallbackTerminal?.response_message ??
        null;

    const code =
        primary?.response_code ??
        fallbackTerminal?.response_code ??
        null;

    const errors = hasErrors(primary?.errors)
        ? primary?.errors
        : hasErrors(fallbackTerminal?.errors)
            ? fallbackTerminal?.errors
            : null;

    const plainText = pollFailure ?? serverError ?? null;

    return (
        <View
            className="w-full p-3 rounded-xl mt-3.5"
            style={{
                backgroundColor: 'rgba(244,63,94,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(244,63,94,0.20)',
            }}
        >
            {/* Message */}
            {message ? (
                <Text
                    className="text-center"
                    style={{
                        color: '#f43f5e',
                        fontFamily: theme.font.semibold,
                        fontSize: theme.fontSize.sm,
                    }}
                >
                    {message}
                </Text>
            ) : null}

            {/* Response code */}
            {code ? (
                <Text
                    className="text-center mt-1"
                    style={{
                        color: '#f43f5e',
                        fontFamily: theme.font.mono,
                        fontSize: theme.fontSize.xs,
                        opacity: 0.75,
                    }}
                >
                    code: {code}
                </Text>
            ) : null}

            {/* Errors */}
            {errors ? (
                <View className="mt-2.5">
                    <Text
                        className="uppercase tracking-widest mb-1"
                        style={{
                            color: '#f43f5e',
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                            opacity: 0.8,
                        }}
                    >
                        Details
                    </Text>
                    <ScrollView
                        style={{ maxHeight: 140 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <ErrorList errors={errors} theme={theme} />
                    </ScrollView>
                </View>
            ) : null}

            {/* Fallback */}
            {!message && !errors ? (
                <Text
                    className="text-center"
                    style={{
                        color: '#f43f5e',
                        fontFamily: theme.font.mono,
                        fontSize: theme.fontSize.xs,
                    }}
                >
                    {plainText ??
                        'The payment confirmation could not be completed.'}
                </Text>
            ) : null}
        </View>
    );
}

function ErrorList({
    errors,
    theme,
}: {
    errors: any;
    theme: ThemeShape;
}) {
    const rows: { key: string; text: string }[] = [];

    if (Array.isArray(errors)) {
        errors.forEach((e, i) => {
            rows.push({
                key: `arr-${i}`,
                text: typeof e === 'string' ? e : JSON.stringify(e),
            });
        });
    } else if (errors && typeof errors === 'object') {
        Object.entries(errors).forEach(([field, val]) => {
            const text = Array.isArray(val)
                ? val.join(' · ')
                : String(val);
            rows.push({
                key: `field-${field}`,
                text: `${field}: ${text}`,
            });
        });
    }

    if (rows.length === 0) return null;

    return (
        <View>
            {rows.map((r) => (
                <Text
                    key={r.key}
                    style={{
                        color: '#f43f5e',
                        fontFamily: theme.font.regular,
                        fontSize: theme.fontSize.xs,
                        lineHeight: 16,
                        marginBottom: 3,
                    }}
                >
                    • {r.text}
                </Text>
            ))}
        </View>
    );
}