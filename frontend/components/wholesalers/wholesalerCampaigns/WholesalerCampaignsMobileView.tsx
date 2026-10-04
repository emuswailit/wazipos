import type { Campaign, CampaignStatus, UUID } from "@/campaigns/types";
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
    RefreshControl,
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
    onOpenDetails: (id: UUID) => void;
    onOpenBuilder: (id: UUID) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
}

const FILTERS: Filter[] = ["ALL", "DRAFT", "PUBLISHED", "CLOSED"];

/**
 * Pick the best image URL to render on the campaign card.
 *
 * The campaign's banner list is `campaign_banners: CampaignBanner[]`,
 * each entry with a full-size `campaign_banner` URL and a 300x300
 * `thumbnail`. Cards render the thumbnail when available and fall
 * back to the full image — the full image would work but is heavier
 * for a scrolling list, so we only reach for it when the thumbnail
 * is missing (older rows uploaded before thumbnails were generated).
 *
 * Returns `null` when the campaign has no banners at all.
 */
function cardImageUri(campaign: Campaign): string | null {
    const first = campaign.campaign_banners?.[0];
    if (!first) return null;
    return first.thumbnail ?? first.campaign_banner ?? null;
}

export default function WholesalerCampaignsMobileView({
    campaigns,
    isLoading,
    error,
    filter,
    onFilterChange,
    onOpenDetails,
    onOpenBuilder,
    onOpenCreate,
    onRefresh,
    refreshing,
}: Props) {
    const { theme } = useAuth();

    return (
        <Screen padded={false}>
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 8,
                    paddingBottom: 12,
                    gap: 16,
                }}
            >
                <View>
                    <Text style={{ color: theme.text, fontSize: 24, fontWeight: "700" }}>
                        Campaigns
                    </Text>
                    <Text style={{ color: theme.textDark, fontSize: 13 }}>
                        Curate offers for your retailers
                    </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                    {FILTERS.map((f) => {
                        const active = filter === f;
                        return (
                            <Pressable
                                key={f}
                                onPress={() => onFilterChange(f)}
                                style={{
                                    paddingHorizontal: 12,
                                    height: 32,
                                    borderRadius: 999,
                                    borderWidth: 1,
                                    borderColor: active ? theme.primary : theme.border,
                                    backgroundColor: active ? theme.primary : theme.surface,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 12,
                                        fontWeight: "600",
                                        color: active ? "#ffffff" : theme.textDark,
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
            </View>

            {isLoading && !refreshing ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator />
                </View>
            ) : (
                <FlatList
                    data={campaigns}
                    keyExtractor={(c) => String(c.id)}
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: 112,
                        gap: 12,
                    }}
                    renderItem={({ item }) => (
                        <CampaignCard
                            campaign={item}
                            onPress={() => onOpenDetails(item.id)}
                            onEdit={
                                item.status === "DRAFT"
                                    ? () => onOpenBuilder(item.id)
                                    : undefined
                            }
                        />
                    )}
                    ListEmptyComponent={
                        error ? (
                            <EmptyState
                                title="Couldn't load campaigns"
                                description={error}
                                action={<Button onPress={onRefresh}>Try again</Button>}
                            />
                        ) : (
                            <EmptyState
                                title="No campaigns yet"
                                description="Create your first campaign to share offers with retailers."
                                action={<Button onPress={onOpenCreate}>Create campaign</Button>}
                            />
                        )
                    }
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                />
            )}

            {campaigns.length > 0 ? (
                <View
                    style={{
                        position: "absolute",
                        left: 16,
                        right: 16,
                        bottom: 24,
                    }}
                >
                    <Button size="lg" onPress={onOpenCreate}>
                        New campaign
                    </Button>
                </View>
            ) : null}
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

function CampaignCard({
    campaign,
    onPress,
    onEdit,
}: {
    campaign: Campaign;
    onPress?: () => void;
    onEdit?: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    // Banner hero — resolves to the thumbnail of the first banner, or
    // the full-size image if the thumbnail is missing. `null` when the
    // campaign has no banners at all, in which case the hero is
    // skipped entirely.
    const bannerUri = cardImageUri(campaign);

    return (
        <Pressable
            onPress={onPress}
            style={{
                borderRadius: 16,
                borderColor: theme.border,
                borderWidth: 1,
                backgroundColor: theme.surface,
                overflow: "hidden",
            }}
        >
            {bannerUri ? (
                <View
                    style={{
                        width: "100%",
                        aspectRatio: 16 / 9,
                        backgroundColor: surfaceMuted,
                    }}
                >
                    <Image
                        source={{ uri: bannerUri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                    />
                </View>
            ) : null}

            <View style={{ padding: 16, gap: 12 }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                    }}
                >
                    <Text
                        style={{
                            flex: 1,
                            color: theme.text,
                            fontSize: 16,
                            fontWeight: "600",
                            lineHeight: 20,
                        }}
                        numberOfLines={2}
                    >
                        {campaign.title}
                    </Text>
                    <Badge tone={statusTone(campaign.status)}>
                        {campaign.status}
                    </Badge>
                </View>

                {campaign.description ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontSize: 13,
                            lineHeight: 20,
                        }}
                        numberOfLines={2}
                    >
                        {campaign.description}
                    </Text>
                ) : null}

                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        paddingTop: 8,
                        borderTopColor: theme.border,
                        borderTopWidth: 1,
                    }}
                >
                    <View style={{ flexDirection: "row", gap: 16 }}>
                        <Meta
                            label="Window"
                            value={`${campaign.start} – ${campaign.end}`}
                        />
                        {typeof (campaign as any).item_count === "number" ? (
                            <Meta
                                label="Items"
                                value={String((campaign as any).item_count)}
                            />
                        ) : null}
                        {typeof (campaign as any).audience_count === "number" ? (
                            <Meta
                                label="Retailers"
                                value={String((campaign as any).audience_count)}
                            />
                        ) : null}
                    </View>

                    {onEdit ? (
                        <Pressable
                            onPress={(e) => {
                                (e as any)?.stopPropagation?.();
                                onEdit();
                            }}
                            style={{
                                paddingHorizontal: 12,
                                height: 30,
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
                </View>
            </View>
        </Pressable>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ gap: 2 }}>
            <Text
                style={{
                    color: theme.textDark,
                    fontSize: 10,
                    fontWeight: "500",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </Text>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>
                {value}
            </Text>
        </View>
    );
}