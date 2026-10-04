import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Screen } from "@/components/common/Screen";
import { useAuth } from "@/context/AuthContext";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import {
    bonusLabel,
    bonusPercent,
    discountStatus,
    fmtDate,
    type QuantityDiscount,
    type QuantityDiscountFilter,
} from "./types";

interface Props {
    discounts: QuantityDiscount[];
    isLoading: boolean;
    error: string | null;
    filter: QuantityDiscountFilter;
    onFilterChange: (f: QuantityDiscountFilter) => void;
    onOpenDetails: (id: string) => void;
    onCreate: () => void;
    onEdit: (d: QuantityDiscount) => void;
    onRefresh: () => void;
    refreshing: boolean;
}

const FILTERS: QuantityDiscountFilter[] = [
    "ALL",
    "ACTIVE",
    "SCHEDULED",
    "EXPIRED",
];

const FILTER_LABEL: Record<QuantityDiscountFilter, string> = {
    ALL: "All",
    ACTIVE: "Active",
    SCHEDULED: "Scheduled",
    EXPIRED: "Expired",
};

export default function QuantityDiscountsWebView({
    discounts,
    isLoading,
    error,
    filter,
    onFilterChange,
    onOpenDetails,
    onCreate,
    onEdit,
    onRefresh,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const surfaceMuted = isDarkMode ? "#1e293b" : "#f1f5f9";

    return (
        <Screen>
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
                        Quantity discounts
                    </Text>
                    <Text style={{ color: theme.textDark, fontSize: 14 }}>
                        Buy-N-get-M offers on individual receipts
                    </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
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
                                        paddingHorizontal: 16,
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
                                        {FILTER_LABEL[f]}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Button onPress={onCreate} fullWidth={false}>
                        New discount
                    </Button>
                </View>
            </View>

            {isLoading ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <ActivityIndicator />
                </View>
            ) : discounts.length === 0 ? (
                <EmptyState
                    title={
                        error
                            ? "Couldn't load discounts"
                            : "No quantity discounts"
                    }
                    description={
                        error ??
                        "Create a discount to reward bulk purchases with free units."
                    }
                    action={
                        error ? (
                            <Button onPress={onRefresh} fullWidth={false}>
                                Retry
                            </Button>
                        ) : (
                            <Button onPress={onCreate} fullWidth={false}>
                                New discount
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
                        <Header label="Title" flex={3} />
                        <Header label="Receipt" flex={3} />
                        <Header label="Window" flex={2} />
                        <Header label="Offer" flex={2} />
                        <Header label="Status" flex={1.2} />
                        <Header label="Actions" flex={1.6} align="right" />
                    </View>

                    <FlatList
                        data={discounts}
                        keyExtractor={(d) => String(d.id)}
                        renderItem={({ item }) => (
                            <Row
                                discount={item}
                                onOpen={() => onOpenDetails(item.id)}
                                onEdit={() => onEdit(item)}
                            />
                        )}
                    />
                </View>
            )}
        </Screen>
    );
}

/* ============================ local atoms ============================ */

function Header({
    label,
    flex,
    align,
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
                textAlign: align ?? "left",
            }}
        >
            {label}
        </Text>
    );
}

function Row({
    discount,
    onOpen,
    onEdit,
}: {
    discount: QuantityDiscount;
    onOpen: () => void;
    onEdit: () => void;
}) {
    const { theme } = useAuth();
    const { label, tone } = discountStatus(discount);
    const pct = bonusPercent(
        discount.limit_quantity,
        discount.awarded_quantity
    );

    return (
        <Pressable
            onPress={onOpen}
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderBottomColor: theme.border,
                borderBottomWidth: 1,
            }}
        >
            <View style={{ flex: 3, paddingRight: 12 }}>
                <Text
                    style={{
                        color: theme.text,
                        fontSize: 14,
                        fontWeight: "600",
                    }}
                    numberOfLines={1}
                >
                    {discount.title}
                </Text>
                <Text
                    style={{ color: theme.textDark, fontSize: 12 }}
                    numberOfLines={1}
                >
                    +{discount.awarded_quantity} free · {pct.toFixed(0)}%
                </Text>
            </View>

            <Text
                style={{ flex: 3, color: theme.textDark, fontSize: 13 }}
                numberOfLines={1}
            >
                {discount.product_title ??
                    discount.wholesaler_receipt_title ??
                    "—"}
            </Text>

            <Text style={{ flex: 2, color: theme.textDark, fontSize: 13 }}>
                {fmtDate(discount.start)} – {fmtDate(discount.end)}
            </Text>

            <Text
                style={{
                    flex: 2,
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: "500",
                }}
                numberOfLines={1}
            >
                {bonusLabel(discount)}
            </Text>

            <View style={{ flex: 1.2 }}>
                <Badge tone={tone}>{label}</Badge>
            </View>

            <View
                style={{
                    flex: 1.6,
                    flexDirection: "row",
                    gap: 6,
                    justifyContent: "flex-end",
                }}
            >
                <SmallButton label="View" onPress={onOpen} primary />
                <SmallButton label="Edit" onPress={onEdit} />
            </View>
        </Pressable>
    );
}

function SmallButton({
    label,
    onPress,
    primary,
}: {
    label: string;
    onPress: () => void;
    primary?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <Pressable
            onPress={onPress}
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
                    color: primary ? theme.primary : theme.text,
                    fontSize: 12,
                    fontWeight: "600",
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}