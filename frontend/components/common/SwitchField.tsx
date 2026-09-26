// components/common/SwitchField.tsx
//
// Universal toggle field with label + hint + optional error.
// - React Native (iOS / Android) + React Native Web
// - Formik-aware via `name` (falls back to controlled when omitted)
// - NativeWind for layout, useAuth() for colors

import { useAuth } from '@/context/AuthContext';
import { useFormikContext } from 'formik';
import React from 'react';
import {
    Switch,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

export interface SwitchFieldProps {
    /* -------- Formik integration -------- */
    /** Formik field name. When provided, the switch reads its
     *  value from context and writes back via setFieldValue. */
    name?: string;
    /** Optional value transform before writing (rarely needed). */
    transform?: (v: boolean) => any;
    /** Only show errors when the field is touched. Default true. */
    showErrorOnlyIfTouched?: boolean;

    /* -------- Controlled mode (when `name` is omitted) -------- */
    value?: boolean;
    onChange?: (v: boolean) => void;
    error?: string;

    /* -------- Shared -------- */
    /** Primary label (rendered uppercase, small). */
    label?: string;
    /** Secondary hint below the label. */
    hint?: string;
    /** Show a red asterisk after the label. */
    required?: boolean;
    disabled?: boolean;
    /** Optional row layout: label on the left, switch on the right. */
    row?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
}

export function SwitchField({
    // Formik
    name,
    transform,
    showErrorOnlyIfTouched = true,

    // Controlled
    value: controlledValue,
    onChange: controlledOnChange,
    error: controlledError,

    // Shared
    label,
    hint,
    required,
    disabled,
    row = true,
    style,
    testID,
}: SwitchFieldProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    /* -------- Effective value -------- */
    const rawValue: boolean = isFormik
        ? !!formik.values?.[name!]
        : !!controlledValue;

    /* -------- Effective error -------- */
    const fieldError: string | undefined = isFormik
        ? showErrorOnlyIfTouched
            ? formik.touched?.[name!] && formik.errors?.[name!]
                ? String(formik.errors[name!])
                : undefined
            : formik.errors?.[name!]
                ? String(formik.errors[name!])
                : undefined
        : controlledError;

    /* -------- Theme -------- */
    const baseBorder = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const danger = '#ef4444';
    const borderColor = fieldError ? danger : baseBorder;

    /* -------- Change -------- */
    const handleChange = (next: boolean) => {
        const value = transform ? transform(next) : next;
        if (isFormik) {
            formik.setFieldValue(name!, value);
            formik.setFieldTouched(name!, true, false);
        } else {
            controlledOnChange?.(next);
        }
    };

    /* -------- Label block (reused in both layouts) -------- */
    const LabelBlock = (
        <View className={row ? 'flex-1 pr-3' : 'mb-2'}>
            {label ? (
                <View className="flex-row items-center">
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        {label}
                    </Text>
                    {required ? (
                        <Text
                            style={{
                                color: danger,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                marginLeft: 4,
                            }}
                        >
                            *
                        </Text>
                    ) : null}
                </View>
            ) : null}
            {hint ? (
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {hint}
                </Text>
            ) : null}
        </View>
    );

    const Toggle = (
        <Switch
            testID={testID}
            value={rawValue}
            onValueChange={handleChange}
            disabled={disabled}
            trackColor={{
                false: isDarkMode ? '#334155' : '#cbd5e1',
                true: theme.primary,
            }}
            thumbColor={
                // Android only — keeps the thumb white for consistency
                // with iOS. Ignored on web/iOS.
                '#ffffff'
            }
        />
    );

    /* -------- Render -------- */
    return (
        <View className="mb-3" style={style}>
            <View
                className={`rounded-xl border px-3 py-3 ${row
                        ? 'flex-row items-center justify-between'
                        : 'flex-col'
                    }`}
                style={{ backgroundColor: subBg, borderColor }}
            >
                {LabelBlock}
                {Toggle}
            </View>

            {fieldError ? (
                <Text
                    className="mt-1"
                    style={{
                        color: danger,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {fieldError}
                </Text>
            ) : null}
        </View>
    );
}