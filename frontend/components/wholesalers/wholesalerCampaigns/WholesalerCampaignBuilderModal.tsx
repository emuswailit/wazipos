// Full-screen campaign builder — Formik-driven.
//
// Left / Products tab:
//   InventoryCheckboxList → items[] (with price + quantity discount actions)
// Right / Retailers tab:
//   RetailerCheckboxList → retailer_ids[]
//
// Suggestions: when the wholesaler has at least one product checked
// AND at least one retailer selected, the builder fires
// GetCampaignItemSuggestion in the background for each item and
// populates that item's suggested_quantity. When the audience empties,
// every suggested_quantity resets to 0.

import campaignsApi from "@/api/campaignsApi";
import api from "@/api/wholesalersApi";
import type { UUID } from "@/campaigns/types";
import {
    WholesalerPriceDiscountFormModal,
    WholesalerQuantityDiscountFormModal,
    type AttachedPriceDiscount,
    type AttachedQuantityDiscount,
} from "@/components/common";
import { useAlert } from "@/components/common/AlertProvider";
import { Button } from "@/components/common/Button";
import { useAuth } from "@/context/AuthContext";
import { useEntitiesSync } from "@/context/EntitiesSyncContext";
import { useWholesalerReceiptsSync } from "@/context/WholesalerReceiptsSyncContext";
import type { EntityItem, WholesalerReceipt } from "@/databases/types";
import {
    useCampaignDetails,
    useCampaignMutations,
} from "@/hooks/useCampaigns";
import { Formik, FormikHelpers, type FormikProps } from "formik";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScrollView as RNScrollView } from "react-native";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Keyboard,
    Platform,
    Pressable,
    Modal as RNModal,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import * as Yup from "yup";

/* =========================================================
 * Debug logging — remove once the campaign flow is stable.
 * ======================================================= */

const LOG = (...args: any[]) => {
    if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[builder]", ...args);
    }
};

/* =========================================================
 * Types
 * ======================================================= */

type AttachedDiscount = AttachedPriceDiscount | AttachedQuantityDiscount;

interface BuilderItem {
    receipt_id: UUID;
    title: string;
    unit_price: string;
    suggested_quantity: number;
    price_discount: AttachedDiscount | null;
    quantity_discount: AttachedDiscount | null;
}

interface BuilderValues {
    items: BuilderItem[];
    retailer_ids: UUID[];
}

interface Props {
    visible: boolean;
    campaignId?: UUID;
    onSaved?: () => void;
    onClose: () => void;
}

const builderSchema = Yup.object({
    items: Yup.array()
        .of(
            Yup.object({
                receipt_id: Yup.string().uuid().required(),
                title: Yup.string().required(),
                unit_price: Yup.string().required(),
                suggested_quantity: Yup.number().min(0).required(),
                price_discount: Yup.mixed().nullable(),
                quantity_discount: Yup.mixed().nullable(),
            })
        )
        .min(1, "Add at least one product to the campaign.")
        .required("Add at least one product to the campaign."),
    retailer_ids: Yup.array()
        .of(Yup.string().uuid())
        .min(1, "Add at least one retailer to the campaign.")
        .required("Add at least one retailer to the campaign."),
});

function flattenErrors(errors: Record<string, unknown>): string {
    return Object.entries(errors)
        .map(([k, v]) => {
            const msg = Array.isArray(v) ? v.join(", ") : String(v);
            return k === "detail" ? msg : `${k}: ${msg}`;
        })
        .join("\n");
}

function retailerTypeFor(
    wholesalerType: string | undefined | null
): string | null {
    switch (wholesalerType) {
        case "GeneralWholesaler":
            return "GeneralRetailer";
        case "PharmaceuticalWholesaler":
            return "PharmaceuticalRetailer";
        default:
            return null;
    }
}

function receiptId(r: WholesalerReceipt): string {
    return String(r.remote_id ?? r.id);
}

/* =========================================================
 * Inventory checkbox list
 * ======================================================= */

