// Retailer campaign detail + opt-in — invoice-style layout.
//
// Reads use the retailer-scoped hook (useRetailerCampaignDetail), which
// fires GetMyCampaignDetails — gated by audience membership, not
// ownership. The response carries campaign + retailer-safe items
// (including discount terms and per-retailer recommendation) + the
// caller's own audience row.
//
// Writes go through the shared mutation hook: OptInCampaign /
// OptOutCampaign are role-neutral dispatcher actions.
//
// Layout mirrors a receipt: header → line items → subtotal → total.
// The quantity input blanks on focus and pushes live updates to the
// parent on every keystroke, so totals recompute immediately.

import type { UUID } from "@/campaigns/types";
import { useAlert } from "@/components/common/AlertProvider";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/context/AuthContext";
import { useCampaignMutations } from "@/hooks/useCampaigns";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import RetailerCampaignItemEditModal from "./RetailerCampaignItemEditModal";
import type { RetailerCampaignItem } from "./types";
import { useRetailerCampaignDetail } from "./useRetailerCampaigns";

interface Props {
    visible: boolean;
    campaignId?: UUID;
    onClose: () => void;
    onChanged?: () => void;
}

function flattenErrors(errors: Record<string, string | string[]>): string {
    return Object.entries(errors)
        .map(([k, v]) => {
            const msg = Array.isArray(v) ? v.join(", ") : String(v);
            return k === "detail" ? msg : `${k}: ${msg}`;
        })
        .join("\n");
}

function seedQuantity(item: RetailerCampaignItem): number {
    const rec = item.recommendation;
    if (
        rec &&
        rec.confidence !== "none" &&
        Number.isFinite(rec.recommended_quantity) &&
        rec.recommended_quantity >= 0
    ) {
        return rec.recommended_quantity;
    }
    return Math.max(0, item.suggested_quantity || 0);
}

/**
 * Compute the per-unit price the retailer actually pays.
 *
 * Priority:
 *   1. price_discount.offer_price when present and > 0
 *   2. published_unit_price
 */
function effectiveUnitPrice(item: RetailerCampaignItem): number {
    const offer = parseFloat(item.price_discount?.offer_price ?? "");
    if (Number.isFinite(offer) && offer > 0) return offer;
    const pub = parseFloat(item.published_unit_price ?? "");
    return Number.isFinite(pub) ? pub : 0;
}

/**
 * Compute the list price (pre-discount) for the strike-through.
 * Falls back to the effective price when no discount is present.
 */
function listUnitPrice(item: RetailerCampaignItem): number {
    const normal = parseFloat(item.price_discount?.normal_price ?? "");
    if (Number.isFinite(normal) && normal > 0) return normal;
    return effectiveUnitPrice(item);
}

