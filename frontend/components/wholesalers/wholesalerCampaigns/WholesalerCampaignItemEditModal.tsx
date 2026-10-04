import type { CampaignItem } from "@/campaigns/types";
import { Button } from "@/components/common/Button";
import { CustomTextField } from "@/components/common/CustomTextField";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/context/AuthContext";
import { Formik, FormikHelpers } from "formik";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import * as Yup from "yup";

interface Props {
    visible: boolean;
    item: CampaignItem | null;
    quantity: number;
    onSave: (qty: number) => void;
    onClose: () => void;
}

interface FormValues {
    quantity: string;
}

const QUICK_ADDS = [5, 10, 20, 50];

const SUCCESS_TONE = {
    light: { text: "#166534" },
    dark: { text: "#6ee7b7" },
};

function buildSchema(max: number | null) {
    return Yup.object({
        quantity: Yup.string()
            .required("Quantity is required.")
            .matches(/^\d*$/, "Must be a whole number.")
            .test("positive", "Quantity must be at least 0.", (v) => {
                if (!v) return true;
                return Number(v) >= 0;
            })
            .test(
                "within-limit",
                max != null ? `Exceeds the per-retailer limit of ${max}.` : "",
                (v) => {
                    if (!v || max == null) return true;
                    return Number(v) <= max;
                }
            ),
    });
}

