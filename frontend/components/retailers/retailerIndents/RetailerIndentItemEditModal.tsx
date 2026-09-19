// app/(retailers)/retailerIndents/RetailerIndentItemEditModal.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { RetailerIndentItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import { notifyError, notifySuccess } from '@/utils/notify';
import { Formik, FormikHelpers } from 'formik';
import React from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import * as Yup from 'yup';

/* ------------------------------------------------------------------ */
/* Payload type                                                        */
/* ------------------------------------------------------------------ */
export interface RetailerIndentItemUpdatePayload {
    recommended_retail_price: string | null;
    markup_percentage_used: string | null;
    required_quantity: number;
}

/* ------------------------------------------------------------------ */
/* Server response type                                                */
/* ------------------------------------------------------------------ */
export interface IndentItemParamsResponse {
    status?: string;
    item_id?: string;
    indent_id?: string;
    params?: Partial<RetailerIndentItem>;
}

/* ------------------------------------------------------------------ */
/* Form values                                                         */
/* ------------------------------------------------------------------ */
interface FormValues {
    recommended_retail_price: string;
    markup_percentage_used: string;
    required_quantity: string;
}

/* ------------------------------------------------------------------ */
/* Validation schema                                                   */
/* ------------------------------------------------------------------ */
const nullableNumber = (opts: { min?: number } = {}) =>
    Yup.number()
        .transform((value, original) => {
            if (
                original === '' ||
                original === null ||
                original === undefined
            ) {
                return null;
            }
            return value;
        })
        .nullable()
        .typeError('Must be a number')
        .test(
            'min-bound',
            opts.min !== undefined ? `Must be ≥ ${opts.min}` : 'Invalid',
            (v) => {
                if (opts.min === undefined) return true;
                if (v === null || v === undefined) return true;
                return v >= opts.min;
            }
        );

