// components/shoppers/RetailerCartPanel.tsx
import {
    DeliveryMethodSelector,
    type DeliveryMethod,
} from "@/components/common/DeliveryMethodSelector";
import { CheckoutDeliveryOptions } from "@/components/deliveries/CheckoutDeliveryOptions";
import { useAuth } from "@/context/AuthContext";
import {
    ShopperCartLine,
    useShopperCart,
} from "@/context/ShopperCartContext";
import type { CustomerOrder } from "@/databases/types";
import {
    AlertCircle,
    CheckCircle2,
    Minus,
    Package,
    Plus,
    ShoppingCart,
    Trash2,
    X
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const isWeb = Platform.OS === "web";
const webPointer = isWeb ? ({ cursor: "pointer" } as any) : {};
const webNoOutline = isWeb ? ({ outlineStyle: "none" } as any) : {};

/* ── Formatters ─────────────────────────────────────────────── */

const formatMoney = (v: number | null | undefined): string => {
    if (v === null || v === undefined) return "—";
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const lineTotal = (l: ShopperCartLine) => l.unitPrice * l.quantity;

/* ── Customer address ───────────────────────────────────────── */

export interface CustomerAddress {
    name: string;
    phone: string;
    label: string;
    latitude: number | null;
    longitude: number | null;
}

const emptyCustomerAddress: CustomerAddress = {
    name: "",
    phone: "",
    label: "",
    latitude: null,
    longitude: null,
};

/* ── Logistics normalization helpers ────────────────────────── */


/* ── Image fallback ─────────────────────────────────────────── */

const ImageWithFallback: React.FC<{ uri?: string; size: number }> = ({
    uri,
    size,
}) => {
    const [errored, setErrored] = useState(false);
    const { isDarkMode } = useAuth();
    const bg = isDarkMode ? "#0f172a" : "#f1f5f9";

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: bg,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {uri && !errored ? (
                <Image
                    source={{ uri }}
                    style={{ width: size, height: size }}
                    resizeMode="cover"
                    onError={() => setErrored(true)}
                />
            ) : (
                <Package size={size * 0.4} color="rgba(148,163,184,0.6)" />
            )}
        </View>
    );
};

/* ── Quantity input ─────────────────────────────────────────── */

const QuantityInput: React.FC<{
    value: number;
    theme: any;
    borderColor: string;
    subtleBg: string;
    onChange: (next: number) => void;
}> = ({ value, theme, borderColor, subtleBg, onChange }) => {
    const [text, setText] = useState(String(value));
    const focusedRef = useRef(false);

    useEffect(() => {
        if (focusedRef.current) return;
        setText(String(value));
    }, [value]);

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 8,
                borderWidth: 1,
                borderColor,
                backgroundColor: subtleBg,
                overflow: "hidden",
            }}
        >
            <TouchableOpacity
                onPress={() => onChange(Math.max(1, value - 1))}
                disabled={value <= 1}
                activeOpacity={0.7}
                style={{
                    width: 26,
                    height: 26,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: value <= 1 ? 0.4 : 1,
                    ...webPointer,
                }}
            >
                <Minus size={12} color={theme.text} />
            </TouchableOpacity>

            <TextInput
                value={text}
                onChangeText={(t) => {
                    const digits = t.replace(/[^0-9]/g, "");
                    setText(digits);
                    const parsed = digits.length > 0 ? parseInt(digits, 10) : 0;
                    if (parsed >= 1) onChange(parsed);
                }}
                onFocus={() => { focusedRef.current = true; }}
                onBlur={() => {
                    focusedRef.current = false;
                    const digits = text.replace(/[^0-9]/g, "");
                    const parsed = digits.length > 0 ? parseInt(digits, 10) : 0;
                    if (parsed < 1) {
                        setText("1");
                        onChange(1);
                    } else {
                        setText(String(parsed));
                    }
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                selectTextOnFocus
                style={{
                    width: 34,
                    height: 26,
                    padding: 0,
                    textAlign: "center",
                    fontFamily: theme.font.bold,
                    fontSize: 12,
                    color: theme.text,
                    ...webNoOutline,
                }}
            />

            <TouchableOpacity
                onPress={() => onChange(value + 1)}
                activeOpacity={0.7}
                style={{
                    width: 26,
                    height: 26,
                    alignItems: "center",
                    justifyContent: "center",
                    ...webPointer,
                }}
            >
                <Plus size={12} color={theme.text} />
            </TouchableOpacity>
        </View>
    );
};

