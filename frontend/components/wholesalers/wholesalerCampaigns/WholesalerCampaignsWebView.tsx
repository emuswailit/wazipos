import type { Campaign, CampaignStatus } from "@/campaigns/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Screen } from "@/components/common/Screen";
import { useAuth } from "@/context/AuthContext";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    Text,
    View,
} from "react-native";

type Filter = "ALL" | CampaignStatus;

interface Props {
    campaigns: Campaign[];
    isLoading: boolean;
    error: string | null;
    filter: Filter;
    onFilterChange: (f: Filter) => void;
    onOpenDetails: (id: string) => void;
    onOpenBuilder: (id: string) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
}

const FILTERS: Filter[] = ["ALL", "DRAFT", "PUBLISHED", "CLOSED"];

/**
 * Pick the best image URL to render as the row thumbnail.
 *
 * The campaign's banner list is `campaign_banners: CampaignBanner[]`.
 * Each entry has a full-size `campaign_banner` URL and a 300x300
 * `thumbnail`. Rows render the thumbnail (cheap) and fall back to the
 * full image for older rows uploaded before thumbnails were generated.
 *
 * Returns `null` when the campaign has no banners.
 */
function rowImageUri(campaign: Campaign): string | null {
    const first = campaign.campaign_banners?.[0];
    if (!first) return null;
    return first.thumbnail ?? first.campaign_banner ?? null;
}

