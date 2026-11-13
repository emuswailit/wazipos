// components/wholesalers/wholesalerReceiptsReturns/WholesalerReceiptReturnDecisionModal.tsx
//
// Decision form for a wholesaler receipt return.
//
// - Status selector at the top: Accept / Reject / Cancel.
// - Fields shown below change based on the selected status.
// - Return summary is read-only above the form.
//
// One modal, three modes — driven by a `status` field in `values`.

import type { WholesalerReturnRecord } from '@/api/wholesalersApi';
import { useAuth } from '@/context/AuthContext';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */

export type DecisionStatus = 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

interface WholesalerReceiptReturnDecisionModalProps {
    visible: boolean;
    target: WholesalerReturnRecord | null;
    submitting?: boolean;
    /** Decision pre-selected when the modal opens (e.g. from a Reject button). Default ACCEPTED. */
    initialStatus?: DecisionStatus;
    onClose: () => void;
    onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

/* =========================================================
 * Option copy
 * ======================================================= */

interface StatusOption {
    value: DecisionStatus;
    label: string;
    hint: string;
    tint: string;
}

const STATUS_OPTIONS: StatusOption[] = [
    {
        value: 'ACCEPTED',
        label: 'Accept',
        hint: 'Take the goods back into wholesaler inventory.',
        tint: '#10b981',
    },
    {
        value: 'REJECTED',
        label: 'Reject',
        hint: 'Close the return. No stock moves; reconcile later.',
        tint: '#f43f5e',
    },
    {
        value: 'CANCELLED',
        label: 'Cancel',
        hint: 'Reverse the retailer stock adjustment.',
        tint: '#64748b',
    },
];

/* =========================================================
 * Helpers
 * ======================================================= */

function fmt(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
}

/* =========================================================
 * Component
 * ======================================================= */

export function WholesalerReceiptReturnDecisionModal({
    visible,
    target,
    submitting = false,
    initialStatus = 'ACCEPTED',
    onClose,
    onSubmit,
}: WholesalerReceiptReturnDecisionModalProps) {
    const { theme, isDarkMode } = useAuth();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const initialValues = useMemo<Record<string, string>>(
        () => ({
            status: initialStatus,
            unit_price_refunded:
                target?.unit_price_refunded != null
                    ? String(target.unit_price_refunded)
                    : '',
            restocking_fee_percent:
                target?.restocking_fee_percent != null
                    ? String(target.restocking_fee_percent)
                    : '',
            notes: '',
            reason: '',
        }),
        [target, initialStatus],
    );

    const [values, setValues] = useState<Record<string, string>>(
        initialValues,
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (visible) {
            setValues(initialValues);
            setErrors({});
        }
    }, [visible, initialValues]);

