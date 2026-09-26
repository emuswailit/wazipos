// components/common/PaymentMethodSelector.tsx
//
// Universal payment method selector.
// - Data source: usePaymentMethodsSync()
// - Formik-aware via `name` (falls back to controlled mode)
// - Emits the full PaymentMethodItem on select
// - Optional M-Pesa (mobile money) phone field
// - Mobile Money requires internet — auto-blocked when offline
// - Evenly spread pills, NativeWind layout, useAuth() colors

import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import type { PaymentMethodItem } from '@/databases/types';
import { useFormikContext } from 'formik';
import React, { useEffect, useMemo } from 'react';
import {
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */
export interface PaymentMethodSelectorProps {
    name?: string;
    mpesaField?: string;
    onAfterSelect?: (method: PaymentMethodItem) => void;

    value?: PaymentMethodItem | null;
    onChange?: (method: PaymentMethodItem | null) => void;
    mpesaNumber?: string;
    onMpesaNumberChange?: (value: string) => void;
    error?: string;

    label?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    filter?: (m: PaymentMethodItem) => boolean;
    testID?: string;
}

/* =========================================================
 * Component
 * ======================================================= */
export function PaymentMethodSelector(
    props: PaymentMethodSelectorProps
) {
    if (!props.name) {
        return <ControlledSelector {...props} />;
    }
    return <FormikSelector {...props} />;
}

/* =========================================================
 * Formik wrapper
 * ======================================================= */
function FormikSelector({
    name,
    mpesaField = 'mpesa_number',
    onAfterSelect,
    ...rest
}: PaymentMethodSelectorProps) {
    const formik = useFormikContext<any>();

    const value: PaymentMethodItem | null =
        formik.values?.[name!]
            ? ({
                id: String(formik.values?.[name!]),
            } as any)
            : null;

    const mpesaNumber = String(
        formik.values?.[mpesaField] ?? ''
    );

    const error: string | undefined =
        formik.touched?.[name!] && formik.errors?.[name!]
            ? String(formik.errors[name!])
            : undefined;

    const handleChange = (
        method: PaymentMethodItem | null
    ) => {
        formik.setFieldValue(name!, method?.id ?? '');
        formik.setFieldTouched(name!, true, false);
        formik.validateField(name!);
        if (method) onAfterSelect?.(method);
    };

    const handleMpesaChange = (next: string) => {
        formik.setFieldValue(mpesaField, next);
        formik.setFieldTouched(mpesaField, true, false);
    };

    return (
        <SelectorInner
            {...rest}
            value={value}
            onChange={handleChange}
            mpesaNumber={mpesaNumber}
            onMpesaNumberChange={handleMpesaChange}
            error={error}
        />
    );
}

/* =========================================================
 * Controlled wrapper
 * ======================================================= */
function ControlledSelector(
    props: PaymentMethodSelectorProps
) {
    return (
        <SelectorInner
            {...props}
            value={props.value ?? null}
            onChange={props.onChange}
            mpesaNumber={props.mpesaNumber ?? ''}
            onMpesaNumberChange={
                props.onMpesaNumberChange
            }
            error={props.error}
        />
    );
}

/* =========================================================
 * Inner — pure UI
 * ======================================================= */
interface SelectorInnerProps {
    value: PaymentMethodItem | null;
    onChange?: (method: PaymentMethodItem | null) => void;
    mpesaNumber: string;
    onMpesaNumberChange?: (v: string) => void;
    error?: string;

    label?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    filter?: (m: PaymentMethodItem) => boolean;
    testID?: string;
}

function SelectorInner({
    value,
    onChange,
    mpesaNumber,
    onMpesaNumberChange,
    error: controlledError,

    label = 'Payment Method',
    helperText,
    required,
    disabled,
    filter,
    testID,
}: SelectorInnerProps) {
    const { theme, isDarkMode } = useAuth();
    const { isOnline } = useNetworkStatus();
    const { paymentMethodsList } = usePaymentMethodsSync();

    /* -------- Filter methods -------- */
    const methods = useMemo(() => {
        let list = paymentMethodsList ?? [];
        if (filter) list = list.filter(filter);
        return list.filter((m) => m.active !== false);
    }, [paymentMethodsList, filter]);

    /* -------- Selected method -------- */
    const selectedId = value?.id ?? '';
    const selectedMethod = useMemo(
        () => methods.find((m) => m.id === selectedId) ?? null,
        [methods, selectedId]
    );

    /* -------- Detect M-Pesa style -------- */
    const isMobileMoneyMethod = (m: PaymentMethodItem | null) =>
        m != null &&
        String(m.title ?? '')
            .toUpperCase()
            .includes('MOBILE');

    const showMpesa = isMobileMoneyMethod(selectedMethod);

    /* -------- Auto-deselect MOBILE MONEY when offline -------- */
    useEffect(() => {
        if (isOnline) return;
        if (!selectedMethod) return;

        if (isMobileMoneyMethod(selectedMethod)) {
            onChange?.(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    /* -------- Theme -------- */
    const borderColor = isDarkMode ? '#334155' : '#cbd5e1';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const placeholderColor = isDarkMode
        ? '#64748b'
        : '#94a3b8';
    const danger = '#ef4444';

    const fieldError = controlledError;

    return (
        <View className="mb-5" testID={testID}>
            {/* -------- Label -------- */}
            {label ? (
                <View className="flex-row items-center mb-2">
                    <Text
                        className="uppercase tracking-wide text-[10px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        {label}
                    </Text>
                    {required ? (
                        <Text
                            className="text-[10px] ml-1"
                            style={{
                                color: danger,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            *
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* -------- Methods -------- */}
            {methods.length === 0 ? (
                <Text
                    className="text-xs italic"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                    }}
                >
                    No payment methods available.
                </Text>
            ) : (
                <View className="flex-row items-stretch gap-2 w-full">
                    {methods.map((method) => {
                        const isSelected =
                            selectedId === method.id;

                        const isMobile =
                            isMobileMoneyMethod(method);

                        const blockedByNetwork =
                            !isOnline && isMobile;

                        return (
                            <Pressable
                                key={method.id}
                                onPress={() => {
                                    if (blockedByNetwork)
                                        return;
                                    onChange?.(method);
                                }}
                                activeOpacity={
                                    blockedByNetwork ? 1 : 0.8
                                }
                                disabled={
                                    disabled ||
                                    blockedByNetwork
                                }
                                className="flex-1 flex-row items-center justify-center gap-x-2 rounded-xl border shadow-sm px-2 h-11"
                                style={{
                                    backgroundColor:
                                        isSelected
                                            ? theme.primary
                                            : inputBg,
                                    borderColor: isSelected
                                        ? theme.primary
                                        : blockedByNetwork
                                            ? 'rgba(148,163,184,0.35)'
                                            : borderColor,
                                    opacity:
                                        disabled ||
                                            blockedByNetwork
                                            ? 0.5
                                            : 1,
                                }}
                            >
                                <View
                                    className="w-3.5 h-3.5 rounded-full border items-center justify-center"
                                    style={{
                                        borderColor: isSelected
                                            ? '#fff'
                                            : theme.textDark,
                                    }}
                                >
                                    {isSelected ? (
                                        <View className="w-2 h-2 rounded-full bg-white" />
                                    ) : null}
                                </View>

                                <Text
                                    className="text-xs font-black uppercase tracking-wide"
                                    numberOfLines={1}
                                    style={{
                                        color: isSelected
                                            ? '#fff'
                                            : theme.text,
                                        fontFamily:
                                            theme.font.bold,
                                    }}
                                >
                                    {method.title}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            )}

            {/* -------- Offline hint -------- */}
            {!isOnline && methods.length > 0 ? (
                <View
                    className="mt-2 rounded-lg px-3 py-2"
                    style={{
                        backgroundColor:
                            'rgba(251,191,36,0.15)',
                        borderWidth: 1,
                        borderColor:
                            'rgba(251,191,36,0.4)',
                    }}
                >
                    <Text
                        className="text-[11px]"
                        style={{
                            color: isDarkMode
                                ? '#fbbf24'
                                : '#b45309',
                            fontFamily: theme.font.medium,
                        }}
                    >
                        📡 Offline — Mobile Money requires
                        internet. Use CASH or CREDIT.
                    </Text>
                </View>
            ) : null}

            {/* -------- M-Pesa phone -------- */}
            {showMpesa ? (
                <View className="mt-4 w-full">
                    <Text
                        className="text-[10px] font-black uppercase mb-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        M-Pesa Mobile Subscriber Phone *
                    </Text>
                    <TextInput
                        keyboardType="phone-pad"
                        value={mpesaNumber}
                        onChangeText={(v) =>
                            onMpesaNumberChange?.(v)
                        }
                        placeholder="e.g. 07XXXXXXXX"
                        placeholderTextColor={placeholderColor}
                        editable={!disabled}
                        className="w-full border rounded-xl px-3.5 h-11 text-sm font-semibold"
                        style={{
                            backgroundColor: inputBg,
                            borderColor,
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            ...(Platform.OS === 'web'
                                ? ({
                                    outlineStyle: 'none',
                                } as any)
                                : null),
                        }}
                    />
                </View>
            ) : null}

            {/* -------- Error / helper -------- */}
            {fieldError ? (
                <Text
                    className="mt-1 text-[11px]"
                    style={{
                        color: danger,
                        fontFamily: theme.font.medium,
                    }}
                >
                    {fieldError}
                </Text>
            ) : helperText ? (
                <Text
                    className="mt-1 text-[11px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        opacity: 0.75,
                    }}
                >
                    {helperText}
                </Text>
            ) : null}
        </View>
    );
}