export default function WholesalerCampaignsWebView({
    campaigns,
    isLoading,
    error,
    filter,
    onFilterChange,
    onOpenDetails,
    onOpenBuilder,
    onOpenCreate,
    onRefresh,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    return (
        <Screen>
            {/* Header — title + segmented filter + primary action */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 24,
                }}
            >
                <View>
                    <Text style={{ color: theme.text, fontSize: 28, fontWeight: "700" }}>
                        Campaigns
                    </Text>
                    <Text style={{ color: theme.textDark, fontSize: 14 }}>
                        Curate offers for your retailers
                    </Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View
                        style={{
                            flexDirection: "row",
                            gap: 4,
                            borderRadius: 12,
                            borderColor: theme.border,
                            borderWidth: 1,
                            backgroundColor: theme.surface,
                            padding: 4,
                        }}
                    >
                        {FILTERS.map((f) => {
                            const active = filter === f;
                            return (
                                <Pressable
                                    key={f}
                                    onPress={() => onFilterChange(f)}
                                    style={{
                                        paddingHorizontal: 12,
                                        height: 36,
                                        borderRadius: 8,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: active
                                            ? theme.primary
                                            : "transparent",
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontSize: 13,
                                            fontWeight: "600",
                                            color: active
                                                ? "#ffffff"
                                                : theme.textDark,
                                        }}
                                    >
                                        {f === "ALL"
                                            ? "All"
                                            : f.charAt(0) + f.slice(1).toLowerCase()}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Button onPress={onOpenCreate} fullWidth={false} size="md">
                        New campaign
                    </Button>
                </View>
            </View>

            {/* Body */}
            {isLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator />
                </View>
            ) : campaigns.length === 0 ? (
                <EmptyState
                    title={error ? "Couldn't load campaigns" : "No campaigns yet"}
                    description={
                        error ??
                        "Create your first campaign to share offers with retailers."
                    }
                    action={
                        error ? (
                            <Button onPress={onRefresh} fullWidth={false}>
                                Retry
                            </Button>
                        ) : (
                            <Button onPress={onOpenCreate} fullWidth={false}>
                                Create campaign
                            </Button>
                        )
                    }
                />
            ) : (
                <View
                    style={{
                        borderRadius: 16,
                        borderColor: theme.border,
                        borderWidth: 1,
                        backgroundColor: theme.surface,
                        overflow: "hidden",
                    }}
                >
                    {/* Table header */}
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
                        <Text
                            style={{
                                flex: 4,
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                            }}
                        >
                            Title
                        </Text>
                        <Text
                            style={{
                                flex: 2,
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                            }}
                        >
                            Window
                        </Text>
                        <Text
                            style={{
                                flex: 1,
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                            }}
                        >
                            Items
                        </Text>
                        <Text
                            style={{
                                flex: 1,
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                            }}
                        >
                            Retailers
                        </Text>
                        <Text
                            style={{
                                flex: 1.2,
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                            }}
                        >
                            Status
                        </Text>
                        <Text
                            style={{
                                flex: 2,
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                                textAlign: "right",
                            }}
                        >
                            Actions
                        </Text>
                    </View>

                    {/* Rows */}
                    <FlatList
                        data={campaigns}
                        keyExtractor={(c) => String(c.id)}
                        renderItem={({ item }) => (
                            <CampaignTableRow
                                campaign={item}
                                onPress={() => onOpenDetails(item.id)}
                                onEdit={
                                    item.status === "DRAFT"
                                        ? () => onOpenBuilder(item.id)
                                        : undefined
                                }
                            />
                        )}
                    />
                </View>
            )}
        </Screen>
    );
}

/* ============================ local atoms ============================ */

function statusTone(
    s: Campaign["status"]
): "success" | "warning" | "danger" | "neutral" {
    return s === "PUBLISHED"
        ? "success"
        : s === "CLOSED"
            ? "warning"
            : s === "CANCELLED"
                ? "danger"
                : "neutral";
}

function CampaignTableRow({
    campaign,
    onPress,
    onEdit,
}: {
    campaign: Campaign;
    onPress?: () => void;
    onEdit?: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const thumbBg = isDarkMode ? "#1e293b" : "#e2e8f0";

    // Thumbnail of the first banner, or the full-size image if the
    // thumbnail is missing. `null` when the campaign has no banners —
    // the initials fallback below covers that case.
    const thumbUri = rowImageUri(campaign);

    return (
        <Pressable
            onPress={onPress}
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderBottomColor: theme.border,
                borderBottomWidth: 1,
            }}
        >
            {/* Title cell — thumbnail + text */}
            <View
                style={{
                    flex: 4,
                    paddingRight: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
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
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                        />
                    ) : (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 11,
                                fontWeight: "600",
                                textAlign: "center",
                                paddingHorizontal: 4,
                            }}
                            numberOfLines={2}
                        >
                            {String(campaign.title ?? "—")
                                .slice(0, 2)
                                .toUpperCase()}
                        </Text>
                    )}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        style={{
                            color: theme.text,
                            fontSize: 14,
                            fontWeight: "600",
                        }}
                        numberOfLines={1}
                    >
                        {campaign.title}
                    </Text>
                    {campaign.description ? (
                        <Text
                            style={{ color: theme.textDark, fontSize: 12 }}
                            numberOfLines={1}
                        >
                            {campaign.description}
                        </Text>
                    ) : null}
                </View>
            </View>

            <Text style={{ flex: 2, color: theme.textDark, fontSize: 13 }}>
                {campaign.start} – {campaign.end}
            </Text>

            <Text style={{ flex: 1, color: theme.textDark, fontSize: 13 }}>
                {(campaign as any).item_count ?? "—"}
            </Text>

            <Text style={{ flex: 1, color: theme.textDark, fontSize: 13 }}>
                {(campaign as any).audience_count ?? "—"}
            </Text>

            <View style={{ flex: 1.2 }}>
                <Badge tone={statusTone(campaign.status)}>
                    {campaign.status}
                </Badge>
            </View>

            {/* Actions — Edit (draft only) + Open */}
            <View
                style={{
                    flex: 2,
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 6,
                }}
            >
                {onEdit ? (
                    <Pressable
                        onPress={(e) => {
                            (e as any)?.stopPropagation?.();
                            onEdit();
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
                                color: theme.text,
                                fontSize: 12,
                                fontWeight: "600",
                            }}
                        >
                            Build
                        </Text>
                    </Pressable>
                ) : null}

                <Pressable
                    onPress={(e) => {
                        (e as any)?.stopPropagation?.();
                        onPress?.();
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
                        Open
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}