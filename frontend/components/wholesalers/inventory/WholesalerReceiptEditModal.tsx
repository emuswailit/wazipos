// components/wholesalers/inventory/WholesalerReceiptEditModal.tsx

import {
    BarcodeScannerInput,
    CustomTextField,
    DateField,
    ProductPickerAutocomplete,
    SelectDropdown,
    type SelectOption,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import {
    buildDraftId,
    useWholesalerReceiptsSync,
} from '@/context/WholesalerReceiptsSyncContext';
import type { WholesalerReceipt } from '@/databases/types';
import { Formik } from 'formik';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import * as Yup from 'yup';

/* =========================================================
 * Unit options
 * ======================================================= */
const UNIT_OPTIONS: SelectOption[] = [
    { value: 'Gram', label: 'Gram', description: 'g' },
    { value: 'Kilogram', label: 'Kilogram', description: 'kg' },
    { value: 'Litre', label: 'Litre', description: 'L' },
    { value: 'Millilitre', label: 'Millilitre', description: 'mL' },
    { value: 'Piece', label: 'Piece', description: 'pc' },
    { value: 'Pack', label: 'Pack', description: 'pkt' },
];

/* =========================================================
 * Types
 * ======================================================= */
interface Props {
    visible: boolean;
    receipt: WholesalerReceipt | null;
    onClose: () => void;
    onSave: (
        payload: WholesalerReceiptDraft,
        mode: 'create' | 'edit'
    ) => Promise<void> | void;
    onSearchProduct?: (query: string) => Promise<any[]>;
}

export interface WholesalerReceiptDraft {
    id?: number | string;
    remote_id?: string;
    draft_id?: string;
    product_id?: number | string;
    product?: string;
    title: string;
    bar_code: string;
    thumbnail_url?: string;
    batch: string;
    unit_of_receipt: string;
    received_unit_quantity: number;
    unit_buying_price: number;
    final_unit_selling_price: number;
    manufacture_date: string;
    expiry_date: string;
}

/* =========================================================
 * Yup schema
 * ======================================================= */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalDate = Yup.string()
    .trim()
    .test('iso', 'Use YYYY-MM-DD', (v) => !v || ISO_DATE.test(v))
    .test('valid', 'Invalid date', (v) => {
        if (!v) return true;
        const d = new Date(v.replace(' ', 'T'));
        return !isNaN(d.getTime());
    });

const schema = Yup.object({
    title: Yup.string().trim().required('Select a product'),
    bar_code: Yup.string().trim(),
    batch: Yup.string().trim(),
    unit_of_receipt: Yup.string()
        .trim()
        .required('Select a unit of receipt'),
    received_unit_quantity: Yup.number()
        .typeError('Quantity must be a number')
        .min(0, 'Quantity must be ≥ 0')
        .required(),
    unit_buying_price: Yup.number()
        .typeError('Buying price must be a number')
        .min(0, 'Buying price must be ≥ 0')
        .required(),
    final_unit_selling_price: Yup.number()
        .typeError('Selling price must be a number')
        .min(0, 'Selling price must be ≥ 0')
        .required()
        .test(
            'above-buying',
            'Selling price is below buying price',
            function (value) {
                const buy = this.parent.unit_buying_price;
                if (value == null || buy == null) return true;
                if (value <= 0) return true;
                return buy <= value;
            }
        ),
    manufacture_date: optionalDate,
    expiry_date: optionalDate.test(
        'after-mfg',
        'Expiry must be on/after manufacture date',
        function (value) {
            const mfg = this.parent.manufacture_date;
            if (!value || !mfg) return true;
            const a = new Date(mfg.replace(' ', 'T')).getTime();
            const b = new Date(value.replace(' ', 'T')).getTime();
            if (isNaN(a) || isNaN(b)) return true;
            return b >= a;
        }
    ),
});

/* =========================================================
 * Helpers
 * ======================================================= */
function toDraft(
    receipt: WholesalerReceipt | null,
    userId?: string | number
): WholesalerReceiptDraft {
    const existing = (receipt as any)?.draft_id as
        | string
        | undefined;

    const productId =
        (receipt as any)?.product_id ??
        (receipt as any)?.product;

    return {
        id: receipt?.id,
        remote_id:
            receipt?.remote_id != null
                ? String(receipt.remote_id)
                : undefined,
        draft_id:
            existing ??
            buildDraftId(userId, productId),
        product_id: productId,
        product: productId,
        title: receipt?.title ?? '',
        bar_code: receipt?.bar_code ?? '',
        thumbnail_url: receipt?.thumbnail_url ?? undefined,
        batch: receipt?.batch ? String(receipt.batch) : '',
        unit_of_receipt: receipt?.unit_of_receipt ?? '',
        received_unit_quantity:
            Number(
                (receipt as any)?.received_unit_quantity ??
                receipt?.current_unit_quantity ??
                0
            ) || 0,
        unit_buying_price:
            Number(
                (receipt as any)?.unit_buying_price ?? 0
            ) || 0,
        final_unit_selling_price:
            Number(
                (receipt as any)?.final_unit_selling_price ??
                (receipt as any)?.unit_selling_price ??
                0
            ) || 0,
        manufacture_date:
            (receipt as any)?.manufacture_date ?? '',
        expiry_date: receipt?.expiry_date ?? '',
    };
}

function pickThumb(p: any): string | undefined {
    const first = p?.images?.[0];
    if (!first) return undefined;
    if (typeof first === 'string') return first;
    return first?.thumbnail || first?.image || undefined;
}

function toNum(raw: string): number {
    const n = Number(
        String(raw ?? '').replace(/[^0-9.\-]/g, '')
    );
    return Number.isFinite(n) ? n : 0;
}

const fmtNum = (v: any) =>
    v == null || Number.isNaN(v) ? '' : String(v);

function buildReceiptFromDraft(
    values: WholesalerReceiptDraft,
    userId: string,
    existing: WholesalerReceipt | null
): WholesalerReceipt {
    const nowIso = new Date().toISOString();

    const days = (() => {
        if (!values.expiry_date) return null;
        const parts = values.expiry_date.split('-');
        if (parts.length !== 3) return null;
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const d = Number(parts[2]);
        if (
            !Number.isFinite(y) ||
            !Number.isFinite(m) ||
            !Number.isFinite(d)
        )
            return null;
        const expiry = new Date(y, m, d);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.round(
            (expiry.getTime() - today.getTime()) /
            (24 * 60 * 60 * 1000)
        );
    })();

    const expiryStatus = (() => {
        if (days === null) return 'UNKNOWN';
        if (days < 0) return 'EXPIRED';
        if (days <= 7) return 'EXPIRING_SOON';
        if (days <= 30) return 'EXPIRING';
        return 'FRESH';
    })();

    const draftId =
        values.draft_id ||
        buildDraftId(userId, values.product_id);

    const sellingPrice = String(
        values.final_unit_selling_price ?? 0
    );
    const buyingPrice =
        values.unit_buying_price != null
            ? String(values.unit_buying_price)
            : null;

    const qty = Number(values.received_unit_quantity || 0);

    return {
        id: existing?.id,
        cached_at: existing?.cached_at ?? nowIso,

        remote_id:
            existing?.remote_id ?? values.remote_id ?? '',
        remote_key: existing?.remote_key,

        synced: false,
        sync_error: null,

        thumbnail_url:
            values.thumbnail_url ??
            existing?.thumbnail_url ??
            null,
        image_url:
            values.thumbnail_url ??
            existing?.image_url ??
            null,

        title: values.title.trim(),
        long_title: values.title.trim(),
        product_title: values.title.trim(),
        product: String(values.product_id ?? ''),
        entity: existing?.entity ?? '',
        entity_title: existing?.entity_title ?? '',
        draft_id: draftId,
        preparation_title: '',
        formulation_title: '',

        received_from: existing?.received_from ?? null,
        received_from_title:
            existing?.received_from_title ?? '',
        manufacturer: existing?.manufacturer ?? '',
        manufacturer_title:
            existing?.manufacturer_title ?? '',

        unit_of_receipt: values.unit_of_receipt.trim(),
        retailer_order: existing?.retailer_order ?? null,
        retailer_order_item:
            existing?.retailer_order_item ?? null,
        wholesaler_order:
            existing?.wholesaler_order ?? null,
        wholesaler_order_item:
            existing?.wholesaler_order_item ?? null,
        batch: values.batch.trim() || null,

        bar_code: values.bar_code.trim(),

        manufacture_date: values.manufacture_date || null,
        expiry_date: values.expiry_date || null,
        days_to_expiry: days,
        expiry_status: expiryStatus,

        unit_buying_price: buyingPrice,
        unit_selling_price: sellingPrice,
        final_unit_selling_price: sellingPrice,
        discount_unit_selling_price:
            existing?.discount_unit_selling_price ??
            '0.00',
        recommended_retail_price:
            existing?.recommended_retail_price ?? null,
        unit_price_discount:
            existing?.unit_price_discount ?? '0.00',

        current_unit_quantity: qty,
        received_unit_quantity: qty,
        received_pack_quantity:
            existing?.received_pack_quantity ?? 0,

        in_placement: existing?.in_placement ?? false,
        is_active: existing?.is_active ?? 'true',
        is_pom: existing?.is_pom ?? false,
        supplier_invoice:
            existing?.supplier_invoice ?? null,

        origin_country: existing?.origin_country ?? '',
        origin_country_title:
            existing?.origin_country_title ?? '',
        packaging: existing?.packaging ?? '',
        units_per_pack: existing?.units_per_pack ?? 1,

        quantity_discounts:
            existing?.quantity_discounts ?? null,
        price_discount: existing?.price_discount ?? null,
        images:
            existing?.images ??
            (values.thumbnail_url
                ? [
                    {
                        id: '',
                        image: values.thumbnail_url,
                        thumbnail: values.thumbnail_url,
                        owner: '',
                        product: '',
                        entity: '',
                        created: nowIso,
                        updated: nowIso,
                    },
                ]
                : []),

        description: existing?.description ?? '',

        created: existing?.created ?? nowIso,
        updated: nowIso,
        employee: existing?.employee ?? '',
        owner: existing?.owner ?? '',
    } as WholesalerReceipt;
}

/* =========================================================
 * Modal
 * ======================================================= */
export function WholesalerReceiptEditModal({
    visible,
    receipt,
    onClose,
    onSave,
    onSearchProduct,
}: Props) {
    const { theme, isDarkMode, user } = useAuth();
    const { productsList, isProductsSyncing } = useProductsSync();
    const { addLocalReceipt, updateLocalReceipt } =
        useWholesalerReceiptsSync();
    const { width: vw } = useWindowDimensions();

    const isXs = vw < 480;
    const isSm = vw < 768;
    const isSmall = vw < 640;

    const bodyPadX = isXs ? 20 : isSm ? 24 : 16;
    const bodyPadY = isXs ? 16 : 20;
    const fieldGap = isXs ? 16 : 12;

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const mode: 'create' | 'edit' = receipt ? 'edit' : 'create';

    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(
        null
    );

    const pickerProducts = useMemo(
        () =>
            (productsList ?? []).map((p: any) => ({
                ...p,
                thumbnail_url: pickThumb(p) ?? '',
            })),
        [productsList]
    );

    const initialValues = useMemo(
        () => toDraft(receipt, (user as any)?.id),
        [receipt, (user as any)?.id]
    );

    if (!visible) return null;

    const RowClassName = isSm
        ? 'flex-col gap-4'
        : 'flex-row gap-3';

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={saving ? undefined : onClose}
        >
            <View
                className="flex-1 bg-black/55 items-center justify-center"
                style={{ padding: isSmall ? 0 : 16 }}
            >
                <Formik<WholesalerReceiptDraft>
                    initialValues={initialValues}
                    validationSchema={schema}
                    enableReinitialize
                    onSubmit={async (values, helpers) => {
                        setSubmitError(null);

                        const userId = String(
                            (user as any)?.id ?? ''
                        );

                        const resolvedDraftId =
                            mode === 'create'
                                ? buildDraftId(
                                    userId,
                                    values.product_id
                                )
                                : values.draft_id ||
                                buildDraftId(
                                    userId,
                                    values.product_id
                                );

                        const valuesWithDraft = {
                            ...values,
                            draft_id: resolvedDraftId,
                        };

                        const localReceipt =
                            buildReceiptFromDraft(
                                valuesWithDraft,
                                userId,
                                receipt
                            );

                        console.log(
                            '[WholesalerReceiptEditModal] About to persist:',
                            JSON.stringify(
                                localReceipt,
                                null,
                                2
                            )
                        );

                        try {
                            setSaving(true);

                            if (mode === 'create') {
                                const created =
                                    await addLocalReceipt(
                                        localReceipt
                                    );
                                console.log(
                                    '[WholesalerReceiptEditModal] Local insert ok',
                                    {
                                        draft_id:
                                            created?.draft_id,
                                    }
                                );
                            } else {
                                await updateLocalReceipt(
                                    localReceipt
                                );
                                console.log(
                                    '[WholesalerReceiptEditModal] Local update ok',
                                    {
                                        remote_id:
                                            localReceipt.remote_id,
                                    }
                                );
                            }

                            try {
                                await onSave(
                                    valuesWithDraft,
                                    mode
                                );
                            } catch (parentErr: any) {
                                console.warn(
                                    '[WholesalerReceiptEditModal] Parent onSave threw (non-fatal):',
                                    parentErr
                                );
                            }

                            onClose();
                        } catch (e: any) {
                            console.error(
                                '[WholesalerReceiptEditModal] Save failed',
                                e
                            );
                            setSubmitError(
                                e?.message ??
                                'Failed to save locally. Please try again.'
                            );
                        } finally {
                            setSaving(false);
                            helpers?.setSubmitting?.(false);
                        }
                    }}
                >
                    {(formik) => {
                        const {
                            values,
                            errors,
                            isSubmitting,
                            setFieldValue,
                            setTouched,
                            submitForm,
                        } = formik;

                        const handleSavePress = async () => {
                            try {
                                const touchedMap =
                                    Object.fromEntries(
                                        Object.keys(
                                            values ?? {}
                                        ).map((k) => [
                                            k,
                                            true,
                                        ])
                                    );
                                await setTouched(
                                    touchedMap,
                                    false
                                );
                                await submitForm();
                            } catch (err) {
                                console.error(
                                    '[WholesalerReceiptEditModal] handleSavePress threw:',
                                    err
                                );
                            }
                        };

                        return (
                            <View
                                className="rounded-2xl border"
                                style={{
                                    backgroundColor: theme.panel,
                                    borderColor,
                                    overflow: 'visible',
                                    width: '100%',
                                    maxWidth: isSmall
                                        ? '100%'
                                        : 900,
                                    flex: isSmall ? 1 : undefined,
                                    maxHeight: isSmall
                                        ? '100%'
                                        : '92%',
                                    borderRadius: isSmall ? 0 : 16,
                                }}
                            >
                                {/* -------- Header -------- */}
                                <View
                                    className="flex-row items-center justify-between border-b"
                                    style={{
                                        borderBottomColor:
                                            dividerColor,
                                        paddingHorizontal: bodyPadX,
                                        paddingVertical: isXs
                                            ? 14
                                            : 16,
                                    }}
                                >
                                    <View className="flex-1 min-w-0 pr-3">
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: isXs
                                                    ? 16
                                                    : theme
                                                        .fontSize
                                                        .lg,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {mode === 'create'
                                                ? 'New inventory item'
                                                : 'Edit inventory item'}
                                        </Text>
                                        <Text
                                            className="mt-0.5"
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.xs,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {values.title ||
                                                'No product selected'}
                                        </Text>
                                    </View>
                                    <Pressable
                                        onPress={
                                            saving
                                                ? undefined
                                                : onClose
                                        }
                                        hitSlop={12}
                                        className="items-center justify-center rounded-full"
                                        style={{
                                            width: isXs ? 36 : 32,
                                            height: isXs ? 36 : 32,
                                            backgroundColor:
                                                isDarkMode
                                                    ? '#334155'
                                                    : '#f1f5f9',
                                            opacity: saving
                                                ? 0.4
                                                : 1,
                                        }}
                                        disabled={saving}
                                    >
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 14,
                                            }}
                                        >
                                            ✕
                                        </Text>
                                    </Pressable>
                                </View>

                                {/* -------- Body -------- */}
                                <ScrollView
                                    style={{ flex: 1 }}
                                    contentContainerStyle={{
                                        paddingHorizontal:
                                            bodyPadX,
                                        paddingTop: bodyPadY,
                                        paddingBottom:
                                            bodyPadY + 8,
                                    }}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    {/* Product picker */}
                                    <SectionTitle
                                        label="Product"
                                        small={isXs}
                                    />
                                    <View style={{ zIndex: 200 }}>
                                        <ProductPickerAutocomplete
                                            name="title"
                                            label="Product"
                                            required
                                            products={
                                                pickerProducts
                                            }
                                            onSearch={
                                                onSearchProduct
                                            }
                                            titleKey="title"
                                            subtitleKey="bar_code"
                                            imageKey="thumbnail_url"
                                            placeholder={
                                                isProductsSyncing &&
                                                    productsList.length ===
                                                    0
                                                    ? 'Loading catalog…'
                                                    : 'Search by name or barcode…'
                                            }
                                            onAfterSelect={(
                                                p: any
                                            ) => {
                                                const nextId =
                                                    p?.remote_id ??
                                                    p?.id;
                                                setFieldValue(
                                                    'product_id',
                                                    nextId
                                                );
                                                setFieldValue(
                                                    'product',
                                                    nextId
                                                );

                                                if (
                                                    mode ===
                                                    'create'
                                                ) {
                                                    setFieldValue(
                                                        'draft_id',
                                                        buildDraftId(
                                                            (user as any)
                                                                ?.id,
                                                            nextId
                                                        )
                                                    );
                                                }
                                            }}
                                        />
                                    </View>

                                    {/* Barcode + Batch */}
                                    <View
                                        className={RowClassName}
                                        style={{
                                            marginTop: fieldGap,
                                        }}
                                    >
                                        <View className="flex-1">
                                            <BarcodeScannerInput
                                                name="bar_code"
                                                label="Bar code"
                                                placeholder="Scan or type…"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <CustomTextField
                                                name="batch"
                                                label="Batch"
                                                placeholder="Optional"
                                                autoCapitalize="none"
                                            />
                                        </View>
                                    </View>

                                    {/* Stock & pricing */}
                                    <SectionTitle
                                        label="Stock & pricing"
                                        small={isXs}
                                    />

                                    <View className={RowClassName}>
                                        <View className="flex-1">
                                            <CustomTextField
                                                name="received_unit_quantity"
                                                label="Quantity"
                                                placeholder="0"
                                                keyboardType="numeric"
                                                transform={toNum}
                                                format={fmtNum}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <SelectDropdown
                                                name="unit_of_receipt"
                                                label="Unit of Receipt"
                                                required
                                                options={
                                                    UNIT_OPTIONS
                                                }
                                                placeholder="Select unit…"
                                            />
                                        </View>
                                    </View>

                                    <View className={RowClassName}>
                                        <View className="flex-1">
                                            <CustomTextField
                                                name="unit_buying_price"
                                                label="Buying price (KES)"
                                                placeholder="0"
                                                keyboardType="numeric"
                                                transform={toNum}
                                                format={fmtNum}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <CustomTextField
                                                name="final_unit_selling_price"
                                                label="Selling price (KES)"
                                                placeholder="0"
                                                keyboardType="numeric"
                                                transform={toNum}
                                                format={fmtNum}
                                            />
                                        </View>
                                    </View>

                                    {/* Margin preview */}
                                    {values.final_unit_selling_price >
                                        0 &&
                                        values.unit_buying_price >= 0 &&
                                        values.unit_buying_price <=
                                        values.final_unit_selling_price ? (
                                        <View
                                            className="rounded-xl px-3 py-2 flex-row items-center justify-between"
                                            style={{
                                                backgroundColor: subBg,
                                                marginBottom: 8,
                                            }}
                                        >
                                            <Text
                                                className="uppercase tracking-widest"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                Margin
                                            </Text>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {(
                                                    ((values.final_unit_selling_price -
                                                        values.unit_buying_price) /
                                                        values.final_unit_selling_price) *
                                                    100
                                                ).toFixed(1)}
                                                %
                                            </Text>
                                        </View>
                                    ) : null}

                                    {/* Dates */}
                                    <SectionTitle
                                        label="Dates"
                                        small={isXs}
                                    />

                                    <View className={RowClassName}>
                                        <View className="flex-1">
                                            <DateField
                                                name="manufacture_date"
                                                label="Manufacture date"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <DateField
                                                name="expiry_date"
                                                label="Expiry date"
                                            />
                                        </View>
                                    </View>
                                </ScrollView>

                                {/* -------- Error banner -------- */}
                                {submitError ? (
                                    <View
                                        className="mx-4 mb-2 rounded-xl p-3"
                                        style={{
                                            backgroundColor:
                                                'rgba(239,68,68,0.12)',
                                            borderWidth: 1,
                                            borderColor:
                                                'rgba(239,68,68,0.35)',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: '#ef4444',
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.sm,
                                            }}
                                        >
                                            {submitError}
                                        </Text>
                                    </View>
                                ) : null}

                                {/* -------- Footer -------- */}
                                <View
                                    className={`border-t ${isSm
                                            ? 'flex-col-reverse gap-3'
                                            : 'flex-row justify-end gap-2'
                                        }`}
                                    style={{
                                        borderTopColor: dividerColor,
                                        paddingHorizontal: bodyPadX,
                                        paddingVertical: isXs
                                            ? 14
                                            : 16,
                                    }}
                                >
                                    <Pressable
                                        onPress={onClose}
                                        disabled={saving}
                                        hitSlop={6}
                                        className={`rounded-xl border items-center justify-center ${isSm
                                                ? 'w-full py-3.5'
                                                : 'px-4 py-3'
                                            }`}
                                        style={{
                                            borderColor,
                                            opacity: saving ? 0.5 : 1,
                                            minHeight: 48,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            Cancel
                                        </Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => {
                                            console.log(
                                                '[WholesalerReceiptEditModal] Save button pressed',
                                                {
                                                    mode,
                                                    saving,
                                                    isSubmitting,
                                                    values,
                                                    errors,
                                                }
                                            );
                                            handleSavePress();
                                        }}
                                        disabled={
                                            saving || isSubmitting
                                        }
                                        hitSlop={6}
                                        className={`rounded-xl flex-row items-center justify-center gap-2 ${isSm
                                                ? 'w-full py-3.5'
                                                : 'px-6 py-3'
                                            }`}
                                        style={{
                                            backgroundColor:
                                                theme.primary,
                                            opacity:
                                                saving || isSubmitting
                                                    ? 0.5
                                                    : 1,
                                            minHeight: 48,
                                        }}
                                    >
                                        {saving || isSubmitting ? (
                                            <ActivityIndicator
                                                size="small"
                                                color="#ffffff"
                                            />
                                        ) : null}
                                        <Text
                                            className="uppercase tracking-wide text-white"
                                            style={{
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            {mode === 'create'
                                                ? 'Create'
                                                : 'Save'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                        );
                    }}
                </Formik>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Section title
 * ======================================================= */
function SectionTitle({
    label,
    small,
}: {
    label: string;
    small?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <Text
            className="uppercase tracking-widest"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: small ? 11 : 10,
                marginTop: 12,
                marginBottom: 8,
            }}
        >
            {label}
        </Text>
    );
}