function currency(n: number): string {
    return `KSh ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default function RetailerCampaignDetailsModal({
    visible,
    campaignId,
    onClose,
    onChanged,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const alert = useAlert();

    const { detail, isLoading, error, refresh } = useRetailerCampaignDetail(
        visible ? campaignId : undefined
    );

    const campaign = detail?.campaign ?? null;
    const items: RetailerCampaignItem[] = detail?.items ?? [];
    const myAudience = detail?.my_audience;
    const alreadyOptedIn = !!myAudience?.has_opted_in;

    const mut = useCampaignMutations();

    const [quantities, setQuantities] = useState<Record<UUID, number>>({});
    const [submitting, setSubmitting] = useState(false);
    const [editingItem, setEditingItem] =
        useState<RetailerCampaignItem | null>(null);

    const seededForRef = useRef<string | null>(null);

    useEffect(() => {
        if (!detail || alreadyOptedIn) return;
        const thisCampaignId = detail.campaign.id;
        if (seededForRef.current === thisCampaignId) return;
        seededForRef.current = thisCampaignId;
        const entries = detail.items.map(
            (it) => [it.id, seedQuantity(it)] as const
        );
        setQuantities(Object.fromEntries(entries));
    }, [detail, alreadyOptedIn]);

    useEffect(() => {
        if (!visible) {
            seededForRef.current = null;
            setQuantities({});
        }
    }, [visible]);

    // ── Invoice totals ────────────────────────────────────────────
    const invoice = useMemo(() => {
        let subtotal = 0;    // sum of list price × qty
        let total = 0;       // sum of effective price × qty
        let units = 0;

        for (const it of items) {
            const qty = quantities[it.id] ?? 0;
            if (qty <= 0) continue;
            const list = listUnitPrice(it);
            const eff = effectiveUnitPrice(it);
            subtotal += list * qty;
            total += eff * qty;
            units += qty;
        }

        return {
            subtotal,
            total,
            savings: Math.max(0, subtotal - total),
            units,
        };
    }, [items, quantities]);

    const setQuantity = (itemId: UUID, q: number) =>
        setQuantities((prev) => ({ ...prev, [itemId]: q }));

    const handleOptIn = async () => {
        if (!campaign) return;
        const lines = Object.entries(quantities)
            .map(([id, q]) => ({ item_id: id, quantity: q }))
            .filter((l) => l.quantity > 0);

        if (!lines.length) {
            alert("Nothing selected", "Set a quantity on at least one item.");
            return;
        }

        setSubmitting(true);
        try {
            const r = await mut.optIn({
                campaign_id: campaign.id,
                items: lines,
            });
            const env = r?.data ?? {};

            if (env.response_code !== 0) {
                alert(
                    env.response_message ?? "Opt-in failed",
                    flattenErrors(env.errors ?? {}) || undefined
                );
                return;
            }

            alert(
                "Success",
                env.response_message ?? "Your indent has been created.",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            onChanged?.();
                            refresh();
                            onClose();
                        },
                    },
                ]
            );
        } catch (e: any) {
            alert("Could not opt in", e?.message ?? "Unknown error");
        } finally {
            setSubmitting(false);
        }
    };

    const isPublished = campaign?.status === "PUBLISHED";
    const surfaceMuted = isDarkMode ? "#0f172a" : "#f8fafc";

    return (
        <>
            <Modal
                visible={visible}
                onClose={onClose}
                title={campaign?.title ?? "Offer"}
                maxHeightRatio={0.94}
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
                            contentContainerStyle={{ paddingBottom: 8 }}
                            showsVerticalScrollIndicator
                        >
                            {/* ── Invoice header ──────────────────── */}
                            <View
                                style={{
                                    paddingHorizontal: 24,
                                    paddingTop: 20,
                                    paddingBottom: 16,
                                    borderBottomColor: theme.border,
                                    borderBottomWidth: 1,
                                    gap: 12,
                                }}
                            >
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <View style={{ gap: 4 }}>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 11,
                                                fontWeight: "600",
                                                letterSpacing: 0.8,
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Offer window
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontSize: 15,
                                                fontWeight: "600",
                                            }}
                                        >
                                            {campaign.start} → {campaign.end}
                                        </Text>
                                    </View>
                                    <Badge
                                        tone={
                                            alreadyOptedIn
                                                ? "success"
                                                : "neutral"
                                        }
                                    >
                                        {alreadyOptedIn
                                            ? "ACCEPTED"
                                            : campaign.status}
                                    </Badge>
                                </View>

                                {campaign.description ? (
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontSize: 13,
                                            lineHeight: 19,
                                        }}
                                    >
                                        {campaign.description}
                                    </Text>
                                ) : null}
                            </View>

                            {/* ── Already opted in banner ─────────── */}
                            {alreadyOptedIn ? (
                                <View
                                    style={{
                                        marginHorizontal: 24,
                                        marginTop: 16,
                                        backgroundColor: surfaceMuted,
                                        borderColor: theme.border,
                                        borderWidth: 1,
                                        borderRadius: 10,
                                        padding: 14,
                                        gap: 4,
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontSize: 14,
                                            fontWeight: "600",
                                        }}
                                    >
                                        You've opted in
                                        {myAudience?.retailer_indent_number
                                            ? ` — indent ${myAudience.retailer_indent_number}`
                                            : ""}
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontSize: 12,
                                        }}
                                    >
                                        Your wholesaler will confirm the
                                        indent shortly.
                                    </Text>
                                </View>
                            ) : null}

                            {/* ── Line items ──────────────────────── */}
                            <View
                                style={{
                                    paddingHorizontal: 24,
                                    paddingTop: 20,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 11,
                                        fontWeight: "600",
                                        letterSpacing: 0.8,
                                        textTransform: "uppercase",
                                        marginBottom: 8,
                                    }}
                                >
                                    Line items ({items.length})
                                </Text>

                                {items.length === 0 ? (
                                    <View
                                        style={{
                                            paddingVertical: 24,
                                            alignItems: "center",
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 13,
                                            }}
                                        >
                                            No items on this offer.
                                        </Text>
                                    </View>
                                ) : (
                                    items.map((it, idx) => (
                                        <InvoiceLine
                                            key={it.id}
                                            item={it}
                                            quantity={
                                                quantities[it.id] ?? 0
                                            }
                                            onChange={(v) =>
                                                setQuantity(it.id, v)
                                            }
                                            onOpenEditor={() =>
                                                setEditingItem(it)
                                            }
                                            disabled={alreadyOptedIn}
                                            isLast={idx === items.length - 1}
                                        />
                                    ))
                                )}
                            </View>
                        </ScrollView>

                        {/* ── Invoice footer — totals + action ─── */}
                        <View
                            style={{
                                borderTopColor: theme.border,
                                borderTopWidth: 2,
                                backgroundColor: surfaceMuted,
                            }}
                        >
                            <View
                                style={{
                                    paddingHorizontal: 24,
                                    paddingVertical: 16,
                                    gap: 8,
                                }}
                            >
                                {invoice.savings > 0 ? (
                                    <>
                                        <TotalRow
                                            label={`Subtotal (${invoice.units} units)`}
                                            value={currency(invoice.subtotal)}
                                            muted
                                        />
                                        <TotalRow
                                            label="Campaign savings"
                                            value={`− ${currency(
                                                invoice.savings
                                            )}`}
                                            accent="#059669"
                                        />
                                    </>
                                ) : null}
                                <View
                                    style={{
                                        height: 1,
                                        backgroundColor: theme.border,
                                        marginVertical: 4,
                                    }}
                                />
                                <TotalRow
                                    label={`Total (${invoice.units} units)`}
                                    value={currency(invoice.total)}
                                    emphasised
                                />
                            </View>

                            <View
                                style={{
                                    paddingHorizontal: 24,
                                    paddingBottom: 20,
                                }}
                            >
                                {alreadyOptedIn ? (
                                    <Button
                                        variant="ghost"
                                        onPress={onClose}
                                    >
                                        Close
                                    </Button>
                                ) : (
                                    <Button
                                        onPress={handleOptIn}
                                        disabled={
                                            !isPublished ||
                                            invoice.units === 0 ||
                                            submitting
                                        }
                                        loading={submitting}
                                        size="lg"
                                    >
                                        {invoice.units === 0
                                            ? "Select quantities"
                                            : `Opt in — ${currency(
                                                invoice.total
                                            )}`}
                                    </Button>
                                )}
                            </View>
                        </View>
                    </>
                )}
            </Modal>

            <RetailerCampaignItemEditModal
                visible={editingItem !== null}
                item={editingItem}
                quantity={
                    editingItem ? quantities[editingItem.id] ?? 0 : 0
                }
                onSave={(qty) => {
                    if (editingItem) setQuantity(editingItem.id, qty);
                }}
                onClose={() => setEditingItem(null)}
            />
        </>
    );
}

/* ============================ local atoms ============================ */

function TotalRow({
    label,
    value,
    muted,
    accent,
    emphasised,
}: {
    label: string;
    value: string;
    muted?: boolean;
    accent?: string;
    emphasised?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
            }}
        >
            <Text
                style={{
                    color: muted ? theme.textDark : theme.text,
                    fontSize: emphasised ? 15 : 13,
                    fontWeight: emphasised ? "700" : "500",
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: accent ?? theme.text,
                    fontSize: emphasised ? 20 : 13,
                    fontWeight: emphasised ? "800" : "600",
                    letterSpacing: emphasised ? -0.3 : 0,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function InvoiceLine({
    item,
    quantity,
    onChange,
    onOpenEditor,
    disabled,
    isLast,
}: {
    item: RetailerCampaignItem;
    quantity: number;
    onChange: (v: number) => void;
    onOpenEditor: () => void;
    disabled?: boolean;
    isLast?: boolean;
}) {
    const { theme } = useAuth();

    const max = item.per_retailer_limit ?? undefined;
    const clamp = (v: number) => {
        const lower = Math.max(0, v);
        return max != null ? Math.min(max, lower) : lower;
    };

    const rec = item.recommendation;
    const showReason =
        rec && rec.confidence !== "none" && rec.reason?.trim().length > 0;

    const pd = item.price_discount;
    const qd = item.quantity_discount;

    const list = listUnitPrice(item);
    const eff = effectiveUnitPrice(item);
    const hasPriceDiscount = !!pd && list > eff;
    const savingsPct = list > 0 ? ((list - eff) / list) * 100 : 0;

    const lineTotal = eff * quantity;

    // ── Editable input state ──────────────────────────────────────
    // `localValue` mirrors the numeric value while NOT focused.
    // While focused, the input is blank and the user types fresh;
    // each valid keystroke is pushed up immediately so the invoice
    // totals recompute live.
    const [localValue, setLocalValue] = useState(String(quantity));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setLocalValue(String(quantity));
        }
    }, [quantity, focused]);

    const handleChangeText = (text: string) => {
        setLocalValue(text);
        const parsed = parseInt(text, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            const next = clamp(parsed);
            if (next !== quantity) onChange(next);
        }
    };

    const handleFocus = () => {
        setFocused(true);
        setLocalValue("");
    };

    const handleBlur = () => {
        setFocused(false);
        const parsed = parseInt(localValue, 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
            setLocalValue(String(quantity));
            return;
        }
        const next = clamp(parsed);
        setLocalValue(String(next));
        if (next !== quantity) onChange(next);
    };

    return (
        <View
            style={{
                paddingVertical: 14,
                borderBottomColor: theme.border,
                borderBottomWidth: isLast ? 0 : 1,
                opacity: disabled ? 0.7 : 1,
                gap: 10,
            }}
        >
            {/* ── Row 1: product + line total ─────────────────────── */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                }}
            >
                <Pressable
                    onPress={onOpenEditor}
                    disabled={disabled}
                    style={{ flex: 1, minWidth: 0 }}
                >
                    <Text
                        style={{
                            color: theme.text,
                            fontSize: 15,
                            fontWeight: "600",
                            lineHeight: 20,
                        }}
                        numberOfLines={2}
                    >
                        {item.product_title ?? "—"}
                    </Text>
                    {item.batch ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 11,
                                marginTop: 2,
                            }}
                        >
                            Batch {item.batch}
                        </Text>
                    ) : null}
                </Pressable>

                <View
                    style={{
                        alignItems: "flex-end",
                        minWidth: 100,
                    }}
                >
                    <Text
                        style={{
                            color: theme.text,
                            fontSize: 15,
                            fontWeight: "700",
                        }}
                    >
                        {currency(lineTotal)}
                    </Text>
                    <Text
                        style={{
                            color: theme.textDark,
                            fontSize: 11,
                            marginTop: 2,
                        }}
                    >
                        {quantity} × {currency(eff)}
                    </Text>
                </View>
            </View>

            {/* ── Row 2: discount chips ───────────────────────────── */}
            {hasPriceDiscount || qd ? (
                <View
                    style={{
                        flexDirection: "row",
                        gap: 6,
                        flexWrap: "wrap",
                        paddingLeft: 2,
                    }}
                >
                    {hasPriceDiscount ? (
                        <View
                            style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: "#ea580c",
                            }}
                        >
                            <Text
                                style={{
                                    color: "#ffffff",
                                    fontSize: 11,
                                    fontWeight: "800",
                                    letterSpacing: 0.3,
                                }}
                            >
                                −{savingsPct.toFixed(0)}% OFF
                            </Text>
                        </View>
                    ) : null}
                    {qd && qd.buy_quantity > 0 && qd.free_quantity > 0 ? (
                        <View
                            style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: "#059669",
                            }}
                        >
                            <Text
                                style={{
                                    color: "#ffffff",
                                    fontSize: 11,
                                    fontWeight: "800",
                                    letterSpacing: 0.3,
                                }}
                            >
                                BUY {qd.buy_quantity} GET {qd.free_quantity}{" "}
                                FREE
                            </Text>
                        </View>
                    ) : null}
                    {hasPriceDiscount ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 12,
                                alignSelf: "center",
                                textDecorationLine: "line-through",
                            }}
                        >
                            {currency(list)}
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* ── Row 3: quantity stepper ─────────────────────────── */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 10,
                        borderColor: theme.border,
                        borderWidth: 1,
                        backgroundColor: theme.surface,
                        overflow: "hidden",
                    }}
                >
                    <Pressable
                        onPress={() => onChange(clamp(quantity - 1))}
                        disabled={disabled}
                        style={{
                            width: 38,
                            height: 38,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Text style={{ color: theme.text, fontSize: 18 }}>
                            −
                        </Text>
                    </Pressable>

                    <TextInput
                        value={localValue}
                        onChangeText={handleChangeText}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onSubmitEditing={handleBlur}
                        editable={!disabled}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        placeholder="0"
                        placeholderTextColor={theme.textDark}
                        maxLength={6}
                        style={{
                            width: 60,
                            height: 38,
                            textAlign: "center",
                            color: theme.text,
                            fontSize: 15,
                            fontWeight: "700",
                            padding: 0,
                            borderLeftWidth: 1,
                            borderRightWidth: 1,
                            borderColor: theme.border,
                            ...(Platform.OS === "web"
                                ? ({ outlineStyle: "none" } as any)
                                : null),
                        }}
                    />

                    <Pressable
                        onPress={() => onChange(clamp(quantity + 1))}
                        disabled={disabled}
                        style={{
                            width: 38,
                            height: 38,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Text style={{ color: theme.text, fontSize: 18 }}>
                            +
                        </Text>
                    </Pressable>
                </View>

                {max != null ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontSize: 11,
                        }}
                    >
                        limit {max}/retailer
                    </Text>
                ) : null}

                {showReason ? (
                    <Pressable
                        onPress={onOpenEditor}
                        disabled={disabled}
                        style={{ marginLeft: "auto" }}
                    >
                        <Text
                            style={{
                                color: theme.primary ?? "#2563eb",
                                fontSize: 11,
                                fontWeight: "600",
                            }}
                        >
                            Why this number?
                        </Text>
                    </Pressable>
                ) : null}
            </View>

            {/* ── Row 4: recommendation reason ────────────────────── */}
            {showReason ? (
                <Text
                    numberOfLines={2}
                    style={{
                        color: theme.textDark,
                        fontSize: 11,
                        fontStyle: "italic",
                        lineHeight: 15,
                        paddingLeft: 2,
                    }}
                >
                    {rec!.reason}
                </Text>
            ) : null}
        </View>
    );
}