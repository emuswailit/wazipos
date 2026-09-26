// components/common/CustomTextField.tsx
//
// Universal text input with label, error, and theme from useAuth().
// - React Native (iOS/Android) + React Native Web
// - NativeWind for layout, useAuth() for colors
// - Formik-aware via `name` prop (falls back to controlled mode)
// - Clears on focus, restores on blur if untouched

import { useAuth } from '@/context/AuthContext';
import { useFocusClear } from '@/hooks/useFocusClear';
import { useFormikContext } from 'formik';
import React from 'react';
import {
    Platform,
    Text,
    TextInput,
    View,
    type StyleProp,
    type TextInputProps,
    type ViewStyle,
} from 'react-native';


export interface CustomTextFieldProps {
    /* -------- Formik integration -------- */
    name?: string;
    transform?: (raw: string) => any;
    format?: (value: any) => string;
    showErrorOnlyIfTouched?: boolean;

    /* -------- Controlled mode (when `name` is omitted) -------- */
    value?: string;
    onChangeText?: (v: string) => void;
    onBlur?: TextInputProps['onBlur'];
    error?: string;

    /* -------- Common -------- */
    label?: string;
    placeholder?: string;
    keyboardType?: TextInputProps['keyboardType'];
    autoCapitalize?: TextInputProps['autoCapitalize'];
    autoCorrect?: boolean;
    multiline?: boolean;
    numberOfLines?: number;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    secureTextEntry?: boolean;
    returnKeyType?: TextInputProps['returnKeyType'];
    onSubmitEditing?: TextInputProps['onSubmitEditing'];
    rightAdornment?: React.ReactNode;
    leftAdornment?: React.ReactNode;
    /** If true, the field will not restore the previous value
     *  on blur when the user doesn't type anything. Default false. */
    alwaysClearOnFocus?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
}

export function CustomTextField({
    // Formik
    name,
    transform,
    format,
    showErrorOnlyIfTouched = true,

    // Controlled
    value: controlledValue,
    onChangeText: controlledOnChange,
    onBlur: controlledOnBlur,
    error: controlledError,

    // Common
    label,
    placeholder,
    keyboardType,
    autoCapitalize,
    autoCorrect,
    multiline,
    numberOfLines,
    helperText,
    required,
    disabled,
    secureTextEntry,
    returnKeyType,
    onSubmitEditing,
    rightAdornment,
    leftAdornment,
    alwaysClearOnFocus = false,
    style,
    testID,
}: CustomTextFieldProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    /* -------- Effective value -------- */
    const fieldValue: any = isFormik
        ? formik.values?.[name!]
        : controlledValue;

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

    /* -------- Display string (formatted) -------- */
    const displayString: string = format
        ? format(fieldValue)
        : fieldValue == null
            ? ''
            : String(fieldValue);

    /* -------- Write back to Formik or controlled -------- */
    const handleChange = (raw: string) => {
        const next = transform ? transform(raw) : raw;
        if (isFormik) {
            formik.setFieldValue(name!, next);
        } else {
            controlledOnChange?.(raw);
        }
    };

    const handleBlur = (e: any) => {
        if (isFormik) {
            formik.setFieldTouched(name!, true, false);
        }
        controlledOnBlur?.(e);
    };

    /* -------- Focus-clear behaviour -------- */
    const { displayValue, onFocus, onChange, onBlur } =
        useFocusClear({
            value: displayString,
            setValue: (next) => handleChange(next),
            alwaysClear: alwaysClearOnFocus,
        });

    const handleBlurWrapper = (e: any) => {
        onBlur();
        handleBlur(e);
    };

    /* -------- Theme -------- */
    const baseBorder = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const danger = '#ef4444';
    const borderColor = fieldError ? danger : baseBorder;

    return (
        <View className="mb-3" style={style}>
            {/* -------- Label -------- */}
            {label ? (
                <View className="flex-row items-center mb-1">
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

            {/* -------- Input row -------- */}
            <View
                className="flex-row items-center rounded-xl border"
                style={{
                    borderColor,
                    backgroundColor: inputBg,
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                {leftAdornment ? (
                    <View className="pl-3">{leftAdornment}</View>
                ) : null}

                <TextInput
                    testID={testID}
                    value={displayValue}
                    onChangeText={onChange}
                    onFocus={onFocus}
                    onBlur={handleBlurWrapper}
                    placeholder={placeholder}
                    placeholderTextColor="#94a3b8"
                    keyboardType={keyboardType ?? 'default'}
                    autoCapitalize={autoCapitalize ?? 'sentences'}
                    autoCorrect={autoCorrect ?? false}
                    multiline={multiline}
                    numberOfLines={numberOfLines}
                    editable={!disabled}
                    secureTextEntry={secureTextEntry}
                    returnKeyType={returnKeyType}
                    onSubmitEditing={onSubmitEditing}
                    className={`flex-1 py-2.5 ${leftAdornment ? 'pl-2' : 'pl-3'
                        } ${rightAdornment ? 'pr-2' : 'pr-3'}`}
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                        minHeight: multiline
                            ? Math.max(
                                80,
                                (numberOfLines ?? 4) * 22
                            )
                            : 42,
                        textAlignVertical: multiline
                            ? 'top'
                            : 'center',
                        paddingTop: multiline ? 10 : undefined,
                        paddingBottom: multiline ? 10 : undefined,
                        ...(Platform.OS === 'web'
                            ? ({ outlineStyle: 'none' } as any)
                            : null),
                    }}
                />

                {rightAdornment ? (
                    <View className="pr-1.5">
                        {rightAdornment}
                    </View>
                ) : null}
            </View>

            {/* -------- Error / helper -------- */}
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
            ) : helperText ? (
                <Text
                    className="mt-1"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                        opacity: 0.75,
                    }}
                >
                    {helperText}
                </Text>
            ) : null}
        </View>
    );
}