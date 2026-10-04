// Retailer campaign inbox — web variant.
//
// Responsive within web:
//   >= 900px  →  table with a compact row per campaign
//   < 900px   →  card list
//
// The parent container (RetailerCampaignsList) only mounts this on
// Platform.OS === "web". Native renders RetailerCampaignsMobileView.

import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Screen } from "@/components/common/Screen";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import type { Campaign, UUID } from "./types";

interface Props {
    campaigns: Campaign[];
    isLoading: boolean;
    error: string | null;
    onOpen: (id: UUID) => void;
    onRefresh: () => void;
    refreshing: boolean;
}

const TABLE_BREAKPOINT = 900;

function heroImageUri(campaign: Campaign): string | null {
    const first = campaign.campaign_banners?.[0];
    if (!first) return null;
    return first.thumbnail ?? first.campaign_banner ?? null;
}

function windowLabel(c: Campaign): string {
    const start = c.start ? new Date(c.start) : null;
    const end = c.end ? new Date(c.end) : null;
    if (!start || !end) return "—";
    const fmt = (d: Date) =>
        d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
}

export default function RetailerCampaignsWebView(props: Props) {
    const { width } = useWindowDimensions();
    const { theme } = useAuth();

    const useTable = width >= TABLE_BREAKPOINT;

    return (
        <Screen>
            {/* Header — shared between layouts */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 24,
                }}
            >
                <View>
                    <Text
                        style={{
                            color: theme.text,
                            fontSize: 28,
                            fontWeight: "700",
                        }}
                    >
                        Campaigns
                    </Text>
                    <Text style={{ color: theme.textDark, fontSize: 14 }}>
                        Offers from your wholesalers
                    </Text>
                </View>
            </View>

            {/* Body */}
            {props.isLoading && !props.refreshing ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <ActivityIndicator />
                </View>
            ) : props.campaigns.length === 0 ? (
                <EmptyState
                    title={
                        props.error
                            ? "Couldn't load campaigns"
                            : "No campaigns yet"
                    }
                    description={
                        props.error ??
                        "When your wholesalers publish offers, they'll appear here."
                    }
                    action={
                        props.error ? (
                            <Button onPress={props.onRefresh} fullWidth={false}>
                                Retry
                            </Button>
                        ) : undefined
                    }
                />
            ) : useTable ? (
                <CampaignTable {...props} />
            ) : (
                <CampaignCardGrid {...props} />
            )}
        </Screen>
    );
}

/* =========================================================
 * Table — large screens
 * ======================================================= */

