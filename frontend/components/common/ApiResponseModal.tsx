// components/common/ApiResponseModal.tsx
//
// Generic modal for displaying a server response envelope.
//
// Envelope shape (loosely enforced — missing fields are fine):
//   {
//     response_code: "0" | "1" | string,
//     response_message: string | null,
//     errors: string[] | Record<string, string[]> | null
//   }
//
// The envelope may live at the top level or under `.data`. The
// extractor handles both. When the request never reached the
// server, pass the free-text `fallbackMessage` and leave the
// envelope null.
//
// Usage:
//
//   <ApiResponseModal
//       isOpen={showError}
//       variant="error"
//       title="Payment failed"
//       subtitle={orderRef}
//       envelope={pollingResponse}
//       fallbackMessage={pollingError}
//       onRetry={() => closePolling()}
//       onClose={handleClose}
//   />
//
// Delete `PaymentErrorModal.tsx` — this replaces it.

import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

/* =========================================================
 * Envelope
 * ======================================================= */

export interface ApiResponseEnvelope {
    response_code: string | null;
    response_message: string | null;
    errors: any;
}

/**
 * Pull the standard response fields off any response shape.
 * Handles unwrapped (`res.response_code`) and wrapped
 * (`res.data.response_code`) bodies, plus DRF-style
 * `message` / `detail` fallbacks.
 */
export function extractEnvelope(res: any): ApiResponseEnvelope {
    const data = res?.data ?? res ?? {};

    const response_code =
        data?.response_code !== undefined &&
            data?.response_code !== null
            ? String(data.response_code)
            : null;

    const response_message =
        typeof data?.response_message === 'string'
            ? data.response_message
            : typeof data?.message === 'string'
                ? data.message
                : typeof data?.detail === 'string'
                    ? data.detail
                    : null;

    const errors =
        data?.errors !== undefined && data?.errors !== null
            ? data.errors
            : null;

    return { response_code, response_message, errors };
}

export type ResponseKind = 'success' | 'error';

/**
 * Classify an envelope as success or error.
 * Default success code is "0"; override per-endpoint if needed.
 *
 *   response_code === successCode → 'success'
 *   anything else, including null → 'error'
 */
export function routeEnvelope(
    env: ApiResponseEnvelope | null,
    opts?: { successCode?: string }
): ResponseKind {
    const successCode = opts?.successCode ?? '0';
    if (env?.response_code === successCode) return 'success';
    return 'error';
}

/** Convenience wrapper: is this envelope a success? */
export function responseIsSuccess(
    env: ApiResponseEnvelope | null,
    successCode = '0'
): boolean {
    return routeEnvelope(env, { successCode }) === 'success';
}

/* =========================================================
 * Modal
 * ======================================================= */

export interface ApiResponseModalProps {
    isOpen: boolean;
    /** 'error' (default) or 'success'. */
    variant?: 'error' | 'success';
    /** Headline, e.g. "Payment failed" or "Stock updated". */
    title?: string;
    /** Small mono line below the title, e.g. order / entity reference. */
    subtitle?: string;
    /**
     * Server envelope. When null, only `fallbackMessage` is shown.
     */
    envelope: ApiResponseEnvelope | null;
    /**
     * Free-text fallback for exceptions that never reached the
     * server (network errors, timeouts, client-side validation).
     */
    fallbackMessage?: string | null;
    onClose: () => void;
    /** Optional. Hides the retry button when not provided. */
    onRetry?: () => void;
    retryLabel?: string;
    closeLabel?: string;
}

