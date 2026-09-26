// components/retailers/requestDrafts/RequestDraftsFormModal.tsx
//
// Modal form for adding or editing a RequestDraftItem.
//
// - Formik owns form state; Yup validates
// - ProductPickerAutocomplete runs in Formik mode (name + fieldMap).
//   It reads/writes `productId`, `productTitle`, `productBarCode`,
//   `productThumbnailUrl` directly on Formik state. The three
//   `product*` display-cache fields MUST be declared in the Yup
//   schema — otherwise `validateField(path)` throws.
// - EntitiesMultiselectPicker runs in controlled mode (options + value).
//
// Quantity UX: centered, and the current value is cleared on focus
// so the user can type a new number immediately. If they blur
// without typing, the previous value is restored.
//
// Confirmation: adding a NEW draft item pops a native OK / Cancel
// alert before persisting — a manually-picked quantity has no
// forecast backing, and this is the last gate before it becomes
// a draft line item.

import {
    EntitiesMultiselectPicker,
    ProductPickerAutocomplete,
    type EntityPickerOption,
} from '@/components/common';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import type { Product, RequestDraftItem } from '@/databases/types';
import { Formik, type FormikHelpers } from 'formik';
import { useCallback, useMemo, useRef } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import * as Yup from 'yup';

/* =========================================================
 * Shapes
 * ======================================================= */

export interface PickableProduct {
    id: string;
    title: string;
    bar_code?: string;
    units_per_pack?: number;
    /** Primary image URL — resolved from `ProductItem.images[0]`. */
    thumbnail_url?: string;
}

export interface PickableWholesaler {
    id: string;
    title: string;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    onSubmit: (draft: Omit<RequestDraftItem, 'added_at'>) => void;
    initialItem?: RequestDraftItem | null;
    products: PickableProduct[];
    wholesalers: PickableWholesaler[];
    loadingProducts?: boolean;
    loadingWholesalers?: boolean;
}

interface FormValues {
    productId: string;
    productTitle: string;
    productBarCode: string;
    productThumbnailUrl: string;
    quantity: string;
    urgency: 'low' | 'medium' | 'high';
    note: string;
    target_wholesaler_ids: string[];
}

/* =========================================================
 * Constants
 * ======================================================= */

const NOTE_MAX = 500;
const DEFAULT_QUANTITY = '1';

const URGENCY_OPTIONS = [
    { value: 'low' as const, label: 'Low', tint: '#10b981' },
    { value: 'medium' as const, label: 'Medium', tint: '#f59e0b' },
    { value: 'high' as const, label: 'High', tint: '#ef4444' },
];

const validationSchema = Yup.object({
    productId: Yup.string().trim().required('Pick a product.'),

    // -------- Display caches for the product picker --------
    // Must be declared so `validateField(path)` doesn't throw.
    productTitle: Yup.string(),
    productBarCode: Yup.string(),
    productThumbnailUrl: Yup.string(),

    quantity: Yup.string()
        .required('Quantity is required.')
        .test(
            'is-positive-integer',
            'Must be a positive whole number.',
            (value) => {
                if (!value) return false;
                const n = Number(value);
                return Number.isFinite(n) && Number.isInteger(n) && n > 0;
            }
        ),
    urgency: Yup.mixed<'low' | 'medium' | 'high'>()
        .oneOf(['low', 'medium', 'high'])
        .required('Urgency is required.'),
    note: Yup.string().max(NOTE_MAX, 'Note is too long.'),
    target_wholesaler_ids: Yup.array()
        .of(Yup.string().required())
        .default([]),
});

function itemToFormValues(
    item: RequestDraftItem | null | undefined
): FormValues {
    if (!item) {
        return {
            productId: '',
            productTitle: '',
            productBarCode: '',
            productThumbnailUrl: '',
            quantity: DEFAULT_QUANTITY,
            urgency: 'medium',
            note: '',
            target_wholesaler_ids: [],
        };
    }
    return {
        productId: item.product_id ?? '',
        productTitle: item.product_title ?? '',
        productBarCode: '',
        productThumbnailUrl: '',
        quantity: String(item.quantity ?? 1),
        urgency: item.urgency ?? 'medium',
        note: item.note ?? '',
        target_wholesaler_ids: [...(item.target_wholesaler_ids ?? [])],
    };
}

