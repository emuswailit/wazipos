// components/retailers/retailerPrescriptions/AddPrescriptionItemForm.tsx
//
// Digitizing form for one prescription item, shared by admins and pharmacy staff.
//   - Preparation and/or product (at least one).
//   - Prescribed quantity (only with a product) + "allow partial purchase" switch.
//   - Dose, duration, frequency, route, unit, instructions (optional).
//   - Pharmacy mode only: pick one of your stock batches to quote it in the same
//     step (admins have no inventory, so they never quote).
// Adding a medicine that is already on the prescription offers to update it.

import { pharmacyRxClient, type PrescriptionsClient } from '@/api/retailerPrescriptionsApi';
import ApiErrorModal, { FlatFieldError } from '@/components/common/ApiErrorModal';
import CustomTextField from '@/components/common/CustomTextField';
import { ProductPickerAutocomplete } from '@/components/common/ProductPickerAutocomplete';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useAuth } from '@/context/AuthContext';
import { useFrequenciesSync } from '@/context/FrequenciesSyncContext';
import { usePreparationsSync } from '@/context/PreparationsSyncContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import { useRoutesSync } from '@/context/RoutesSyncContext';
import { Formik, FormikHelpers } from 'formik';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as Yup from 'yup';

import type { PrescriptionNormalized } from './RetailerPrescriptionsList';
import { StockBatchSelect, type StockBatch } from './StockBatchSelect';

const UNIT_OF_ISSUE_OPTIONS = ['Piece', 'Pack', 'Box', 'Carton', 'Bottle', 'Tube', 'Sachet', 'Ampoule', 'Vial', 'Roll', 'Dozen', 'Gram', 'Kilogram', 'Litre', 'Millilitre'].map(
    (v) => ({ value: v, label: v })
);

interface FormValues {
    preparation: string;
    product: any | null;
    dose: string;
    days: string;
    frequency: string;
    route: string;
    required_unit_quantity: string;
    instruction: string;
    unit_of_issue: string;
    allow_partial_purchase: boolean;
    retailer_receipt: string;
    quote_quantity: string;
}

const INITIAL_VALUES: FormValues = {
    preparation: '',
    product: null,
    dose: '',
    days: '',
    frequency: '',
    route: '',
    required_unit_quantity: '',
    instruction: '',
    unit_of_issue: 'Piece',
    allow_partial_purchase: false,
    retailer_receipt: '',
    quote_quantity: '',
};

const PICK_ONE_MESSAGE = 'Pick a preparation, a product, or both.';

const VALIDATION_SCHEMA = Yup.object().shape({
    product: Yup.mixed().nullable().test('product-or-preparation', PICK_ONE_MESSAGE, function (value) {
        return !!value || !!this.parent.preparation;
    }),
    required_unit_quantity: Yup.string()
        .matches(/^\d*$/, 'Quantity must be a whole number.')
        .test('needs-product', 'Select a product to set a quantity.', function (value) {
            return !value || !!this.parent.product;
        })
        .test('needs-qty-for-batch', 'Enter the prescribed quantity to quote from a batch.', function (value) {
            return !this.parent.retailer_receipt || (!!value && parseInt(value, 10) > 0);
        }),
    quote_quantity: Yup.string()
        .matches(/^\d*$/, 'Quantity must be a whole number.')
        .test('within-prescribed', 'Quote between 1 and the prescribed quantity.', function (value) {
            if (!value || !this.parent.retailer_receipt) return true;
            const q = parseInt(value, 10);
            const max = parseInt(this.parent.required_unit_quantity || '0', 10);
            return q > 0 && (!max || q <= max);
        }),
});

interface Props {
    prescription: PrescriptionNormalized;
    /** Items already on the prescription — used to offer "update" instead of a duplicate. */
    existingItems?: any[];
    /** Where to post (pharmacy remote API or the admin API). */
    client?: PrescriptionsClient;
    onSuccess: () => void;
    onCancel?: () => void;
}

const idOf = (v: any): string => (v && typeof v === 'object' ? String(v.remote_id ?? v.id ?? '') : v ? String(v) : '');

/** The existing line for the same product (or, with no product, the same preparation). */
function findExistingItem(items: any[], productId?: string, preparationId?: string): any | null {
    if (productId) return items.find((it) => idOf(it.product) === productId) ?? null;
    if (preparationId) return items.find((it) => !idOf(it.product) && idOf(it.preparation) === preparationId) ?? null;
    return null;
}

/** Cross-platform yes/no prompt (Alert has no web implementation). */
function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: confirmLabel, onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
}