function InventoryCheckboxList({
    selectedIds,
    onToggle,
    items,
    onOpenPriceDiscount,
    onOpenQuantityDiscount,
    onClearPriceDiscount,
    onClearQuantityDiscount,
    receipts,
    isLoading,
    disabled,
    maxHeight,
}: {
    selectedIds: Set<string>;
    onToggle: (receipt: WholesalerReceipt) => void;
    items: BuilderItem[];
    onOpenPriceDiscount: (receipt: WholesalerReceipt) => void;
    onOpenQuantityDiscount: (receipt: WholesalerReceipt) => void;
    onClearPriceDiscount: (receiptId: UUID) => void;
    onClearQuantityDiscount: (receiptId: UUID) => void;
    receipts: WholesalerReceipt[];
    isLoading?: boolean;
    disabled?: boolean;
    maxHeight?: number;
}) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const [search, setSearch] = useState("");
    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const subBg = isDarkMode ? "#0f172a" : "#f8fafc";
    const thumbBg = isDarkMode ? "#1e293b" : "#e2e8f0";

    const isNarrow = width < 640;

    const itemByReceipt = useMemo(() => {
        const m = new Map<string, BuilderItem>();
        items.forEach((i) => m.set(i.receipt_id, i));
        return m;
    }, [items]);

    const inStock = useMemo(
        () =>
            receipts.filter(
                (r) => Number(r.current_unit_quantity ?? 0) > 0
            ),
        [receipts]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return inStock;
        return inStock.filter((r) => {
            const blob = [r.title, r.product_title, r.bar_code, r.batch]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return blob.includes(q);
        });
    }, [inStock, search]);

    const selectAllVisible = () => {
        filtered.forEach((r) => {
            if (!selectedIds.has(receiptId(r))) onToggle(r);
        });
    };

    const clearAll = () => {
        inStock.forEach((r) => {
            if (selectedIds.has(receiptId(r))) onToggle(r);
        });
    };

    const renderDiscountActions = (receipt: WholesalerReceipt) => {
        const id = receiptId(receipt);
        const attached = itemByReceipt.get(id);

        const hasSuggested =
            attached != null && (attached.suggested_quantity ?? 0) > 0;

        return (
            <View
                style={{
                    flexDirection: "row",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: isNarrow ? 8 : 0,
                    marginLeft: isNarrow ? 0 : 8,
                }}
            >
                {/* -------- Recommended quantity -------- */}
                <View
                    style={{
                        paddingHorizontal: 8,
                        height: 28,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderStyle: hasSuggested ? "solid" : "dashed",
                        borderColor: hasSuggested
                            ? theme.primary
                            : theme.border,
                        backgroundColor: hasSuggested
                            ? `${theme.primary}12`
                            : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 60,
                    }}
                >
                    <Text
                        style={{
                            color: hasSuggested
                                ? theme.primary
                                : theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                        }}
                    >
                        {hasSuggested
                            ? `Rec. ${attached!.suggested_quantity}`
                            : "Rec. …"}
                    </Text>
                </View>

                {/* -------- Price discount -------- */}
                {attached?.price_discount ? (
                    <Pressable
                        onPress={() => onOpenPriceDiscount(receipt)}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingHorizontal: 8,
                            height: 28,
                            borderRadius: 6,
                            backgroundColor: `${theme.primary}20`,
                        }}
                    >
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                            }}
                            numberOfLines={1}
                        >
                            {attached.price_discount.label}
                        </Text>
                        <Pressable
                            onPress={(e) => {
                                (e as any)?.stopPropagation?.();
                                onClearPriceDiscount(attached.receipt_id);
                            }}
                            hitSlop={6}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontSize: 11,
                                    lineHeight: 13,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() => onOpenPriceDiscount(receipt)}
                        style={{
                            paddingHorizontal: 8,
                            height: 28,
                            borderRadius: 6,
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
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                            }}
                        >
                            + Price Discount
                        </Text>
                    </Pressable>
                )}

                {/* -------- Quantity discount -------- */}
                {attached?.quantity_discount ? (
                    <Pressable
                        onPress={() => onOpenQuantityDiscount(receipt)}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingHorizontal: 8,
                            height: 28,
                            borderRadius: 6,
                            backgroundColor: "rgba(16,185,129,0.15)",
                        }}
                    >
                        <Text
                            style={{
                                color: "#10b981",
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                            }}
                            numberOfLines={1}
                        >
                            {attached.quantity_discount.label}
                        </Text>
                        <Pressable
                            onPress={(e) => {
                                (e as any)?.stopPropagation?.();
                                onClearQuantityDiscount(attached.receipt_id);
                            }}
                            hitSlop={6}
                        >
                            <Text
                                style={{
                                    color: "#10b981",
                                    fontSize: 11,
                                    lineHeight: 13,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() => onOpenQuantityDiscount(receipt)}
                        style={{
                            paddingHorizontal: 8,
                            height: 28,
                            borderRadius: 6,
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
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                            }}
                        >
                            + Qty Discount
                        </Text>
                    </Pressable>
                )}
            </View>
        );
    };

    return (
        <View
            style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                backgroundColor: theme.panel,
                overflow: "hidden",
            }}
        >
            <View
                style={{
                    padding: 12,
                    gap: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by product, barcode, batch…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    editable={!disabled}
                    style={{
                        height: 40,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: subBg,
                        paddingHorizontal: 12,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 13,
                        ...(Platform.OS === "web"
                            ? ({ outlineStyle: "none" } as any)
                            : null),
                    }}
                />

                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        {selectedIds.size} of {inStock.length} selected
                    </Text>

                    <View style={{ flexDirection: "row", gap: 12 }}>
                        <Pressable
                            onPress={selectAllVisible}
                            disabled={disabled || filtered.length === 0}
                            hitSlop={6}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    letterSpacing: 0.5,
                                    textTransform: "uppercase",
                                    opacity:
                                        disabled || filtered.length === 0
                                            ? 0.4
                                            : 1,
                                }}
                            >
                                Select all
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={clearAll}
                            disabled={disabled || selectedIds.size === 0}
                            hitSlop={6}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    letterSpacing: 0.5,
                                    textTransform: "uppercase",
                                    opacity:
                                        disabled || selectedIds.size === 0
                                            ? 0.4
                                            : 1,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {isLoading ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text
                        style={{
                            marginTop: 8,
                            color: theme.textDark,
                            fontSize: 12,
                        }}
                    >
                        Loading inventory…
                    </Text>
                </View>
            ) : inStock.length === 0 ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ color: theme.textDark, fontSize: 13 }}>
                        No inventory available
                    </Text>
                </View>
            ) : filtered.length === 0 ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ color: theme.textDark, fontSize: 13 }}>
                        No inventory matches that search
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(r, i) =>
                        String(r.remote_id ?? r.draft_id ?? i)
                    }
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: maxHeight ?? 360 }}
                    renderItem={({ item }) => {
                        const id = receiptId(item);
                        const isChecked = selectedIds.has(id);
                        const qty = Number(item.current_unit_quantity ?? 0);
                        const unit = String(item.unit_of_receipt ?? "");
                        const price = Number(
                            item.final_unit_selling_price ??
                            item.unit_selling_price ??
                            0
                        );
                        const lowStock = qty > 0 && qty <= 5;

                        return (
                            <View
                                style={{
                                    borderBottomWidth: 1,
                                    borderBottomColor: borderColor,
                                    backgroundColor: isChecked
                                        ? `${theme.primary}08`
                                        : "transparent",
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                }}
                            >
                                <View
                                    style={{
                                        flexDirection: isNarrow
                                            ? "column"
                                            : "row",
                                        alignItems: isNarrow
                                            ? "stretch"
                                            : "center",
                                    }}
                                >
                                    <Pressable
                                        onPress={() => onToggle(item)}
                                        disabled={disabled}
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            flex: isNarrow ? undefined : 1,
                                            minWidth: 0,
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: 4,
                                                borderWidth: 1,
                                                borderColor: isChecked
                                                    ? theme.primary
                                                    : borderColor,
                                                backgroundColor: isChecked
                                                    ? theme.primary
                                                    : "transparent",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                marginRight: 12,
                                            }}
                                        >
                                            {isChecked ? (
                                                <Text
                                                    style={{
                                                        color: "#ffffff",
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 12,
                                                        lineHeight: 14,
                                                    }}
                                                >
                                                    ✓
                                                </Text>
                                            ) : null}
                                        </View>

                                        <View
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 8,
                                                backgroundColor: thumbBg,
                                                overflow: "hidden",
                                                marginRight: 10,
                                            }}
                                        >
                                            {item.thumbnail_url ? (
                                                <Image
                                                    source={{
                                                        uri: String(
                                                            item.thumbnail_url
                                                        ),
                                                    }}
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                    }}
                                                    resizeMode="cover"
                                                />
                                            ) : null}
                                        </View>

                                        <View
                                            style={{ flex: 1, minWidth: 0 }}
                                        >
                                            <Text
                                                numberOfLines={1}
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 14,
                                                }}
                                            >
                                                {String(
                                                    item.title ??
                                                    item.product_title ??
                                                    "Unknown"
                                                )}
                                            </Text>
                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    marginTop: 2,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {item.batch ? (
                                                    <Text
                                                        numberOfLines={1}
                                                        style={{
                                                            color: theme.textDark,
                                                            fontFamily:
                                                                theme.font
                                                                    .medium,
                                                            fontSize: 11,
                                                        }}
                                                    >
                                                        Batch {item.batch}
                                                    </Text>
                                                ) : null}
                                                <View
                                                    style={{
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 1,
                                                        borderRadius: 4,
                                                        backgroundColor:
                                                            lowStock
                                                                ? "rgba(251,191,36,0.18)"
                                                                : "rgba(16,185,129,0.15)",
                                                    }}
                                                >
                                                    <Text
                                                        style={{
                                                            color: lowStock
                                                                ? "#f59e0b"
                                                                : "#10b981",
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                            fontSize: 10,
                                                        }}
                                                    >
                                                        {qty} {unit || "u"}
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={{
                                                        color: theme.primary,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    KSh {price.toFixed(2)}
                                                </Text>
                                            </View>
                                        </View>
                                    </Pressable>

                                    {isChecked
                                        ? renderDiscountActions(item)
                                        : null}
                                </View>
                            </View>
                        );
                    }}
                />
            )}
        </View>
    );
}