/* ── Props ──────────────────────────────────────────────────── */

interface RetailerCartPanelProps {
    onClose?: () => void;
    bottomInset?: number;
    onRequestCloseOrder?: (order: CustomerOrder) => void;
    deliveryMethod?: DeliveryMethod;
    onDeliveryMethodChange?: (m: DeliveryMethod) => void;

    /** The shop (prices its delivery options to the shopper's location). */
    retailerId?: string;
    /** Chosen delivery option (logistics GetCustomerDeliveryOptions key) and its total. */
    deliveryOptionKey?: string | null;
    onDeliveryOptionChange?: (key: string | null, total: number | null) => void;

    customerAddress?: CustomerAddress | null;
    onCustomerAddressChange?: (address: CustomerAddress) => void;

    /** Delivery fee of the chosen option (added to the total). */
    shippingCost?: number | null;
    retailerName?: string;
    retailerLocation?: string;
}

/* ── Component ──────────────────────────────────────────────── */

export default function RetailerCartPanel({
    onClose,
    bottomInset = 0,
    onRequestCloseOrder,
    deliveryMethod = "PICKUP",
    onDeliveryMethodChange,
    retailerId,
    deliveryOptionKey,
    onDeliveryOptionChange,
    customerAddress,
    onCustomerAddressChange,
    shippingCost,
    retailerName,
    retailerLocation,
}: RetailerCartPanelProps) {
    const { theme, isDarkMode } = useAuth();
    const {
        order,
        lines,
        isReady,
        itemCount,
        totalUnits,
        subtotal,
        setQuantity,
        removeLine,
    } = useShopperCart();

    const [locationError, setLocationError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    const borderColor = isDarkMode ? "#1e293b" : "#e8edf2";
    const rowDivider = isDarkMode ? "#111827" : "#f4f6f8";
    const subtleBg = isDarkMode ? "#0f172a" : "#f1f5f9";

    const empty = lines.length === 0;
    const hasPin = Number.isFinite(customerAddress?.latitude) && Number.isFinite(customerAddress?.longitude);

    // Delivery: the shopper shares their location and picks one of the shop's
    // priced options; its total is the delivery fee.
    const isDelivery = deliveryMethod === "DELIVERY";
    const finalTotal = subtotal + (isDelivery ? shippingCost || 0 : 0);
    const canCloseOrder = !isDelivery || (hasPin && !!deliveryOptionKey);

    const handleCloseOrder = () => {
        if (!order) return;
        if (!onRequestCloseOrder) return;
        if (!canCloseOrder) return;
        onRequestCloseOrder(order);
    };

    const requestLocation = useCallback(() => {
        if (!isWeb || typeof navigator === "undefined" || !navigator.geolocation) {
            setLocationError("Location is not supported on this device or browser.");
            return;
        }

        setIsLocating(true);
        setLocationError(null);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setIsLocating(false);
                onCustomerAddressChange?.({
                    ...(customerAddress || emptyCustomerAddress),
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                setIsLocating(false);
                let msg = "Could not retrieve location.";
                if (error.code === 1) msg = "Location permission denied. Allow it to get deliveries.";
                else if (error.code === 2) msg = "Location information is unavailable on your device.";
                else if (error.code === 3) msg = "Location request timed out. Please try again.";
                setLocationError(msg);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [customerAddress, onCustomerAddressChange]);

    useEffect(() => {
        if (deliveryMethod === "DELIVERY") {
            if (!hasPin) requestLocation();
        } else {
            setLocationError(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deliveryMethod]);

    const subtitle = !isReady
        ? "Loading…"
        : empty
            ? "Nothing added yet."
            : `${itemCount} item${itemCount === 1 ? "" : "s"} · ${totalUnits} unit${totalUnits === 1 ? "" : "s"}`;

    return (
        <View style={{ flex: 1, backgroundColor: theme.panel }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <View
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        marginRight: 11,
                        backgroundColor: theme.primary,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <ShoppingCart size={16} color="#fff" />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: theme.text }}>
                        Your cart
                    </Text>
                    <Text style={{ marginTop: 1, fontFamily: theme.font.regular, fontSize: 11, color: theme.textDark }}>
                        {subtitle}
                    </Text>
                </View>

                {onClose && (
                    <TouchableOpacity
                        onPress={onClose}
                        activeOpacity={0.8}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: subtleBg,
                            ...webPointer,
                        }}
                    >
                        <X size={14} color={theme.text} />
                    </TouchableOpacity>
                )}
            </View>

            {!isReady ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={{ marginTop: 10, textAlign: "center", fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.textDark }}>
                        Loading your cart…
                    </Text>
                </View>
            ) : empty ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                    <Package size={30} color={theme.textDark} />
                    <Text style={{ marginTop: 12, textAlign: "center", fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.textDark, lineHeight: 18 }}>
                        Your cart is empty.
                    </Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 8 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                >
                    {lines.map((l, index) => (
                        <View
                            key={l.receiptId || `cart-line-${index}`}
                            style={{
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: rowDivider,
                            }}
                        >
                            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                                <View style={{ marginRight: 12 }}>
                                    <ImageWithFallback uri={l.image} size={46} />
                                </View>

                                <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text numberOfLines={2} style={{ fontFamily: theme.font.medium, fontSize: 12, lineHeight: 16, color: theme.text }}>
                                        {l.name}
                                    </Text>
                                    <Text style={{ marginTop: 3, fontFamily: theme.font.regular, fontSize: 10, color: theme.textDark }}>
                                        KES {formatMoney(l.unitPrice)} / {l.unit}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() => removeLine(l.receiptId, index)}
                                    activeOpacity={0.7}
                                    style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 6,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: "rgba(220,38,38,0.1)",
                                        ...webPointer,
                                    }}
                                >
                                    <Trash2 size={12} color="#dc2626" />
                                </TouchableOpacity>
                            </View>

                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                                <QuantityInput
                                    value={l.quantity}
                                    theme={theme}
                                    borderColor={borderColor}
                                    subtleBg={subtleBg}
                                    onChange={(next) => setQuantity(l.receiptId, next)}
                                />

                                <Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: theme.text }}>
                                    KES {formatMoney(lineTotal(l))}
                                </Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}

            <View
                style={{
                    borderTopWidth: 1,
                    borderTopColor: borderColor,
                    paddingHorizontal: 16,
                    paddingTop: 14,
                    paddingBottom: 14 + bottomInset,
                    maxHeight: "60%",
                }}
            >
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={{ gap: 6, marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                            <Text style={{ fontFamily: theme.font.medium, fontSize: 12, color: theme.textDark }}>
                                Subtotal
                            </Text>
                            <Text style={{ fontFamily: theme.font.medium, fontSize: 13, color: theme.text }}>
                                KES {formatMoney(subtotal)}
                            </Text>
                        </View>

                        {isDelivery && (
                            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                                <Text style={{ fontFamily: theme.font.medium, fontSize: 12, color: theme.textDark }}>
                                    Delivery
                                </Text>
                                <Text style={{ fontFamily: theme.font.medium, fontSize: 13, color: theme.text }}>
                                    {deliveryOptionKey ? `KES ${formatMoney(shippingCost)}` : "Choose an option"}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: rowDivider, paddingTop: 10 }}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: theme.textDark }}>
                            Total
                        </Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 20, color: theme.text }}>
                            KES {formatMoney(finalTotal)}
                        </Text>
                    </View>

                    {isReady && !empty && (
                        <>
                            <View style={{ marginTop: 14 }}>
                                <DeliveryMethodSelector
                                    value={deliveryMethod}
                                    methods={["PICKUP", "DELIVERY"]}
                                    onChange={(m) => {
                                        onDeliveryMethodChange?.(m);
                                        if (m === "PICKUP") onDeliveryOptionChange?.(null, null);
                                    }}
                                    label="Fulfilment"
                                    variant="segment"
                                />
                            </View>

                            {isDelivery && (
                                <View style={{ marginTop: 16, gap: 10 }}>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: theme.textDark }}>
                                        Delivery to you
                                    </Text>

                                    {locationError && (
                                        <View style={{
                                            backgroundColor: isDarkMode ? "rgba(220,38,38,0.1)" : "#fef2f2",
                                            borderWidth: 1,
                                            borderColor: isDarkMode ? "rgba(220,38,38,0.3)" : "#fecaca",
                                            borderRadius: 8,
                                            padding: 12,
                                            flexDirection: "row",
                                            alignItems: "flex-start",
                                            gap: 8,
                                        }}>
                                            <AlertCircle size={16} color={isDarkMode ? "#fca5a5" : "#dc2626"} style={{ marginTop: 1 }} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontFamily: theme.font.medium, fontSize: 12, color: isDarkMode ? "#fca5a5" : "#991b1b", lineHeight: 16 }}>
                                                    {locationError}
                                                </Text>
                                                <TouchableOpacity onPress={requestLocation} style={{ marginTop: 6 }}>
                                                    <Text style={{ fontFamily: theme.font.bold, fontSize: 12, color: isDarkMode ? "#f87171" : "#dc2626" }}>
                                                        Try again
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {isLocating ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <ActivityIndicator size="small" color={theme.primary} />
                                            <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark }}>
                                                Getting your location…
                                            </Text>
                                        </View>
                                    ) : hasPin ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <CheckCircle2 size={16} color={isDarkMode ? "#4ade80" : "#16a34a"} />
                                            <Text style={{ flex: 1, fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark }}>
                                                To {customerAddress?.latitude?.toFixed(4)}, {customerAddress?.longitude?.toFixed(4)} from{" "}
                                                <Text style={{ fontFamily: theme.font.semibold, color: theme.text }}>{retailerName || "the shop"}</Text>
                                                {retailerLocation ? ` (${retailerLocation})` : ""}
                                            </Text>
                                            <TouchableOpacity onPress={requestLocation}>
                                                <Text style={{ fontFamily: theme.font.bold, fontSize: 12, color: theme.primary }}>Update</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        !locationError && (
                                            <TouchableOpacity onPress={requestLocation}>
                                                <Text style={{ fontFamily: theme.font.bold, fontSize: 12.5, color: theme.primary }}>Share my location</Text>
                                            </TouchableOpacity>
                                        )
                                    )}

                                    {retailerId ? (
                                        <CheckoutDeliveryOptions
                                            retailerId={retailerId}
                                            latitude={customerAddress?.latitude}
                                            longitude={customerAddress?.longitude}
                                            lines={lines.map((l) => ({ receiptId: l.receiptId, quantity: l.quantity }))}
                                            selectedKey={deliveryOptionKey ?? null}
                                            onSelect={(key, total) => onDeliveryOptionChange?.(key, total)}
                                        />
                                    ) : null}
                                </View>
                            )}

                            <TouchableOpacity
                                onPress={handleCloseOrder}
                                activeOpacity={0.85}
                                disabled={!canCloseOrder}
                                style={{
                                    marginTop: 16,
                                    height: 46,
                                    borderRadius: 12,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: theme.primary,
                                    opacity: canCloseOrder ? 1 : 0.5,
                                    ...webPointer,
                                }}
                            >
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: "#fff" }}>
                                    Close order
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}
                </ScrollView>
            </View>
        </View>
    );
}