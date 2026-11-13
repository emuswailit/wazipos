// components/retailers/stockOuts/OutOfStockFormModal.tsx
//
// Create / edit an out-of-stock request.
//
// Built from the shared form kit in @/components/common:
//   Modal (centred card on web, bottom sheet on native), ProductPickerAutocomplete,
//   CustomTextField, SelectDropdown, SwitchField, Button — wired through Formik + Yup.
//
// Saving is offline-first: create/edit are queued in RetailerOutOfStocksSyncContext.

import { Button } from '@/components/common/Button';
import { CustomTextField } from '@/components/common/CustomTextField';
import ImageWithFallback from '@/components/common/ImageWithFallback';
import { Modal } from '@/components/common/Modal';
import { ProductPickerAutocomplete } from '@/components/common/ProductPickerAutocomplete';
import { SelectDropdown, type SelectOption } from '@/components/common/SelectDropdown';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import { rememberProductTitle, useRetailerOutOfStocksSync } from '@/context/RetailerOutOfStocksSyncContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import { resolveImageUrl } from '@/lib/images';
import { Ionicons } from '@expo/vector-icons';
import { Formik, type FormikHelpers } from 'formik';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

interface UnitOption {
    value: string;
    label: string;
}

const DEFAULT_UNITS: UnitOption[] = [
    { value: 'Piece', label: 'Piece' },
    { value: 'Pack', label: 'Pack' },
    { value: 'Box', label: 'Box' },
    { value: 'Carton', label: 'Carton' },
    { value: 'Dozen', label: 'Dozen' },
    { value: 'Kilogram', label: 'Kilogram' },
    { value: 'Gram', label: 'Gram' },
    { value: 'Litre', label: 'Litre' },
];

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

type OutOfStockFormMode = 'create' | 'edit';

interface OutOfStockFormModalProps {
    visible: boolean;
    mode: OutOfStockFormMode;
    item?: RetailerOutOfStockNormalized | null;
    onClose: () => void;
    onSaved?: (id: string) => void;
    units?: UnitOption[];
}

/* ------------------------------------------------------------------ */
/* Form values + validation                                            */
/* ------------------------------------------------------------------ */

interface FormValues {
    productId: string;
    productTitle: string;
    unitOfReceipt: string;
    requiredQuantity: string;
    customerName: string;
    customerPhone: string;
    isSpecialOrder: boolean;
}

function initialValuesFor(item: RetailerOutOfStockNormalized | null | undefined, units: UnitOption[]): FormValues {
    if (item) {
        return {
            productId: item.product ?? '',
            productTitle: item.product_title ?? '',
            unitOfReceipt: item.unit_of_receipt || units[0]?.value || '',
            requiredQuantity: String(item.required_quantity ?? 1),
            customerName: item.customer_name ?? '',
            customerPhone: item.customer_phone ?? '',
            isSpecialOrder: !!item.is_special_order,
        };
    }
    return {
        productId: '',
        productTitle: '',
        unitOfReceipt: units[0]?.value ?? '',
        requiredQuantity: '1',
        customerName: '',
        customerPhone: '',
        isSpecialOrder: false,
    };
}

const PHONE_RE = /^\+?[0-9][0-9\s-]{7,14}$/;

