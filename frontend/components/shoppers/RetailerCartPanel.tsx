// components/shoppers/RetailerCartPanel.tsx
import {
    DeliveryMethodSelector,
    type DeliveryMethod,
} from "@/components/common/DeliveryMethodSelector";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { useAuth } from "@/context/AuthContext";
import {
    ShopperCartLine,
    useShopperCart,
} from "@/context/ShopperCartContext";
import type { CustomerOrder, EmployeeNormalized } from "@/databases/types";
import type { CollectionPoint, Courier } from "@/hooks/useLogistics";
import {
    AlertCircle,
    CheckCircle2,
    Minus,
    Package,
    Plus,
    Search,
    ShoppingCart,
    Trash2,
    X
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable, // 🟢 FIXED: Added missing import
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

const getCourierName = (c: any) => c?.entity_title || c?.name || c?.title || "Unknown Transporter";
const getCourierId = (c: any) => c?.id || c?.uuid || c?.key || "";
const getPointName = (p: any) => p?.name || p?.title || "Unknown Point";
const getPointAddress = (p: any) => p?.address || p?.location || "";
const getPointId = (p: any) => p?.id || p?.uuid || p?.key || "";

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

    couriers?: Courier[];
    couriersLoading?: boolean;
    selectedCourierId?: string | null;
    onSelectCourier?: (id: string | null) => void;

    collectionPoints?: CollectionPoint[];
    collectionPointsLoading?: boolean;
    selectedCollectionPoint?: CollectionPoint | null;
    onSelectCollectionPoint?: (point: CollectionPoint | null) => void;

    customerAddress?: CustomerAddress | null;
    onCustomerAddressChange?: (address: CustomerAddress) => void;

    shippingCost?: number | null;
    shippingLoading?: boolean;
    shippingError?: string | null;
    retailerName?: string;
    retailerLocation?: string;

    isRetailerDelivery?: boolean;
    onToggleRetailerDelivery?: (val: boolean) => void;
    deliveryEmployees?: EmployeeNormalized[];
    deliveryEmployeesLoading?: boolean;
    selectedDeliveryEmployeeId?: string | null;
    onSelectDeliveryEmployee?: (id: string | null) => void;
}

/* ── Component ──────────────────────────────────────────────── */

