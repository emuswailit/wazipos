// Read-only view of a single campaign. Three actions chain out:
//
//   "Publish campaign"        → dispatcher action PublishCampaign (draft only)
//   "Edit details"            → meta form (WholesalerCampaignEditModal)
//   "Products & retailers"    → builder (WholesalerCampaignBuilderModal)
//
// The builder button is shown only for DRAFT campaigns — once a
// campaign is published, items and audience are frozen by the backend
// and the builder would 400.
//
// Items and retailers render in full; the outer ScrollView handles
// overflow. The footer stays pinned below the scroll region.

import type { Campaign, UUID } from "@/campaigns/types";
import { useAlert } from "@/components/common/AlertProvider";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/context/AuthContext";
import {
    useCampaignDetails,
    useCampaignMutations,
} from "@/hooks/useCampaigns";
import { useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    Text,
    View,
} from "react-native";

interface Props {
    visible: boolean;
    campaignId?: UUID;
    onClose: () => void;
    onChanged?: () => void;
    onEditMeta?: (c: Campaign) => void;
    onEditBuilder?: (c: Campaign) => void;
}

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

function fmtDate(iso?: string | null) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return iso;
    }
}

function flattenErrors(errors: Record<string, unknown>): string {
    return Object.entries(errors)
        .map(([k, v]) => {
            const msg = Array.isArray(v) ? v.join(", ") : String(v);
            return k === "detail" ? msg : `${k}: ${msg}`;
        })
        .join("\n");
}

/**
 * Resolve the best image URL to show as the hero.
 *
 * Campaign banners are stored as a list now — take the first entry
 * and prefer its thumbnail, falling back to the full image for older
 * rows that predate thumbnail generation.
 */
function heroImageUri(campaign: Campaign): string | null {
    const first = campaign.campaign_banners?.[0];
    if (!first) return null;
    return first.thumbnail ?? first.campaign_banner ?? null;
}

