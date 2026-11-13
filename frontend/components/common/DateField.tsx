// components/common/DateField.tsx

import { useAuth } from '@/context/AuthContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFormikContext } from 'formik';
import React, { useState } from 'react';
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

type DateFieldSize = 'sm' | 'md';

interface DateFieldProps {
    name?: string;
    transform?: (raw: string) => any;
    format?: (value: any) => string;
    showErrorOnlyIfTouched?: boolean;

    value?: string;
    onChangeText?: (v: string) => void;
    error?: string;

    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    helperText?: string;

    size?: DateFieldSize;
    bare?: boolean;
    width?: number;
    showIcon?: boolean;
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

    size = 'md',
    bare = false,
    width,
    showIcon,
}: DateFieldProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    /* -------- Effective value -------- */
    const fieldValue: string = isFormik
        ? ((formik.values?.[name!] as string) ?? '')
        : ((controlledValue as string) ?? '');

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

    /* -------- Local state -------- */
    const [pickerOpen, setPickerOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [tempDate, setTempDate] = useState<Date>(
        () => parseDate(fieldValue) ?? new Date(),
    );

    /* -------- Size tokens -------- */
    const isCompact = size === 'sm';
    const labelFontSize = isCompact ? 9 : 10;
    const inputFontSize = isCompact ? 12 : 13.5;
    const iconSize = isCompact ? 24 : 32;
    const iconFontSize = isCompact ? 12 : 15;
    const radiusClass = isCompact ? 'rounded-lg' : 'rounded-xl';
    const heightClass = isCompact ? 'h-8' : 'min-h-[46px]';

    /* sm defaults to 210px; md stretches unless width is set */
    const resolvedWidth = width ?? (isCompact ? 210 : undefined);

    /* -------- Theme tokens -------- */
    const baseBorder = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
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
        Platform.OS === 'web' && focused
            ? ({
                boxShadow: `0 0 0 3px ${alpha(
                    theme.primary,
                    0.15,
                )}, 0 1px 2px rgba(0,0,0,0.04)`,
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

    /* -------- Icon flag -------- */
    const renderIcon = showIcon ?? !isCompact;

    /* ========================================================
     * Header
     * ====================================================== */
    const Header = label ? (
        <View className="flex-row items-center mb-1">
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: labelFontSize,
                }}
            >
                {label}
            </Text>
            {required ? (
                <Text
                    className="ml-1"
                    style={{
                        color: danger,
                        fontFamily: theme.font.bold,
                        fontSize: labelFontSize,
                    }}
                >
                    *
                </Text>
            ) : null}
        </View>
    ) : null;

    /* ========================================================
     * Calendar badge
     * ====================================================== */
    const CalendarBadge = renderIcon ? (
        <View
            pointerEvents="none"
            className="items-center justify-center mr-2.5"
            style={{
                width: iconSize,
                height: iconSize,
                borderRadius: 10,
                backgroundColor: alpha(
                    theme.primary,
                    isDarkMode ? 0.18 : 0.10,
                ),
            }}
        >
            <Text
                style={{
                    fontSize: iconFontSize,
                    color: theme.primary,
                }}
            >
                📅
            </Text>
        </View>
    ) : null;

    /* ========================================================
     * Clear button
     * ====================================================== */
    const ClearButton =
        hasValue && !disabled ? (
            <Pressable
                onPress={() => setValue('')}
                hitSlop={8}
                className="items-center justify-center"
                style={{
                    marginLeft: 6,
                    width: isCompact ? 20 : 26,
                    height: isCompact ? 20 : 26,
                    borderRadius: 8,
                    backgroundColor: isDarkMode
                        ? 'rgba(148,163,184,0.12)'
                        : 'rgba(100,116,139,0.08)',
                    zIndex: 20,
                }}
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: isCompact ? 10 : 12,
                        lineHeight: isCompact ? 12 : 14,
                    }}
                >
                    ✕
                </Text>
            </Pressable>
        ) : null;

    /* ========================================================
     * Helper / error row
     * ====================================================== */
    const FeedbackRow = bare
        ? null
        : fieldError
            ? (
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
            )
            : helperText
                ? (
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
                )
                : null;

    /* ========================================================
     * Outer wrapper
     * ====================================================== */
    const outerClasses = bare ? '' : 'mb-3 mx-2';
    const outerStyle = {
        ...(resolvedWidth ? { width: resolvedWidth } : {}),
        flexShrink: 0,
    };

    /* -------- Display text -------- */
    const displayText = format
        ? format(fieldValue)
        : hasValue
            ? prettyPrint(fieldValue)
            : placeholder;

    /* ========================================================
     * WEB
     * ====================================================== */
    if (Platform.OS === 'web') {
        return (
            <View className={outerClasses} style={outerStyle}>
                {Header}

                <View
                    className={[
                        'flex-row items-center border relative',
                        radiusClass,
                        'px-2.5',
                        heightClass,
                    ].join(' ')}
                    style={{
                        borderColor,
                        backgroundColor: hasValue ? filledBg : inputBg,
                        opacity: disabled ? 0.55 : 1,
                        transitionProperty: 'border-color, box-shadow',
                        transitionDuration: '140ms',
                        ...(shadowStyle as any),
                    }}
                >
                    {CalendarBadge}

                    {/* Visible text */}
                    <Text
                        className="flex-1"
                        pointerEvents="none"
                        style={{
                            color: hasValue ? theme.text : '#94a3b8',
                            fontFamily: hasValue ? theme.font.bold : theme.font.medium,
                            fontSize: inputFontSize,
                            letterSpacing: hasValue ? 0.2 : 0,
                            pointerEvents: 'none',
                        }}
                        numberOfLines={1}
                    >
                        {displayText}
                    </Text>

                    {/* Clear button */}
                    {hasValue && !disabled ? (
                        <View style={{ position: 'relative', zIndex: 20 }}>
                            {ClearButton}
                        </View>
                    ) : null}

                    {/* Transparent <input type="date"> covering the entire field. */}
                    {React.createElement('input', {
                        type: 'date',
                        value: fieldValue || '',
                        onChange: (e: any) => setValue(e.target.value),
                        onFocus: () => setFocused(true),
                        onBlur: () => setFocused(false),
                        onClick: (e: any) => {
                            // CRITICAL FIX: Force the browser's native date picker to open
                            // regardless of where inside the input the user clicked.
                            try {
                                e.target.showPicker();
                            } catch (err) {
                                // Fallback for older browsers that don't support showPicker
                            }
                        },
                        disabled,
                        'aria-label': label,
                        style: {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            border: 'none',
                            outline: 'none',
                            padding: 0,
                            margin: 0,
                            background: 'transparent',
                            zIndex: 10,
                            color: 'transparent',
                            fontFamily: 'inherit',
                            fontSize: 16,
                        } as any,
                    })}
                </View>

                {FeedbackRow}
            </View>
        );
    }

    /* ========================================================
     * NATIVE (iOS / Android)
     * ====================================================== */
    return (
        <View className={outerClasses} style={outerStyle}>
            {Header}

            <Pressable
                onPress={openPicker}
                disabled={disabled}
                className={[
                    'flex-row items-center border',
                    radiusClass,
                    'px-2.5',
                    heightClass,
                ].join(' ')}
                style={{
                    borderColor,
                    backgroundColor: hasValue ? filledBg : inputBg,
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                {CalendarBadge}

                <Text
                    className="flex-1"
                    style={{
                        color: hasValue ? theme.text : '#94a3b8',
                        fontFamily: hasValue
                            ? theme.font.bold
                            : theme.font.medium,
                        fontSize: inputFontSize,
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
                    presentationStyle="overFullScreen" // Allows rendering over nested Modals
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
                                shadowOffset: { width: 0, height: 12 },
                                elevation: 12,
                            }}
                        >
                            <View
                                className="flex-row items-center justify-between px-4 py-3.5 border-b"
                                style={{ borderBottomColor: baseBorder }}
                            >
                                <Pressable
                                    onPress={() => setPickerOpen(false)}
                                    hitSlop={10}
                                >
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        Cancel
                                    </Text>
                                </Pressable>

                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.base,
                                    }}
                                >
                                    {label ?? 'Select date'}
                                </Text>

                                <Pressable
                                    onPress={() => {
                                        setValue(toISODate(tempDate));
                                        setPickerOpen(false);
                                    }}
                                    hitSlop={10}
                                >
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: theme.primary,
                                            fontFamily: theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        Done
                                    </Text>
                                </Pressable>
                            </View>

                            <View
                                className="items-center"
                                style={{
                                    paddingTop: 18,
                                    paddingBottom: 8,
                                    backgroundColor: alpha(
                                        theme.primary,
                                        isDarkMode ? 0.10 : 0.06,
                                    ),
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 34,
                                        lineHeight: 38,
                                    }}
                                >
                                    {String(tempDate.getDate()).padStart(2, '0')}
                                </Text>
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 11,
                                        letterSpacing: 1.6,
                                        marginTop: 2,
                                        opacity: 0.85,
                                    }}
                                >
                                    {tempDate
                                        .toLocaleDateString(undefined, {
                                            weekday: 'long',
                                            month: 'long',
                                            year: 'numeric',
                                        })
                                        .toUpperCase()}
                                </Text>
                            </View>

                            <View className="px-2 pb-2 pt-1">
                                <DateTimePicker
                                    value={tempDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={(_: any, date?: Date) => {
                                        if (date) setTempDate(date);
                                    }}
                                    themeVariant={isDarkMode ? 'dark' : 'light'}
                                    accentColor={theme.primary}
                                    textColor={isDarkMode ? '#f8fafc' : '#0f172a'}
                                />
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>
            ) : null}

            {FeedbackRow}
        </View>
    );
}

