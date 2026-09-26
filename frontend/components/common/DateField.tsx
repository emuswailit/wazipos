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
 * Web-only style injection (runs once)
 * Restyles the native <input type="date"> and its popup
 * calendar chrome. No layout impact, just visual polish.
 * ======================================================= */
function useWebDateStyles(primary: string, isDark: boolean) {
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const doc: any =
            typeof document !== 'undefined' ? document : null;
        if (!doc) return;

        const id = 'wazi-datefield-styles';
        if (doc.getElementById(id)) return;

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
                font-size: 13px;
                letter-spacing: 0.2px;
                cursor: pointer;
            }
            input.wazi-date-input::-webkit-calendar-picker-indicator {
                cursor: pointer;
                opacity: 0.65;
                transition: opacity 120ms ease;
                filter: ${isDark
                ? 'invert(90%) sepia(10%) saturate(200%) hue-rotate(180deg)'
                : 'none'
            };
            }
            input.wazi-date-input::-webkit-calendar-picker-indicator:hover {
                opacity: 1;
            }
            input.wazi-date-input::-webkit-datetime-edit-fields-wrapper {
                padding: 0;
            }
            input.wazi-date-input::-webkit-datetime-edit-text {
                color: ${isDark ? '#94a3b8' : '#64748b'};
                padding: 0 2px;
            }
            input.wazi-date-input::-webkit-datetime-edit-month-field,
            input.wazi-date-input::-webkit-datetime-edit-day-field,
            input.wazi-date-input::-webkit-datetime-edit-year-field {
                color: ${isDark ? '#f8fafc' : '#0f172a'};
                padding: 2px 4px;
                border-radius: 4px;
            }
            input.wazi-date-input::-webkit-datetime-edit-month-field:focus,
            input.wazi-date-input::-webkit-datetime-edit-day-field:focus,
            input.wazi-date-input::-webkit-datetime-edit-year-field:focus {
                background: ${primary}22;
                color: ${primary};
                outline: none;
            }
            input.wazi-date-input:disabled {
                opacity: 0.55;
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
    const [tempDate, setTempDate] = useState<Date>(
        () => parseDate(fieldValue) ?? new Date()
    );

    const webInputRef = useRef<any>(null);

    /* -------- Theme tokens -------- */
    const baseBorder = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const danger = '#ef4444';
    const borderColor = fieldError ? danger : baseBorder;

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
     * Label + shell (shared between web and native renders)
     * ====================================================== */
    const Header = label ? (
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
    ) : null;

    /* ========================================================
     * WEB
     * ====================================================== */
    if (Platform.OS === 'web') {
        return (
            <View className="mb-3">
                {Header}

                <View
                    className="flex-row items-center rounded-xl border px-3"
                    style={{
                        borderColor,
                        backgroundColor: inputBg,
                        opacity: disabled ? 0.55 : 1,
                        minHeight: 44,
                    }}
                >
                    {/* Leading calendar icon */}
                    <Text
                        style={{
                            color: theme.primary,
                            fontSize: 14,
                            marginRight: 8,
                        }}
                    >
                        📅
                    </Text>

                    {/* Native HTML date input, classed for our
                        injected stylesheet. This is the one place
                        we use a real DOM tag — required to get the
                        browser's date picker. */}
                    <input
                        ref={webInputRef}
                        className="wazi-date-input"
                        type="date"
                        value={fieldValue || ''}
                        onChange={(e) =>
                            setValue(e.target.value)
                        }
                        disabled={disabled}
                        placeholder={placeholder}
                    />

                    {/* Clear button */}
                    {fieldValue && !disabled ? (
                        <Pressable
                            onPress={() => setValue('')}
                            hitSlop={8}
                            className="ml-2 p-1"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontSize: 13,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    ) : null}
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

    /* ========================================================
     * NATIVE (iOS / Android)
     * ====================================================== */
    return (
        <View className="mb-3">
            {Header}

            <Pressable
                onPress={openPicker}
                disabled={disabled}
                className="flex-row items-center rounded-xl border px-3"
                style={{
                    borderColor,
                    backgroundColor: inputBg,
                    opacity: disabled ? 0.55 : 1,
                    minHeight: 44,
                }}
            >
                {/* Leading icon */}
                <Text
                    style={{
                        color: theme.primary,
                        fontSize: 14,
                        marginRight: 8,
                    }}
                >
                    📅
                </Text>

                <Text
                    className="flex-1 py-2.5"
                    style={{
                        color: fieldValue
                            ? theme.text
                            : '#94a3b8',
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                    numberOfLines={1}
                >
                    {fieldValue
                        ? prettyPrint(fieldValue)
                        : placeholder}
                </Text>

                {fieldValue && !disabled ? (
                    <Pressable
                        onPress={() => setValue('')}
                        hitSlop={8}
                        className="p-1"
                    >
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 13,
                            }}
                        >
                            ✕
                        </Text>
                    </Pressable>
                ) : null}
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

                            {/* Preview strip */}
                            <View
                                className="px-4 pt-4"
                                style={{
                                    alignItems: 'center',
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 22,
                                    }}
                                >
                                    {tempDate.toLocaleDateString(
                                        undefined,
                                        {
                                            weekday: 'short',
                                            day: '2-digit',
                                        }
                                    )}
                                </Text>
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 12,
                                        marginTop: 2,
                                        letterSpacing: 1,
                                    }}
                                >
                                    {tempDate
                                        .toLocaleDateString(
                                            undefined,
                                            {
                                                month: 'long',
                                                year: 'numeric',
                                            }
                                        )
                                        .toUpperCase()}
                                </Text>
                            </View>

                            {/* Picker */}
                            <View className="px-2 pb-2">
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