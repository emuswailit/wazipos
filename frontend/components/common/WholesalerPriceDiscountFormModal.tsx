// Reusable price-discount form modal. Self-contained.
//
// The modal uses `useFormik()` and republishes its bag through
// <FormikProvider> so context-aware children (DateField,
// WholesaleInventoryPicker, ImagePickerField via FormikImagePicker)
// can resolve useFormikContext().

import type { UUID } from "@/campaigns/types";
import { Button } from "@/components/common/Button";
import { DateField } from "@/components/common/DateField";
import { ImagePickerField } from "@/components/common/ImagePickerField";
import { WholesaleInventoryPicker } from "@/components/common/WholesaleInventoryPicker";
import { type ImageFieldValue } from "@/components/common/imagePicker";
import { useAuth } from "@/context/AuthContext";
import { useWholesalerReceiptsSync } from "@/context/WholesalerReceiptsSyncContext";
import type { WholesalerReceipt } from "@/databases/types";
import {
    FormikProvider,
    useFormik,
    type FormikErrors,
} from "formik";
import { useMemo, useState } from "react";
import {
    Keyboard,
    Platform,
    Pressable,
    Modal as RNModal,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import * as Yup from "yup";

/* =========================================================
 * Public types
 * ======================================================= */

export interface PriceDiscountPayload {
    wholesaler_receipt: UUID;
    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
    start: string;
    end: string;
    is_active: "true" | "false";
    banner: ImageFieldValue;
}

export type PriceDiscountRecord = PriceDiscountPayload & {
    id: UUID;
    wholesaler_receipt_title?: string;
    product_title?: string;
    receipt_unit_selling_price?: string;
    thumbnail_url?: string;
    images?: any[];
    price_discount_banners?: any[];
};

export interface AttachedPriceDiscount {
    id: UUID;
    label: string;
    start?: string;
    end?: string;
    is_currently_active?: boolean;
}

export interface PriceDiscountSubmitResult {
    errors: Record<string, string | string[]> | null;
    result: PriceDiscountRecord | null;
}

export interface WholesalerPriceDiscountFormModalProps {
    visible: boolean;
    existing?: PriceDiscountRecord | null;
    onClose: () => void;
    onSaved: (discount: AttachedPriceDiscount) => void;
    onSubmit: (
        payload: PriceDiscountPayload,
        id?: UUID
    ) => Promise<PriceDiscountSubmitResult>;
}

/* =========================================================
 * Helpers
 * ======================================================= */

export function priceDiscountLabel(
    d: Pick<PriceDiscountPayload, "title" | "percent">
): string {
    const t = (d.title ?? "").trim();
    if (t) return t;
    const pct = Number(d.percent);
    return Number.isFinite(pct) && pct > 0 ? `${pct}% off` : "Price discount";
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export function bannerUrlFromPriceRecord(
    record: PriceDiscountRecord | null | undefined
): string | null {
    if (!record) return null;
    const banners = (record as any).price_discount_banners ?? [];
    if (!Array.isArray(banners) || banners.length === 0) return null;
    const first = banners[0];
    return first?.thumbnail ?? first?.price_discount_banner ?? null;
}

function receiptStubFromExisting(
    existing: PriceDiscountRecord | null | undefined
): WholesalerReceipt | null {
    if (!existing) return null;
    const anyExisting = existing as any;
    const imgs: any[] = anyExisting.images ?? [];
    return {
        remote_id: existing.wholesaler_receipt,
        id: existing.wholesaler_receipt,
        title:
            existing.wholesaler_receipt_title ??
            existing.product_title ??
            "Receipt",
        product_title: existing.product_title,
        thumbnail_url:
            anyExisting.thumbnail_url ??
            imgs[0]?.thumbnail ??
            imgs[0]?.image ??
            null,
        images: imgs,
        final_unit_selling_price: Number(existing.normal_price) || 0,
        unit_selling_price:
            Number(existing.receipt_unit_selling_price) || 0,
    } as any;
}

export function initialPriceDiscountValues(
    existing?: PriceDiscountRecord | null
): PriceDiscountPayload {
    if (existing) {
        return {
            wholesaler_receipt: existing.wholesaler_receipt,
            title: existing.title,
            percent: existing.percent,
            normal_price: existing.normal_price,
            offer_price: existing.offer_price,
            start: existing.start,
            end: existing.end,
            is_active: existing.is_active,
            banner: bannerUrlFromPriceRecord(existing),
        };
    }
    return {
        wholesaler_receipt: "" as UUID,
        title: "",
        percent: "10.00",
        normal_price: "",
        offer_price: "",
        start: todayIso(),
        end: plusDaysIso(30),
        is_active: "true",
        banner: null,
    };
}

/* =========================================================
 * Yup schema
 * ======================================================= */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const decimals = (v: number | undefined, places: number) => {
    if (v === undefined || v === null || Number.isNaN(v)) return true;
    const f = 10 ** places;
    return Math.round(v * f) === v * f;
};

export const priceDiscountSchema = Yup.object({
    wholesaler_receipt: Yup.string()
        .uuid("Pick a receipt.")
        .required("Pick a receipt."),
    title: Yup.string()
        .trim()
        .required("Title is required.")
        .max(100, "Title must be 100 characters or fewer."),
    percent: Yup.number()
        .typeError("Percent must be a number.")
        .required("Percent is required.")
        .min(0, "Percent cannot be negative.")
        .max(99.99, "Percent cannot exceed 99.99.")
        .test("dp2", "Percent allows at most 2 decimal places.", (v) =>
            decimals(v, 2)
        ),
    normal_price: Yup.number()
        .typeError("Normal price must be a number.")
        .required("Normal price is required.")
        .min(0, "Normal price cannot be negative."),
    offer_price: Yup.number()
        .typeError("Offer price must be a number.")
        .required("Offer price is required.")
        .min(0, "Offer price cannot be negative.")
        .test(
            "lte-normal",
            "Offer price cannot exceed normal price.",
            function (offer) {
                const normal = (this.parent as { normal_price?: number })
                    .normal_price;
                if (offer == null || normal == null) return true;
                return offer <= normal;
            }
        ),
    start: Yup.string()
        .trim()
        .required("Start date is required.")
        .matches(DATE_RE, "Start date must be YYYY-MM-DD."),
    end: Yup.string()
        .trim()
        .required("End date is required.")
        .matches(DATE_RE, "End date must be YYYY-MM-DD.")
        .test(
            "gte-start",
            "End date must be on or after start date.",
            function (end) {
                const start = (this.parent as { start?: string }).start;
                if (!end || !start) return true;
                return end >= start;
            }
        ),
    is_active: Yup.string().oneOf(["true", "false"]).required(),
});

/* =========================================================
 * Local atoms
 * ======================================================= */

function Field({
    label,
    value,
    onChangeText,
    onBlur,
    error,
    touched,
    placeholder,
    keyboardType,
    hint,
}: {
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    onBlur?: () => void;
    error?: string;
    touched?: boolean;
    placeholder?: string;
    keyboardType?: "default" | "decimal-pad" | "number-pad";
    hint?: string;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const subBg = isDarkMode ? "#0f172a" : "#f8fafc";
    const showError = touched && !!error;

    return (
        <View style={{ gap: 4 }}>
            <Text
                style={{
                    color: theme.textDark,
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                onBlur={onBlur}
                placeholder={placeholder}
                placeholderTextColor="#94a3b8"
                keyboardType={keyboardType}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                    height: 40,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: showError ? "#ef4444" : borderColor,
                    backgroundColor: subBg,
                    paddingHorizontal: 12,
                    color: theme.text,
                    fontSize: 13,
                    ...(Platform.OS === "web"
                        ? ({ outlineStyle: "none" } as any)
                        : null),
                }}
            />
            {showError ? (
                <Text style={{ color: "#ef4444", fontSize: 11 }}>{error}</Text>
            ) : hint ? (
                <Text style={{ color: theme.textDark, fontSize: 11 }}>
                    {hint}
                </Text>
            ) : null}
        </View>
    );
}

function Toggle({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: "true" | "false";
    onChange: (v: "true" | "false") => void;
    disabled?: boolean;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const options: ("true" | "false")[] = ["true", "false"];
    return (
        <View style={{ gap: 4, opacity: disabled ? 0.55 : 1 }}>
            <Text
                style={{
                    color: theme.textDark,
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
                {options.map((opt) => {
                    const active = value === opt;
                    return (
                        <Pressable
                            key={opt}
                            onPress={() => !disabled && onChange(opt)}
                            style={{
                                paddingHorizontal: 14,
                                height: 34,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: active
                                    ? theme.primary
                                    : borderColor,
                                backgroundColor: active
                                    ? `${theme.primary}15`
                                    : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Text
                                style={{
                                    color: active ? theme.primary : theme.text,
                                    fontSize: 12,
                                    fontWeight: "600",
                                }}
                            >
                                {opt === "true" ? "Active" : "Inactive"}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

function PreviewCard({ children }: { children: React.ReactNode }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: isDarkMode ? "#1e293b" : "#f1f5f9",
                padding: 12,
                gap: 6,
            }}
        >
            {children}
        </View>
    );
}

/* =========================================================
 * Component
 * ======================================================= */

export function WholesalerPriceDiscountFormModal({
    visible,
    existing,
    onClose,
    onSaved,
    onSubmit,
}: WholesalerPriceDiscountFormModalProps) {
    const { theme } = useAuth();
    const editing = !!existing;

    const { wholesalerReceipts } = useWholesalerReceiptsSync();

    const [selectedReceipt, setSelectedReceipt] =
        useState<WholesalerReceipt | null>(null);

    const formik = useFormik<PriceDiscountPayload>({
        enableReinitialize: true,
        initialValues: initialPriceDiscountValues(existing),
        validationSchema: priceDiscountSchema,
        validateOnChange: true,
        validateOnBlur: true,
        onSubmit: async (values, helpers) => {
            if (!values.wholesaler_receipt) {
                helpers.setFieldError(
                    "wholesaler_receipt",
                    "Pick a receipt."
                );
                return;
            }
            helpers.setSubmitting(true);
            try {
                const res = await onSubmit(values, existing?.id);
                console.log("PRICE dISCOUNT", res)
                if (res.errors) {
                    helpers.setErrors(
                        res.errors as FormikErrors<PriceDiscountPayload>
                    );
                    return;
                }
                if (res.result) {
                    onSaved({
                        id: res.result.id,
                        label: priceDiscountLabel(res.result),
                        start: res.result.start,
                        end: res.result.end,
                        is_currently_active:
                            res.result.is_active === "true" &&
                            res.result.start <= todayIso() &&
                            todayIso() <= res.result.end,
                    });
                    Keyboard.dismiss();
                }
            } finally {
                helpers.setSubmitting(false);
            }
        },
    });

    const displayReceipt = useMemo<WholesalerReceipt | null>(() => {
        if (selectedReceipt) return selectedReceipt;

        const targetId = formik.values.wholesaler_receipt;
        if (!targetId) return null;

        const full = (wholesalerReceipts ?? []).find(
            (r) => String(r.remote_id ?? r.id) === String(targetId)
        );
        if (full) return full;

        if (
            existing &&
            String(existing.wholesaler_receipt) === String(targetId)
        ) {
            return receiptStubFromExisting(existing);
        }
        return null;
    }, [
        selectedReceipt,
        formik.values.wholesaler_receipt,
        wholesalerReceipts,
        existing,
    ]);

    const handleSelectReceipt = (r: WholesalerReceipt) => {
        setSelectedReceipt(r);
        formik.setFieldValue(
            "wholesaler_receipt",
            String(r.remote_id ?? r.id)
        );
        formik.setFieldTouched("wholesaler_receipt", true, false);

        const listPrice = Number(
            r.final_unit_selling_price ?? r.unit_selling_price ?? 0
        );
        const currentNormal = parseFloat(formik.values.normal_price);
        if (
            listPrice > 0 &&
            (!Number.isFinite(currentNormal) || currentNormal === 0)
        ) {
            const pct = parseFloat(formik.values.percent) || 10;
            formik.setFieldValue("normal_price", listPrice.toFixed(2), false);
            formik.setFieldValue(
                "offer_price",
                (listPrice * (1 - pct / 100)).toFixed(2),
                false
            );
        }
    };

    const handleClearReceipt = () => {
        setSelectedReceipt(null);
        formik.setFieldValue("wholesaler_receipt", "", false);
    };

    const normalNum = Number(formik.values.normal_price);
    const offerNum = Number(formik.values.offer_price);
    const savedPerUnit =
        Number.isFinite(normalNum) && Number.isFinite(offerNum)
            ? Math.max(0, normalNum - offerNum)
            : 0;

    const handlePercentChange = (text: string) => {
        formik.setFieldValue("percent", text);
        const pct = parseFloat(text);
        const normal = parseFloat(formik.values.normal_price);
        if (Number.isFinite(pct) && Number.isFinite(normal) && normal > 0) {
            formik.setFieldValue(
                "offer_price",
                (normal * (1 - pct / 100)).toFixed(2),
                false
            );
        }
    };

    const handleOfferChange = (text: string) => {
        formik.setFieldValue("offer_price", text);
        const offer = parseFloat(text);
        const normal = parseFloat(formik.values.normal_price);
        if (Number.isFinite(offer) && Number.isFinite(normal) && normal > 0) {
            formik.setFieldValue(
                "percent",
                (((normal - offer) / normal) * 100).toFixed(2),
                false
            );
        }
    };

    const handleNormalChange = (text: string) => {
        formik.setFieldValue("normal_price", text);
        const normal = parseFloat(text);
        const pct = parseFloat(formik.values.percent);
        if (Number.isFinite(normal) && Number.isFinite(pct) && normal > 0) {
            formik.setFieldValue(
                "offer_price",
                (normal * (1 - pct / 100)).toFixed(2),
                false
            );
        }
    };

    const receiptError =
        formik.submitCount > 0 && formik.errors.wholesaler_receipt
            ? String(formik.errors.wholesaler_receipt)
            : undefined;

    const generalError =
        formik.submitCount > 0 && formik.errors.detail
            ? String(formik.errors.detail)
            : undefined;

    if (!visible) return null;

    return (
        <RNModal
            visible
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View
                style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                }}
            >
                <Pressable
                    onPress={onClose}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                    }}
                />

                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                        borderWidth: 1,
                        borderRadius: 16,
                        padding: 20,
                        gap: 14,
                        width: "min(560px, 100%)",
                        maxHeight: "90%",
                    }}
                >
                    <View style={{ gap: 4 }}>
                        <Text
                            style={{
                                color: theme.text,
                                fontSize: 16,
                                fontWeight: "700",
                            }}
                        >
                            {editing
                                ? "Edit price discount"
                                : "New price discount"}
                        </Text>
                        <Text style={{ color: theme.textDark, fontSize: 12 }}>
                            Pick a receipt, set the offer, then choose a
                            window.
                        </Text>
                    </View>

                    {generalError ? (
                        <View
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: "#ef4444",
                                backgroundColor: "rgba(239,68,68,0.08)",
                            }}
                        >
                            <Text
                                style={{
                                    color: "#ef4444",
                                    fontSize: 12,
                                    fontWeight: "500",
                                }}
                            >
                                {generalError}
                            </Text>
                        </View>
                    ) : null}

                    <FormikProvider value={formik}>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{
                                gap: 12,
                                overflow: "visible",
                            }}
                        >
                            {/* ---- Receipt ---- */}
                            <WholesaleInventoryPicker
                                value={displayReceipt}
                                onSelect={handleSelectReceipt}
                                onClear={handleClearReceipt}
                                label="Receipt"
                                placeholder="Search by product, barcode, batch…"
                                required
                                error={receiptError}
                            />

                            {/* ---- Banner ---- */}
                            <ImagePickerField
                                label="Banner"
                                helpText="Optional. Shown on the discount card in retailer views."
                                aspect={[16, 9]}
                                value={formik.values.banner}
                                onChange={(next) => {
                                    formik.setFieldValue("banner", next);
                                    formik.setFieldTouched(
                                        "banner",
                                        true,
                                        false
                                    );
                                }}
                                onError={(msg) =>
                                    // eslint-disable-next-line no-console
                                    console.warn("[banner-picker] ", msg)
                                }
                                disabled={formik.isSubmitting}
                            />

                            {/* ---- Title ---- */}
                            <Field
                                label="Title"
                                value={formik.values.title}
                                onChangeText={(t) =>
                                    formik.setFieldValue("title", t)
                                }
                                onBlur={() =>
                                    formik.setFieldTouched("title", true)
                                }
                                error={formik.errors.title}
                                touched={
                                    formik.touched.title ||
                                    formik.submitCount > 0
                                }
                                placeholder="e.g. 15% OFF"
                            />

                            {/* ---- Prices ---- */}
                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Field
                                        label="Normal price"
                                        value={formik.values.normal_price}
                                        onChangeText={handleNormalChange}
                                        onBlur={() =>
                                            formik.setFieldTouched(
                                                "normal_price",
                                                true
                                            )
                                        }
                                        error={formik.errors.normal_price}
                                        touched={
                                            formik.touched.normal_price ||
                                            formik.submitCount > 0
                                        }
                                        keyboardType="decimal-pad"
                                        hint="List price per unit."
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field
                                        label="Percent off"
                                        value={formik.values.percent}
                                        onChangeText={handlePercentChange}
                                        onBlur={() =>
                                            formik.setFieldTouched(
                                                "percent",
                                                true
                                            )
                                        }
                                        error={formik.errors.percent}
                                        touched={
                                            formik.touched.percent ||
                                            formik.submitCount > 0
                                        }
                                        keyboardType="decimal-pad"
                                        hint="Max 99.99"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field
                                        label="Offer price"
                                        value={formik.values.offer_price}
                                        onChangeText={handleOfferChange}
                                        onBlur={() =>
                                            formik.setFieldTouched(
                                                "offer_price",
                                                true
                                            )
                                        }
                                        error={formik.errors.offer_price}
                                        touched={
                                            formik.touched.offer_price ||
                                            formik.submitCount > 0
                                        }
                                        keyboardType="decimal-pad"
                                        hint="≤ normal"
                                    />
                                </View>
                            </View>

                            {/* ---- Preview ---- */}
                            <PreviewCard>
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 11,
                                        fontWeight: "600",
                                        letterSpacing: 0.4,
                                    }}
                                >
                                    PREVIEW
                                </Text>
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontSize: 13,
                                    }}
                                >
                                    {Number.isFinite(offerNum) &&
                                        Number.isFinite(normalNum) &&
                                        normalNum > 0
                                        ? `Retailer pays KSh ${offerNum.toFixed(
                                            2
                                        )} instead of KSh ${normalNum.toFixed(
                                            2
                                        )} — saves KSh ${savedPerUnit.toFixed(
                                            2
                                        )} per unit.`
                                        : "Enter a normal price and percent to preview."}
                                </Text>
                            </PreviewCard>

                            {/* ---- Window ---- */}
                            <View
                                style={{ flexDirection: "row", gap: 10 }}
                            >
                                <View style={{ flex: 1 }}>
                                    <DateField
                                        label="START"
                                        value={formik.values.start}
                                        onChangeText={(v) => {
                                            formik.setFieldValue(
                                                "start",
                                                v
                                            );
                                            formik.setFieldTouched(
                                                "start",
                                                true,
                                                false
                                            );
                                        }}
                                        error={
                                            formik.submitCount > 0 &&
                                                formik.errors.start
                                                ? String(formik.errors.start)
                                                : undefined
                                        }
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <DateField
                                        label="END"
                                        value={formik.values.end}
                                        onChangeText={(v) => {
                                            formik.setFieldValue("end", v);
                                            formik.setFieldTouched(
                                                "end",
                                                true,
                                                false
                                            );
                                        }}
                                        error={
                                            formik.submitCount > 0 &&
                                                formik.errors.end
                                                ? String(formik.errors.end)
                                                : undefined
                                        }
                                    />
                                </View>
                            </View>

                            {/* ---- Status ---- */}
                            <Toggle
                                label="Status"
                                value={formik.values.is_active}
                                onChange={(v) =>
                                    formik.setFieldValue("is_active", v)
                                }
                                disabled={editing}
                            />
                        </ScrollView>
                    </FormikProvider>

                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 4,
                        }}
                    >
                        <Button
                            variant="ghost"
                            onPress={onClose}
                            disabled={formik.isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onPress={() => formik.handleSubmit()}
                            loading={formik.isSubmitting}
                            disabled={formik.isSubmitting}
                        >
                            {editing ? "Save changes" : "Create discount"}
                        </Button>
                    </View>
                </View>
            </View>
        </RNModal>
    );
}