function CampaignTable({
    campaigns,
    onOpen,
    onRefresh,
    refreshing,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";
    const surfaceHover = isDarkMode ? "#1e293b" : "#f8fafc";
    const thumbBg = isDarkMode ? "#1e293b" : "#e2e8f0";

    const [hoveredId, setHoveredId] = useState<string | null>(null);

    return (
        <View
            style={{
                borderRadius: 16,
                borderColor: theme.border,
                borderWidth: 1,
                backgroundColor: theme.surface,
                overflow: "hidden",
            }}
        >
            {/* Header row */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderBottomColor: theme.border,
                    borderBottomWidth: 1,
                    backgroundColor: surfaceMuted,
                }}
            >
                <HeaderCell label="Campaign" flex={4} />
                <HeaderCell label="Wholesaler" flex={2} />
                <HeaderCell label="Window" flex={2} />
                <HeaderCell label="Status" flex={1.2} />
                <HeaderCell label="Actions" flex={1.8} align="right" />
            </View>

            {/* Body rows */}
            <FlatList
                data={campaigns}
                keyExtractor={(c) => String(c.id)}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                }
                renderItem={({ item }) => {
                    const isHovered = hoveredId === String(item.id);
                    const thumbUri = heroImageUri(item);

                    return (
                        <Pressable
                            onPress={() => onOpen(item.id)}
                            onHoverIn={() => setHoveredId(String(item.id))}
                            onHoverOut={() => setHoveredId(null)}
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingHorizontal: 20,
                                paddingVertical: 14,
                                borderBottomColor: theme.border,
                                borderBottomWidth: 1,
                                backgroundColor: isHovered
                                    ? surfaceHover
                                    : "transparent",
                            }}
                        >
                            {/* Campaign cell */}
                            <View
                                style={{
                                    flex: 4,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 12,
                                    paddingRight: 12,
                                }}
                            >
                                <View
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 10,
                                        overflow: "hidden",
                                        backgroundColor: thumbBg,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                    }}
                                >
                                    {thumbUri ? (
                                        <Image
                                            source={{ uri: thumbUri }}
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                            }}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <Text
                                            numberOfLines={2}
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 11,
                                                fontWeight: "600",
                                                textAlign: "center",
                                                paddingHorizontal: 4,
                                            }}
                                        >
                                            {String(item.title ?? "—")
                                                .slice(0, 2)
                                                .toUpperCase()}
                                        </Text>
                                    )}
                                </View>

                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            color: theme.text,
                                            fontSize: 14,
                                            fontWeight: "600",
                                        }}
                                    >
                                        {item.title}
                                    </Text>
                                    {item.description ? (
                                        <Text
                                            numberOfLines={1}
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 12,
                                                marginTop: 2,
                                            }}
                                        >
                                            {item.description}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>

                            {/* Wholesaler cell */}
                            <Text
                                numberOfLines={1}
                                style={{
                                    flex: 2,
                                    color: theme.textDark,
                                    fontSize: 13,
                                    paddingRight: 12,
                                }}
                            >
                                {item.entity_title ?? "—"}
                            </Text>

                            {/* Window cell */}
                            <Text
                                style={{
                                    flex: 2,
                                    color: theme.textDark,
                                    fontSize: 13,
                                    paddingRight: 12,
                                }}
                            >
                                {windowLabel(item)}
                            </Text>

                            {/* Status cell */}
                            <View style={{ flex: 1.2 }}>
                                <Badge tone="success">OPEN</Badge>
                            </View>

                            {/* Actions cell */}
                            <View
                                style={{
                                    flex: 1.8,
                                    flexDirection: "row",
                                    justifyContent: "flex-end",
                                    gap: 6,
                                }}
                            >
                                <Pressable
                                    onPress={(e) => {
                                        (e as any)?.stopPropagation?.();
                                        onOpen(item.id);
                                    }}
                                    style={{
                                        paddingHorizontal: 12,
                                        height: 32,
                                        borderRadius: 8,
                                        borderColor: theme.border,
                                        borderWidth: 1,
                                        backgroundColor: theme.surface,
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontSize: 12,
                                            fontWeight: "600",
                                        }}
                                    >
                                        View offer
                                    </Text>
                                </Pressable>
                            </View>
                        </Pressable>
                    );
                }}
            />
        </View>
    );
}

function HeaderCell({
    label,
    flex,
    align = "left",
}: {
    label: string;
    flex: number;
    align?: "left" | "right";
}) {
    const { theme } = useAuth();
    return (
        <Text
            style={{
                flex,
                color: theme.textDark,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                textAlign: align,
            }}
        >
            {label}
        </Text>
    );
}

/* =========================================================
 * Card grid — narrow screens (mobile web)
 * ======================================================= */

function CampaignCardGrid({
    campaigns,
    onOpen,
    onRefresh,
    refreshing,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    return (
        <FlatList
            data={campaigns}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{
                paddingBottom: 40,
                gap: 12,
            }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                />
            }
            renderItem={({ item }) => {
                const uri = heroImageUri(item);
                return (
                    <Pressable
                        onPress={() => onOpen(item.id)}
                        style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: theme.border,
                            backgroundColor: theme.surface,
                            overflow: "hidden",
                        }}
                    >
                        {uri ? (
                            <View
                                style={{
                                    width: "100%",
                                    aspectRatio: 16 / 9,
                                    backgroundColor: surfaceMuted,
                                }}
                            >
                                <Image
                                    source={{ uri }}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                    }}
                                    resizeMode="cover"
                                />
                            </View>
                        ) : null}

                        <View style={{ padding: 16, gap: 10 }}>
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "flex-start",
                                    justifyContent: "space-between",
                                    gap: 12,
                                }}
                            >
                                <Text
                                    numberOfLines={2}
                                    style={{
                                        flex: 1,
                                        color: theme.text,
                                        fontSize: 16,
                                        fontWeight: "600",
                                        lineHeight: 20,
                                    }}
                                >
                                    {item.title}
                                </Text>
                                <Badge tone="success">OPEN</Badge>
                            </View>

                            {item.description ? (
                                <Text
                                    numberOfLines={2}
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 13,
                                        lineHeight: 20,
                                    }}
                                >
                                    {item.description}
                                </Text>
                            ) : null}

                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 16,
                                    paddingTop: 8,
                                    borderTopWidth: 1,
                                    borderTopColor: theme.border,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 12,
                                    }}
                                >
                                    {windowLabel(item)}
                                </Text>
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontSize: 13,
                                        fontWeight: "600",
                                        marginLeft: "auto",
                                    }}
                                >
                                    View offer →
                                </Text>
                            </View>
                        </View>
                    </Pressable>
                );
            }}
        />
    );
}