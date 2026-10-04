// components/common/DateField.tsx
//
// Universal date picker field.
// - Native: @react-native-community/datetimepicker (iOS spinner modal, Android calendar dialog)
// - Web: same component + a tiny <style> injection to theme the browser date input
// - Formik-aware via `name` (falls back to controlled when omitted)
// - NativeWind layout, useAuth() colors

import { useAuth } from '@/context/AuthContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFormikContext } from 'formik';
import React, { useEffect, useRef, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    Text,
    View,
} from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */
export interface DateFieldProps {
    /* -------- Formik integration -------- */
    name?: string;
    transform?: (raw: string) => any;
    format?: (value: any) => string;
    showErrorOnlyIfTouched?: boolean;

    /* -------- Controlled mode -------- */
    value?: string;
    onChangeText?: (v: string) => void;
    error?: string;

    /* -------- Common -------- */
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    helperText?: string;
}

/* =========================================================
 * Helpers
 * ======================================================= */
function parseDate(raw: string): Date | null {
    if (!raw) return null;
    const d = new Date(raw.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function prettyPrint(raw: string): string {
    const d = parseDate(raw);
    if (!d) return '';
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

/* =========================================================
 * Colour helper — hex + alpha → rgba
 * ======================================================= */
function alpha(hex: string, a: number): string {
    if (!hex) return `rgba(0,0,0,${a})`;
    const clean = hex.replace('#', '');
    const full =
        clean.length === 3
            ? clean
                .split('')
                .map((c) => c + c)
                .join('')
            : clean;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

/* =========================================================
 * Web-only style injection (runs once)
 * ======================================================= */
function useWebDateStyles(primary: string, isDark: boolean) {
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const doc: any =
            typeof document !== 'undefined' ? document : null;
        if (!doc) return;

        const id = 'wazi-datefield-styles';
        const existing = doc.getElementById(id);
        if (existing) existing.remove();

        const style = doc.createElement('style');
        style.id = id;
        style.textContent = `
            /* ---- CustomDateInput: hide the ugly default UA widgets ---- */
            input.wazi-date-input {
                appearance: none;
                -webkit-appearance: none;
                border: none;
                outline: none;
                background: transparent;
                width: 100%;
                font-family: inherit;
                font-size: 13.5px;
                font-weight: 500;
                letter-spacing: 0.2px;
                cursor: pointer;
            }
            input.wazi-date-input::-webkit-calendar-picker-indicator {
                cursor: pointer;
                opacity: 0.75;
                transition: opacity 120ms ease, transform 120ms ease;
                filter: ${isDark
                ? 'invert(75%) sepia(60%) saturate(2500%) hue-rotate(220deg) brightness(105%)'
                : 'invert(30%) sepia(90%) saturate(2500%) hue-rotate(220deg) brightness(95%)'};
            }
            input.wazi-date-input::-webkit-calendar-picker-indicator:hover {
                opacity: 1;
                transform: scale(1.08);
            }
            input.wazi-date-input::-webkit-datetime-edit-fields-wrapper {
                padding: 0;
            }
            input.wazi-date-input::-webkit-datetime-edit-text {
                color: ${isDark ? '#64748b' : '#94a3b8'};
                padding: 0 3px;
                font-weight: 400;
            }
            input.wazi-date-input::-webkit-datetime-edit-month-field,
            input.wazi-date-input::-webkit-datetime-edit-day-field,
            input.wazi-date-input::-webkit-datetime-edit-year-field {
                color: ${isDark ? '#f1f5f9' : '#0f172a'};
                padding: 3px 5px;
                border-radius: 6px;
                transition: background 120ms ease, color 120ms ease;
            }
            input.wazi-date-input::-webkit-datetime-edit-month-field:hover,
            input.wazi-date-input::-webkit-datetime-edit-day-field:hover,
            input.wazi-date-input::-webkit-datetime-edit-year-field:hover {
                background: ${alpha(primary, isDark ? 0.18 : 0.10)};
            }
            input.wazi-date-input::-webkit-datetime-edit-month-field:focus,
            input.wazi-date-input::-webkit-datetime-edit-day-field:focus,
            input.wazi-date-input::-webkit-datetime-edit-year-field:focus {
                background: ${alpha(primary, isDark ? 0.28 : 0.16)};
                color: ${primary};
                outline: none;
            }
            input.wazi-date-input:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        doc.head.appendChild(style);
    }, [primary, isDark]);
}

/* =========================================================
 * Component
 * ======================================================= */
export function DateField({
    name,
    transform,
    format,
    showErrorOnlyIfTouched = true,

    value: controlledValue,
    onChangeText: controlledOnChange,
    error: controlledError,

    label,
    placeholder = 'YYYY-MM-DD',
    required,
    disabled,
    helperText,
}: DateFieldProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    /* -------- Effective value -------- */
    const fieldValue: string = isFormik
        ? (formik.values?.[name!] as string) ?? ''
        : (controlledValue as string) ?? '';

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

    const displayValue = format
        ? format(fieldValue)
        : fieldValue ?? '';

    /* -------- Web style injection -------- */
    useWebDateStyles(theme.primary, isDarkMode);

    /* -------- Local state -------- */
    const [pickerOpen, setPickerOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [tempDate, setTempDate] = useState<Date>(
        () => parseDate(fieldValue) ?? new Date()
    );

    const webInputRef = useRef<any>(null);

    /* -------- Theme tokens -------- */
    const baseBorder = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const filledBg = isDarkMode ? '#0b1220' : '#ffffff';
    const danger = '#ef4444';

    const hasValue = !!fieldValue;
    const borderColor = fieldError
        ? danger
        : focused
            ? theme.primary
            : hasValue
                ? alpha(theme.primary, isDarkMode ? 0.35 : 0.25)
                : baseBorder;

    const shadowStyle =
        Platform.OS === 'web'
            ? focused
                ? ({
                    boxShadow: `0 0 0 3px ${alpha(
                        theme.primary,
                        0.15
                    )}, 0 1px 2px rgba(0,0,0,0.04)`,
                } as any)
                : ({
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                } as any)
            : null;

    /* -------- Value writer -------- */
    const setValue = (next: string) => {
        const value = transform ? transform(next) : next;
        if (isFormik) {
            formik.setFieldValue(name!, value);
            formik.setFieldTouched(name!, true, false);
        } else {
            controlledOnChange?.(next);
        }
    };

    const openPicker = () => {
        if (disabled) return;
        setTempDate(parseDate(fieldValue) ?? new Date());
        setPickerOpen(true);
    };

    /* ========================================================
     * Label + shell
     * ====================================================== */
    const Header = label ? (
        <View className="flex-row items-center mb-1.5">
            <Text
                className="uppercase"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.8,
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
    ) : null;

    const CalendarBadge = (
        <View
            style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: alpha(
                    theme.primary,
                    isDarkMode ? 0.18 : 0.10
                ),
                marginRight: 10,
            }}
        >
            <Text
                style={{
                    fontSize: 15,
                    color: theme.primary,
                }}
            >
                📅
            </Text>
        </View>
    );

    const ClearButton = hasValue && !disabled ? (
        <Pressable
            onPress={() => setValue('')}
            hitSlop={8}
            style={{
                marginLeft: 8,
                width: 26,
                height: 26,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDarkMode
                    ? 'rgba(148,163,184,0.12)'
                    : 'rgba(100,116,139,0.08)',
            }}
        >
            <Text
                style={{
                    color: theme.textDark,
                    fontSize: 12,
                    lineHeight: 14,
                }}
            >
                ✕
            </Text>
        </Pressable>
    ) : null;

    /* ========================================================
     * WEB
     * ====================================================== */
    if (Platform.OS === 'web') {
        return (
            <View className="mb-3">
                {Header}

                <View
                    className="flex-row items-center rounded-xl border"
                    style={{
                        borderColor,
                        backgroundColor: hasValue
                            ? filledBg
                            : inputBg,
                        opacity: disabled ? 0.55 : 1,
                        minHeight: 46,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        transitionProperty: 'border-color, box-shadow',
                        transitionDuration: '140ms',
                        ...(shadowStyle as any),
                    }}
                >
                    {CalendarBadge}

                    <input
                        ref={webInputRef}
                        className="wazi-date-input"
                        type="date"
                        value={fieldValue || ''}
                        onChange={(e) =>
                            setValue(e.target.value)
                        }
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        disabled={disabled}
                        placeholder={placeholder}
                    />

                    {ClearButton}
                </View>

                {fieldError ? (
                    <Text
                        className="mt-1.5"
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
                        className="mt-1.5"
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

    /* ========================================================
     * NATIVE (iOS / Android)
     * ====================================================== */
    return (
        <View className="mb-3">
            {Header}

            <Pressable
                onPress={openPicker}
                disabled={disabled}
                className="flex-row items-center rounded-xl border"
                style={{
                    borderColor,
                    backgroundColor: hasValue ? filledBg : inputBg,
                    opacity: disabled ? 0.55 : 1,
                    minHeight: 46,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                }}
            >
                {CalendarBadge}

                <Text
                    className="flex-1 py-2"
                    style={{
                        color: hasValue
                            ? theme.text
                            : '#94a3b8',
                        fontFamily: hasValue
                            ? theme.font.bold
                            : theme.font.medium,
                        fontSize: theme.fontSize.sm,
                        letterSpacing: hasValue ? 0.2 : 0,
                    }}
                    numberOfLines={1}
                >
                    {hasValue
                        ? prettyPrint(fieldValue)
                        : placeholder}
                </Text>

                {ClearButton}
            </Pressable>

            {/* Android: system calendar dialog */}
            {Platform.OS === 'android' && pickerOpen ? (
                <DateTimePicker
                    value={tempDate}
                    mode="date"
                    display="calendar"
                    onChange={(event: any, date?: Date) => {
                        setPickerOpen(false);
                        if (event.type === 'set' && date) {
                            setValue(toISODate(date));
                        }
                    }}
                />
            ) : null}

            {/* iOS: custom modal */}
            {Platform.OS === 'ios' ? (
                <Modal
                    visible={pickerOpen}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setPickerOpen(false)}
                >
                    <Pressable
                        onPress={() => setPickerOpen(false)}
                        className="flex-1 bg-black/60 items-center justify-center p-4"
                    >
                        <Pressable
                            onPress={(e) => e?.stopPropagation?.()}
                            className="w-full max-w-[420px] rounded-3xl overflow-hidden"
                            style={{
                                backgroundColor: theme.panel,
                                shadowColor: '#000',
                                shadowOpacity: 0.25,
                                shadowRadius: 24,
                                shadowOffset: {
                                    width: 0,
                                    height: 12,
                                },
                                elevation: 12,
                            }}
                        >
                            {/* Header */}
                            <View
                                className="flex-row items-center justify-between px-4 py-3.5 border-b"
                                style={{
                                    borderBottomColor: baseBorder,
                                }}
                            >
                                <Pressable
                                    onPress={() =>
                                        setPickerOpen(false)
                                    }
                                    hitSlop={10}
                                >
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        Cancel
                                    </Text>
                                </Pressable>

                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.base,
                                    }}
                                >
                                    {label ?? 'Select date'}
                                </Text>

                                <Pressable
                                    onPress={() => {
                                        setValue(
                                            toISODate(tempDate)
                                        );
                                        setPickerOpen(false);
                                    }}
                                    hitSlop={10}
                                >
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: theme.primary,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        Done
                                    </Text>
                                </Pressable>
                            </View>

                            {/* Preview band — tinted with the theme accent */}
                            <View
                                className="items-center"
                                style={{
                                    paddingTop: 18,
                                    paddingBottom: 8,
                                    backgroundColor: alpha(
                                        theme.primary,
                                        isDarkMode ? 0.10 : 0.06
                                    ),
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 34,
                                        lineHeight: 38,
                                    }}
                                >
                                    {String(
                                        tempDate.getDate()
                                    ).padStart(2, '0')}
                                </Text>
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 11,
                                        letterSpacing: 1.6,
                                        marginTop: 2,
                                        opacity: 0.85,
                                    }}
                                >
                                    {tempDate
                                        .toLocaleDateString(
                                            undefined,
                                            {
                                                weekday: 'long',
                                                month: 'long',
                                                year: 'numeric',
                                            }
                                        )
                                        .toUpperCase()}
                                </Text>
                            </View>

                            {/* Picker */}
                            <View className="px-2 pb-2 pt-1">
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={(_: any, date?: Date) => {
                                        if (date) setTempDate(date);
                                    }}
                                    themeVariant={
                                        isDarkMode ? 'dark' : 'light'
                                    }
                                    accentColor={theme.primary}
                                    textColor={
                                        isDarkMode
                                            ? '#f8fafc'
                                            : '#0f172a'
                                    }
                                />
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>
            ) : null}

            {fieldError ? (
                <Text
                    className="mt-1.5"
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
                    className="mt-1.5"
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