export default function ApiResponseModal({
    isOpen,
    variant = 'error',
    title,
    subtitle,
    envelope,
    fallbackMessage,
    onClose,
    onRetry,
    retryLabel = 'Try again',
    closeLabel = 'Close',
}: ApiResponseModalProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    if (!isOpen) return null;

    const isError = variant === 'error';
    const accent = isError ? '#f43f5e' : '#10b981';
    const accentBg = isError
        ? 'rgba(244,63,94,0.08)'
        : 'rgba(16,185,129,0.08)';
    const accentBorder = isError
        ? 'rgba(244,63,94,0.20)'
        : 'rgba(16,185,129,0.20)';

    const defaultTitle = isError
        ? 'Something went wrong'
        : 'Success';

    const message =
        envelope?.response_message ?? fallbackMessage ?? null;

    const code = envelope?.response_code ?? null;
    const errors = envelope?.errors ?? null;
    const hasErrorList = hasErrors(errors);

    const showRetry = !!onRetry;

    return (
        <Modal
            visible={isOpen}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-center items-center p-4 bg-black/60">
                <View
                    className="w-full max-w-sm rounded-2xl p-6 border items-center flex-col"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* ---------- Icon ---------- */}
                    <View
                        className="w-14 h-14 rounded-full items-center justify-center mb-4"
                        style={{
                            backgroundColor: `${accent}1a`,
                            borderWidth: 1,
                            borderColor: `${accent}33`,
                        }}
                    >
                        <Text
                            style={{
                                color: accent,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xl,
                            }}
                        >
                            {isError ? '✕' : '✓'}
                        </Text>
                    </View>

                    {/* ---------- Title ---------- */}
                    <Text
                        className="uppercase tracking-wide text-center"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.lg,
                        }}
                    >
                        {title ?? defaultTitle}
                    </Text>

                    {subtitle ? (
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
                            {subtitle}
                        </Text>
                    ) : null}

                    {/* ---------- Details card ---------- */}
                    <View
                        className="w-full p-3 rounded-xl mt-3.5"
                        style={{
                            backgroundColor: accentBg,
                            borderWidth: 1,
                            borderColor: accentBorder,
                        }}
                    >
                        {message ? (
                            <Text
                                className="text-center"
                                style={{
                                    color: accent,
                                    fontFamily: theme.font.semibold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                {message}
                            </Text>
                        ) : null}

                        {code ? (
                            <Text
                                className="text-center mt-1"
                                style={{
                                    color: accent,
                                    fontFamily: theme.font.mono,
                                    fontSize: theme.fontSize.xs,
                                    opacity: 0.75,
                                }}
                            >
                                code: {code}
                            </Text>
                        ) : null}

                        {hasErrorList ? (
                            <View className="mt-2.5">
                                <Text
                                    className="uppercase tracking-widest mb-1"
                                    style={{
                                        color: accent,
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
                                    <ErrorList
                                        errors={errors}
                                        theme={theme}
                                        accent={accent}
                                    />
                                </ScrollView>
                            </View>
                        ) : null}

                        {!message && !hasErrorList ? (
                            <Text
                                className="text-center"
                                style={{
                                    color: accent,
                                    fontFamily: theme.font.mono,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {isError
                                    ? 'The request could not be completed.'
                                    : 'Operation completed successfully.'}
                            </Text>
                        ) : null}
                    </View>

                    {/* ---------- Actions ---------- */}
                    <View className="w-full flex-row gap-2 mt-5">
                        <Pressable
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel={closeLabel}
                            className="flex-1 h-11 rounded-xl border items-center justify-center"
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
                                {closeLabel}
                            </Text>
                        </Pressable>

                        {showRetry ? (
                            <Pressable
                                onPress={onRetry}
                                accessibilityRole="button"
                                accessibilityLabel={retryLabel}
                                className="flex-1 h-11 rounded-xl items-center justify-center"
                                style={{
                                    backgroundColor: theme.primary,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    {retryLabel}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Errors
 * ======================================================= */

export function hasErrors(errors: any): boolean {
    if (!errors) return false;
    if (Array.isArray(errors)) return errors.length > 0;
    if (typeof errors === 'object') {
        return Object.keys(errors).length > 0;
    }
    return false;
}

function ErrorList({
    errors,
    theme,
    accent,
}: {
    errors: any;
    theme: ThemeShape;
    accent: string;
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
                        color: accent,
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