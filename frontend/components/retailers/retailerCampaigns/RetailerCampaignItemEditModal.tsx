// components/retailers/retailerCampaigns/RetailerCampaignItemEditModal.tsx
//
// Adjust the opt-in quantity for one campaign item: stepper, quick-add chips,
// the per-retailer limit and the bonus units it earns.

import { CustomTextField } from "@/components/common/CustomTextField";
import { AdminAvatarTile, AdminSheet, SheetButton, useListTokens, useSheetIsWide, webPointer } from "@/components/common/listScreen";
import { Ionicons } from "@expo/vector-icons";
import { Formik, FormikHelpers } from "formik";
import React from "react";
import { Pressable, Text, View } from "react-native";
import * as Yup from "yup";

import type { RetailerCampaignItem } from "./types";

interface Props {
    visible: boolean;
    item: RetailerCampaignItem | null;
    quantity: number;
    onSave: (qty: number) => void;
    onClose: () => void;
}

interface FormValues {
    quantity: string;
}

const QUICK_ADDS = [5, 10, 20, 50];

function buildSchema(max: number | null) {
    return Yup.object({
        quantity: Yup.string()
            .required("Quantity is required.")
            .matches(/^\d*$/, "Must be a whole number.")
            .test("within-limit", max != null ? `The limit per retailer is ${max}.` : "", (v) => !v || max == null || Number(v) <= max),
    });
}

export default function RetailerCampaignItemEditModal({ visible, item, quantity, onSave, onClose }: Props) {
    const { theme, chipBg } = useListTokens();
    const wide = useSheetIsWide();
    const max = item?.per_retailer_limit ?? null;
    const suggested = item?.suggested_quantity ?? 0;
    const bonus = item?.published_bonus_quantity ?? 0;

    const bound = (n: number) => (max != null ? Math.min(max, Math.max(0, n)) : Math.max(0, n));

    const handleSubmit = (values: FormValues, helpers: FormikHelpers<FormValues>) => {
        const parsed = Number(values.quantity);
        onSave(Number.isFinite(parsed) ? bound(parsed) : 0);
        helpers.setSubmitting(false);
        onClose();
    };

    return (
        <Formik key={`${item?.id ?? "none"}-${visible}-${quantity}`} initialValues={{ quantity: String(quantity) }} validationSchema={buildSchema(max)} onSubmit={handleSubmit}>
            {(formik) => {
                const parsed = Number(formik.values.quantity);
                const clamped = Number.isFinite(parsed) ? bound(parsed) : 0;
                const bonusEarned = bonus > 0 && suggested > 0 ? Math.floor(clamped / suggested) * bonus : 0;
                const error = formik.submitCount > 0 ? formik.errors.quantity : undefined;
                const bump = (delta: number) => formik.setFieldValue("quantity", String(bound(clamped + delta)));
                const title = item?.product_title || (item?.batch ? `Batch ${item.batch}` : "Campaign item");
                const facts = [item?.published_unit_price ? `KSh ${item.published_unit_price}` : "", suggested > 0 ? `suggested ${suggested}` : "", max != null ? `max ${max}` : ""].filter(Boolean);

                return (
                    <AdminSheet
                        visible={visible}
                        onClose={onClose}
                        title="Adjust quantity"
                        subtitle={title}
                        icon="calculator-outline"
                        width={480}
                        footer={
                            <>
                                <SheetButton label="Cancel" variant="secondary" onPress={onClose} grow={!wide} />
                                <SheetButton label="Save quantity" icon="checkmark" onPress={() => formik.handleSubmit()} disabled={clamped === quantity || !item} grow={!wide} />
                            </>
                        }
                    >
                        {!item ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14 }}>No item selected.</Text>
                        ) : (
                            <>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 12, backgroundColor: chipBg }}>
                                    <AdminAvatarTile avatar={{ icon: "cube-outline" }} title={title} size={48} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>
                                            {title}
                                        </Text>
                                        {facts.length ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 2 }}>{facts.join(" · ")}</Text> : null}
                                    </View>
                                </View>

                                <View style={{ gap: 8 }}>
                                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                                        <Step icon="remove" disabled={clamped <= 0} onPress={() => bump(-1)} />
                                        <View style={{ flex: 1 }}>
                                            <CustomTextField name="quantity" keyboardType="number-pad" textAlign="center" accessibilityLabel="Quantity" />
                                        </View>
                                        <Step icon="add" disabled={max != null && clamped >= max} onPress={() => bump(1)} />
                                    </View>
                                    {error ? (
                                        <Text style={{ color: "#e11d48", fontFamily: theme.font.medium, fontSize: 12.5, textAlign: "center" }}>{error}</Text>
                                    ) : bonusEarned > 0 ? (
                                        <Text style={{ color: "#059669", fontFamily: theme.font.bold, fontSize: 12.5, textAlign: "center" }}>
                                            Earns +{bonusEarned} free unit{bonusEarned === 1 ? "" : "s"}
                                        </Text>
                                    ) : bonus > 0 && suggested > 0 ? (
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, textAlign: "center" }}>
                                            +{bonus} free for every {suggested}
                                        </Text>
                                    ) : null}
                                </View>

                                <View style={{ gap: 8 }}>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", marginLeft: 4 }}>Quick add</Text>
                                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                        {QUICK_ADDS.map((n) => (
                                            <Chip key={n} label={`+${n}`} onPress={() => bump(n)} />
                                        ))}
                                        {suggested > 0 ? <Chip label={`Suggested (${suggested})`} onPress={() => formik.setFieldValue("quantity", String(bound(suggested)))} /> : null}
                                        <Chip label="Clear" muted onPress={() => formik.setFieldValue("quantity", "0")} />
                                    </View>
                                </View>
                            </>
                        )}
                    </AdminSheet>
                );
            }}
        </Formik>
    );
}

function Step({ icon, onPress, disabled }: { icon: "add" | "remove"; onPress: () => void; disabled?: boolean }) {
    const { theme, chipBg } = useListTokens();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={icon === "add" ? "Increase quantity" : "Decrease quantity"}
            style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: chipBg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, ...webPointer })}
        >
            <Ionicons name={icon} size={20} color={theme.text} />
        </Pressable>
    );
}

function Chip({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
    const { theme, chipBg } = useListTokens();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: muted ? "transparent" : `${theme.primary}14`, borderWidth: muted ? 1 : 0, borderColor: chipBg, opacity: pressed ? 0.7 : 1, ...webPointer })}
        >
            <Text style={{ color: muted ? theme.textDark : theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>{label}</Text>
        </Pressable>
    );
}