export default function RetailerCampaignItemEditModal({
    visible,
    item,
    quantity,
    onSave,
    onClose,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const successText = isDarkMode
        ? SUCCESS_TONE.dark.text
        : SUCCESS_TONE.light.text;
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    const max = item?.per_retailer_limit ?? null;
    const suggested = item?.suggested_quantity ?? 0;
    const bonus = item?.published_bonus_quantity ?? 0;

    const handleSubmit = (
        values: FormValues,
        helpers: FormikHelpers<FormValues>
    ) => {
        const parsed = Number(values.quantity);
        const bounded = Number.isFinite(parsed)
            ? max != null
                ? Math.min(max, Math.max(0, parsed))
                : Math.max(0, parsed)
            : 0;
        onSave(bounded);
        helpers.setSubmitting(false);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            onClose={onClose}
            title="Adjust quantity"
            maxHeightRatio={0.7}
        >
            <Formik
                key={`${item?.id ?? "none"}-${visible}-${quantity}`}
                initialValues={{ quantity: String(quantity) }}
                validationSchema={buildSchema(max)}
                onSubmit={handleSubmit}
            >
                {(formik) => {
                    const parsed = Number(formik.values.quantity);
                    const clamped = Number.isFinite(parsed)
                        ? max != null
                            ? Math.min(max, Math.max(0, parsed))
                            : Math.max(0, parsed)
                        : 0;
                    const bonusEarned =
                        bonus > 0 && suggested > 0
                            ? Math.floor(clamped / suggested) * bonus
                            : 0;
                    const currentError = formik.errors.quantity;
                    const showError = formik.submitCount > 0 && !!currentError;

                    const bump = (delta: number) => {
                        const next = clamped + delta;
                        const bounded = max != null ? Math.min(max, Math.max(0, next)) : Math.max(0, next);
                        formik.setFieldValue("quantity", String(bounded));
                    };

                    return (
                        <KeyboardAvoidingView
                            behavior={Platform.OS === "ios" ? "padding" : undefined}
                            style={{ flex: 1 }}
                        >
                            <ScrollView
                                contentContainerStyle={{
                                    paddingHorizontal: 16,
                                    paddingTop: 16,
                                    paddingBottom: 24,
                                    gap: 20,
                                }}
                                keyboardShouldPersistTaps="handled"
                            >
                                {!item ? (
                                    <Text style={{ color: theme.textDark, fontSize: 14 }}>
                                        No item selected
                                    </Text>
                                ) : (
                                    <>
                                        {/* Item header */}
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                gap: 12,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    width: 48,
                                                    height: 48,
                                                    borderRadius: 12,
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    backgroundColor: surfaceMuted,
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        color: theme.textDark,
                                                        fontSize: 12,
                                                        fontWeight: "600",
                                                    }}
                                                >
                                                    {item.product_title?.slice(0, 2).toUpperCase() ?? "—"}
                                                </Text>
                                            </View>

                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={{
                                                        color: theme.text,
                                                        fontSize: 15,
                                                        fontWeight: "600",
                                                    }}
                                                    numberOfLines={2}
                                                >
                                                    {item.product_title ??
                                                        `Receipt #${item.wholesaler_receipt}`}
                                                </Text>
                                                <View
                                                    style={{
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        gap: 12,
                                                        marginTop: 2,
                                                    }}
                                                >
                                                    {item.published_unit_price ? (
                                                        <Text
                                                            style={{ color: theme.textDark, fontSize: 13 }}
                                                        >
                                                            KSh {item.published_unit_price}
                                                        </Text>
                                                    ) : null}
                                                    {suggested > 0 ? (
                                                        <Text
                                                            style={{ color: theme.textDark, fontSize: 13 }}
                                                        >
                                                            · suggested {suggested}
                                                        </Text>
                                                    ) : null}
                                                    {max != null ? (
                                                        <Text
                                                            style={{ color: theme.textDark, fontSize: 13 }}
                                                        >
                                                            · max {max}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </View>
                                        </View>

                                        {/* Quantity row — stepper + input */}
                                        <View style={{ gap: 8 }}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontSize: 11,
                                                    fontWeight: "500",
                                                    letterSpacing: 0.5,
                                                    textTransform: "uppercase",
                                                }}
                                            >
                                                Quantity
                                            </Text>

                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    alignItems: "center",
                                                    borderRadius: 16,
                                                    borderWidth: 1,
                                                    borderColor: showError ? "#ef4444" : theme.border,
                                                    backgroundColor: theme.surface,
                                                }}
                                            >
                                                <Pressable
                                                    onPress={() => bump(-1)}
                                                    style={{
                                                        width: 56,
                                                        height: 56,
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    <Text style={{ color: theme.text, fontSize: 26 }}>
                                                        −
                                                    </Text>
                                                </Pressable>

                                                <View style={{ flex: 1 }}>
                                                    <CustomTextField
                                                        name="quantity"
                                                        keyboardType="number-pad"
                                                        textAlign="center"
                                                        style={{
                                                            fontSize: 32,
                                                            fontWeight: "700",
                                                            borderWidth: 0,
                                                            backgroundColor: "transparent",
                                                            paddingHorizontal: 0,
                                                        }}
                                                    />
                                                </View>

                                                <Pressable
                                                    onPress={() => bump(1)}
                                                    style={{
                                                        width: 56,
                                                        height: 56,
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    <Text style={{ color: theme.text, fontSize: 26 }}>
                                                        +
                                                    </Text>
                                                </Pressable>
                                            </View>

                                            {showError ? (
                                                <Text style={{ color: "#ef4444", fontSize: 12 }}>
                                                    {currentError}
                                                </Text>
                                            ) : bonusEarned > 0 ? (
                                                <Text style={{ color: successText, fontSize: 12 }}>
                                                    Earns +{bonusEarned} free unit
                                                    {bonusEarned === 1 ? "" : "s"}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* Quick-add chips */}
                                        <View style={{ gap: 8 }}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontSize: 11,
                                                    fontWeight: "500",
                                                    letterSpacing: 0.5,
                                                    textTransform: "uppercase",
                                                }}
                                            >
                                                Quick add
                                            </Text>
                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    flexWrap: "wrap",
                                                    gap: 8,
                                                }}
                                            >
                                                {QUICK_ADDS.map((n) => (
                                                    <Pressable
                                                        key={n}
                                                        onPress={() => bump(n)}
                                                        style={{
                                                            paddingHorizontal: 16,
                                                            height: 36,
                                                            borderRadius: 999,
                                                            borderWidth: 1,
                                                            borderColor: theme.border,
                                                            backgroundColor: theme.surface,
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                        }}
                                                    >
                                                        <Text
                                                            style={{
                                                                color: theme.text,
                                                                fontSize: 13,
                                                                fontWeight: "600",
                                                            }}
                                                        >
                                                            +{n}
                                                        </Text>
                                                    </Pressable>
                                                ))}
                                                <Pressable
                                                    onPress={() => formik.setFieldValue("quantity", "0")}
                                                    style={{
                                                        paddingHorizontal: 16,
                                                        height: 36,
                                                        borderRadius: 999,
                                                        borderWidth: 1,
                                                        borderColor: theme.border,
                                                        backgroundColor: theme.surface,
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    <Text
                                                        style={{
                                                            color: theme.textDark,
                                                            fontSize: 13,
                                                            fontWeight: "600",
                                                        }}
                                                    >
                                                        Clear
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    </>
                                )}
                            </ScrollView>

                            <View
                                style={{
                                    paddingHorizontal: 16,
                                    paddingVertical: 12,
                                    borderTopColor: theme.border,
                                    borderTopWidth: 1,
                                    gap: 8,
                                }}
                            >
                                <Button
                                    onPress={formik.handleSubmit}
                                    disabled={clamped === quantity || !item}
                                    size="lg"
                                >
                                    Save quantity
                                </Button>
                                <Button variant="ghost" onPress={onClose}>
                                    Cancel
                                </Button>
                            </View>
                        </KeyboardAvoidingView>
                    );
                }}
            </Formik>
        </Modal>
    );
}