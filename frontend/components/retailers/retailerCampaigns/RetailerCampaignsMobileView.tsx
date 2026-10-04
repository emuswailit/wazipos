// Retailer campaign inbox — mobile card list.
//
// Purely presentational. The parent container (RetailerCampaignsList)
// owns the data hook and the detail modal.

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
import type { Campaign, UUID } from "./types";

interface Props {
    campaigns: Campaign[];
    isLoading: boolean;
    error: string | null;
    onOpen: (id: UUID) => void;
    onRefresh: () => void;
    refreshing: boolean;
}

function heroImageUri(campaign: Campaign): string | null {
    const first = campaign.campaign_banners?.[0];
    if (!first) return null;
    return first.thumbnail ?? first.campaign_banner ?? null;
}

function windowLabel(c: Campaign): string {
    const start = c.start ? new Date(c.start) : null;
    const end = c.end ? new Date(c.end) : null;
    if (!start || !end) return "";
    const fmt = (d: Date) =>
        d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
}

export default function RetailerCampaignsMobileView({
    campaigns,
    isLoading,
    error,
    onOpen,
    onRefresh,
    refreshing,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    return (
        <Screen padded={false}>
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 8,
                    paddingBottom: 12,
                }}
            >
                <Text
                    style={{
                        color: theme.text,
                        fontSize: 24,
                        fontWeight: "700",
                    }}
                >
                    Campaigns
                </Text>
                <Text style={{ color: theme.textDark, fontSize: 13 }}>
                    Offers from your wholesalers
                </Text>
            </View>

            {isLoading && !refreshing ? (
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
                <FlatList
                    data={campaigns}
                    keyExtractor={(c) => String(c.id)}
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: 40,
                        gap: 12,
                    }}
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
                    ListEmptyComponent={
                        error ? (
                            <EmptyState
                                title="Couldn't load campaigns"
                                description={error}
                                action={
                                    <Button onPress={onRefresh}>
                                        Try again
                                    </Button>
                                }
                            />
                        ) : (
                            <EmptyState
                                title="No campaigns yet"
                                description="When your wholesalers publish offers, they'll appear here."
                            />
                        )
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                        />
                    }
                />
            )}
        </Screen>
    );
}