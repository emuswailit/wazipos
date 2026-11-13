// components/shoppers/RetailerQuantityModal.tsx
//
// Quantity prompt for adding a product to the shopper cart.
//
// NESTED INTERACTIVES
//   react-native-web renders Pressable/TouchableOpacity as
//   <button>, and a <button> cannot contain another <button>. Every
//   interactive element is therefore a View with platform-specific
//   handlers:
//     web    → onClick (with stopPropagation for the content card)
//     native → onStartShouldSetResponder + onResponderRelease
//
// WEB OVERLAY
//   On web the modal renders as an absolutely-positioned View
//   instead of RN's Modal. That bypasses RN Web's modal quirks and
//   guarantees the overlay captures every click.
//
// On native, the RN Modal is kept — it works there.

import { useAuth } from "@/context/AuthContext";
import { useShopperCart } from "@/context/ShopperCartContext";
import type { RetailerReceipt } from "@/databases/types";
import {
    getReceiptImage,
    getReceiptKey,
    getReceiptName,
    getReceiptPrice,
    getReceiptStock,
} from "@/hooks/useRetailerInventory";
import { Minus, Package, Plus, Trash2, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
    Image,
    Modal,
    Platform,
    Text,
    TextInput,
    View,
} from "react-native";

const isWeb = Platform.OS === "web";
const webPointer = isWeb ? ({ cursor: "pointer" } as any) : {};
const webNoOutline = isWeb ? ({ outlineStyle: "none" } as any) : {};

const formatMoney = (v: any): string => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/* ── Press handler factory ─────────────────────────────────── */

function pressHandlers(
    onPress: () => void,
    stopPropagation = false,
) {
    return isWeb
        ? {
            onClick: (e: any) => {
                if (stopPropagation) e?.stopPropagation?.();
                onPress();
            },
        }
        : {
            onStartShouldSetResponder: () => true,
            onResponderRelease: (e: any) => {
                if (stopPropagation) e?.stopPropagation?.();
                onPress();
            },
        };
}

/* ── Image fallback ─────────────────────────────────────────── */

