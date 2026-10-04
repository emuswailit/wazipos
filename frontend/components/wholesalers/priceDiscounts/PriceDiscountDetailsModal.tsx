// Renders a single price discount. Fetches via usePriceDiscountDetails,
// which posts { action: "WholesalerPriceDiscountDetails", id } to
// /wholesalers/receipts through the dispatcher.

import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/context/AuthContext";
import { usePriceDiscountDetails } from "@/hooks/useDiscounts";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    Text,
    View,
} from "react-native";
import { discountStatus, effectivePrices, type PriceDiscount } from "./types";

interface Props {
    visible: boolean;
    discountId?: string;
    onClose: () => void;
    onEdit?: (d: PriceDiscount) => void;
}

export default function PriceDiscountDetailsModal({
    visible,
    discountId,
    onClose,
    onEdit,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    const { data, isLoading, error } = usePriceDiscountDetails(
        visible ? discountId : undefined
    );

    const status = data ? discountStatus(data) : null;
    const prices = data ? effectivePrices(data) : null;
    const banner = data?.price_discount_banners?.[0];

    return (
        <Modal
            visible={visible}
            onClose={onClose}
            title={data?.title ?? "Price discount"}
            maxHeightRatio={0.9}
        >
            {isLoading || !data || !status || !prices ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 80,
                    }}
                >
                    {error ? (
                        <Text style={{ color: theme.textDark, fontSize: 14 }}>
                            {error}
                        </Text>
                    ) : (
                        <ActivityIndicator />
                    )}
                </View>
            ) : (
                <>
                    <ScrollView
                        contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingTop: 16,
                            paddingBottom: 24,
                            gap: 16,
                        }}
                        showsVerticalScrollIndicator={false}
                    >
                        {banner ? (
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
                                    source={{
                                        uri:
                                            banner.thumbnail ??
                                            banner.price_discount_banner,
                                    }}
                                    style={{ width: "100%", height: "100%" }}
                                    resizeMode="cover"
                                />
                            </View>
                        ) : null}

                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}
                        >
                            <View style={{ flexDirection: "row", gap: 16 }}>
                                <Meta label="Starts" value={data.start} />
                                <Meta label="Ends" value={data.end} />
                            </View>
                            <Badge tone={status.tone}>{status.label}</Badge>
                        </View>

                        <Section title="Offer">
                            <Row
                                label="Normal price"
                                value={`KSh ${prices.normal}`}
                            />
                            <Row
                                label="Offer price"
                                value={`KSh ${prices.offer}`}
                            />
                            <Row
                                label="Percent off"
                                value={`${Number(data.percent).toFixed(2)}%`}
                            />
                            <Row
                                label="Per unit saving"
                                value={`KSh ${(
                                    Number(prices.normal) - Number(prices.offer)
                                ).toFixed(2)}`}
                            />
                        </Section>

                        <Section title="Receipt">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontSize: 14,
                                    fontWeight: "500",
                                }}
                            >
                                {data.product_title ??
                                    data.wholesaler_receipt_title ??
                                    `Receipt #${data.wholesaler_receipt}`}
                            </Text>
                        </Section>
                    </ScrollView>

                    <View
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderTopColor: theme.border,
                            borderTopWidth: 1,
                            gap: 8,
                        }}
                    >
                        <Button onPress={() => onEdit?.(data)} size="lg">
                            Edit discount
                        </Button>
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
            <View
                style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
            >
                {children}
            </View>
        </View>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
            }}
        >
            <Text style={{ color: theme.textDark, fontSize: 13 }}>{label}</Text>
            <Text
                style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}
            >
                {value}
            </Text>
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