    const setField = useCallback((key: string, value: string) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const status = (values.status as DecisionStatus) || 'ACCEPTED';
    const activeOption =
        STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

    /* -------- Validation -------- */
    const validate = useCallback((): boolean => {
        const next: Record<string, string> = {};

        if (status === 'ACCEPTED') {
            const refund = values.unit_price_refunded?.trim();
            if (refund) {
                const n = Number(refund);
                if (!Number.isFinite(n) || n < 0) {
                    next.unit_price_refunded =
                        'Refund must be a non-negative number';
                }
            }
            const fee = values.restocking_fee_percent?.trim();
            if (fee) {
                const n = Number(fee);
                if (!Number.isFinite(n) || n < 0 || n > 100) {
                    next.restocking_fee_percent =
                        'Restocking fee must be between 0 and 100';
                }
            }
        }

        setErrors(next);
        return Object.keys(next).length === 0;
    }, [status, values]);

    const handleSubmit = useCallback(async () => {
        if (!validate()) return;
        await onSubmit(values);
    }, [validate, onSubmit, values]);

    const canSubmit = !submitting && target != null;

    const submitLabel =
        status === 'ACCEPTED'
            ? 'Accept return'
            : status === 'REJECTED'
                ? 'Reject return'
                : 'Cancel return';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/50 justify-center items-center p-4">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    className="w-full max-w-2xl"
                >
                    <View
                        className="rounded-2xl overflow-hidden"
                        style={{
                            backgroundColor: theme.panel,
                            maxHeight: '88%',
                        }}
                    >
                        {/* Header */}
                        <View
                            className="px-5 py-3.5 border-b flex-row justify-between items-center"
                            style={{
                                backgroundColor: subBg,
                                borderBottomColor: borderColor,
                            }}
                        >
                            <View className="flex-1 min-w-0 pr-3">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.lg,
                                    }}
                                >
                                    Update return
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.regular,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                    numberOfLines={2}
                                >
                                    {activeOption.hint}
                                </Text>
                            </View>
                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Close form"
                                className="w-8 h-8 rounded-full items-center justify-center"
                                style={{ backgroundColor: theme.background }}
                            >
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        {/* Body */}
                        <ScrollView
                            className="flex-1"
                            contentContainerStyle={{ padding: 20 }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {/* ---- Read-only summary ---- */}
                            {target ? (
                                <View
                                    className="rounded-xl border p-3"
                                    style={{
                                        borderColor,
                                        backgroundColor: subBg,
                                    }}
                                >
                                    <SummaryRow
                                        label="Product"
                                        value={fmt(target.product_title)}
                                        theme={theme}
                                    />
                                    <SummaryRow
                                        label="Quantity"
                                        value={fmt(target.quantity)}
                                        theme={theme}
                                    />
                                    <SummaryRow
                                        label="Reason"
                                        value={fmt(target.reason)}
                                        theme={theme}
                                    />
                                    <SummaryRow
                                        label="Return type"
                                        value={fmt(target.return_type)}
                                        theme={theme}
                                    />
                                    <SummaryRow
                                        label="Justification"
                                        value={fmt(target.justification)}
                                        theme={theme}
                                    />
                                </View>
                            ) : null}

                            {/* ---- Status selector ---- */}
                            <Text
                                className="uppercase tracking-widest mb-2 mt-5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Status *
                            </Text>
                            <View className="flex-row flex-wrap gap-2">
                                {STATUS_OPTIONS.map((opt) => {
                                    const selected = status === opt.value;
                                    return (
                                        <Pressable
                                            key={opt.value}
                                            onPress={() =>
                                                setField('status', opt.value)
                                            }
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected,
                                            }}
                                            className="flex-1 min-w-[100px] min-h-[44px] rounded-xl border items-center justify-center"
                                            style={{
                                                borderColor: selected
                                                    ? opt.tint
                                                    : borderColor,
                                                backgroundColor: selected
                                                    ? `${opt.tint}15`
                                                    : inputBg,
                                            }}
                                        >
                                            <Text
                                                className="uppercase tracking-widest text-[11px]"
                                                style={{
                                                    color: selected
                                                        ? opt.tint
                                                        : theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                }}
                                            >
                                                {opt.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* ---- Accept-only fields ---- */}
                            {status === 'ACCEPTED' ? (
                                <>
                                    <FieldLabel theme={theme}>
                                        Unit price refunded
                                    </FieldLabel>
                                    <TextInput
                                        value={values.unit_price_refunded}
                                        onChangeText={(v) =>
                                            setField('unit_price_refunded', v)
                                        }
                                        placeholder="Leave blank to use original"
                                        placeholderTextColor="#94a3b8"
                                        keyboardType="numeric"
                                        autoCorrect={false}
                                        className="rounded-lg border px-3 text-sm"
                                        style={{
                                            borderColor:
                                                errors.unit_price_refunded
                                                    ? '#f43f5e'
                                                    : borderColor,
                                            backgroundColor: inputBg,
                                            color: theme.text,
                                            fontFamily: theme.font.medium,
                                            height: 40,
                                        }}
                                    />
                                    {errors.unit_price_refunded ? (
                                        <ErrorText theme={theme}>
                                            {errors.unit_price_refunded}
                                        </ErrorText>
                                    ) : null}

                                    <FieldLabel theme={theme}>
                                        Restocking fee (%)
                                    </FieldLabel>
                                    <TextInput
                                        value={values.restocking_fee_percent}
                                        onChangeText={(v) =>
                                            setField(
                                                'restocking_fee_percent',
                                                v,
                                            )
                                        }
                                        placeholder="0 – 100"
                                        placeholderTextColor="#94a3b8"
                                        keyboardType="numeric"
                                        autoCorrect={false}
                                        className="rounded-lg border px-3 text-sm"
                                        style={{
                                            borderColor:
                                                errors.restocking_fee_percent
                                                    ? '#f43f5e'
                                                    : borderColor,
                                            backgroundColor: inputBg,
                                            color: theme.text,
                                            fontFamily: theme.font.medium,
                                            height: 40,
                                        }}
                                    />
                                    {errors.restocking_fee_percent ? (
                                        <ErrorText theme={theme}>
                                            {errors.restocking_fee_percent}
                                        </ErrorText>
                                    ) : null}

                                    <FieldLabel theme={theme}>
                                        Notes
                                    </FieldLabel>
                                    <TextInput
                                        value={values.notes}
                                        onChangeText={(v) =>
                                            setField('notes', v)
                                        }
                                        placeholder="Optional note for the retailer…"
                                        placeholderTextColor="#94a3b8"
                                        multiline
                                        autoCorrect={false}
                                        className="rounded-lg border px-3 text-sm"
                                        style={{
                                            borderColor,
                                            backgroundColor: inputBg,
                                            color: theme.text,
                                            fontFamily: theme.font.medium,
                                            minHeight: 90,
                                            paddingTop: 8,
                                            textAlignVertical: 'top',
                                        }}
                                    />
                                </>
                            ) : (
                                <>
                                    {/* ---- Reject / Cancel ---- */}
                                    <FieldLabel theme={theme}>
                                        Reason (optional)
                                    </FieldLabel>
                                    <TextInput
                                        value={values.reason}
                                        onChangeText={(v) =>
                                            setField('reason', v)
                                        }
                                        placeholder={
                                            status === 'REJECTED'
                                                ? 'Why is this being rejected?'
                                                : 'Why is this being cancelled?'
                                        }
                                        placeholderTextColor="#94a3b8"
                                        multiline
                                        autoCorrect={false}
                                        className="rounded-lg border px-3 text-sm"
                                        style={{
                                            borderColor,
                                            backgroundColor: inputBg,
                                            color: theme.text,
                                            fontFamily: theme.font.medium,
                                            minHeight: 90,
                                            paddingTop: 8,
                                            textAlignVertical: 'top',
                                        }}
                                    />
                                </>
                            )}
                        </ScrollView>

                        {/* Footer */}
                        <View
                            className="p-4 border-t flex-row items-center gap-2"
                            style={{
                                backgroundColor: subBg,
                                borderTopColor: borderColor,
                            }}
                        >
                            <Pressable
                                onPress={onClose}
                                disabled={submitting}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: submitting }}
                                className="flex-1 h-10 rounded-xl border items-center justify-center"
                                style={{
                                    borderColor,
                                    opacity: submitting ? 0.5 : 1,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Close
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleSubmit}
                                disabled={!canSubmit}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !canSubmit }}
                                className="flex-1 h-10 rounded-xl items-center justify-center"
                                style={{
                                    backgroundColor: activeOption.tint,
                                    opacity: canSubmit ? 1 : 0.5,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    {submitting ? '…' : submitLabel}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Subcomponents
 * ======================================================= */

function SummaryRow({
    label,
    value,
    theme,
}: {
    label: string;
    value: string;
    theme: any;
}) {
    return (
        <View className="flex-row py-1">
            <Text
                className="w-32"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.xs,
                }}
            >
                {label}
            </Text>
            <Text
                className="flex-1"
                style={{
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.xs,
                }}
                numberOfLines={3}
            >
                {value}
            </Text>
        </View>
    );
}

function FieldLabel({
    theme,
    children,
}: {
    theme: any;
    children: React.ReactNode;
}) {
    return (
        <Text
            className="uppercase tracking-widest mb-1.5 mt-4"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
            }}
        >
            {children}
        </Text>
    );
}

function ErrorText({
    theme,
    children,
}: {
    theme: any;
    children: React.ReactNode;
}) {
    return (
        <Text
            className="mt-1"
            style={{
                color: '#f43f5e',
                fontFamily: theme.font.medium,
                fontSize: 11,
            }}
        >
            {children}
        </Text>
    );
}