export default function RetailerCartPanel({
    onClose,
    bottomInset = 0,
    onRequestCloseOrder,
    deliveryMethod = "PICKUP",
    onDeliveryMethodChange,
    couriers = [],
    couriersLoading = false,
    selectedCourierId,
    onSelectCourier,
    collectionPoints = [],
    collectionPointsLoading = false,
    selectedCollectionPoint,
    onSelectCollectionPoint,
    customerAddress,
    onCustomerAddressChange,
    shippingCost,
    shippingLoading,
    shippingError,
    retailerName,
    retailerLocation,
    isRetailerDelivery = false,
    onToggleRetailerDelivery,
    deliveryEmployees = [],
    deliveryEmployeesLoading = false,
    selectedDeliveryEmployeeId,
    onSelectDeliveryEmployee,
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

    const [courierSearch, setCourierSearch] = useState("");
    const [showCourierList, setShowCourierList] = useState(false);

    const [pointSearch, setPointSearch] = useState("");
    const [showPointList, setShowPointList] = useState(false);

    const [locationError, setLocationError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    const borderColor = isDarkMode ? "#1e293b" : "#e8edf2";
    const rowDivider = isDarkMode ? "#111827" : "#f4f6f8";
    const subtleBg = isDarkMode ? "#0f172a" : "#f1f5f9";

    const empty = lines.length === 0;
    const hasPin = Number.isFinite(customerAddress?.latitude) && Number.isFinite(customerAddress?.longitude);

    const isShippingActive = deliveryMethod === "COURIER" || deliveryMethod === "DELIVERY";
    const isShippingReady = isShippingActive
        ? (shippingCost !== null && !shippingLoading && !shippingError)
        : true;

    const finalTotal = subtotal + (shippingCost || 0);

    const canCloseOrder = (() => {
        if (deliveryMethod === "PICKUP") return true;

        if (isRetailerDelivery) {
            if (!selectedDeliveryEmployeeId) return false;
            if (deliveryMethod === "COURIER") return hasPin && isShippingReady;
            return isShippingReady;
        }

        if (deliveryMethod === "DELIVERY")
            return !!selectedCourierId && !!selectedCollectionPoint && isShippingReady;
        if (deliveryMethod === "COURIER")
            return !!selectedCourierId && hasPin && isShippingReady;
        return false;
    })();

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
                if (error.code === 1) msg = "Location permission denied. Please enable it to use Courier.";
                else if (error.code === 2) msg = "Location information is unavailable on your device.";
                else if (error.code === 3) msg = "Location request timed out. Please try again.";
                setLocationError(msg);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [customerAddress, onCustomerAddressChange]);

    useEffect(() => {
        if (deliveryMethod === "COURIER") {
            requestLocation();
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

    const filteredCouriers = couriers.filter((c: any) =>
        getCourierName(c).toLowerCase().includes(courierSearch.toLowerCase()),
    );
    const selectedCourierName = couriers.length > 0
        ? getCourierName(couriers.find((c: any) => getCourierId(c) === selectedCourierId))
        : undefined;

    const filteredPoints = collectionPoints.filter(
        (p: any) =>
            getPointName(p).toLowerCase().includes(pointSearch.toLowerCase()) ||
            getPointAddress(p).toLowerCase().includes(pointSearch.toLowerCase()),
    );

    const isCourierBased =
        deliveryMethod === "DELIVERY" || deliveryMethod === "COURIER";

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

                        {isShippingActive && (
                            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                                <Text style={{ fontFamily: theme.font.medium, fontSize: 12, color: theme.textDark }}>
                                    Shipping
                                </Text>
                                {shippingLoading && !isRetailerDelivery ? (
                                    <ActivityIndicator size="small" color={theme.primary} />
                                ) : (
                                    <Text style={{ fontFamily: theme.font.medium, fontSize: 13, color: theme.text }}>
                                        KES {formatMoney(shippingCost)}
                                    </Text>
                                )}
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
                                    onChange={(m) => {
                                        onDeliveryMethodChange?.(m);
                                        if (m === "PICKUP") onToggleRetailerDelivery?.(false);
                                        setCourierSearch("");
                                        setShowCourierList(false);
                                        setPointSearch("");
                                        setShowPointList(false);
                                    }}
                                    label="Fulfilment"
                                    variant="segment"
                                />
                            </View>

                            {isCourierBased && (
                                <Pressable
                                    onPress={() => onToggleRetailerDelivery?.(!isRetailerDelivery)}
                                    className="mt-3 flex-row items-center p-3.5 rounded-xl border"
                                    style={{
                                        backgroundColor: isRetailerDelivery ? `${theme.primary}10` : "transparent",
                                        borderColor: isRetailerDelivery ? theme.primary : borderColor,
                                    }}
                                >
                                    <View
                                        className="w-5 h-5 rounded border items-center justify-center mr-2.5"
                                        style={{
                                            borderColor: isRetailerDelivery ? theme.primary : theme.textDark,
                                            backgroundColor: isRetailerDelivery ? theme.primary : "transparent",
                                        }}
                                    >
                                        {isRetailerDelivery && <CheckCircle2 size={12} color="#fff" />}
                                    </View>
                                    <View className="flex-1">
                                        <Text style={{ fontFamily: theme.font.semibold, fontSize: 13, color: theme.text }}>
                                            Fulfilled by Retailer Staff
                                        </Text>
                                        <Text style={{ fontFamily: theme.font.regular, fontSize: 11, color: theme.textDark }}>
                                            Free delivery (No third-party courier)
                                        </Text>
                                    </View>
                                </Pressable>
                            )}

                            {isCourierBased && isRetailerDelivery && (
                                <View className="mt-4" style={{ zIndex: 1000 }}>
                                    <Text className="text-[10px] font-bold tracking-wider uppercase mb-1.5" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>
                                        Assign Store Delivery Staff
                                    </Text>
                                    <EmployeePicker
                                        employees={deliveryEmployees}
                                        isLoading={deliveryEmployeesLoading}
                                        selectedId={selectedDeliveryEmployeeId || null}
                                        onSelect={(id) => onSelectDeliveryEmployee?.(id)}
                                    />
                                </View>
                            )}

                            {isCourierBased && !isRetailerDelivery && (
                                <View style={{ marginTop: 16 }}>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: theme.textDark, marginBottom: 8 }}>
                                        1. {deliveryMethod === "DELIVERY" ? "Select Transporter" : "Select Rider"}
                                    </Text>

                                    {selectedCourierId ? (
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                paddingHorizontal: 12,
                                                paddingVertical: 12,
                                                borderRadius: 8,
                                                borderWidth: 1,
                                                borderColor: theme.primary,
                                                backgroundColor: `${theme.primary}10`,
                                            }}
                                        >
                                            <Text style={{ fontFamily: theme.font.semibold, fontSize: 13, color: theme.primary }}>
                                                {selectedCourierName || "Selected"}
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    onSelectCourier?.(null);
                                                    onSelectCollectionPoint?.(null);
                                                }}
                                                style={webPointer}
                                            >
                                                <X size={16} color={theme.primary} />
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <>
                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    alignItems: "center",
                                                    borderRadius: 8,
                                                    borderWidth: 1,
                                                    borderColor,
                                                    backgroundColor: subtleBg,
                                                    paddingHorizontal: 12,
                                                    height: 38,
                                                }}
                                            >
                                                <Search size={14} color={theme.textDark} />
                                                <TextInput
                                                    placeholder={
                                                        deliveryMethod === "DELIVERY"
                                                            ? "Search transporters…"
                                                            : "Search riders…"
                                                    }
                                                    placeholderTextColor={theme.textDark}
                                                    value={courierSearch}
                                                    onChangeText={(t) => {
                                                        setCourierSearch(t);
                                                        setShowCourierList(true);
                                                    }}
                                                    onFocus={() => setShowCourierList(true)}
                                                    onBlur={() => setTimeout(() => setShowCourierList(false), 200)}
                                                    style={{
                                                        flex: 1,
                                                        height: "100%",
                                                        marginLeft: 8,
                                                        fontFamily: theme.font.regular,
                                                        fontSize: 13,
                                                        color: theme.text,
                                                        ...webNoOutline,
                                                    }}
                                                />
                                            </View>

                                            {showCourierList && (
                                                <>
                                                    {couriersLoading ? (
                                                        <ActivityIndicator
                                                            size="small"
                                                            color={theme.primary}
                                                            style={{ alignSelf: "flex-start", marginTop: 8 }}
                                                        />
                                                    ) : filteredCouriers.length > 0 ? (
                                                        <View
                                                            style={{
                                                                borderWidth: 1,
                                                                borderColor,
                                                                borderRadius: 8,
                                                                marginTop: 4,
                                                                overflow: "hidden",
                                                            }}
                                                        >
                                                            {filteredCouriers.map((c: any) => (
                                                                <TouchableOpacity
                                                                    key={getCourierId(c)}
                                                                    onPress={() => {
                                                                        onSelectCourier?.(getCourierId(c));
                                                                        setCourierSearch("");
                                                                        setShowCourierList(false);
                                                                    }}
                                                                    style={{
                                                                        padding: 12,
                                                                        borderBottomWidth: 1,
                                                                        borderBottomColor: borderColor,
                                                                        backgroundColor: theme.panel,
                                                                        ...webPointer,
                                                                    }}
                                                                >
                                                                    <Text style={{ fontFamily: theme.font.medium, fontSize: 13, color: theme.text }}>
                                                                        {getCourierName(c)}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    ) : (
                                                        <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark, marginTop: 8 }}>
                                                            {courierSearch ? `No results matching "${courierSearch}"` : "No transporters available right now."}
                                                        </Text>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    )}

                                    {deliveryMethod === "DELIVERY" && selectedCourierId && (
                                        <View style={{ marginTop: 16 }}>
                                            <Text style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: theme.textDark, marginBottom: 8 }}>
                                                2. Select Drop-off Point
                                            </Text>

                                            {selectedCollectionPoint ? (
                                                <View
                                                    style={{
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 12,
                                                        borderRadius: 8,
                                                        borderWidth: 1,
                                                        borderColor: theme.primary,
                                                        backgroundColor: `${theme.primary}10`,
                                                    }}
                                                >
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontFamily: theme.font.semibold, fontSize: 13, color: theme.primary }}>
                                                            {getPointName(selectedCollectionPoint)}
                                                        </Text>
                                                        <Text style={{ fontFamily: theme.font.regular, fontSize: 11, color: theme.primary, opacity: 0.8, marginTop: 2 }}>
                                                            {getPointAddress(selectedCollectionPoint)}
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        onPress={() => onSelectCollectionPoint?.(null)}
                                                        style={webPointer}
                                                    >
                                                        <X size={16} color={theme.primary} />
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <>
                                                    <View
                                                        style={{
                                                            flexDirection: "row",
                                                            alignItems: "center",
                                                            borderRadius: 8,
                                                            borderWidth: 1,
                                                            borderColor,
                                                            backgroundColor: subtleBg,
                                                            paddingHorizontal: 12,
                                                            height: 38,
                                                        }}
                                                    >
                                                        <Search size={14} color={theme.textDark} />
                                                        <TextInput
                                                            placeholder="Search drop-off points…"
                                                            placeholderTextColor={theme.textDark}
                                                            value={pointSearch}
                                                            onChangeText={(t) => {
                                                                setPointSearch(t);
                                                                setShowPointList(true);
                                                            }}
                                                            onFocus={() => setShowPointList(true)}
                                                            onBlur={() => setTimeout(() => setShowPointList(false), 200)}
                                                            style={{
                                                                flex: 1,
                                                                height: "100%",
                                                                marginLeft: 8,
                                                                fontFamily: theme.font.regular,
                                                                fontSize: 13,
                                                                color: theme.text,
                                                                ...webNoOutline,
                                                            }}
                                                        />
                                                    </View>

                                                    {showPointList && (
                                                        <>
                                                            {collectionPointsLoading ? (
                                                                <ActivityIndicator
                                                                    size="small"
                                                                    color={theme.primary}
                                                                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                                                                />
                                                            ) : filteredPoints.length > 0 ? (
                                                                <View
                                                                    style={{
                                                                        borderWidth: 1,
                                                                        borderColor,
                                                                        borderRadius: 8,
                                                                        marginTop: 4,
                                                                        overflow: "hidden",
                                                                    }}
                                                                >
                                                                    {filteredPoints.map((p: any) => (
                                                                        <TouchableOpacity
                                                                            key={getPointId(p)}
                                                                            onPress={() => {
                                                                                onSelectCollectionPoint?.(p);
                                                                                setPointSearch("");
                                                                                setShowPointList(false);
                                                                            }}
                                                                            style={{
                                                                                padding: 12,
                                                                                borderBottomWidth: 1,
                                                                                borderBottomColor: borderColor,
                                                                                backgroundColor: theme.panel,
                                                                                ...webPointer,
                                                                            }}
                                                                        >
                                                                            <Text style={{ fontFamily: theme.font.semibold, fontSize: 13, color: theme.text }}>
                                                                                {getPointName(p)}
                                                                            </Text>
                                                                            <Text style={{ fontFamily: theme.font.regular, fontSize: 11, color: theme.textDark, marginTop: 2 }}>
                                                                                {getPointAddress(p)}
                                                                            </Text>
                                                                        </TouchableOpacity>
                                                                    ))}
                                                                </View>
                                                            ) : (
                                                                <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark, marginTop: 8 }}>
                                                                    {pointSearch ? `No points matching "${pointSearch}"` : "No collection points available for this transporter."}
                                                                </Text>
                                                            )}
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}

                            {deliveryMethod === "COURIER" && (
                                <View style={{ marginTop: 16 }}>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: theme.textDark, marginBottom: 8 }}>
                                        2. Delivery Location
                                    </Text>

                                    {locationError && (
                                        <View style={{
                                            backgroundColor: isDarkMode ? "rgba(220,38,38,0.1)" : "#fef2f2",
                                            borderWidth: 1,
                                            borderColor: isDarkMode ? "rgba(220,38,38,0.3)" : "#fecaca",
                                            borderRadius: 8,
                                            padding: 12,
                                            marginBottom: 12,
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
                                                        Try Again
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {isLocating && (
                                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
                                            <ActivityIndicator size="small" color={theme.primary} />
                                            <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark }}>
                                                Fetching your current location…
                                            </Text>
                                        </View>
                                    )}

                                    {shippingError && (
                                        <View style={{
                                            backgroundColor: isDarkMode ? "rgba(220,38,38,0.1)" : "#fef2f2",
                                            borderWidth: 1,
                                            borderColor: isDarkMode ? "rgba(220,38,38,0.3)" : "#fecaca",
                                            borderRadius: 8,
                                            padding: 12,
                                            marginBottom: 12,
                                        }}>
                                            <Text style={{ fontFamily: theme.font.medium, fontSize: 12, color: isDarkMode ? "#fca5a5" : "#991b1b", lineHeight: 16 }}>
                                                {shippingError}
                                            </Text>
                                        </View>
                                    )}

                                    {hasPin ? (
                                        <View style={{
                                            backgroundColor: isDarkMode ? "rgba(22,163,74,0.1)" : "#f0fdf4",
                                            borderWidth: 1,
                                            borderColor: isDarkMode ? "rgba(22,163,74,0.3)" : "#bbf7d0",
                                            borderRadius: 8,
                                            padding: 16,
                                            gap: 10,
                                        }}>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                <CheckCircle2 size={18} color={isDarkMode ? "#4ade80" : "#16a34a"} />
                                                <Text style={{ fontFamily: theme.font.bold, fontSize: 14, color: isDarkMode ? "#4ade80" : "#15803d" }}>
                                                    Location Detected
                                                </Text>
                                            </View>

                                            <View style={{ gap: 4, marginLeft: 26 }}>
                                                <Text style={{ fontFamily: theme.font.medium, fontSize: 13, color: theme.text }}>
                                                    {customerAddress?.latitude?.toFixed(5) ?? "—"}, {customerAddress?.longitude?.toFixed(5) ?? "—"}
                                                </Text>

                                                <View style={{ height: 1, backgroundColor: isDarkMode ? "rgba(22,163,74,0.2)" : "#dcfce7", marginVertical: 6 }} />

                                                <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark }}>
                                                    Shipping from: <Text style={{ fontFamily: theme.font.semibold, color: theme.text }}>{retailerName || "Retailer"}</Text>
                                                    {retailerLocation ? ` (${retailerLocation})` : ""}
                                                </Text>
                                            </View>
                                        </View>
                                    ) : (
                                        !isLocating && !locationError && (
                                            <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark }}>
                                                Waiting for location detection...
                                            </Text>
                                        )
                                    )}
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