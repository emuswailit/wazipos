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

import { useAuth } from '@/context/AuthContext';
import { fieldErrors, prettyField } from '@/utils/apiFeedback';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react-native';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

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

/* =========================================================
 * Modal
 * ======================================================= */

interface ApiResponseModalProps {
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
    const { width } = useWindowDimensions();
    const isError = variant === 'error';
    const color = isError ? theme.danger : theme.success;
    const Icon = isError ? XCircle : CheckCircle2;
    const message = envelope?.response_message || fallbackMessage || (isError ? 'Something went wrong. Please try again.' : 'Done.');
    const list = fieldErrors({ errors: envelope?.errors });
    const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;

    return (
        <Modal visible={isOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: isDarkMode ? 'rgba(2,6,23,0.72)' : 'rgba(11,23,51,0.45)' }}>
                <View
                    accessibilityRole="alert"
                    style={{
                        width: '100%', maxWidth: Math.min(460, width - 40), backgroundColor: theme.panel,
                        borderRadius: 24, borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
                        shadowColor: '#0b1733', shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 24,
                    }}
                >
                    <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 22, paddingBottom: 8, alignItems: 'center' }}>
                        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: `${color}1c`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <Icon size={26} color={color} strokeWidth={2.2} />
                        </View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17, textAlign: 'center', letterSpacing: -0.2 }}>
                            {title ?? (isError ? 'Request failed' : 'Success')}
                        </Text>
                        {subtitle ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.mono ?? theme.font.medium, fontSize: 12, marginTop: 4 }}>{subtitle}</Text> : null}
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>{message}</Text>
                        {list.length ? (
                            <View style={{ alignSelf: 'stretch', marginTop: 16, borderRadius: 16, backgroundColor: `${color}12`, padding: 14, gap: 10 }}>
                                {list.map((e, i) => (
                                    <View key={`${e.field}-${i}`} style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 7 }} />
                                        <View style={{ flex: 1 }}>
                                            {e.field ? <Text style={{ color, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>{prettyField(e.field)}</Text> : null}
                                            <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13.5, lineHeight: 19 }}>{e.message}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingTop: 12 }}>
                        {onRetry ? (
                            <Pressable onPress={onRetry} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: theme.surfaceAlt, ...pointer }}>
                                <RefreshCw size={15} color={theme.text} strokeWidth={2.3} />
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{retryLabel}</Text>
                            </Pressable>
                        ) : null}
                        <Pressable onPress={onClose} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, ...pointer }}>
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14.5 }}>{closeLabel}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