function buildSchema(isEdit: boolean) {
    return Yup.object({
        productId: isEdit ? Yup.string() : Yup.string().required('Pick the product that is out of stock'),
        requiredQuantity: Yup.string()
            .required('Enter how many are needed')
            .test('positive-int', 'Enter a whole number of at least 1', (v) => {
                const n = Number(v);
                return Number.isInteger(n) && n >= 1;
            }),
        customerName: Yup.string().max(120, 'Name is too long'),
        customerPhone: Yup.string().test('phone', 'Enter a valid phone number', (v) => !v || PHONE_RE.test(v.trim())),
    });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function OutOfStockFormModal({ visible, mode, item, onClose, onSaved, units = DEFAULT_UNITS }: OutOfStockFormModalProps) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isWide = width >= 640;

    const { productsList, isProductsSyncing } = useProductsSync();
    const { createOutOfStock, queueOutOfStockEdit } = useRetailerOutOfStocksSync();

    const isEdit = mode === 'edit' && !!item;
    const [submitError, setSubmitError] = useState<string | null>(null);

    const unitOptions: SelectOption[] = useMemo(() => units.map((u) => ({ value: u.value, label: u.label })), [units]);
    const schema = useMemo(() => buildSchema(isEdit), [isEdit]);
    const initialValues = useMemo(() => initialValuesFor(isEdit ? item : null, units), [isEdit, item, units]);

    const handleSubmit = async (values: FormValues, helpers: FormikHelpers<FormValues>) => {
        setSubmitError(null);
        const qty = Math.floor(Number(values.requiredQuantity));
        const customer_name = values.customerName.trim() || null;
        const customer_phone = values.customerPhone.trim() || null;
        try {
            if (isEdit && item) {
                await queueOutOfStockEdit(item.remote_id, {
                    product: item.product,
                    required_quantity: qty,
                    is_special_order: values.isSpecialOrder,
                    customer_name,
                    customer_phone,
                });
                onSaved?.(item.remote_id);
            } else {
                const draftId = await createOutOfStock({
                    product: values.productId,
                    required_quantity: qty,
                    is_special_order: values.isSpecialOrder,
                    customer_name,
                    customer_phone,
                    unit_of_receipt: values.unitOfReceipt,
                });
                onSaved?.(draftId);
            }
            onClose();
        } catch (e: any) {
            setSubmitError(e?.message || (isEdit ? 'Could not save the changes.' : 'Could not save the out-of-stock request.'));
        } finally {
            helpers.setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} onClose={onClose} title={isEdit ? 'Edit out-of-stock' : 'New out-of-stock'} maxHeightRatio={0.9}>
            <Formik
                // Fresh form every time it opens (and per item when editing)
                key={`${visible}-${mode}-${item?.remote_id ?? 'new'}`}
                initialValues={initialValues}
                validationSchema={schema}
                onSubmit={handleSubmit}
            >
                {(formik) => {
                    const { values, errors, touched, submitCount, isSubmitting, setFieldValue, setFieldTouched } = formik;
                    const showError = (k: keyof FormValues) => ((touched[k] || submitCount > 0) && errors[k] ? String(errors[k]) : undefined);
                    const qty = Math.max(0, Math.floor(Number(values.requiredQuantity) || 0));
                    const bump = (delta: number) => setFieldValue('requiredQuantity', String(Math.max(1, qty + delta)));

                    // Picker (controlled): find the full product for its title + thumbnail
                    const selectedProduct = values.productId
                        ? (productsList ?? []).find((p: any) => p?.remote_id === values.productId || p?.id === values.productId) ??
                          ({ remote_id: values.productId, id: values.productId, title: values.productTitle } as any)
                        : null;

                    return (
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                            <ScrollView
                                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 18 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {submitError ? (
                                    <View className="flex-row items-start gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.10)' }}>
                                        <Ionicons name="alert-circle" size={16} color="#f43f5e" style={{ marginTop: 1 }} />
                                        <Text style={{ flex: 1, color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{submitError}</Text>
                                    </View>
                                ) : null}

                                {/* ---------- Product ---------- */}
                                <Section title="Product" theme={theme}>
                                    {isEdit && item ? (
                                        <ProductCard item={item} />
                                    ) : (
                                        <View style={{ zIndex: 1000 }}>
                                            <ProductPickerAutocomplete
                                                products={productsList}
                                                value={selectedProduct}
                                                onSelect={(p: any) => {
                                                    const id = String(p?.remote_id ?? p?.id ?? '');
                                                    const title = String(p?.title ?? p?.product_title ?? '');
                                                    setFieldValue('productId', id);
                                                    setFieldValue('productTitle', title);
                                                    setFieldTouched('productId', true, false);
                                                    if (id) rememberProductTitle(id, title);
                                                }}
                                                onClear={() => {
                                                    setFieldValue('productId', '');
                                                    setFieldValue('productTitle', '');
                                                }}
                                                error={showError('productId')}
                                                imageKey="images"
                                                label="Product"
                                                required
                                                placeholder="Search products…"
                                                debounceMs={250}
                                                maxDropdownHeight={300}
                                                disabled={isSubmitting}
                                                testID="out-of-stock.product"
                                            />
                                            {isProductsSyncing && (productsList?.length ?? 0) === 0 ? (
                                                <Text style={{ marginTop: 6, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>Loading catalogue…</Text>
                                            ) : null}
                                        </View>
                                    )}
                                </Section>

                                {/* ---------- Quantity ---------- */}
                                <Section title="Quantity needed" theme={theme}>
                                    <View style={{ flexDirection: isWide && !isEdit ? 'row' : 'column', gap: 12 }}>
                                        <View style={{ flex: isWide && !isEdit ? 1 : undefined }}>
                                            <View className="flex-row items-end gap-2">
                                                <View style={{ flex: 1 }}>
                                                    {/* Controlled (not `name`-bound): with `name`, the field's own
                                                        onChangeText replaces ours and the digits-only filter is lost. */}
                                                    <CustomTextField
                                                        value={values.requiredQuantity}
                                                        onBlur={() => setFieldTouched('requiredQuantity', true)}
                                                        label="Quantity"
                                                        keyboardType="number-pad"
                                                        placeholder="1"
                                                        editable={!isSubmitting}
                                                        onChangeText={(t) => setFieldValue('requiredQuantity', t.replace(/[^0-9]/g, ''))}
                                                        error={showError('requiredQuantity')}
                                                    />
                                                </View>
                                                <StepButton icon="remove" onPress={() => bump(-1)} disabled={isSubmitting || qty <= 1} label="Decrease quantity" />
                                                <StepButton icon="add" onPress={() => bump(1)} disabled={isSubmitting} label="Increase quantity" />
                                            </View>
                                        </View>

                                        {!isEdit ? (
                                            <View style={{ flex: isWide ? 1 : undefined }}>
                                                <SelectDropdown
                                                    name="unitOfReceipt"
                                                    label="Unit"
                                                    options={unitOptions}
                                                    placeholder="Select unit…"
                                                    disabled={isSubmitting}
                                                    maxHeight={220}
                                                />
                                            </View>
                                        ) : null}
                                    </View>
                                </Section>

                                {/* ---------- Customer ---------- */}
                                <Section title="Customer" hint="Optional — who asked for it, so you can let them know when it arrives." theme={theme}>
                                    <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
                                        <View style={{ flex: isWide ? 1 : undefined }}>
                                            <CustomTextField
                                                name="customerName"
                                                label="Name"
                                                placeholder="e.g. Jane Wanjiku"
                                                autoCapitalize="words"
                                                editable={!isSubmitting}
                                                error={showError('customerName')}
                                            />
                                        </View>
                                        <View style={{ flex: isWide ? 1 : undefined }}>
                                            <CustomTextField
                                                name="customerPhone"
                                                label="Phone"
                                                placeholder="e.g. 0712 345 678"
                                                keyboardType="phone-pad"
                                                editable={!isSubmitting}
                                                error={showError('customerPhone')}
                                            />
                                        </View>
                                    </View>
                                </Section>

                                {/* ---------- Special order ---------- */}
                                <View
                                    className="rounded-2xl px-3.5 py-3"
                                    style={{ backgroundColor: values.isSpecialOrder ? 'rgba(139,92,246,0.08)' : isDarkMode ? '#0f172a' : '#f8fafc' }}
                                >
                                    <SwitchField
                                        name="isSpecialOrder"
                                        label="Special order"
                                        hint="Ordered specifically for this customer — not regular stock."
                                        row
                                        disabled={isSubmitting}
                                    />
                                </View>
                            </ScrollView>

                            {/* ---------- Footer ---------- */}
                            <View
                                style={{
                                    flexDirection: 'row',
                                    justifyContent: 'flex-end',
                                    gap: 8,
                                    paddingHorizontal: 16,
                                    paddingVertical: 12,
                                    borderTopWidth: 1,
                                    borderTopColor: theme.border,
                                }}
                            >
                                <Button variant="ghost" onPress={onClose} disabled={isSubmitting}>
                                    Cancel
                                </Button>
                                <Button onPress={() => formik.handleSubmit()} loading={isSubmitting} disabled={isSubmitting}>
                                    {isEdit ? 'Save changes' : 'Add to out-of-stock'}
                                </Button>
                            </View>
                        </KeyboardAvoidingView>
                    );
                }}
            </Formik>
        </Modal>
    );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Section({ title, hint, theme, children }: { title: string; hint?: string; theme: any; children: React.ReactNode }) {
    return (
        <View style={{ gap: 8 }}>
            <View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{title}</Text>
                {hint ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }}>{hint}</Text> : null}
            </View>
            {children}
        </View>
    );
}

/** Read-only product card shown when editing (the product can't be changed). */
function ProductCard({ item }: { item: RetailerOutOfStockNormalized }) {
    const { theme, isDarkMode } = useAuth();
    const img: any = item.images?.[0];
    const uri = resolveImageUrl(img?.thumbnail || img?.image || img) as any;
    return (
        <View className="flex-row items-start gap-3 rounded-2xl p-3" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }}>
            <View className="w-12 h-12 rounded-xl overflow-hidden items-center justify-center" style={{ backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' }}>
                <ImageWithFallback uri={uri} width={48} height={48} fallback="📦" fallbackSize={20} borderRadius={12} />
            </View>
            <View className="flex-1 min-w-0">
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14, lineHeight: 19 }}>{item.product_title || 'Unnamed product'}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }}>
                    {item.unit_of_receipt ? `Unit: ${item.unit_of_receipt} · ` : ''}The product can't be changed once recorded.
                </Text>
            </View>
        </View>
    );
}

function StepButton({ icon, onPress, disabled, label }: { icon: 'add' | 'remove'; onPress: () => void; disabled?: boolean; label: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={4}
            style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? `${theme.primary}22` : isDarkMode ? '#0f172a' : '#f1f5f9',
                opacity: disabled ? 0.4 : 1,
                ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : {}),
            })}
        >
            <Ionicons name={icon} size={18} color={theme.primary} />
        </Pressable>
    );
}