/* =========================================================
 * Confirmation — inline, no helper
 * ======================================================= */

const CONFIRM_TITLE = 'No forecast basis';
const CONFIRM_MESSAGE =
    'You picked this product manually — the quantity isn\'t ' +
    'backed by a forecast, stock-out history, or any buying ' +
    'signal.\n\n' +
    'This request will go to wholesalers as a best-guess ' +
    'estimate.\n\n' +
    'Add it to the draft anyway?';

function confirmWithoutForecast(): Promise<boolean> {
    // Web: blocking native browser dialog.
    if (Platform.OS === 'web') {
        if (typeof window === 'undefined') {
            return Promise.resolve(false);
        }
        try {
            return Promise.resolve(
                window.confirm(`${CONFIRM_TITLE}\n\n${CONFIRM_MESSAGE}`)
            );
        } catch {
            // Some embedded WebViews disable confirm().
            return Promise.resolve(true);
        }
    }

    // Native: Alert.alert wrapped in a Promise.
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (v: boolean) => {
            if (settled) return;
            settled = true;
            resolve(v);
        };

        Alert.alert(
            CONFIRM_TITLE,
            CONFIRM_MESSAGE,
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => settle(false),
                },
                {
                    text: 'Add to list',
                    onPress: () => settle(true),
                },
            ],
            {
                cancelable: true,
                onDismiss: () => settle(false),
            }
        );
    });
}

/* =========================================================
 * Component
 * ======================================================= */

