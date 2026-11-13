import { useAuth } from "@/context/AuthContext";
import { RetailShop } from "@/hooks/useRetailersByLocation";
import { Building2, MapPin, Package, Star } from "lucide-react-native";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

const isWeb = Platform.OS === "web";
const webPointer = isWeb ? ({ cursor: "pointer" } as any) : {};

const ACCENTS = [
    "#fef3c7",
    "#dbeafe",
    "#fce7f3",
    "#e2e8f0",
    "#dcfce7",
    "#fef9c3",
];

/* ── Thumbnail with graceful fallback ───────────────────────── */

const Thumbnail: React.FC<{
    uri?: string;
    size: number;
    accent: string;
}> = ({ uri, size, accent }) => {
    const [errored, setErrored] = useState(false);

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: accent,
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
                <Building2 size={size * 0.4} color="rgba(15,23,42,0.35)" />
            )}
        </View>
    );
};

/* ── Location label ─────────────────────────────────────────── */

function formatLocation(shop: RetailShop): string | null {
    const parts = [shop.town, shop.subCountyTitle, shop.countyTitle].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

/* ── Props ──────────────────────────────────────────────────── */

interface RetailerListPanelProps {
    shops: RetailShop[];
    selectedId: string | null;
    onSelect: (shop: RetailShop) => void;
    /** True while the API call is in flight. */
    loading?: boolean;
    /** True before any location has been picked, so the empty state can prompt for one. */
    idle?: boolean;
}

/* ── Component ──────────────────────────────────────────────── */

export default function RetailerListPanel({
    shops,
    selectedId,
    onSelect,
    loading = false,
    idle = false,
}: RetailerListPanelProps) {
    const { theme, isDarkMode } = useAuth();

    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const rowDivider = isDarkMode ? "#1e293b" : "#f1f5f9";

    /* Body — three states, in priority order:
         1. Loading with no rows  → spinner
         2. Loaded with no rows   → empty message
         3. Loaded with rows      → scrollable list */
    let body: React.ReactNode;

    if (loading && shops.length === 0) {
        body = (
            <View
                style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                }}
            >
                <ActivityIndicator size="large" color={theme.primary} />
                <Text
                    style={{
                        marginTop: 12,
                        fontFamily: theme.font.regular,
                        fontSize: theme.fontSize.sm,
                        color: theme.textDark,
                    }}
                >
                    Loading retailers…
                </Text>
            </View>
        );
    } else if (shops.length === 0) {
        body = (
            <View
                style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                }}
            >
                <Package size={28} color={theme.textDark} />
                <Text
                    style={{
                        marginTop: 10,
                        textAlign: "center",
                        fontFamily: theme.font.regular,
                        fontSize: theme.fontSize.sm,
                        color: theme.textDark,
                    }}
                >
                    {idle
                        ? "Pick a county or location to see retailers."
                        : "No retailers match your filters."}
                </Text>
            </View>
        );
    } else {
        body = (
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 12 }}
                showsVerticalScrollIndicator
            >
                {shops.map((item, index) => {
                    const accent = ACCENTS[index % ACCENTS.length];
                    const isSelected = selectedId === item.id;
                    const location = formatLocation(item);

                    return (
                        <Pressable
                            key={item.id}
                            onPress={() => onSelect(item)}
                            accessibilityRole="button"
                            accessibilityLabel={item.name}
                            focusable
                            style={({ pressed, hovered }: any) => ({
                                flexDirection: "row",
                                alignItems: "center",
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: rowDivider,
                                borderLeftWidth: isSelected ? 3 : 0,
                                borderLeftColor: isSelected
                                    ? theme.primary
                                    : "transparent",
                                backgroundColor: isSelected
                                    ? isDarkMode
                                        ? "rgba(59,130,246,0.1)"
                                        : "rgba(0,86,179,0.06)"
                                    : isWeb && hovered
                                        ? isDarkMode
                                            ? "rgba(59,130,246,0.06)"
                                            : "rgba(0,86,179,0.04)"
                                        : "transparent",
                                opacity: pressed ? 0.9 : 1,
                                ...webPointer,
                                ...(isWeb
                                    ? ({ transitionDuration: "120ms" } as any)
                                    : null),
                            })}
                        >
                            <View style={{ marginRight: 10 }}>
                                <Thumbnail
                                    uri={item.image}
                                    size={44}
                                    accent={accent}
                                />
                            </View>

                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        fontFamily: theme.font.medium,
                                        fontSize: 12,
                                        color: theme.text,
                                        lineHeight: 16,
                                    }}
                                >
                                    {item.name}
                                </Text>

                                <Text
                                    numberOfLines={1}
                                    style={{
                                        marginTop: 2,
                                        fontFamily: theme.font.regular,
                                        fontSize: 11,
                                        color: theme.textDark,
                                    }}
                                >
                                    {item.primaryCategory}
                                    {item.categories.length > 1
                                        ? ` +${item.categories.length - 1}`
                                        : ""}
                                </Text>

                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        marginTop: 4,
                                    }}
                                >
                                    {location && (
                                        <>
                                            <MapPin
                                                size={11}
                                                color={theme.textDark}
                                            />
                                            <Text
                                                numberOfLines={1}
                                                style={{
                                                    marginLeft: 3,
                                                    fontFamily:
                                                        theme.font.regular,
                                                    fontSize: 11,
                                                    color: theme.textDark,
                                                    flexShrink: 1,
                                                }}
                                            >
                                                {location}
                                            </Text>
                                        </>
                                    )}

                                    {item.rating > 0 && (
                                        <>
                                            {location && (
                                                <View
                                                    style={{
                                                        width: 3,
                                                        height: 3,
                                                        borderRadius: 2,
                                                        backgroundColor:
                                                            theme.textDark,
                                                        marginHorizontal: 6,
                                                        opacity: 0.6,
                                                    }}
                                                />
                                            )}
                                            <Star
                                                size={10}
                                                color="#f59e0b"
                                                fill="#f59e0b"
                                            />
                                            <Text
                                                style={{
                                                    marginLeft: 3,
                                                    fontFamily:
                                                        theme.font.medium,
                                                    fontSize: 11,
                                                    color: theme.text,
                                                }}
                                            >
                                                {item.rating.toFixed(1)}
                                            </Text>
                                        </>
                                    )}

                                    {item.isPharmacy && (
                                        <>
                                            {(location || item.rating > 0) && (
                                                <View
                                                    style={{
                                                        width: 3,
                                                        height: 3,
                                                        borderRadius: 2,
                                                        backgroundColor:
                                                            theme.textDark,
                                                        marginHorizontal: 6,
                                                        opacity: 0.6,
                                                    }}
                                                />
                                            )}
                                            <Text
                                                style={{
                                                    fontFamily: theme.font.bold,
                                                    fontSize: 9,
                                                    letterSpacing: 0.4,
                                                    textTransform: "uppercase",
                                                    color: "#16a34a",
                                                }}
                                            >
                                                Pharmacy
                                            </Text>
                                        </>
                                    )}
                                </View>
                            </View>
                        </Pressable>
                    );
                })}
            </ScrollView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.panel }}>
            {/* Header */}
            <View
                style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            marginRight: 10,
                            backgroundColor: theme.primary,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {loading && shops.length === 0 ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Building2 size={16} color="#fff" />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                color: theme.text,
                            }}
                        >
                            Retailers
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={{
                                marginTop: 1,
                                fontFamily: theme.font.regular,
                                fontSize: 11,
                                color: theme.textDark,
                            }}
                        >
                            {loading && shops.length === 0
                                ? "Fetching…"
                                : `${shops.length} ${shops.length === 1 ? "shop" : "shops"
                                } listed`}
                        </Text>
                    </View>
                </View>
            </View>

            {body}
        </View>
    );
}