function notify(title: string, message: string) {
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert(title, message);
}

export function AddPrescriptionItemForm({ prescription, existingItems = [], client = pharmacyRxClient, onSuccess, onCancel }: Props) {
    const { theme } = useAuth();
    const isAdmin = client.scope === 'admin';

    const rawId = prescription?.id || (prescription as any)?.remote_id || (prescription as any)?.key || (prescription as any)?._id;
    const prescriptionId = rawId ? String(rawId) : null;

    const { productsList, isProductsSyncing } = useProductsSync();
    const { preparationsList, isPreparationsSyncing } = usePreparationsSync();
    const { routesList, isRoutesSyncing } = useRoutesSync();
    const { frequenciesList, isFrequenciesSyncing } = useFrequenciesSync();

    const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
    const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
    const [apiErrors, setApiErrors] = useState<FlatFieldError[]>([]);
    const [batches, setBatches] = useState<StockBatch[]>([]);

    const preparationOptions = useMemo(() => preparationsList.map((p) => ({ value: p.remote_id, label: p.long_title || p.title })), [preparationsList]);
    const routeOptions = useMemo(() => routesList.map((r) => ({ value: r.remote_id, label: r.title })), [routesList]);
    const frequencyOptions = useMemo(() => frequenciesList.map((f) => ({ value: f.remote_id, label: f.title })), [frequenciesList]);

    const showError = (message: string, errors: string[] = []) => {
        setApiErrorMessage(message);
        setApiErrors(
            errors.map((err) => {
                const parts = String(err).split(':');
                return parts.length > 1 ? { field: parts[0].trim(), message: parts.slice(1).join(':').trim() } : { field: '', message: String(err) };
            })
        );
        setIsErrorModalVisible(true);
    };

    const buildFields = (values: FormValues, productId?: string) => {
        const qty = productId && values.required_unit_quantity ? parseInt(values.required_unit_quantity, 10) : undefined;
        const receipt = !isAdmin && productId && values.retailer_receipt ? values.retailer_receipt : undefined;
        const quoteQty = receipt ? (values.allow_partial_purchase && values.quote_quantity ? parseInt(values.quote_quantity, 10) : qty) : undefined;
        return {
            product_id: productId,
            preparation_id: values.preparation || undefined,
            route_id: values.route || undefined,
            frequency_id: values.frequency || undefined,
            dose: values.dose.trim() || undefined,
            days: values.days ? parseInt(values.days, 10) : undefined,
            required_unit_quantity: qty,
            instruction: values.instruction.trim() || undefined,
            unit_of_issue: productId ? values.unit_of_issue : undefined,
            allow_partial_purchase: values.allow_partial_purchase ? 'true' : 'false',
            retailer_receipt: receipt,
            quote_quantity: quoteQty,
        };
    };

    const handleSubmit = async (values: FormValues, { setSubmitting, resetForm }: FormikHelpers<FormValues>) => {
        if (!prescriptionId) {
            showError('Prescription ID is missing from the selected prescription.');
            setSubmitting(false);
            return;
        }
        const productId = values.product ? String(values.product.remote_id || values.product.id) : undefined;
        if (!productId && !values.preparation) {
            showError(PICK_ONE_MESSAGE);
            setSubmitting(false);
            return;
        }
        const fields = buildFields(values, productId);
        if (fields.retailer_receipt) {
            const batch = batches.find((b) => b.id === fields.retailer_receipt);
            if (batch && fields.quote_quantity && fields.quote_quantity > batch.current_unit_quantity) {
                showError(`Only ${batch.current_unit_quantity} in stock for this batch.`);
                setSubmitting(false);
                return;
            }
        }

        try {
            const existing = findExistingItem(existingItems, productId, values.preparation || undefined);
            let res;
            if (existing) {
                const name = existing.product_title || existing.preparation_title || 'This medicine';
                const ok = await confirmAsync('Already on this prescription', `${name} is already added. Update it with the new details?`, 'Update');
                if (!ok) return;
                res = await client.post({ action: 'UpdateRetailPrescriptionItem', prescription_item_id: String(existing.id), ...fields });
            } else {
                res = await client.post({ action: 'CreateRetailPrescriptionItem', prescription_id: prescriptionId, ...fields });
            }
            if (!res.ok) throw new Error('Network request failed');
            if (res.data?.response_code === 0) {
                const verb = existing ? 'Updated' : 'Added';
                notify(verb, fields.retailer_receipt ? `${verb} and added to your quotation.` : res.data?.response_message || `${verb}.`);
                resetForm();
                onSuccess();
            } else {
                showError(res.data?.response_message || 'Failed to save the item.', Array.isArray(res.data?.errors) ? res.data.errors : []);
            }
        } catch (e: any) {
            showError(e?.message || 'An unexpected error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Formik initialValues={INITIAL_VALUES} validationSchema={VALIDATION_SCHEMA} onSubmit={handleSubmit} validateOnMount>
                {(formik) => {
                    const isSubmitDisabled = formik.isSubmitting || isProductsSyncing || !prescriptionId;
                    const hasProduct = !!formik.values.product;
                    const partial = formik.values.allow_partial_purchase;
                    const filteredProducts = formik.values.preparation ? productsList.filter((p) => String(p.preparation) === formik.values.preparation) : productsList;

                    return (
                        <View className="flex-1">
                            <ScrollView className="p-3" keyboardShouldPersistTaps="handled">
                                {/* Patient */}
                                <View className="p-3 rounded-xl border mb-4" style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}>
                                    <Text className="uppercase tracking-widest font-bold text-[11px] mb-1" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                                        Patient
                                    </Text>
                                    <Text className="font-bold text-[15px]" style={{ color: theme.text, fontFamily: theme.font.bold }}>
                                        {prescription.patient_name || 'Unknown patient'}
                                    </Text>
                                    <Text className="text-[11px] mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>
                                        {prescription.patient_gender || 'N/A'} · DOB: {prescription.patient_date_of_birth || 'N/A'}
                                        {prescription.nature ? ` · ${prescription.nature}` : ''}
                                    </Text>
                                </View>

                                <View className="mb-3" style={{ zIndex: 40 }}>
                                    <SelectDropdown
                                        name="preparation"
                                        label="Preparation form"
                                        options={preparationOptions}
                                        placeholder={isPreparationsSyncing ? 'Loading preparations…' : 'Filter by preparation…'}
                                        disabled={formik.isSubmitting || isPreparationsSyncing}
                                    />
                                </View>

                                <Text className="text-[11px] mb-3 -mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>
                                    {isAdmin
                                        ? 'Pick a preparation, a product, or both. The pharmacy quotes it from its own stock.'
                                        : 'Pick a preparation, a product, or both. With a product you can quote it from one of your stock batches.'}
                                </Text>

                                <View className="mb-3" style={{ zIndex: 30 }}>
                                    <ProductPickerAutocomplete
                                        products={filteredProducts}
                                        value={formik.values.product}
                                        onSelect={(product) => {
                                            formik.setFieldValue('product', product);
                                            formik.setFieldTouched('product', true);
                                            if (!formik.values.preparation && product.preparation) formik.setFieldValue('preparation', String(product.preparation));
                                        }}
                                        onClear={() => {
                                            formik.setFieldValue('product', null);
                                            formik.setFieldTouched('product', true);
                                            formik.setFieldValue('required_unit_quantity', '');
                                            formik.setFieldValue('retailer_receipt', '');
                                            formik.setFieldValue('quote_quantity', '');
                                        }}
                                        label="Product / medication"
                                        error={formik.submitCount > 0 || formik.touched.product ? (formik.errors.product as string | undefined) : undefined}
                                        placeholder={isProductsSyncing ? 'Loading catalog…' : 'Search products…'}
                                        disabled={formik.isSubmitting || isProductsSyncing}
                                    />
                                </View>

                                {/* Quantity + partial purchase */}
                                <View className="flex-row gap-3 mb-3">
                                    <View className="flex-1">
                                        <CustomTextField
                                            name="required_unit_quantity"
                                            label={hasProduct ? 'Prescribed quantity' : 'Quantity (needs a product)'}
                                            placeholder={hasProduct ? 'e.g. 14' : 'Select product first'}
                                            keyboardType="number-pad"
                                            editable={!formik.isSubmitting && hasProduct}
                                            style={{ minHeight: 40, paddingVertical: 10, opacity: hasProduct ? 1 : 0.5 }}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <SelectDropdown name="unit_of_issue" label="Unit" options={UNIT_OF_ISSUE_OPTIONS} disabled={formik.isSubmitting || !hasProduct} />
                                    </View>
                                </View>

                                <View className="flex-row items-center rounded-xl border px-3 py-2.5 mb-3" style={{ borderColor: theme.border, backgroundColor: theme.surfaceAlt }}>
                                    <View className="flex-1 pr-3">
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>Allow partial purchase</Text>
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, marginTop: 1 }}>
                                            {partial
                                                ? 'The customer may buy part now and the rest later.'
                                                : 'The full prescribed quantity must be bought at once.'}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={partial}
                                        onValueChange={(v) => {
                                            formik.setFieldValue('allow_partial_purchase', v);
                                            if (!v) formik.setFieldValue('quote_quantity', '');
                                        }}
                                        disabled={formik.isSubmitting}
                                        accessibilityLabel="Allow partial purchase"
                                    />
                                </View>

                                {/* Pharmacy only: quote from a stock batch */}
                                {!isAdmin && hasProduct ? (
                                    <View className="mb-3" style={{ zIndex: 25 }}>
                                        <StockBatchSelect
                                            productId={String(formik.values.product?.remote_id || formik.values.product?.id || '') || null}
                                            disabled={formik.isSubmitting}
                                            onBatchesChange={setBatches}
                                        />
                                    </View>
                                ) : null}
                                {!isAdmin && hasProduct && formik.values.retailer_receipt && partial ? (
                                    <View className="mb-3">
                                        <CustomTextField
                                            name="quote_quantity"
                                            label="Quantity you can supply"
                                            placeholder={formik.values.required_unit_quantity || '1'}
                                            keyboardType="number-pad"
                                            editable={!formik.isSubmitting}
                                            hint="Leave empty to quote the full prescribed quantity."
                                            style={{ minHeight: 40, paddingVertical: 10 }}
                                        />
                                    </View>
                                ) : null}

                                {/* Dosing (optional) */}
                                <View className="flex-row gap-3 mb-3">
                                    <View className="flex-1">
                                        <CustomTextField name="dose" label="Dose" placeholder="500mg" editable={!formik.isSubmitting} style={{ minHeight: 40, paddingVertical: 10 }} />
                                    </View>
                                    <View className="flex-1">
                                        <CustomTextField name="days" label="Duration (days)" placeholder="7" keyboardType="number-pad" editable={!formik.isSubmitting} style={{ minHeight: 40, paddingVertical: 10 }} />
                                    </View>
                                </View>
                                <View className="flex-row gap-3 mb-3">
                                    <View className="flex-1" style={{ zIndex: 10 }}>
                                        <SelectDropdown
                                            name="frequency"
                                            label="Frequency"
                                            options={frequencyOptions}
                                            placeholder={isFrequenciesSyncing ? 'Loading…' : 'Select…'}
                                            disabled={formik.isSubmitting || isFrequenciesSyncing}
                                        />
                                    </View>
                                    <View className="flex-1" style={{ zIndex: 5 }}>
                                        <SelectDropdown
                                            name="route"
                                            label="Route"
                                            options={routeOptions}
                                            placeholder={isRoutesSyncing ? 'Loading…' : 'Select…'}
                                            disabled={formik.isSubmitting || isRoutesSyncing}
                                        />
                                    </View>
                                </View>
                                <View className="mb-2">
                                    <CustomTextField name="instruction" label="Instructions (optional)" placeholder="Take after meals" editable={!formik.isSubmitting} style={{ minHeight: 50, paddingVertical: 10 }} />
                                </View>
                            </ScrollView>

                            {/* Footer */}
                            <View className="flex-row justify-end gap-2 p-3 border-t" style={{ borderTopColor: theme.border }}>
                                {onCancel ? (
                                    <Pressable onPress={onCancel} disabled={formik.isSubmitting} className="px-4 py-2 rounded-xl border" style={{ borderColor: theme.border }}>
                                        <Text className="uppercase tracking-wide font-bold text-[11px]" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                                            Cancel
                                        </Text>
                                    </Pressable>
                                ) : null}
                                <Pressable
                                    onPress={() => formik.handleSubmit()}
                                    disabled={isSubmitDisabled}
                                    className="px-5 py-2 rounded-xl flex-row items-center justify-center gap-2"
                                    style={{ backgroundColor: theme.primary, opacity: isSubmitDisabled ? 0.7 : 1, minWidth: 120 }}
                                >
                                    {formik.isSubmitting ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                                    <Text className="uppercase tracking-wide font-bold text-[11px]" style={{ color: '#ffffff', fontFamily: theme.font.bold }}>
                                        {formik.isSubmitting ? 'Saving…' : 'Add item'}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    );
                }}
            </Formik>

            <ApiErrorModal visible={isErrorModalVisible} message={apiErrorMessage} errors={apiErrors} onClose={() => setIsErrorModalVisible(false)} />
        </>
    );
}