export default function RequestDraftsFormModal({
    visible,
    onClose,
    onSubmit,
    initialItem,
    products,
    wholesalers,
    loadingProducts,
    loadingWholesalers,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isNarrow = width < 520;

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const panelBg = theme.panel;
    const dividerColor = `${theme.textDark}20`;
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const initialValues = useMemo(
        () => itemToFormValues(initialItem),
        [initialItem]
    );

    /*
     * Snapshot of the quantity value at the moment the field gains
     * focus. Used to restore it if the user blurs without typing.
     */
    const quantityBeforeFocusRef = useRef<string>('');

    /* ---- Adapter: wholesalers → picker options ---- */
    const wholesalerOptions: EntityPickerOption[] = useMemo(
        () =>
            wholesalers.map((w) => ({
                id: w.id,
                label: w.title,
            })),
        [wholesalers]
    );

    const handleFormSubmit = useCallback(
        async (
            values: FormValues,
            helpers: FormikHelpers<FormValues>
        ) => {
            if (!values.productId) {
                helpers.setFieldError('productId', 'Pick a product.');
                return;
            }

            /*
             * Confirm before persisting on CREATE only. On edit the
             * user has already acknowledged the trade-off once;
             * warning again is noise.
             */
            if (!initialItem) {
                const proceed = await confirmWithoutForecast();
                if (!proceed) {
                    if (__DEV__) {
                        console.log(
                            '[RequestDraftsFormModal] add cancelled at confirmation'
                        );
                    }
                    return;
                }
            }

            const selectedProduct =
                products.find((p) => p.id === values.productId) ?? null;

            const productTitle =
                selectedProduct?.title ||
                values.productTitle ||
                'Product';

            const selectedWholesalers = wholesalers.filter((w) =>
                values.target_wholesaler_ids.includes(w.id)
            );

            onSubmit({
                product_id: values.productId,
                product_title: productTitle,
                quantity: Number(values.quantity),
                urgency: values.urgency,
                note: values.note.trim(),
                target_wholesaler_ids: [...values.target_wholesaler_ids],
                target_wholesaler_titles: selectedWholesalers.map(
                    (w) => w.title
                ),
                wholesalers: selectedWholesalers.map((w) => ({
                    id: w.id,
                    title: w.title,
                })),
                best_forecast_quantity: undefined,
            });

            onClose();
        },
        [initialItem, products, wholesalers, onSubmit, onClose]
    );

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
            >
                <View
                    className={[
                        'flex-1 bg-black/55 items-center justify-center',
                        isNarrow ? 'p-2' : 'p-4',
                    ].join(' ')}
                >
                    <Pressable
                        className="absolute inset-0"
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss"
                    />

                    <View
                        className="w-full max-w-[640px] rounded-2xl border overflow-hidden"
                        accessibilityViewIsModal
                        style={{
                            backgroundColor: panelBg,
                            borderColor,
                            maxHeight: '94%',
                        }}
                    >
                        <Formik<FormValues>
                            initialValues={initialValues}
                            enableReinitialize
                            validationSchema={validationSchema}
                            validateOnChange
                            validateOnBlur
                            onSubmit={handleFormSubmit}
                        >
                            {({
                                values,
                                errors,
                                touched,
                                setFieldValue,
                                setFieldTouched,
                                handleSubmit,
                                handleBlur,
                                isSubmitting,
                            }) => {
                                return (
                                    <>
                                        {/* Header */}
                                        <View
                                            className={[
                                                'flex-row items-center justify-between border-b',
                                                isNarrow ? 'p-3' : 'p-4',
                                            ].join(' ')}
                                            style={{
                                                borderBottomColor:
                                                    dividerColor,
                                            }}
                                        >
                                            <Text
                                                className="font-bold"
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: isNarrow
                                                        ? theme.fontSize.base
                                                        : theme.fontSize.lg,
                                                }}
                                            >
                                                {initialItem
                                                    ? 'Edit item'
                                                    : 'Add item'}
                                            </Text>
                                            <Pressable
                                                onPress={onClose}
                                                hitSlop={10}
                                                className="p-1.5"
                                                accessibilityRole="button"
                                                accessibilityLabel="Close"
                                            >
                                                <Text
                                                    className="font-bold"
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.bold,
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
                                            className="flex-1"
                                            contentContainerStyle={{
                                                padding: isNarrow
                                                    ? 10
                                                    : 16,
                                            }}
                                            keyboardShouldPersistTaps="handled"
                                        >
                                            <FieldLabel
                                                label="Product"
                                                theme={theme}
                                            />
                                            <ProductPickerAutocomplete
                                                name="productId"
                                                fieldMap={{
                                                    id: 'productId',
                                                    title: 'productTitle',
                                                    bar_code:
                                                        'productBarCode',
                                                    thumbnail_url:
                                                        'productThumbnailUrl',
                                                }}
                                                imageKey="thumbnail_url"
                                                titleKey="title"
                                                subtitleKey="bar_code"
                                                products={
                                                    products as unknown as Product[]
                                                }
                                                placeholder="Select a product…"
                                                disabled={
                                                    !!loadingProducts &&
                                                    products.length === 0
                                                }
                                            />
                                            <FieldError
                                                show={touched.productId}
                                                message={
                                                    typeof errors.productId ===
                                                        'string'
                                                        ? errors.productId
                                                        : undefined
                                                }
                                                theme={theme}
                                            />

                                            <View className="flex-row gap-2 mt-3">
                                                <View className="flex-1">
                                                    <FieldLabel
                                                        label="Quantity"
                                                        theme={theme}
                                                    />
                                                    <TextInput
                                                        value={
                                                            values.quantity
                                                        }
                                                        onChangeText={(v) =>
                                                            setFieldValue(
                                                                'quantity',
                                                                v.replace(
                                                                    /[^0-9]/g,
                                                                    ''
                                                                )
                                                            )
                                                        }
                                                        onFocus={() => {
                                                            if (
                                                                values.quantity
                                                            ) {
                                                                quantityBeforeFocusRef.current =
                                                                    values.quantity;
                                                                setFieldValue(
                                                                    'quantity',
                                                                    ''
                                                                );
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            if (
                                                                !values.quantity
                                                            ) {
                                                                setFieldValue(
                                                                    'quantity',
                                                                    quantityBeforeFocusRef.current ||
                                                                    DEFAULT_QUANTITY
                                                                );
                                                            }
                                                            setFieldTouched(
                                                                'quantity',
                                                                true,
                                                                true
                                                            );
                                                        }}
                                                        keyboardType="numeric"
                                                        inputMode="numeric"
                                                        placeholder={
                                                            DEFAULT_QUANTITY
                                                        }
                                                        placeholderTextColor={`${theme.textDark}99`}
                                                        className="h-12 rounded-xl border px-3 text-center text-[14px] font-bold"
                                                        style={{
                                                            borderColor:
                                                                touched.quantity &&
                                                                    errors.quantity
                                                                    ? '#ef4444'
                                                                    : borderColor,
                                                            backgroundColor:
                                                                inputBg,
                                                            color: theme.text,
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                            textAlign:
                                                                'center',
                                                        }}
                                                    />
                                                    <FieldError
                                                        show={
                                                            touched.quantity
                                                        }
                                                        message={
                                                            typeof errors.quantity ===
                                                                'string'
                                                                ? errors.quantity
                                                                : undefined
                                                        }
                                                        theme={theme}
                                                    />
                                                </View>
                                                <View className="flex-1">
                                                    <FieldLabel
                                                        label="Urgency"
                                                        theme={theme}
                                                    />
                                                    <View
                                                        className="flex-row gap-1"
                                                        accessibilityRole="radiogroup"
                                                    >
                                                        {URGENCY_OPTIONS.map(
                                                            (u) => {
                                                                const active =
                                                                    values.urgency ===
                                                                    u.value;
                                                                return (
                                                                    <Pressable
                                                                        key={
                                                                            u.value
                                                                        }
                                                                        onPress={() =>
                                                                            setFieldValue(
                                                                                'urgency',
                                                                                u.value
                                                                            )
                                                                        }
                                                                        accessibilityRole="radio"
                                                                        accessibilityState={{
                                                                            selected:
                                                                                active,
                                                                        }}
                                                                        accessibilityLabel={
                                                                            u.label
                                                                        }
                                                                        className="flex-1 h-12 rounded-xl border items-center justify-center"
                                                                        style={{
                                                                            borderColor:
                                                                                active
                                                                                    ? u.tint
                                                                                    : borderColor,
                                                                            backgroundColor:
                                                                                active
                                                                                    ? `${u.tint}15`
                                                                                    : inputBg,
                                                                        }}
                                                                    >
                                                                        <Text
                                                                            className="text-[11px] font-bold uppercase"
                                                                            style={{
                                                                                color: active
                                                                                    ? u.tint
                                                                                    : theme.textDark,
                                                                                fontFamily:
                                                                                    theme
                                                                                        .font
                                                                                        .bold,
                                                                            }}
                                                                        >
                                                                            {
                                                                                u.label
                                                                            }
                                                                        </Text>
                                                                    </Pressable>
                                                                );
                                                            }
                                                        )}
                                                    </View>
                                                </View>
                                            </View>

                                            <View className="mt-3">
                                                <FieldLabel
                                                    label={`Wholesalers${values
                                                            .target_wholesaler_ids
                                                            .length > 0
                                                            ? ` · ${values
                                                                .target_wholesaler_ids
                                                                .length
                                                            } selected`
                                                            : ''
                                                        }`}
                                                    theme={theme}
                                                />
                                                <EntitiesMultiselectPicker
                                                    options={wholesalerOptions}
                                                    value={
                                                        values.target_wholesaler_ids
                                                    }
                                                    loading={
                                                        loadingWholesalers
                                                    }
                                                    placeholder="Select wholesalers…"
                                                    onChange={(
                                                        ids: string[]
                                                    ) =>
                                                        setFieldValue(
                                                            'target_wholesaler_ids',
                                                            ids
                                                        )
                                                    }
                                                />
                                            </View>

                                            <View className="mt-3">
                                                <FieldLabel
                                                    label="Note"
                                                    theme={theme}
                                                />
                                                <TextInput
                                                    value={values.note}
                                                    onChangeText={(v) =>
                                                        setFieldValue(
                                                            'note',
                                                            v
                                                        )
                                                    }
                                                    onBlur={handleBlur('note')}
                                                    placeholder="Optional note to the wholesalers…"
                                                    placeholderTextColor={`${theme.textDark}99`}
                                                    multiline
                                                    numberOfLines={3}
                                                    className="rounded-xl border px-3 py-2.5 text-[13px]"
                                                    style={{
                                                        borderColor:
                                                            touched.note &&
                                                                errors.note
                                                                ? '#ef4444'
                                                                : borderColor,
                                                        backgroundColor:
                                                            inputBg,
                                                        color: theme.text,
                                                        fontFamily:
                                                            theme.font.medium,
                                                        minHeight: 72,
                                                        textAlignVertical:
                                                            'top',
                                                    }}
                                                />
                                                <View className="flex-row justify-between mt-1">
                                                    <FieldError
                                                        show={touched.note}
                                                        message={
                                                            typeof errors.note ===
                                                                'string'
                                                                ? errors.note
                                                                : undefined
                                                        }
                                                        theme={theme}
                                                    />
                                                    <Text
                                                        className="text-[10px] ml-auto"
                                                        style={{
                                                            color:
                                                                values.note
                                                                    .length >
                                                                    NOTE_MAX
                                                                    ? '#ef4444'
                                                                    : `${theme.textDark}99`,
                                                            fontFamily:
                                                                theme.font
                                                                    .medium,
                                                        }}
                                                    >
                                                        {values.note.length}/
                                                        {NOTE_MAX}
                                                    </Text>
                                                </View>
                                            </View>
                                        </ScrollView>

                                        {/* Footer */}
                                        <View
                                            className="border-t"
                                            style={{
                                                borderTopColor:
                                                    dividerColor,
                                            }}
                                        >
                                            <View
                                                className={[
                                                    'flex-row justify-end gap-2',
                                                    isNarrow
                                                        ? 'p-2.5'
                                                        : 'p-4',
                                                ].join(' ')}
                                            >
                                                <Pressable
                                                    onPress={onClose}
                                                    accessibilityRole="button"
                                                    className={[
                                                        'rounded-xl border items-center justify-center min-h-[44px]',
                                                        isNarrow
                                                            ? 'px-3.5'
                                                            : 'px-5',
                                                    ].join(' ')}
                                                    style={{
                                                        borderColor,
                                                    }}
                                                >
                                                    <Text
                                                        className="uppercase tracking-wide text-[12px] font-bold"
                                                        style={{
                                                            color: theme.textDark,
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                        }}
                                                    >
                                                        Cancel
                                                    </Text>
                                                </Pressable>
                                                <Pressable
                                                    onPress={() =>
                                                        handleSubmit()
                                                    }
                                                    disabled={isSubmitting}
                                                    accessibilityRole="button"
                                                    className={[
                                                        'rounded-xl items-center justify-center min-h-[44px]',
                                                        isNarrow
                                                            ? 'px-5 flex-grow'
                                                            : 'px-6',
                                                    ].join(' ')}
                                                    style={{
                                                        backgroundColor:
                                                            theme.primary,
                                                        opacity: isSubmitting
                                                            ? 0.6
                                                            : 1,
                                                    }}
                                                >
                                                    <Text
                                                        className="uppercase tracking-wide text-white text-[12px] font-bold"
                                                        style={{
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                        }}
                                                    >
                                                        {initialItem
                                                            ? 'Save changes'
                                                            : 'Add to list'}
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    </>
                                );
                            }}
                        </Formik>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/* =========================================================
 * Small pieces
 * ======================================================= */

function FieldLabel({
    label,
    theme,
}: {
    label: string;
    theme: ThemeShape;
}) {
    return (
        <Text
            className="uppercase tracking-widest text-[10px] font-bold mb-1.5"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
            }}
        >
            {label}
        </Text>
    );
}

function FieldError({
    show,
    message,
    theme,
}: {
    show?: boolean;
    message?: string;
    theme: ThemeShape;
}) {
    if (!show || !message) return null;

    return (
        <Text
            className="mt-1 text-[11px] font-medium"
            style={{
                color: '#ef4444',
                fontFamily: theme.font.medium,
            }}
        >
            {message}
        </Text>
    );
}