export default function WholesalerCampaignDetailsModal({
    visible,
    campaignId,
    onClose,
    onEditMeta,
    onEditBuilder,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const alert = useAlert();
    const mut = useCampaignMutations();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    const { campaign, items, audience, isLoading, error, refresh } =
        useCampaignDetails(visible ? campaignId : undefined);

    const [publishing, setPublishing] = useState(false);

    const isDraft = campaign?.status === "DRAFT";
    const canEditMeta =
        campaign?.status === "DRAFT" || campaign?.status === "PUBLISHED";

    // Publish gating. Backend enforces both conditions; this mirror
    // prevents a round-trip for the common case of an empty draft.
    const hasItems = items.length > 0;
    const hasAudience = audience.length > 0;
    const canPublish = isDraft && hasItems && hasAudience && !publishing;

    const heroUri = campaign ? heroImageUri(campaign) : null;

    const doPublish = async () => {
        if (!campaign) return;
        setPublishing(true);
        try {
            const res = await mut.publishCampaign(campaign.id);
            const env = (res?.data ?? {}) as any;

            if (env?.response_code !== 0) {
                alert(
                    "Could not publish",
                    env?.response_message ??
                    flattenErrors(env?.errors ?? {}) ??
                    "Server rejected the request.",
                    undefined,
                    "danger"
                );
                return;
            }

            alert(
                "Published",
                "The campaign is now live. Retailers in the audience can see it and opt in.",
                [
                    {
                        text: "OK",
                        onPress: () => refresh(),
                    },
                ],
                "success"
            );
        } catch (e: any) {
            alert(
                "Could not publish",
                e?.message ?? "Unknown error",
                undefined,
                "danger"
            );
        } finally {
            setPublishing(false);
        }
    };

    const handlePublishPress = () => {
        if (!campaign || !canPublish) return;
        const count = audience.length;
        alert(
            "Publish campaign?",
            `"${campaign.title}" will become visible to ${count} retailer${count === 1 ? "" : "s"
            }. They can then opt in. You can close it later, but you cannot return it to draft.`,
            [
                { text: "Cancel" },
                { text: "Publish", onPress: doPublish },
            ],
            "default"
        );
    };

    return (
        <Modal
            visible={visible}
            onClose={onClose}
            title={campaign?.title ?? "Campaign"}
            maxHeightRatio={0.92}
        >
            {isLoading || !campaign ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 80,
                    }}
                >
                    {error ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 14,
                                paddingHorizontal: 24,
                                textAlign: "center",
                            }}
                        >
                            {error}
                        </Text>
                    ) : (
                        <ActivityIndicator />
                    )}
                </View>
            ) : (
                <>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingTop: 16,
                            paddingBottom: 24,
                            gap: 16,
                        }}
                        showsVerticalScrollIndicator
                    >
                        {/* Banner hero — first banner from the M2M */}
                        {heroUri ? (
                            <View
                                style={{
                                    width: "100%",
                                    aspectRatio: 16 / 9,
                                    borderRadius: 12,
                                    overflow: "hidden",
                                    backgroundColor: surfaceMuted,
                                }}
                            >
                                <Image
                                    source={{ uri: heroUri }}
                                    style={{ width: "100%", height: "100%" }}
                                    resizeMode="cover"
                                />
                            </View>
                        ) : null}

                        {/* Status strip */}
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}
                        >
                            <View style={{ flexDirection: "row", gap: 16 }}>
                                <Meta
                                    label="Starts"
                                    value={fmtDate(campaign.start)}
                                />
                                <Meta
                                    label="Ends"
                                    value={fmtDate(campaign.end)}
                                />
                                {campaign.budget_cap ? (
                                    <Meta
                                        label="Budget"
                                        value={`KSh ${campaign.budget_cap}`}
                                    />
                                ) : null}
                            </View>
                            <Badge tone={statusTone(campaign.status)}>
                                {campaign.status}
                            </Badge>
                        </View>

                        {/* Description */}
                        {campaign.description ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontSize: 14,
                                    lineHeight: 20,
                                }}
                            >
                                {campaign.description}
                            </Text>
                        ) : null}

                        {/* Stats */}
                        <View
                            style={{
                                flexDirection: "row",
                                gap: 24,
                                paddingVertical: 4,
                            }}
                        >
                            <Stat
                                label="Items"
                                value={String(items.length)}
                            />
                            <Stat
                                label="Retailers"
                                value={String(audience.length)}
                            />
                        </View>

                        {/* Items — full list, outer ScrollView handles overflow */}
                        <Section title="Items">
                            {items.length === 0 ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 13,
                                    }}
                                >
                                    No items yet.
                                </Text>
                            ) : (
                                items.map((it) => {
                                    const title =
                                        (it as any)
                                            .wholesaler_receipt_title ??
                                        (it as any).product_title ??
                                        `Receipt ${String(
                                            it.wholesaler_receipt
                                        ).slice(0, 8)}`;

                                    const batch = (it as any)
                                        .wholesaler_receipt_batch as
                                        | string
                                        | null
                                        | undefined;

                                    return (
                                        <View
                                            key={String(it.id)}
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                justifyContent:
                                                    "space-between",
                                                paddingVertical: 8,
                                                gap: 12,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                }}
                                            >
                                                <Text
                                                    numberOfLines={1}
                                                    style={{
                                                        color: theme.text,
                                                        fontSize: 13,
                                                        fontWeight: "600",
                                                    }}
                                                >
                                                    {title}
                                                </Text>
                                                {batch ? (
                                                    <Text
                                                        numberOfLines={1}
                                                        style={{
                                                            color: theme.textDark,
                                                            fontSize: 11,
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        Batch {batch}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontSize: 12,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                Suggested{" "}
                                                {it.suggested_quantity}
                                            </Text>
                                        </View>
                                    );
                                })
                            )}
                        </Section>

                        {/* Audience — full list */}
                        <Section title="Retailers">
                            {audience.length === 0 ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 13,
                                    }}
                                >
                                    No retailers selected.
                                </Text>
                            ) : (
                                audience.map((a: any) => (
                                    <View
                                        key={String(a.id)}
                                        style={{ paddingVertical: 6 }}
                                    >
                                        <Text
                                            numberOfLines={1}
                                            style={{
                                                color: theme.text,
                                                fontSize: 13,
                                            }}
                                        >
                                            {a.retailer_title ??
                                                a.retailer?.title ??
                                                `Retailer ${String(
                                                    a.retailer
                                                ).slice(0, 8)}`}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </Section>
                    </ScrollView>

                    {/* Footer — chain actions */}
                    <View
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderTopColor: theme.border,
                            borderTopWidth: 1,
                            gap: 8,
                        }}
                    >
                        {isDraft ? (
                            <>
                                <Button
                                    onPress={handlePublishPress}
                                    loading={publishing}
                                    disabled={!canPublish}
                                    size="lg"
                                >
                                    Publish campaign
                                </Button>
                                {!canPublish ? (
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontSize: 11,
                                            textAlign: "center",
                                            marginTop: -2,
                                        }}
                                    >
                                        {!hasItems
                                            ? "Add at least one product first."
                                            : !hasAudience
                                                ? "Add at least one retailer first."
                                                : " "}
                                    </Text>
                                ) : null}
                            </>
                        ) : null}

                        {isDraft && onEditBuilder ? (
                            <Button
                                variant={canPublish ? "secondary" : "primary"}
                                onPress={() => onEditBuilder(campaign)}
                                size={canPublish ? "md" : "lg"}
                            >
                                Products & retailers
                            </Button>
                        ) : null}

                        {canEditMeta && onEditMeta ? (
                            <Button
                                variant="ghost"
                                onPress={() => onEditMeta(campaign)}
                                size="md"
                            >
                                Edit details
                            </Button>
                        ) : null}

                        <Button variant="ghost" onPress={onClose}>
                            Close
                        </Button>
                    </View>
                </>
            )}
        </Modal>
    );
}

/* ============================ local atoms ============================ */

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    const { theme } = useAuth();
    return (
        <View
            style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 16,
                overflow: "hidden",
            }}
        >
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomColor: theme.border,
                    borderBottomWidth: 1,
                }}
            >
                <Text
                    style={{
                        color: theme.text,
                        fontSize: 15,
                        fontWeight: "600",
                    }}
                >
                    {title}
                </Text>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                {children}
            </View>
        </View>
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
            <Text
                style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}
            >
                {value}
            </Text>
        </View>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ gap: 2 }}>
            <Text
                style={{
                    color: theme.textDark,
                    fontSize: 10,
                    fontWeight: "600",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: theme.text,
                    fontSize: 22,
                    fontWeight: "700",
                }}
            >
                {value}
            </Text>
        </View>
    );
}