/* =========================================================
 * Retailer checkbox list
 * ======================================================= */

function RetailerCheckboxList({
    value,
    onChange,
    retailers,
    isLoading,
    disabled,
    maxHeight,
}: {
    value: UUID[];
    onChange: (ids: UUID[]) => void;
    retailers: EntityItem[];
    isLoading?: boolean;
    disabled?: boolean;
    maxHeight?: number;
}) {
    const { theme, isDarkMode } = useAuth();
    const [search, setSearch] = useState("");
    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const subBg = isDarkMode ? "#0f172a" : "#f8fafc";

    const selectedSet = useMemo(() => new Set(value), [value]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return retailers;
        return retailers.filter((r) => {
            const blob = [r.title, r.town, r.phone, r.email, r.entity_type]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return blob.includes(q);
        });
    }, [retailers, search]);

    const toggle = (id: UUID) => {
        if (selectedSet.has(id)) {
            onChange(value.filter((v) => v !== id));
        } else {
            onChange([...value, id]);
        }
    };

    const selectAllVisible = () => {
        const merged = new Set<UUID>(value);
        filtered.forEach((r) => merged.add(String(r.id)));
        onChange(Array.from(merged));
    };

    const clearAll = () => onChange([]);

    return (
        <View
            style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                backgroundColor: theme.panel,
                overflow: "hidden",
            }}
        >
            <View
                style={{
                    padding: 12,
                    gap: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search retailers by name, town, phone…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    editable={!disabled}
                    style={{
                        height: 40,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: subBg,
                        paddingHorizontal: 12,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 13,
                        ...(Platform.OS === "web"
                            ? ({ outlineStyle: "none" } as any)
                            : null),
                    }}
                />

                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        {value.length} of {retailers.length} selected
                    </Text>

                    <View style={{ flexDirection: "row", gap: 12 }}>
                        <Pressable
                            onPress={selectAllVisible}
                            disabled={disabled || filtered.length === 0}
                            hitSlop={6}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    letterSpacing: 0.5,
                                    textTransform: "uppercase",
                                    opacity:
                                        disabled || filtered.length === 0
                                            ? 0.4
                                            : 1,
                                }}
                            >
                                Select all
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={clearAll}
                            disabled={disabled || value.length === 0}
                            hitSlop={6}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    letterSpacing: 0.5,
                                    textTransform: "uppercase",
                                    opacity:
                                        disabled || value.length === 0
                                            ? 0.4
                                            : 1,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {isLoading ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text
                        style={{
                            marginTop: 8,
                            color: theme.textDark,
                            fontSize: 12,
                        }}
                    >
                        Loading retailers…
                    </Text>
                </View>
            ) : retailers.length === 0 ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ color: theme.textDark, fontSize: 13 }}>
                        No retailers available
                    </Text>
                </View>
            ) : filtered.length === 0 ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ color: theme.textDark, fontSize: 13 }}>
                        No retailers match that search
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(r) => String(r.id)}
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: maxHeight ?? 360 }}
                    renderItem={({ item }) => {
                        const isChecked = selectedSet.has(String(item.id));
                        const sublabel = [item.town, item.phone]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                            <Pressable
                                onPress={() => toggle(String(item.id))}
                                disabled={disabled}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    paddingHorizontal: 12,
                                    paddingVertical: 10,
                                    borderBottomWidth: 1,
                                    borderBottomColor: borderColor,
                                    backgroundColor: isChecked
                                        ? `${theme.primary}10`
                                        : "transparent",
                                    opacity: disabled ? 0.55 : 1,
                                }}
                            >
                                <View
                                    style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: 4,
                                        borderWidth: 1,
                                        borderColor: isChecked
                                            ? theme.primary
                                            : borderColor,
                                        backgroundColor: isChecked
                                            ? theme.primary
                                            : "transparent",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        marginRight: 12,
                                    }}
                                >
                                    {isChecked ? (
                                        <Text
                                            style={{
                                                color: "#ffffff",
                                                fontFamily: theme.font.bold,
                                                fontSize: 12,
                                                lineHeight: 14,
                                            }}
                                        >
                                            ✓
                                        </Text>
                                    ) : null}
                                </View>

                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 14,
                                        }}
                                    >
                                        {String(item.title || "Unknown")}
                                    </Text>
                                    {sublabel ? (
                                        <Text
                                            numberOfLines={1}
                                            style={{
                                                color: theme.textDark,
                                                fontFamily: theme.font.medium,
                                                fontSize: 11,
                                                marginTop: 2,
                                            }}
                                        >
                                            {sublabel}
                                        </Text>
                                    ) : null}
                                </View>
                            </Pressable>
                        );
                    }}
                />
            )}
        </View>
    );
}

