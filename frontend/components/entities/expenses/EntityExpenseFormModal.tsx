// components/entities/entityExpenses/EntityExpenseFormModal.tsx
//
// Create form for an entity expense.
//
// Field types:
//   text | number | textarea   → TextInput
//   select                     → inline chip grid (small option sets)
//   dropdown                   → SelectDropdown (large option sets, picker)
//   date                       → DateField (calendar picker)

import { DateField } from '@/components/common/DateField';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
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

export type FormFieldType =
    | 'text'
    | 'number'
    | 'textarea'
    | 'select'
    | 'dropdown'
    | 'date';

export interface FormFieldOption {
    label: string;
    value: string;
}

export interface FormFieldConfig {
    key: string;
    label: string;
    type: FormFieldType;
    placeholder?: string;
    required?: boolean;
    helpText?: string;
    options?: FormFieldOption[];
    initialValue?: string;
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
    visibleWhen?: (values: Record<string, string>) => boolean;
}

interface EntityExpenseFormModalProps {
    visible: boolean;
    title: string;
    subtitle?: string;
    submitLabel?: string;
    fields: FormFieldConfig[];
    submitting?: boolean;
    onClose: () => void;
    onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

/* =========================================================
 * Component
 * ======================================================= */

export function EntityExpenseFormModal({
    visible,
    title,
    subtitle,
    submitLabel = 'Save',
    fields,
    submitting = false,
    onClose,
    onSubmit,
}: EntityExpenseFormModalProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const initialValues = useMemo(() => {
        const map: Record<string, string> = {};
        for (const f of fields) map[f.key] = f.initialValue ?? '';
        return map;
    }, [fields]);

    const [values, setValues] = useState<Record<string, string>>(initialValues);
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

    const validate = useCallback((): boolean => {
        const next: Record<string, string> = {};
        for (const f of fields) {
            if (f.visibleWhen && !f.visibleWhen(values)) continue;
            if (!f.required) continue;
            if (!String(values[f.key] ?? '').trim()) {
                next[f.key] = `${f.label} is required`;
            }
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    }, [fields, values]);

    const handleSubmit = useCallback(async () => {
        if (!validate()) return;
        await onSubmit(values);
    }, [validate, onSubmit, values]);

    const visibleFields = fields.filter(
        (f) => !f.visibleWhen || f.visibleWhen(values),
    );

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
                            maxHeight: '85%',
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
                                    {title}
                                </Text>
                                {subtitle ? (
                                    <Text
                                        className="mt-0.5"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.regular,
                                            fontSize: theme.fontSize.xs,
                                        }}
                                        numberOfLines={2}
                                    >
                                        {subtitle}
                                    </Text>
                                ) : null}
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
                            {visibleFields.map((f) => (
                                <FieldRow
                                    key={f.key}
                                    field={f}
                                    value={values[f.key] ?? ''}
                                    error={errors[f.key]}
                                    borderColor={borderColor}
                                    inputBg={inputBg}
                                    theme={theme}
                                    onChange={(v) => setField(f.key, v)}
                                />
                            ))}
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
                                    Cancel
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleSubmit}
                                disabled={submitting}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: submitting }}
                                className="flex-1 h-10 rounded-xl items-center justify-center"
                                style={{
                                    backgroundColor: theme.primary,
                                    opacity: submitting ? 0.5 : 1,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
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
 * Field row
 * ======================================================= */

function FieldRow({
    field,
    value,
    error,
    borderColor,
    inputBg,
    theme,
    onChange,
}: {
    field: FormFieldConfig;
    value: string;
    error?: string;
    borderColor: string;
    inputBg: string;
    theme: ThemeShape;
    onChange: (v: string) => void;
}) {
    const isDropdown = field.type === 'dropdown' && !!field.options;
    const isDateField = field.type === 'date';

    // These widgets render their own label + error + helper.
    const rendersOwnChrome = isDropdown || isDateField;

    return (
        <View className="mb-4">
            {!rendersOwnChrome ? (
                <Text
                    className="uppercase tracking-widest mb-1.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    {field.label}
                    {field.required ? ' *' : ''}
                </Text>
            ) : null}

            {isDropdown ? (
                <SelectDropdown
                    label={field.label}
                    required={field.required}
                    options={field.options!.map((o) => ({
                        value: o.value,
                        label: o.label,
                    }))}
                    value={value}
                    onChange={onChange}
                    error={error}
                    helperText={field.helpText}
                    placeholder={field.placeholder ?? 'Select…'}
                    maxHeight={260}
                />
            ) : isDateField ? (
                <DateField
                    label={field.label}
                    required={field.required}
                    value={value}
                    onChangeText={onChange}
                    error={error}
                    helperText={field.helpText}
                    placeholder={field.placeholder ?? 'YYYY-MM-DD'}
                />
            ) : field.type === 'select' && field.options ? (
                <View className="flex-row flex-wrap gap-1.5">
                    {field.options.map((opt) => {
                        const active = value === opt.value;
                        return (
                            <Pressable
                                key={opt.value}
                                onPress={() => onChange(opt.value)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                className="px-3 py-1.5 rounded-full border"
                                style={{
                                    borderColor: active
                                        ? theme.primary
                                        : borderColor,
                                    backgroundColor: active
                                        ? `${theme.primary}15`
                                        : 'transparent',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: active
                                            ? theme.primary
                                            : theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {opt.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            ) : (
                <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={field.placeholder}
                    placeholderTextColor="#94a3b8"
                    keyboardType={field.keyboardType ?? 'default'}
                    multiline={field.type === 'textarea'}
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="rounded-lg border px-3 text-sm"
                    style={[
                        {
                            borderColor: error ? '#f43f5e' : borderColor,
                            backgroundColor: inputBg,
                            color: theme.text,
                            fontFamily: theme.font.medium,
                        },
                        field.type === 'textarea'
                            ? {
                                minHeight: 90,
                                paddingTop: 8,
                                textAlignVertical: 'top',
                            }
                            : { height: 40 },
                    ]}
                />
            )}

            {/* Helper / error — dropdown and date field render their own. */}
            {!rendersOwnChrome && field.helpText && !error ? (
                <Text
                    className="mt-1"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: 11,
                    }}
                >
                    {field.helpText}
                </Text>
            ) : null}

            {!rendersOwnChrome && error ? (
                <Text
                    className="mt-1"
                    style={{
                        color: '#f43f5e',
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {error}
                </Text>
            ) : null}
        </View>
    );
}