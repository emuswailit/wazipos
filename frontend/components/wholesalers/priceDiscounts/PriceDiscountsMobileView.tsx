// Card list for narrow screens. Pull-to-refresh, chips for filters,
// same prop contract as the web view.

import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Screen } from "@/components/common/Screen";
import { useAuth } from "@/context/AuthContext";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    View,
} from "react-native";
import {
    discountStatus,
    effectivePrices,
    fmtDate,
    type PriceDiscount,
    type PriceDiscountFilter,
} from "./types";

interface Props {
    discounts: PriceDiscount[];
    isLoading: boolean;
    error: string | null;
    filter: PriceDiscountFilter;
    onFilterChange: (f: PriceDiscountFilter) => void;
    onOpenDetails: (id: string) => void;
    onCreate: () => void;
    onEdit: (d: PriceDiscount) => void;
    onRefresh: () => void;
    refreshing: boolean;
}

const FILTERS: PriceDiscountFilter[] = ["ALL", "ACTIVE", "EXPIRED"];

const FILTER_LABEL: Record<PriceDiscountFilter, string> = {
    ALL: "All",
    ACTIVE: "Active",
    SCHEDULED: "Scheduled",
    EXPIRED: "Expired",
};

export default function PriceDiscountsMobileView({
    discounts,
    isLoading,
    error,
    filter,
    onFilterChange,
    onOpenDetails,
    onCreate,
    onEdit,
    onRefresh,
    refreshing,
}: Props) {
    const { theme } = useAuth();

    return (
        <Screen padded={false}>
            {/* ---------- Header + filters ---------- */}
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 8,
                    paddingBottom: 12,
                    gap: 16,
                }}
            >
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <Text
                            style={{
                                color: theme.text,
                                fontSize: 24,
                                fontWeight: "700",
                            }}
                        >
                            Price discounts
                        </Text>
                        <Text style={{ color: theme.textDark, fontSize: 13 }}>
                            Percentage reductions on receipts
                        </Text>
                    </View>
                    <Button onPress={onCreate} fullWidth={false}>
                        New
                    </Button>
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
                                    borderColor: active
                                        ? theme.primary
                                        : theme.border,
                                    backgroundColor: active
                                        ? theme.primary
                                        : theme.surface,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 12,
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
            </View>

            {/* ---------- Body ---------- */}
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
                    data={discounts}
                    keyExtractor={(d) => String(d.id)}
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: 32,
                        gap: 12,
                    }}
                    renderItem={({ item }) => (
                        <Card
                            discount={item}
                            onOpen={() => onOpenDetails(item.id)}
                            onEdit={() => onEdit(item)}
                        />
                    )}
                    ListEmptyComponent={
                        error ? (
                            <EmptyState
                                title="Couldn't load discounts"
                                description={error}
                                action={
                                    <Button onPress={onRefresh}>
                                        Try again
                                    </Button>
                                }
                            />
                        ) : (
                            <EmptyState
                                title="No price discounts"
                                description="Create a discount to offer a reduced unit price."
                                action={
                                    <Button onPress={onCreate}>
                                        New discount
                                    </Button>
                                }
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

/* ============================ local atoms ============================ */

function Card({
    discount,
    onOpen,
    onEdit,
}: {
    discount: PriceDiscount;
    onOpen: () => void;
    onEdit: () => void;
}) {
    const { theme } = useAuth();
    const { label, tone } = discountStatus(discount);
    const { normal, offer } = effectivePrices(discount);

    return (
        <Pressable
            onPress={onOpen}
            style={{
                borderRadius: 16,
                borderColor: theme.border,
                borderWidth: 1,
                backgroundColor: theme.surface,
                padding: 16,
                gap: 12,
            }}
        >
            {/* Title row */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                }}
            >
                <View style={{ flex: 1, gap: 4 }}>
                    <Text
                        style={{
                            color: theme.text,
                            fontSize: 16,
                            fontWeight: "600",
                        }}
                        numberOfLines={2}
                    >
                        {discount.title}
                    </Text>
                    <Text
                        style={{ color: theme.textDark, fontSize: 13 }}
                        numberOfLines={1}
                    >
                        {discount.product_title ??
                            discount.wholesaler_receipt_title ??
                            "—"}
                    </Text>
                </View>
                <Badge tone={tone}>{label}</Badge>
            </View>

            {/* Price strip */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                    paddingTop: 8,
                    borderTopColor: theme.border,
                    borderTopWidth: 1,
                }}
            >
                <Meta label="Offer" value={`KSh ${offer}`} />
                <Meta label="Was" value={`KSh ${normal}`} />
                <Meta
                    label="Off"
                    value={`${Number(discount.percent).toFixed(0)}%`}
                />
            </View>

            {/* Window + edit */}
            <View
                style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
            >
                <Meta
                    label="Window"
                    value={`${fmtDate(discount.start)} – ${fmtDate(discount.end)}`}
                />
                <View style={{ flex: 1 }} />
                <Pressable
                    onPress={onEdit}
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
                        Edit
                    </Text>
                </Pressable>
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
            <Text
                style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}
            >
                {value}
            </Text>
        </View>
    );
}