/* =========================================================
 * Component
 * ======================================================= */

export default function WholesalerCampaignBuilderModal({
    visible,
    campaignId,
    onClose,
    onSaved,
}: Props) {
    const { theme, isDarkMode, user } = useAuth();
    const alert = useAlert();
    const mut = useCampaignMutations();
    const { width } = useWindowDimensions();

    const { entitiesList, isEntitiesSyncing } = useEntitiesSync();
    const { wholesalerReceipts, isSyncing: receiptsSyncing } =
        useWholesalerReceiptsSync();

    const isWide = Platform.OS === "web" && width >= 900;
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    const narrowScrollRef = useRef<RNScrollView>(null);
    const formikRef = useRef<FormikProps<BuilderValues> | null>(null);

    const [priceDiscountReceipt, setPriceDiscountReceipt] =
        useState<WholesalerReceipt | null>(null);
    const [quantityDiscountReceipt, setQuantityDiscountReceipt] =
        useState<WholesalerReceipt | null>(null);

    const { items: existingItems, audience: existingAudience, isLoading } =
        useCampaignDetails(visible && campaignId ? campaignId : undefined);

    const initialValues: BuilderValues = useMemo(
        () => ({
            items: existingItems.map((it) => ({
                receipt_id: String(it.wholesaler_receipt),
                title:
                    (it as any).wholesaler_receipt_title ??
                    `Receipt #${it.wholesaler_receipt}`,
                unit_price: String(it.published_unit_price ?? 0),
                suggested_quantity: it.suggested_quantity ?? 0,
                price_discount: it.wholesaler_price_discount
                    ? {
                        id: String(it.wholesaler_price_discount),
                        label: "Discounted",
                    }
                    : null,
                quantity_discount: it.wholesaler_quantity_discount
                    ? {
                        id: String(it.wholesaler_quantity_discount),
                        label: "Bonus",
                    }
                    : null,
            })),
            retailer_ids: existingAudience.map((a) => a.retailer),
        }),
        [existingItems, existingAudience]
    );

    const itemIdByReceipt = useMemo(() => {
        const m = new Map<string, UUID>();
        existingItems.forEach((it) =>
            m.set(String(it.wholesaler_receipt), it.id)
        );
        return m;
    }, [existingItems]);

    const audienceIdByRetailer = useMemo(() => {
        const m = new Map<UUID, UUID>();
        existingAudience.forEach((a) => m.set(a.retailer, a.id));
        return m;
    }, [existingAudience]);

    const receiptsSource: WholesalerReceipt[] = wholesalerReceipts ?? [];

    const wholesalerEntityType =
        user?.entity_type ?? user?.roles?.[0]?.entity_type ?? undefined;
    const expectedRetailerType = retailerTypeFor(wholesalerEntityType);

    const allRetailers = useMemo(() => {
        if (!expectedRetailerType) return [];
        return entitiesList.filter(
            (e) => e.entity_type === expectedRetailerType
        );
    }, [entitiesList, expectedRetailerType]);

    const [activeTab, setActiveTab] = useState<"products" | "retailers">(
        "products"
    );

    const handleTabChange = (t: "products" | "retailers") => {
        Keyboard.dismiss();
        setActiveTab(t);
        narrowScrollRef.current?.scrollTo({ y: 0, animated: false });
    };

    useEffect(() => {
        if (visible) setActiveTab("products");
    }, [visible]);

    /* ---------------------------------------------------------
     * Suggestion trigger
     *
     * Fires when BOTH the item set and the audience set are
     * non-empty. Uses a debounce + membership key so rapid toggles
     * coalesce into a single round of requests, and unchanged
     * re-renders don't retrigger.
     *
     * When the audience empties, every item's suggested_quantity
     * resets to 0 — there's nothing to average over.
     * ------------------------------------------------------- */
    const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const lastFiredKeyRef = useRef<string>("");

    useEffect(() => {
        if (!visible || !campaignId) return;

        const items = formikRef.current?.values.items ?? [];
        const retailers = formikRef.current?.values.retailer_ids ?? [];

        // No products selected — nothing to suggest for.
        if (items.length === 0) return;

        // ---- Audience emptied: reset all suggested quantities to 0 ----
        if (retailers.length === 0) {
            const anyNonZero = items.some(
                (it) => (it.suggested_quantity ?? 0) !== 0
            );
            if (!anyNonZero) return;   // already zeroed — skip no-op

            formikRef.current?.setFieldValue(
                "items",
                items.map((it) => ({ ...it, suggested_quantity: 0 }))
            );

            lastFiredKeyRef.current = "";

            if (suggestionDebounceRef.current) {
                clearTimeout(suggestionDebounceRef.current);
                suggestionDebounceRef.current = null;
            }
            return;
        }

        // ---- Both sides non-empty: schedule a fetch ----
        const key =
            items.map((i) => i.receipt_id).sort().join(",") +
            "|" +
            [...retailers].sort().join(",");

        if (key === lastFiredKeyRef.current) return;
        lastFiredKeyRef.current = key;

        if (suggestionDebounceRef.current) {
            clearTimeout(suggestionDebounceRef.current);
        }

        suggestionDebounceRef.current = setTimeout(async () => {
            const itemsAtFire = formikRef.current?.values.items ?? [];
            const retailersAtFire =
                formikRef.current?.values.retailer_ids ?? [];

            if (itemsAtFire.length === 0 || retailersAtFire.length === 0) return;

            LOG("suggestion fetch →", {
                items: itemsAtFire.length,
                retailers: retailersAtFire.length,
            });

            const results = await Promise.all(
                itemsAtFire.map(async (item) => {
                    try {
                        const res =
                            await campaignsApi.getCampaignItemSuggestionAction({
                                campaign_id: campaignId,
                                wholesaler_receipt_id: item.receipt_id as UUID,
                                retailer_ids: retailersAtFire,
                            });
                        const env = res?.data ?? {};
                        const suggested = env?.suggestion?.suggested_quantity;
                        if (
                            env.response_code === 0 &&
                            typeof suggested === "number"
                        ) {
                            return [item.receipt_id, suggested] as const;
                        }
                        LOG("suggestion non-zero response", {
                            receipt: item.receipt_id,
                            response_code: env?.response_code,
                            errors: env?.errors,
                        });
                    } catch (e) {
                        LOG("suggestion fetch threw", e);
                    }
                    return null;
                })
            );

            const valid = results.filter(
                (r): r is readonly [string, number] => r !== null
            );
            if (valid.length === 0) return;

            const latestItems = formikRef.current?.values.items ?? [];
            const byReceipt = new Map(valid);
            formikRef.current?.setFieldValue(
                "items",
                latestItems.map((it) =>
                    byReceipt.has(it.receipt_id)
                        ? {
                            ...it,
                            suggested_quantity:
                                byReceipt.get(it.receipt_id)!,
                        }
                        : it
                )
            );

            LOG("suggestion fetch ←", { updated: valid.length });
        });
    });

    /* ---------------------------------------------------------
     * Discount attach / clear
     * ------------------------------------------------------- */

    const attachDiscountToItem = (
        receiptIdValue: UUID,
        kind: "price" | "quantity",
        discount: AttachedDiscount
    ) => {
        const f = formikRef.current;
        if (!f) return;
        if (!f.values.items.some((i) => i.receipt_id === receiptIdValue)) return;

        const key = kind === "price" ? "price_discount" : "quantity_discount";
        LOG("attachDiscountToItem", { receiptIdValue, kind, discount });
        f.setFieldValue(
            "items",
            f.values.items.map((i) =>
                i.receipt_id === receiptIdValue
                    ? { ...i, [key]: discount }
                    : i
            )
        );
    };

    /* ---------------------------------------------------------
     * Submit
     * ------------------------------------------------------- */

    const handleSubmit = async (
        values: BuilderValues,
        helpers: FormikHelpers<BuilderValues>
    ) => {
        LOG("submit — start", {
            campaignId,
            items: values.items,
            retailer_ids: values.retailer_ids,
        });

        if (!campaignId) {
            LOG("submit — no campaignId, delegating to onSaved");
            onSaved?.();
            return;
        }

        const itemsToAdd = values.items.filter(
            (v) =>
                !initialValues.items.some(
                    (i) => i.receipt_id === v.receipt_id
                )
        );
        const itemsToRemove = initialValues.items.filter(
            (i) => !values.items.some((v) => v.receipt_id === i.receipt_id)
        );
        const retailersToAdd = values.retailer_ids.filter(
            (id) => !initialValues.retailer_ids.includes(id)
        );
        const retailersToRemove = initialValues.retailer_ids.filter(
            (id) => !values.retailer_ids.includes(id)
        );

        LOG("submit — diff", {
            itemsToAdd,
            itemsToRemove,
            retailersToAdd,
            retailersToRemove,
        });

        try {
            /* ---- 1. Removals ---- */

            for (const item of itemsToRemove) {
                const itemId = itemIdByReceipt.get(item.receipt_id);
                if (!itemId) continue;

                LOG("deleteItem →", { itemId, receipt: item.receipt_id });
                const r = await mut.deleteItem(itemId);
                LOG("deleteItem ←", {
                    itemId,
                    response_code: r?.data?.response_code,
                    response_message: r?.data?.response_message,
                    errors: r?.data?.errors,
                });

                if ((r?.data?.response_code ?? 0) !== 0) {
                    alert(
                        r?.data?.response_message ?? "Could not remove item",
                        flattenErrors(r?.data?.errors ?? {}) || undefined,
                        undefined,
                        "danger"
                    );
                    return;
                }
            }

            for (const retailerId of retailersToRemove) {
                const audId = audienceIdByRetailer.get(retailerId);
                if (!audId) continue;

                LOG("removeAudience →", { audience_id: audId, retailerId });
                const r = await mut.removeAudience(audId);
                LOG("removeAudience ←", {
                    audience_id: audId,
                    response_code: r?.data?.response_code,
                    response_message: r?.data?.response_message,
                    errors: r?.data?.errors,
                });

                if ((r?.data?.response_code ?? 0) !== 0) {
                    alert(
                        r?.data?.response_message ??
                        "Could not remove retailer",
                        flattenErrors(r?.data?.errors ?? {}) || undefined,
                        undefined,
                        "danger"
                    );
                    return;
                }
            }

            /* ---- 2. Additions ---- */

            for (const item of itemsToAdd) {
                const payload = {
                    campaign_id: campaignId,
                    wholesaler_receipt_id: item.receipt_id,
                    suggested_quantity: item.suggested_quantity,
                    wholesaler_price_discount_id:
                        item.price_discount?.id ?? null,
                    wholesaler_quantity_discount_id:
                        item.quantity_discount?.id ?? null,
                };

                LOG("addItem →", payload);
                const r = await mut.addItem(payload);
                LOG("addItem ←", {
                    response_code: r?.data?.response_code,
                    response_message: r?.data?.response_message,
                    errors: r?.data?.errors,
                    campaign_item: r?.data?.campaign_item,
                });

                if ((r?.data?.response_code ?? 0) !== 0) {
                    alert(
                        r?.data?.response_message ?? "Could not add item",
                        flattenErrors(r?.data?.errors ?? {}) || undefined,
                        undefined,
                        "danger"
                    );
                    return;
                }
            }

            for (const retailerId of retailersToAdd) {
                LOG("addAudience →", {
                    campaign_id: campaignId,
                    retailer_id: retailerId,
                });
                const r = await mut.addAudience(campaignId, retailerId);
                LOG("addAudience ←", {
                    retailer_id: retailerId,
                    response_code: r?.data?.response_code,
                    response_message: r?.data?.response_message,
                    errors: r?.data?.errors,
                });

                if ((r?.data?.response_code ?? 0) !== 0) {
                    alert(
                        r?.data?.response_message ?? "Could not add retailer",
                        flattenErrors(r?.data?.errors ?? {}) || undefined,
                        undefined,
                        "danger"
                    );
                    return;
                }
            }

            LOG("submit — all writes succeeded");
            alert(
                "Success",
                "Campaign updated.",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            onSaved?.();
                            onClose();
                        },
                    },
                ],
                "success"
            );
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error("[builder] submit threw:", e);
            alert(
                "Save failed",
                e?.message ?? "Unknown error",
                undefined,
                "danger"
            );
        } finally {
            helpers.setSubmitting(false);
        }
    };

    return (
        <RNModal
            visible={visible}
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={{ flex: 1, backgroundColor: theme.background }}>
                {isLoading ? (
                    <View
                        style={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <ActivityIndicator />
                    </View>
                ) : (
                    <Formik
                        innerRef={formikRef}
                        enableReinitialize
                        initialValues={initialValues}
                        validationSchema={builderSchema}
                        validateOnChange={false}
                        validateOnBlur={false}
                        onSubmit={handleSubmit}
                    >
                        {(formik) => {
                            const items = formik.values.items;
                            const retailerIds = formik.values.retailer_ids;

                            const selectedReceiptIds = new Set(
                                items.map((i) => i.receipt_id)
                            );

                            const toggleReceipt = (r: WholesalerReceipt) => {
                                const id = receiptId(r);
                                if (selectedReceiptIds.has(id)) {
                                    LOG("uncheck receipt", { id });
                                    formik.setFieldValue(
                                        "items",
                                        items.filter(
                                            (i) => i.receipt_id !== id
                                        )
                                    );
                                    return;
                                }
                                LOG("check receipt", {
                                    id,
                                    title: r.title ?? r.product_title,
                                });
                                formik.setFieldValue("items", [
                                    ...items,
                                    {
                                        receipt_id: id,
                                        title: String(
                                            r.title ?? r.product_title ?? "—"
                                        ),
                                        unit_price: String(
                                            r.final_unit_selling_price ??
                                            r.unit_selling_price ??
                                            0
                                        ),
                                        suggested_quantity: 0,
                                        price_discount: null,
                                        quantity_discount: null,
                                    },
                                ]);
                            };

                            const clearDiscount = (
                                receiptIdValue: UUID,
                                kind: "price" | "quantity"
                            ) => {
                                LOG("clearDiscount", { receiptIdValue, kind });
                                formik.setFieldValue(
                                    "items",
                                    items.map((i) =>
                                        i.receipt_id === receiptIdValue
                                            ? {
                                                ...i,
                                                [kind === "price"
                                                    ? "price_discount"
                                                    : "quantity_discount"]:
                                                    null,
                                            }
                                            : i
                                    )
                                );
                            };

                            const projection = {
                                item_count: items.length,
                                retailer_count: retailerIds.length,
                                discounted_items: items.filter(
                                    (i) => i.price_discount !== null
                                ).length,
                                bonus_items: items.filter(
                                    (i) => i.quantity_discount !== null
                                ).length,
                            };

                            const projectionCard =
                                items.length > 0 ? (
                                    <View
                                        style={{
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: theme.border,
                                            backgroundColor: surfaceMuted,
                                            padding: 12,
                                            gap: 10,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 13,
                                                letterSpacing: 0.3,
                                            }}
                                        >
                                            Projected effect
                                        </Text>

                                        <View
                                            style={{
                                                flexDirection: "row",
                                                flexWrap: "wrap",
                                                gap: 16,
                                            }}
                                        >
                                            <Stat
                                                label="Items"
                                                value={String(
                                                    projection.item_count
                                                )}
                                            />
                                            <Stat
                                                label="Retailers"
                                                value={String(
                                                    projection.retailer_count
                                                )}
                                            />
                                            <Stat
                                                label="Discounted"
                                                value={`${projection.discounted_items} / ${projection.item_count}`}
                                            />
                                            <Stat
                                                label="Bonus offers"
                                                value={String(
                                                    projection.bonus_items
                                                )}
                                            />
                                        </View>

                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 11,
                                                lineHeight: 16,
                                            }}
                                        >
                                            Full projection (profit, margin,
                                            and bonus dilution) becomes
                                            available after saving, once each
                                            item exists on the campaign.
                                        </Text>
                                    </View>
                                ) : null;

                            const productsPanel = (
                                <View style={{ flex: 1, gap: 16 }}>
                                    <View style={{ gap: 8 }}>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontSize: 15,
                                                fontWeight: "600",
                                            }}
                                        >
                                            Products
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 12,
                                            }}
                                        >
                                            Check the receipts you want. Attach
                                            optional price and quantity
                                            discounts per item.
                                        </Text>
                                    </View>

                                    <InventoryCheckboxList
                                        selectedIds={selectedReceiptIds}
                                        onToggle={toggleReceipt}
                                        items={items}
                                        onOpenPriceDiscount={(r) =>
                                            setPriceDiscountReceipt(r)
                                        }
                                        onOpenQuantityDiscount={(r) =>
                                            setQuantityDiscountReceipt(r)
                                        }
                                        onClearPriceDiscount={(id) =>
                                            clearDiscount(id, "price")
                                        }
                                        onClearQuantityDiscount={(id) =>
                                            clearDiscount(id, "quantity")
                                        }
                                        receipts={receiptsSource}
                                        isLoading={receiptsSyncing}
                                        maxHeight={360}
                                    />

                                    {projectionCard}

                                    {formik.submitCount > 0 &&
                                        formik.errors.items ? (
                                        <Text
                                            style={{
                                                color: "#ef4444",
                                                fontSize: 12,
                                            }}
                                        >
                                            {String(formik.errors.items)}
                                        </Text>
                                    ) : null}
                                </View>
                            );

                            const retailersPanel = (
                                <View style={{ flex: 1, gap: 16 }}>
                                    <View style={{ gap: 8 }}>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontSize: 15,
                                                fontWeight: "600",
                                            }}
                                        >
                                            Retailers
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 12,
                                            }}
                                        >
                                            {expectedRetailerType
                                                ? `Showing ${expectedRetailerType.replace(
                                                    /([a-z])([A-Z])/g,
                                                    "$1 $2"
                                                )} entities. Check the ones who will see this campaign.`
                                                : "Wholesaler category not recognised — no retailers available."}
                                        </Text>
                                    </View>

                                    <RetailerCheckboxList
                                        value={retailerIds}
                                        onChange={(ids) =>
                                            formik.setFieldValue(
                                                "retailer_ids",
                                                ids
                                            )
                                        }
                                        retailers={allRetailers}
                                        isLoading={isEntitiesSyncing}
                                        maxHeight={400}
                                    />

                                    {formik.submitCount > 0 &&
                                        formik.errors.retailer_ids ? (
                                        <Text
                                            style={{
                                                color: "#ef4444",
                                                fontSize: 12,
                                            }}
                                        >
                                            {String(
                                                formik.errors.retailer_ids
                                            )}
                                        </Text>
                                    ) : null}
                                </View>
                            );

                            const footer = (
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 12,
                                        paddingHorizontal: 16,
                                        paddingVertical: 12,
                                        borderTopWidth: 1,
                                        borderTopColor: theme.border,
                                        backgroundColor: theme.surface,
                                    }}
                                >
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            gap: 16,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 12,
                                            }}
                                        >
                                            {items.length} products
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 12,
                                            }}
                                        >
                                            {retailerIds.length} retailers
                                        </Text>
                                    </View>

                                    <View
                                        style={{
                                            flexDirection: "row",
                                            gap: 8,
                                        }}
                                    >
                                        <Button
                                            variant="ghost"
                                            onPress={onClose}
                                            disabled={formik.isSubmitting}
                                            fullWidth={false}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onPress={formik.handleSubmit}
                                            loading={formik.isSubmitting}
                                            disabled={
                                                items.length === 0 ||
                                                retailerIds.length === 0
                                            }
                                            fullWidth={false}
                                        >
                                            Save
                                        </Button>
                                    </View>
                                </View>
                            );

                            return (
                                <>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            paddingHorizontal: 16,
                                            paddingTop:
                                                Platform.OS === "ios"
                                                    ? 56
                                                    : 16,
                                            paddingBottom: 12,
                                            borderBottomWidth: 1,
                                            borderBottomColor: theme.border,
                                            backgroundColor: theme.surface,
                                        }}
                                    >
                                        <View style={{ gap: 2 }}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontSize: 18,
                                                    fontWeight: "700",
                                                }}
                                            >
                                                Build campaign
                                            </Text>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontSize: 12,
                                                }}
                                            >
                                                Pick products and discounts,
                                                then choose retailers.
                                            </Text>
                                        </View>

                                        <Pressable
                                            onPress={onClose}
                                            hitSlop={12}
                                        >
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontSize: 24,
                                                    lineHeight: 26,
                                                }}
                                            >
                                                ×
                                            </Text>
                                        </Pressable>
                                    </View>

                                    {!isWide ? (
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                borderBottomWidth: 1,
                                                borderBottomColor: theme.border,
                                                backgroundColor: theme.surface,
                                            }}
                                        >
                                            {(
                                                ["products", "retailers"] as const
                                            ).map((t) => {
                                                const active =
                                                    activeTab === t;
                                                return (
                                                    <Pressable
                                                        key={t}
                                                        onPress={() =>
                                                            handleTabChange(t)
                                                        }
                                                        style={{
                                                            flex: 1,
                                                            paddingVertical: 12,
                                                            alignItems:
                                                                "center",
                                                            borderBottomWidth: 2,
                                                            borderBottomColor:
                                                                active
                                                                    ? theme.primary
                                                                    : "transparent",
                                                        }}
                                                    >
                                                        <Text
                                                            style={{
                                                                color: active
                                                                    ? theme.primary
                                                                    : theme.textDark,
                                                                fontSize: 13,
                                                                fontWeight:
                                                                    "600",
                                                            }}
                                                        >
                                                            {t === "products"
                                                                ? `Products · ${items.length}`
                                                                : `Retailers · ${retailerIds.length}`}
                                                        </Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    ) : null}

                                    {isWide ? (
                                        <View
                                            style={{
                                                flex: 1,
                                                flexDirection: "row",
                                            }}
                                        >
                                            <ScrollView
                                                style={{ flex: 1 }}
                                                contentContainerStyle={{
                                                    padding: 16,
                                                    gap: 16,
                                                }}
                                                keyboardShouldPersistTaps="handled"
                                            >
                                                {productsPanel}
                                            </ScrollView>

                                            <View
                                                style={{
                                                    width: 1,
                                                    backgroundColor:
                                                        theme.border,
                                                }}
                                            />

                                            <ScrollView
                                                style={{ flex: 1 }}
                                                contentContainerStyle={{
                                                    padding: 16,
                                                    gap: 16,
                                                }}
                                                keyboardShouldPersistTaps="handled"
                                            >
                                                {retailersPanel}
                                            </ScrollView>
                                        </View>
                                    ) : (
                                        <ScrollView
                                            ref={narrowScrollRef}
                                            style={{ flex: 1 }}
                                            contentContainerStyle={{
                                                padding: 16,
                                                paddingBottom: 32,
                                                gap: 16,
                                            }}
                                            keyboardShouldPersistTaps="handled"
                                            contentInsetAdjustmentBehavior="automatic"
                                        >
                                            {activeTab === "products"
                                                ? productsPanel
                                                : retailersPanel}
                                        </ScrollView>
                                    )}

                                    {footer}
                                </>
                            );
                        }}
                    </Formik>
                )}

                <WholesalerPriceDiscountFormModal
                    visible={priceDiscountReceipt !== null}
                    existing={null}
                    onClose={() => setPriceDiscountReceipt(null)}
                    onSaved={(discount) => {
                        if (priceDiscountReceipt) {
                            attachDiscountToItem(
                                receiptId(priceDiscountReceipt),
                                "price",
                                discount
                            );
                        }
                        setPriceDiscountReceipt(null);
                    }}
                    onSubmit={(payload, id) =>
                        api.submitPriceDiscountAction(payload as any, id)
                    }
                />

                <WholesalerQuantityDiscountFormModal
                    visible={quantityDiscountReceipt !== null}
                    existing={null}
                    onClose={() => setQuantityDiscountReceipt(null)}
                    onSaved={(discount) => {
                        if (quantityDiscountReceipt) {
                            attachDiscountToItem(
                                receiptId(quantityDiscountReceipt),
                                "quantity",
                                discount
                            );
                        }
                        setQuantityDiscountReceipt(null);
                    }}
                    onSubmit={(payload, id) =>
                        api.submitQuantityDiscountAction(payload as any, id)
                    }
                />
            </View>
        </RNModal>
    );
}

/* =========================================================
 * Local atoms
 * ======================================================= */

function Stat({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ gap: 2 }}>
            <Text
                style={{
                    color: theme.textDark,
                    fontSize: 10,
                    fontWeight: "600",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: theme.text,
                    fontSize: 15,
                    fontWeight: "700",
                }}
            >
                {value}
            </Text>
        </View>
    );
}