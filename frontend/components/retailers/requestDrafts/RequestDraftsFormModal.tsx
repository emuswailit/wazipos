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
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, ChoiceChips, FormSection } from '@/components/common/listScreen';
import type { Product, RequestDraftItem } from '@/databases/types';
import { Formik, type FormikHelpers } from 'formik';
import { useCallback, useMemo } from 'react';
import {
    Alert,
    Platform,
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
    const initialValues = useMemo(
        () => itemToFormValues(initialItem),
        [initialItem]
    );

    /*
     * Snapshot of the quantity value at the moment the field gains
     * focus. Used to restore it if the user blurs without typing.
     */

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
        <Formik<FormValues>
            initialValues={initialValues}
            enableReinitialize
            validationSchema={validationSchema}
            validateOnChange
            validateOnBlur
            onSubmit={handleFormSubmit}
        >
            {({ values, errors, touched, submitCount, setFieldValue, setFieldTouched, handleSubmit, isSubmitting }) => {
                const show = (k: keyof FormValues) => ((touched[k] || submitCount > 0) && typeof errors[k] === 'string' ? (errors[k] as string) : undefined);
                const picked = values.target_wholesaler_ids.length;
                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title={initialItem ? 'Edit product' : 'Add product'}
                        subtitle="Request basket"
                        icon="basket-outline"
                        submitLabel={initialItem ? 'Save changes' : 'Add to basket'}
                        submitting={isSubmitting}
                        onSubmit={() => handleSubmit()}
                    >
                        <FormSection title="Product" zIndex={40}>
                            <View style={{ zIndex: 300 }}>
                                <ProductPickerAutocomplete
                                    name="productId"
                                    fieldMap={{ id: 'productId', title: 'productTitle', bar_code: 'productBarCode', thumbnail_url: 'productThumbnailUrl' }}
                                    imageKey="thumbnail_url"
                                    titleKey="title"
                                    subtitleKey="bar_code"
                                    products={products as unknown as Product[]}
                                    label="Product"
                                    required
                                    placeholder={loadingProducts && products.length === 0 ? 'Loading catalogue…' : 'Search products…'}
                                    disabled={!!loadingProducts && products.length === 0}
                                    error={show('productId')}
                                />
                            </View>
                        </FormSection>

                        <FormSection title="How many, how soon">
                            <CustomTextField
                                label="Quantity"
                                required
                                value={values.quantity}
                                onChangeText={(v) => setFieldValue('quantity', v.replace(/[^0-9]/g, ''))}
                                onBlur={() => {
                                    if (!values.quantity) setFieldValue('quantity', DEFAULT_QUANTITY);
                                    setFieldTouched('quantity', true, true);
                                }}
                                keyboardType="number-pad"
                                placeholder={DEFAULT_QUANTITY}
                                error={show('quantity')}
                            />
                            <ChoiceChips
                                label="Urgency"
                                options={URGENCY_OPTIONS.map((u) => ({ value: u.value, label: u.label, color: u.tint }))}
                                value={values.urgency}
                                onChange={(v) => setFieldValue('urgency', v)}
                            />
                        </FormSection>

                        <FormSection
                            title="Wholesalers"
                            hint={picked > 0 ? `${picked} selected — only these will be asked for a quote.` : 'Leave empty to ask every wholesaler that stocks it.'}
                            zIndex={30}
                        >
                            <EntitiesMultiselectPicker
                                options={wholesalerOptions}
                                value={values.target_wholesaler_ids}
                                loading={loadingWholesalers}
                                placeholder="Select wholesalers…"
                                onChange={(ids: string[]) => setFieldValue('target_wholesaler_ids', ids)}
                            />
                        </FormSection>

                        <FormSection title="Note" hint="Optional — shown to the wholesalers.">
                            <CustomTextField
                                value={values.note}
                                onChangeText={(v) => setFieldValue('note', v)}
                                onBlur={() => setFieldTouched('note', true, true)}
                                placeholder="e.g. Need it before Friday"
                                multiline
                                numberOfLines={3}
                                error={show('note')}
                                hint={`${values.note.length}/${NOTE_MAX}`}
                            />
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}