const ImageWithFallback: React.FC<{ uri?: string; size: number }> = ({
    uri,
    size,
}) => {
    const [errored, setErrored] = useState(false);

    if (!uri || errored) {
        return (
            <View
                style={{
                    width: size,
                    height: size,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Package size={size * 0.4} color="rgba(148,163,184,0.6)" />
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={{ width: size, height: size }}
            resizeMode="cover"
            onError={() => setErrored(true)}
        />
    );
};

/* ── Props ──────────────────────────────────────────────────── */

interface RetailerQuantityModalProps {
    visible: boolean;
    product: RetailerReceipt | null;
    onClose: () => void;
}

/* ── Component ──────────────────────────────────────────────── */

export default function RetailerQuantityModal({
    visible,
    product,
    onClose,
}: RetailerQuantityModalProps) {
    const { theme, isDarkMode } = useAuth();
    const cart = useShopperCart();
    const { getQuantity, addOrUpdate, removeLine } = cart;

    const [qtyText, setQtyText] = useState("1");

    const receiptKey = product ? getReceiptKey(product) : "";
    const existingQuantity = product ? getQuantity(receiptKey) : 0;
    const isEditing = existingQuantity > 0;

    useEffect(() => {
        if (!visible) return;
        setQtyText(String(existingQuantity > 0 ? existingQuantity : 1));
    }, [visible, product?.remote_id, (product as any)?.id, existingQuantity]);

    useEffect(() => {
        if (!isWeb || !visible) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [visible, onClose]);

    if (!visible || !product) return null;

    const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
    const stock = getReceiptStock(product);
    const canSubmit = qty > 0 && qty <= stock;

    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const subtleBg = isDarkMode ? "#0f172a" : "#f1f5f9";

    /* ── Handlers ─────────────────────────────────────────── */

    const handleSubmit = () => {
        if (!canSubmit) return;
        addOrUpdate(product, qty);
        onClose();
    };

    const handleRemove = () => {
        if (!receiptKey) return;
        removeLine(receiptKey);
        onClose();
    };

    /* ── Overlay ──────────────────────────────────────────── */

    const overlay = (
        <View
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999,
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
            }}
        >
            {/* Backdrop */}
            <View
                {...pressHandlers(onClose)}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)",
                }}
            />

            {/* Content card */}
            <View
                {...pressHandlers(() => { }, true)}
                style={{
                    width: "100%",
                    maxWidth: 420,
                    backgroundColor: theme.panel,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor,
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor,
                    }}
                >
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                letterSpacing: 1,
                                textTransform: "uppercase",
                                color: isEditing ? "#16a34a" : theme.primary,
                                marginBottom: 2,
                            }}
                        >
                            {isEditing ? "Already in cart" : "Add to cart"}
                        </Text>
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                                color: theme.text,
                            }}
                        >
                            {isEditing ? "Update quantity" : "Set quantity"}
                        </Text>
                    </View>

                    <View
                        {...pressHandlers(onClose)}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: subtleBg,
                            ...webPointer,
                        }}
                    >
                        <X size={14} color={theme.text} />
                    </View>
                </View>

                {/* Product preview */}
                <View style={{ flexDirection: "row", padding: 16 }}>
                    <View
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 10,
                            backgroundColor: subtleBg,
                            overflow: "hidden",
                            marginRight: 12,
                        }}
                    >
                        <ImageWithFallback
                            uri={getReceiptImage(product)}
                            size={64}
                        />
                    </View>
                    <View style={{ flex: 1, justifyContent: "center" }}>
                        <Text
                            numberOfLines={2}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                                color: theme.text,
                            }}
                        >
                            {getReceiptName(product)}
                        </Text>
                        <Text
                            style={{
                                marginTop: 2,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.xs,
                                color: theme.textDark,
                            }}
                        >
                            {product.unit_of_receipt || "unit"} · {stock}{" "}
                            available
                        </Text>
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                color: theme.primary,
                                marginTop: 4,
                            }}
                        >
                            KES {formatMoney(getReceiptPrice(product))} /{" "}
                            {product.unit_of_receipt || "unit"}
                        </Text>
                    </View>
                </View>

                {/* Quantity stepper */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <Text
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                            letterSpacing: 0.6,
                            textTransform: "uppercase",
                            color: theme.textDark,
                            marginBottom: 8,
                        }}
                    >
                        Quantity
                    </Text>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor,
                            backgroundColor: subtleBg,
                            paddingHorizontal: 6,
                            height: 44,
                        }}
                    >
                        <View
                            {...pressHandlers(() =>
                                setQtyText(String(Math.max(1, qty - 1))),
                            )}
                            accessibilityRole="button"
                            accessibilityLabel="Decrease quantity"
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: qty <= 1 ? 0.4 : 1,
                                ...(qty <= 1 ? {} : webPointer),
                            }}
                        >
                            <Minus size={16} color={theme.text} />
                        </View>

                        <TextInput
                            value={qtyText}
                            onChangeText={(t) =>
                                setQtyText(t.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            inputMode="numeric"
                            selectTextOnFocus
                            style={{
                                flex: 1,
                                textAlign: "center",
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.lg,
                                color: theme.text,
                                ...webNoOutline,
                            }}
                        />

                        <View
                            {...pressHandlers(() =>
                                setQtyText(String(Math.min(stock, qty + 1))),
                            )}
                            accessibilityRole="button"
                            accessibilityLabel="Increase quantity"
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: qty >= stock ? 0.4 : 1,
                                ...(qty >= stock ? {} : webPointer),
                            }}
                        >
                            <Plus size={16} color={theme.text} />
                        </View>
                    </View>

                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.xs,
                            color: qty > stock ? "#dc2626" : theme.textDark,
                        }}
                    >
                        {qty > stock
                            ? `Only ${stock} in stock`
                            : isEditing
                                ? `Currently ${existingQuantity} — will become ${qty}`
                                : `Will add ${qty} ${qty === 1 ? "unit" : "units"
                                }`}
                    </Text>
                </View>

                {/* Actions */}
                <View
                    style={{
                        flexDirection: "row",
                        paddingHorizontal: 16,
                        paddingBottom: 16,
                    }}
                >
                    {isEditing && (
                        <View
                            {...pressHandlers(handleRemove)}
                            accessibilityRole="button"
                            accessibilityLabel="Remove from cart"
                            style={{
                                width: 42,
                                height: 42,
                                borderRadius: 10,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "rgba(220,38,38,0.1)",
                                borderWidth: 1,
                                borderColor: "rgba(220,38,38,0.35)",
                                marginRight: 8,
                                ...webPointer,
                            }}
                        >
                            <Trash2 size={16} color="#dc2626" />
                        </View>
                    )}

                    <View
                        {...pressHandlers(onClose)}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                        style={{
                            flex: 1,
                            height: 42,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: subtleBg,
                            marginRight: 8,
                            ...webPointer,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                color: theme.text,
                            }}
                        >
                            Cancel
                        </Text>
                    </View>

                    <View
                        {...pressHandlers(handleSubmit)}
                        accessibilityRole="button"
                        accessibilityLabel={
                            isEditing ? "Update quantity" : "Add to cart"
                        }
                        accessibilityState={{ disabled: !canSubmit }}
                        style={{
                            flex: 1,
                            height: 42,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: theme.primary,
                            opacity: canSubmit ? 1 : 0.5,
                            ...(canSubmit ? webPointer : {}),
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                color: "#fff",
                            }}
                        >
                            {isEditing ? "Update" : "Add to cart"}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );

    if (isWeb) {
        return overlay;
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            {overlay}
        </Modal>
    );
}