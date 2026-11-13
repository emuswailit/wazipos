// components/common/DeliveryMethodSelector.tsx
import { useAuth } from "@/context/AuthContext";
import { Bike, Package, Truck } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export type DeliveryMethod = "PICKUP" | "DELIVERY" | "COURIER";

interface DeliveryMethodSelectorProps {
    value: DeliveryMethod;
    onChange: (m: DeliveryMethod) => void;
    label?: string;
    variant?: "segment" | "pills";
}

const OPTIONS: {
    value: DeliveryMethod;
    label: string;
    Icon: React.ComponentType<{ size: number; color: string }>;
}[] = [
        { value: "PICKUP", label: "Pickup", Icon: Package },
        { value: "DELIVERY", label: "Delivery", Icon: Truck },
        { value: "COURIER", label: "Courier", Icon: Bike },
    ];

export function DeliveryMethodSelector({
    value,
    onChange,
    label,
    variant = "segment",
}: DeliveryMethodSelectorProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? "#1e293b" : "#e8edf2";

    return (
        <View>
            {label && (
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
                    {label}
                </Text>
            )}

            <View
                style={{
                    flexDirection: "row",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                    overflow: "hidden",
                }}
            >
                {OPTIONS.map((opt, idx) => {
                    const active = value === opt.value;
                    return (
                        <TouchableOpacity
                            key={opt.value}
                            onPress={() => onChange(opt.value)}
                            activeOpacity={0.8}
                            style={{
                                flex: 1,
                                paddingVertical: 10,
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                backgroundColor: active ? theme.primary : "transparent",
                                borderLeftWidth: idx > 0 ? 1 : 0,
                                borderLeftColor: borderColor,
                            }}
                        >
                            <opt.Icon size={14} color={active ? "#fff" : theme.textDark} />
                            <Text
                                style={{
                                    fontFamily: active ? theme.font.bold : theme.font.medium,
                                    fontSize: 12,
                                    color: active ? "#fff" : theme.text,
                                }}
                            >
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}