const schema = Yup.object({
    recommended_retail_price: nullableNumber({ min: 0 }),
    markup_percentage_used: nullableNumber({ min: -100 }),
    required_quantity: Yup.number()
        .transform((value, original) => {
            if (
                original === '' ||
                original === null ||
                original === undefined
            ) {
                return null;
            }
            return value;
        })
        .typeError('Must be a number')
        .integer('Must be a whole number')
        .min(1, 'Must be at least 1')
        .required('Required quantity is required'),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const toStr = (v: unknown): string =>
    v === null || v === undefined ? '' : String(v);

const itemToFormValues = (
    item: RetailerIndentItem | null
): FormValues => ({
    recommended_retail_price: toStr(item?.recommended_retail_price),
    markup_percentage_used: toStr(item?.markup_percentage_used),
    required_quantity: toStr(item?.required_quantity),
});

const formValuesToPayload = (
    v: FormValues
): RetailerIndentItemUpdatePayload => ({
    recommended_retail_price:
        v.recommended_retail_price.trim() === ''
            ? null
            : v.recommended_retail_price.trim(),
    markup_percentage_used:
        v.markup_percentage_used.trim() === ''
            ? null
            : v.markup_percentage_used.trim(),
    required_quantity: Number(v.required_quantity),
});

const logJson = (label: string, data: unknown) => {
    if (!__DEV__) return;
    try {
        const raw = JSON.stringify(data, null, 2);
        console.log(`\n========== ${label} ==========\n${raw}\n`);
    } catch {
        console.log(`[${label}] (unserializable)`, data);
    }
};

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
interface Props {
    visible: boolean;
    item: RetailerIndentItem | null;
    loading?: boolean;
    onClose: () => void;
    onSave: (
        payload: RetailerIndentItemUpdatePayload,
        item: RetailerIndentItem,
        serverResponse?: IndentItemParamsResponse
    ) => void | Promise<void>;
    onDelete?: (item: RetailerIndentItem) => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function RetailerIndentItemEditModal({
    visible,
    item,
    loading: externalLoading = false,
    onClose,
    onSave,
    onDelete,
}: Props) {
    const { theme } = useAuth();

    const {
        request: patchItem,
        loading: patching,
    } = useApi(retailersApi.retailerIndentItemParamsUpdateAction);

    const busyExternal = patching || externalLoading;

    const handleSubmit = async (
        values: FormValues,
        helpers: FormikHelpers<FormValues>
    ) => {
        if (!item) return;

        const payload = formValuesToPayload(values);
        const requestBody = {
            item_id: item.id,
            ...payload,
        };

        logJson('IndentItemEditModal · REQUEST PAYLOAD', requestBody);

        let res: any = null;
        try {
            res = await patchItem(requestBody);
        } catch (e: any) {
            const msg = e?.message || 'Network error. Please try again.';
            helpers.setStatus({ submitError: msg });
            notifyError('Update Failed', msg);
            return;
        }

        logJson('IndentItemEditModal · RAW RESPONSE', {
            ok: res?.ok,
            status: res?.status,
            problem: res?.problem,
            data: res?.data,
        });

        if (!res?.ok) {
            const msg =
                res?.problem ||
                res?.data?.detail ||
                res?.data?.message ||
                'Please try again.';
            helpers.setStatus({ submitError: msg });
            notifyError('Update Failed', String(msg));
            return;
        }

        // Success — hand the response up so the parent can persist it.
        await onSave(payload, item, res.data);

        notifySuccess(
            'Item Updated',
            `Required quantity updated to ${payload.required_quantity}.`
        );
    };

    const borderColor = theme.isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = theme.isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = theme.isDarkMode ? '#0f172a' : '#f8fafc';
    const inputBg = theme.isDarkMode ? '#0b1220' : '#ffffff';
    const placeholderColor = theme.isDarkMode ? '#64748b' : '#94a3b8';

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <View className="flex-1 bg-black/55 items-center justify-center p-4">
                    <View
                        className="w-full max-w-[560px] max-h-[92%] rounded-2xl border overflow-hidden"
                        style={{ backgroundColor: theme.panel, borderColor }}
                    >
                        {!item ? null : (
                            <Formik<FormValues>
                                initialValues={itemToFormValues(item)}
                                validationSchema={schema}
                                enableReinitialize
                                onSubmit={handleSubmit}
                            >
                                {({
                                    values,
                                    errors,
                                    touched,
                                    handleChange,
                                    handleBlur,
                                    handleSubmit: submitForm,
                                    isSubmitting,
                                    status,
                                }) => {
                                    const busy =
                                        busyExternal || isSubmitting;

                                    return (
                                        <>
                                            {/* Header */}
                                            <View
                                                className="flex-row items-center justify-between p-4 border-b"
                                                style={{
                                                    borderBottomColor:
                                                        dividerColor,
                                                }}
                                            >
                                                <View className="flex-1 min-w-0">
                                                    <Text
                                                        style={{
                                                            color: theme.text,
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                            fontSize:
                                                                theme.fontSize
                                                                    .lg,
                                                        }}
                                                        numberOfLines={1}
                                                    >
                                                        Edit Item
                                                    </Text>
                                                    <Text
                                                        className="mt-0.5"
                                                        style={{
                                                            color: theme.textDark,
                                                            fontFamily:
                                                                theme.font
                                                                    .medium,
                                                            fontSize:
                                                                theme.fontSize
                                                                    .xs,
                                                        }}
                                                        numberOfLines={1}
                                                    >
                                                        {item.wholesale_receipt_title ||
                                                            item.wholesaler_title ||
                                                            '—'}
                                                    </Text>
                                                </View>
                                                <Pressable
                                                    onPress={onClose}
                                                    hitSlop={10}
                                                    disabled={busy}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Close"
                                                >
                                                    <Text
                                                        style={{
                                                            color: theme.textDark,
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                            fontSize:
                                                                theme.fontSize
                                                                    .base,
                                                        }}
                                                    >
                                                        ✕
                                                    </Text>
                                                </Pressable>
                                            </View>

                                            {/* Body */}
                                            <ScrollView
                                                contentContainerStyle={{
                                                    padding: 16,
                                                }}
                                                keyboardShouldPersistTaps="handled"
                                            >
                                                <View
                                                    className="rounded-xl p-3 mb-4 flex-row flex-wrap gap-3"
                                                    style={{
                                                        backgroundColor:
                                                            subBg,
                                                    }}
                                                >
                                                    <SnapshotCell
                                                        label="Source"
                                                        value={
                                                            item.source ||
                                                            '—'
                                                        }
                                                    />
                                                    <SnapshotCell
                                                        label="Final Unit"
                                                        value={
                                                            item.final_unit_price ??
                                                            '—'
                                                        }
                                                    />
                                                    <SnapshotCell
                                                        label="Cost / Unit"
                                                        value={
                                                            item.cost_per_unit !=
                                                                null
                                                                ? String(
                                                                    item.cost_per_unit
                                                                )
                                                                : '—'
                                                        }
                                                    />
                                                </View>

                                                {status?.submitError ? (
                                                    <View
                                                        className="rounded-xl border px-3 py-2 mb-3"
                                                        style={{
                                                            borderColor:
                                                                '#ef4444',
                                                            backgroundColor:
                                                                theme.isDarkMode
                                                                    ? '#3f1d1d'
                                                                    : '#fef2f2',
                                                        }}
                                                    >
                                                        <Text
                                                            style={{
                                                                color: '#ef4444',
                                                                fontFamily:
                                                                    theme
                                                                        .font
                                                                        .medium,
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            {
                                                                status.submitError
                                                            }
                                                        </Text>
                                                    </View>
                                                ) : null}

                                                <Field
                                                    label="Markup Percentage Used (%)"
                                                    value={
                                                        values.markup_percentage_used
                                                    }
                                                    error={
                                                        errors.markup_percentage_used
                                                    }
                                                    touched={
                                                        touched.markup_percentage_used
                                                    }
                                                    onChangeText={handleChange(
                                                        'markup_percentage_used'
                                                    )}
                                                    onBlur={handleBlur(
                                                        'markup_percentage_used'
                                                    )}
                                                    placeholder="e.g. 25"
                                                    keyboardType="decimal-pad"
                                                    editable={!busy}
                                                    inputBg={inputBg}
                                                    borderColor={borderColor}
                                                    placeholderColor={
                                                        placeholderColor
                                                    }
                                                />

                                                <Field
                                                    label="Recommended Retail Price"
                                                    value={
                                                        values.recommended_retail_price
                                                    }
                                                    error={
                                                        errors.recommended_retail_price
                                                    }
                                                    touched={
                                                        touched.recommended_retail_price
                                                    }
                                                    onChangeText={handleChange(
                                                        'recommended_retail_price'
                                                    )}
                                                    onBlur={handleBlur(
                                                        'recommended_retail_price'
                                                    )}
                                                    placeholder="e.g. 150.00"
                                                    keyboardType="decimal-pad"
                                                    editable={!busy}
                                                    inputBg={inputBg}
                                                    borderColor={borderColor}
                                                    placeholderColor={
                                                        placeholderColor
                                                    }
                                                />

                                                <Field
                                                    label="Required Quantity"
                                                    value={
                                                        values.required_quantity
                                                    }
                                                    error={
                                                        errors.required_quantity
                                                    }
                                                    touched={
                                                        touched.required_quantity
                                                    }
                                                    onChangeText={handleChange(
                                                        'required_quantity'
                                                    )}
                                                    onBlur={handleBlur(
                                                        'required_quantity'
                                                    )}
                                                    placeholder="e.g. 10"
                                                    keyboardType="number-pad"
                                                    editable={!busy}
                                                    inputBg={inputBg}
                                                    borderColor={borderColor}
                                                    placeholderColor={
                                                        placeholderColor
                                                    }
                                                />
                                            </ScrollView>

                                            {/* Footer */}
                                            <View
                                                className="flex-row items-center justify-between p-4 border-t"
                                                style={{
                                                    borderTopColor:
                                                        dividerColor,
                                                }}
                                            >
                                                <View className="flex-row items-center">
                                                    {onDelete ? (
                                                        <Pressable
                                                            onPress={() => {
                                                                if (busy)
                                                                    return;
                                                                Alert.alert(
                                                                    'Delete item?',
                                                                    'This will remove the item from the indent. This cannot be undone.',
                                                                    [
                                                                        {
                                                                            text: 'Cancel',
                                                                            style: 'cancel',
                                                                        },
                                                                        {
                                                                            text: 'Delete',
                                                                            style: 'destructive',
                                                                            onPress: () =>
                                                                                void onDelete(
                                                                                    item
                                                                                ),
                                                                        },
                                                                    ]
                                                                );
                                                            }}
                                                            disabled={busy}
                                                            className="px-3 py-2.5 rounded-xl border"
                                                            style={{
                                                                borderColor:
                                                                    '#ef4444',
                                                                opacity: busy
                                                                    ? 0.5
                                                                    : 1,
                                                            }}
                                                        >
                                                            <Text
                                                                className="uppercase tracking-wide"
                                                                style={{
                                                                    color: '#ef4444',
                                                                    fontFamily:
                                                                        theme
                                                                            .font
                                                                            .bold,
                                                                    fontSize: 12,
                                                                }}
                                                            >
                                                                Delete
                                                            </Text>
                                                        </Pressable>
                                                    ) : null}
                                                </View>

                                                <View className="flex-row gap-2">
                                                    <Pressable
                                                        onPress={onClose}
                                                        disabled={busy}
                                                        className="px-4 py-2.5 rounded-xl border"
                                                        style={{
                                                            borderColor,
                                                            opacity: busy
                                                                ? 0.5
                                                                : 1,
                                                        }}
                                                    >
                                                        <Text
                                                            className="uppercase tracking-wide"
                                                            style={{
                                                                color: theme.textDark,
                                                                fontFamily:
                                                                    theme
                                                                        .font
                                                                        .bold,
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            Cancel
                                                        </Text>
                                                    </Pressable>
                                                    <Pressable
                                                        onPress={() =>
                                                            submitForm()
                                                        }
                                                        disabled={busy}
                                                        className="px-4 py-2.5 rounded-xl"
                                                        style={{
                                                            backgroundColor:
                                                                theme.primary,
                                                            opacity: busy
                                                                ? 0.5
                                                                : 1,
                                                        }}
                                                    >
                                                        {busy ? (
                                                            <ActivityIndicator
                                                                size="small"
                                                                color="#fff"
                                                            />
                                                        ) : (
                                                            <Text
                                                                className="uppercase tracking-wide text-white"
                                                                style={{
                                                                    fontFamily:
                                                                        theme
                                                                            .font
                                                                            .bold,
                                                                    fontSize: 12,
                                                                }}
                                                            >
                                                                Save
                                                            </Text>
                                                        )}
                                                    </Pressable>
                                                </View>
                                            </View>
                                        </>
                                    );
                                }}
                            </Formik>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/* ------------------------------------------------------------------ */
/* Field                                                               */
/* ------------------------------------------------------------------ */
function Field({
    label,
    value,
    error,
    touched,
    onChangeText,
    onBlur,
    editable,
    placeholder,
    keyboardType,
    inputBg,
    borderColor,
    placeholderColor,
}: {
    label: string;
    value: string;
    error?: string;
    touched?: boolean;
    onChangeText: (text: string) => void;
    onBlur: (e: any) => void;
    editable: boolean;
    placeholder?: string;
    keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
    inputBg: string;
    borderColor: string;
    placeholderColor: string;
}) {
    const { theme } = useAuth();
    const showError = touched && error;

    return (
        <View className="mb-3">
            <Text
                className="uppercase tracking-wide mb-1.5"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                onBlur={onBlur}
                placeholder={placeholder}
                placeholderTextColor={placeholderColor}
                keyboardType={keyboardType}
                editable={editable}
                className="rounded-xl border px-3 py-2.5"
                style={{
                    backgroundColor: inputBg,
                    borderColor: showError ? '#ef4444' : borderColor,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            />
            {showError ? (
                <Text
                    className="mt-1"
                    style={{
                        color: '#ef4444',
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

function SnapshotCell({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    const { theme } = useAuth();
    return (
        <View style={{ minWidth: 90 }}>
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
            <Text
                className="mt-0.5"
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {value}
            </Text>
        </View>
    );
}