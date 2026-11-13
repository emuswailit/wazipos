// components/common/DeliveryLogisticsSelector.tsx

import { EmployeePicker } from '@/components/common/EmployeePicker';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, Search, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};
const webNoOutline = isWeb ? ({ outlineStyle: 'none' } as any) : {};

interface DeliveryLogisticsProps {
    deliveryMethod: string;
    isRetailerDelivery: boolean;
    onToggleRetailerDelivery: (val: boolean) => void;

    couriers: any[];
    couriersLoading: boolean;
    selectedCourierId: string | null;
    onSelectCourier: (id: string | null) => void;

    collectionPoints: any[];
    collectionPointsLoading: boolean;
    selectedCollectionPoint: any | null;
    onSelectCollectionPoint: (point: any | null) => void;

    // 🟢 Employee Props
    deliveryEmployees?: any[];
    deliveryEmployeesLoading?: boolean;
    selectedDeliveryEmployeeId?: string | null;
    onSelectDeliveryEmployee?: (id: string | null) => void;
}

const getCourierName = (c: any) => c?.entity_title || c?.name || c?.title || "Unknown Transporter";
const getCourierId = (c: any) => c?.id || c?.uuid || c?.key || "";
const getPointName = (p: any) => p?.name || p?.title || "Unknown Point";
const getPointAddress = (p: any) => p?.address || p?.location || "";
const getPointId = (p: any) => p?.id || p?.uuid || p?.key || "";

export function DeliveryLogisticsSelector({
    deliveryMethod,
    isRetailerDelivery,
    onToggleRetailerDelivery,
    couriers,
    couriersLoading,
    selectedCourierId,
    onSelectCourier,
    collectionPoints,
    collectionPointsLoading,
    selectedCollectionPoint,
    onSelectCollectionPoint,
    deliveryEmployees = [],
    deliveryEmployeesLoading = false,
    selectedDeliveryEmployeeId,
    onSelectDeliveryEmployee,
}: DeliveryLogisticsProps) {
    const { theme, isDarkMode } = useAuth();

    const [courierSearch, setCourierSearch] = useState("");
    const [showCourierList, setShowCourierList] = useState(false);
    const [pointSearch, setPointSearch] = useState("");
    const [showPointList, setShowPointList] = useState(false);

    const borderColor = isDarkMode ? "#1e293b" : "#e8edf2";
    const subtleBg = isDarkMode ? "#0f172a" : "#f1f5f9";

    const isCourierBased = deliveryMethod === "DELIVERY" || deliveryMethod === "COURIER";

    if (!isCourierBased) return null;

    const filteredCouriers = couriers.filter((c: any) =>
        getCourierName(c).toLowerCase().includes(courierSearch.toLowerCase())
    );
    const selectedCourierName = couriers.length > 0
        ? getCourierName(couriers.find((c: any) => getCourierId(c) === selectedCourierId))
        : undefined;

    const filteredPoints = collectionPoints.filter(
        (p: any) =>
            getPointName(p).toLowerCase().includes(pointSearch.toLowerCase()) ||
            getPointAddress(p).toLowerCase().includes(pointSearch.toLowerCase())
    );

    return (
        <View className="flex-col w-full mt-4 space-y-4">
            {/* RETAILER FREE DELIVERY TOGGLE */}
            <Pressable
                onPress={() => onToggleRetailerDelivery(!isRetailerDelivery)}
                className="flex-row items-center p-3.5 rounded-xl border"
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

            {/* 🟢 EMPLOYEE PICKER */}
            {isRetailerDelivery ? (
                <View className="mt-2" style={{ zIndex: 1000 }}>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: theme.textDark, marginBottom: 8 }}>
                        Assign Store Delivery Staff
                    </Text>
                    <EmployeePicker
                        employees={deliveryEmployees}
                        isLoading={deliveryEmployeesLoading}
                        selectedId={selectedDeliveryEmployeeId || null}
                        onSelect={(id) => onSelectDeliveryEmployee?.(id)}
                    />
                </View>
            ) : (
                /* LOGISTICS UI (Hidden if Retailer is delivering) */
                <View>
                    {/* STEP 1: Transporter */}
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
                                    onSelectCourier(null);
                                    onSelectCollectionPoint(null);
                                }}
                                style={webPointer}
                            >
                                <X size={16} color={theme.primary} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={{ zIndex: 1000 }}>
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
                                    placeholder={deliveryMethod === "DELIVERY" ? "Search transporters…" : "Search riders…"}
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
                                        <ActivityIndicator size="small" color={theme.primary} style={{ alignSelf: "flex-start", marginTop: 8 }} />
                                    ) : filteredCouriers.length > 0 ? (
                                        <View style={{ borderWidth: 1, borderColor, borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                                            {filteredCouriers.map((c: any) => (
                                                <TouchableOpacity
                                                    key={getCourierId(c)}
                                                    onPress={() => {
                                                        onSelectCourier(getCourierId(c));
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
                        </View>
                    )}

                    {/* STEP 2: Drop-off Point (Only for DELIVERY) */}
                    {deliveryMethod === "DELIVERY" && selectedCourierId && (
                        <View style={{ marginTop: 16, zIndex: 900 }}>
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
                                    <TouchableOpacity onPress={() => onSelectCollectionPoint(null)} style={webPointer}>
                                        <X size={16} color={theme.primary} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View>
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
                                                <ActivityIndicator size="small" color={theme.primary} style={{ alignSelf: "flex-start", marginTop: 8 }} />
                                            ) : filteredPoints.length > 0 ? (
                                                <View style={{ borderWidth: 1, borderColor, borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                                                    {filteredPoints.map((p: any) => (
                                                        <TouchableOpacity
                                                            key={getPointId(p)}
                                                            onPress={() => {
                                                                onSelectCollectionPoint(p);
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
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}