// components/retailers/forecast/ForecastOffersModal.tsx

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import {
    RetailerForecastCampaign,
    RetailerForecastNormalized,
    RetailerForecastOffer,
} from '@/databases/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Payload
 * ======================================================= */
export interface AcceptedForecastOfferPayload {
    forecast: RetailerForecastNormalized;
    offer: RetailerForecastOffer;
    quantity: number;
}

/* =========================================================
 * Props
 * ======================================================= */
interface Props {
    forecast: RetailerForecastNormalized | null;
    onClose: () => void;
    onSelectOffer: (payload: AcceptedForecastOfferPayload) => void;
    onRemoveForecast: (forecast: RetailerForecastNormalized) => void;
    isForecastChecked: (forecast: RetailerForecastNormalized) => boolean;
}

/* =========================================================
 * Modal
 * ======================================================= */
export function ForecastOffersModal({
    forecast,
    onClose,
    onSelectOffer,
    onRemoveForecast,
    isForecastChecked,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const { currentOpenIndent } = useRetailerIndentsSync();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
    const [quantity, setQuantity] = useState<number>(0);
    const [quantityText, setQuantityText] = useState<string>('');

    /* Reset on open */
    useEffect(() => {
        if (!forecast) return;
        const first = forecast.wholesaler_offers[0];
        setSelectedOfferId(first?.receipt_id ?? null);
        setQuantity(forecast.required_quantity);
        setQuantityText(String(forecast.required_quantity));
    }, [forecast]);

    /* Which offers are already on the indent */
    const savedByReceiptId = useMemo(() => {
        const map: Record<string, string> = {};
        if (!forecast || !currentOpenIndent) return map;
        const items = currentOpenIndent.retailer_indent_items ?? [];
        const receiptIds = new Set(
            forecast.wholesaler_offers.map((o) => o.receipt_id)
        );
        for (const it of items) {
            if (it.wholesale_receipt && receiptIds.has(it.wholesale_receipt)) {
                map[it.wholesale_receipt] = it.id;
            }
        }
        return map;
    }, [forecast, currentOpenIndent]);

    const selectedOffer =
        forecast?.wholesaler_offers.find(
            (o) => o.receipt_id === selectedOfferId
        ) ?? null;

    const handleConfirm = useCallback(() => {
        if (!forecast || !selectedOffer) return;
        const qty = Math.max(0, Math.floor(quantity));
        if (qty <= 0) return;
        onSelectOffer({ forecast, offer: selectedOffer, quantity: qty });
        onClose();
    }, [forecast, selectedOffer, quantity, onSelectOffer, onClose]);

    const handleRemoveAll = useCallback(() => {
        if (!forecast) return;
        onRemoveForecast(forecast);
        onClose();
    }, [forecast, onRemoveForecast, onClose]);

    const handleQuantityTextChange = useCallback((raw: string) => {
        const digits = raw.replace(/[^0-9]/g, '');
        setQuantityText(digits);
        const n = parseInt(digits, 10);
        setQuantity(Number.isFinite(n) ? n : 0);
    }, []);

    const handleStepQuantity = useCallback((delta: number) => {
        setQuantity((prev) => {
            const next = Math.max(0, Math.floor(prev + delta));
            setQuantityText(String(next));
            return next;
        });
    }, []);

    if (!forecast) return null;

    const checked = isForecastChecked(forecast);

    return (
        <Modal visible={!!forecast} animationType="fade" transparent onRequestClose={onClose}>
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[900px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{ backgroundColor: theme.panel, borderColor }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                                numberOfLines={1}
                            >
                                {forecast.product_title}
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Forecast {forecast.total_forecast.toFixed(0)}u
                                {' '}over {forecast.days_covered} days
                                {' '}· {forecast.wholesaler_offers.length} offers
                                {' '}· {forecast.wholesaler_campaigns.length} campaigns
                            </Text>
                        </View>
                        <Pressable onPress={onClose} hitSlop={10} className="p-1.5">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView contentContainerStyle={{ padding: 16 }}>
                        {/* Summary */}
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Total forecast"
                                value={`${forecast.total_forecast.toFixed(0)} units`}
                            />
                            <SummaryCell
                                label="P10 – P90"
                                value={`${forecast.total_p10.toFixed(0)} – ${forecast.total_p90.toFixed(0)}`}
                            />
                            <SummaryCell
                                label="Avg daily"
                                value={forecast.avg_daily_forecast.toFixed(2)}
                            />
                            <SummaryCell
                                label="Suggested"
                                value={String(forecast.required_quantity)}
                            />
                        </View>

                        {/* Offers */}
                        <Text
                            className="uppercase tracking-widest mb-2"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Wholesaler offers ({forecast.wholesaler_offers.length})
                        </Text>

                        {forecast.wholesaler_offers.length === 0 ? (
                            <View className="p-6 items-center">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    No offers available for this product.
                                </Text>
                            </View>
                        ) : (
                            forecast.wholesaler_offers.map((o) => (
                                <OfferRow
                                    key={o.receipt_id}
                                    offer={o}
                                    selected={o.receipt_id === selectedOfferId}
                                    alreadySaved={!!savedByReceiptId[o.receipt_id]}
                                    onPress={() => setSelectedOfferId(o.receipt_id)}
                                />
                            ))
                        )}

                        {/* Campaigns */}
                        {forecast.wholesaler_campaigns.length > 0 ? (
                            <>
                                <Text
                                    className="uppercase tracking-widest mt-4 mb-2"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Campaigns ({forecast.wholesaler_campaigns.length})
                                </Text>
                                {forecast.wholesaler_campaigns.map((c) => (
                                    <CampaignRow key={c.campaign_id} campaign={c} />
                                ))}
                            </>
                        ) : null}

                        {/* Quantity selector */}
                        {selectedOffer ? (
                            <View className="mt-5">
                                <Text
                                    className="uppercase tracking-widest mb-2"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Quantity to add
                                </Text>

                                {selectedOffer.in_placement ? (
                                    <View
                                        className="rounded-xl px-3 py-2 mb-2"
                                        style={{ backgroundColor: 'rgba(251,191,36,0.12)' }}
                                    >
                                        <Text
                                            className="text-[11px]"
                                            style={{
                                                color: '#f59e0b',
                                                fontFamily: theme.font.medium,
                                            }}
                                        >
                                            Consignment offer — no upfront payment.
                                            You settle per unit sold at KES {selectedOffer.effective_unit_price}.
                                        </Text>
                                    </View>
                                ) : null}

                                <View
                                    className="flex-row items-center rounded-xl border"
                                    style={{ borderColor, backgroundColor: subBg }}
                                >
                                    <Pressable
                                        onPress={() => handleStepQuantity(-1)}
                                        className="px-4 py-3"
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 18,
                                            }}
                                        >
                                            −
                                        </Text>
                                    </Pressable>

                                    <TextInput
                                        value={quantityText}
                                        onChangeText={handleQuantityTextChange}
                                        keyboardType="number-pad"
                                        style={{
                                            flex: 1,
                                            textAlign: 'center',
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: theme.fontSize.lg,
                                            paddingVertical: 12,
                                        }}
                                        placeholder="0"
                                        placeholderTextColor={theme.textDark}
                                    />

                                    <Pressable
                                        onPress={() => handleStepQuantity(1)}
                                        className="px-4 py-3"
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 18,
                                            }}
                                        >
                                            +
                                        </Text>
                                    </Pressable>
                                </View>

                                <View className="flex-row justify-between mt-2">
                                    <Pressable
                                        onPress={() =>
                                            handleStepQuantity(
                                                forecast.required_quantity - quantity
                                            )
                                        }
                                    >
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: theme.primary,
                                                fontFamily: theme.font.bold,
                                                fontSize: 11,
                                            }}
                                        >
                                            Use suggested ({forecast.required_quantity})
                                        </Text>
                                    </Pressable>

                                    {selectedOffer.quantity_discount ? (
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily: theme.font.medium,
                                                fontSize: 11,
                                            }}
                                        >
                                            Buy {selectedOffer.quantity_discount.limit_quantity} get{' '}
                                            {selectedOffer.quantity_discount.awarded_quantity} free
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        ) : null}

                        {checked ? (
                            <View
                                className="rounded-xl px-3 py-2 mt-4"
                                style={{ backgroundColor: 'rgba(16,185,129,0.10)' }}
                            >
                                <Text
                                    style={{
                                        color: '#10b981',
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    This product is already on your open indent.
                                </Text>
                            </View>
                        ) : null}
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="flex-row justify-end gap-2 p-4 border-t flex-wrap"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                Close
                            </Text>
                        </Pressable>

                        {checked ? (
                            <Pressable
                                onPress={handleRemoveAll}
                                className="px-4 py-2.5 rounded-xl border"
                                style={{ borderColor: '#ef4444' }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: '#ef4444',
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Remove from indent
                                </Text>
                            </Pressable>
                        ) : null}

                        {selectedOffer && !checked ? (
                            <Pressable
                                onPress={handleConfirm}
                                disabled={quantity <= 0}
                                className="px-4 py-2.5 rounded-xl"
                                style={{
                                    backgroundColor: theme.primary,
                                    opacity: quantity <= 0 ? 0.5 : 1,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Add to indent
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Offer row — with placement badge
 * ======================================================= */
function OfferRow({
    offer,
    selected,
    alreadySaved,
    onPress,
}: {
    offer: RetailerForecastOffer;
    selected: boolean;
    alreadySaved: boolean;
    onPress: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const hasPriceDiscount = offer.price_discount_percent > 0;
    const hasQuantityDiscount = offer.quantity_discount !== null;

    return (
        <Pressable
            onPress={onPress}
            className="rounded-xl border p-3 mb-2"
            style={{
                backgroundColor: subBg,
                borderColor: selected ? theme.primary : borderColor,
                borderWidth: selected ? 1.5 : 1,
            }}
        >
            <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2 flex-1 min-w-0">
                    <View
                        className="w-4 h-4 rounded-full border-2 items-center justify-center"
                        style={{
                            borderColor: selected ? theme.primary : borderColor,
                        }}
                    >
                        {selected ? (
                            <View
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: theme.primary }}
                            />
                        ) : null}
                    </View>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            flex: 1,
                        }}
                        numberOfLines={1}
                    >
                        {offer.wholesaler_title || 'Unknown wholesaler'}
                    </Text>
                </View>

                {alreadySaved ? (
                    <View
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            On indent
                        </Text>
                    </View>
                ) : null}
            </View>

            <View className="flex-row flex-wrap gap-1.5 mt-1">
                {offer.in_placement ? (
                    <MiniBadge label="Consignment" tone="warning" />
                ) : null}
                <MiniBadge label={`${offer.current_quantity} in stock`} />
                {offer.batch ? <MiniBadge label={`Batch ${offer.batch}`} /> : null}
                {offer.days_to_expiry != null ? (
                    <MiniBadge
                        label={`${offer.days_to_expiry}d expiry`}
                        tone={offer.days_to_expiry < 60 ? 'warning' : 'default'}
                    />
                ) : null}
                {hasPriceDiscount ? (
                    <MiniBadge
                        label={`${offer.price_discount_percent.toFixed(0)}% off`}
                        tone="success"
                    />
                ) : null}
                {hasQuantityDiscount && offer.quantity_discount ? (
                    <MiniBadge
                        label={`Buy ${offer.quantity_discount.limit_quantity} get ${offer.quantity_discount.awarded_quantity}`}
                        tone="success"
                    />
                ) : null}
            </View>

            {offer.placement_note ? (
                <Text
                    className="text-[11px] mt-2"
                    style={{
                        color: '#f59e0b',
                        fontFamily: theme.font.medium,
                    }}
                >
                    {offer.placement_note}
                </Text>
            ) : null}

            <View className="flex-row items-baseline justify-between mt-2.5">
                <Text
                    className="text-[11px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        flex: 1,
                    }}
                    numberOfLines={1}
                >
                    {offer.rationale}
                </Text>
                <View className="items-end ml-2">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                    >
                        KES {formatKES(offer.effective_unit_price)}
                    </Text>
                    {hasPriceDiscount ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 10,
                                textDecorationLine: 'line-through',
                                opacity: 0.7,
                                marginTop: 1,
                            }}
                        >
                            KES {formatKES(offer.list_unit_price)}
                        </Text>
                    ) : null}
                </View>
            </View>
        </Pressable>
    );
}

/* =========================================================
 * Campaign row
 * ======================================================= */
function CampaignRow({ campaign }: { campaign: RetailerForecastCampaign }) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    return (
        <View
            className="rounded-xl border p-3 mb-2"
            style={{ backgroundColor: subBg, borderColor }}
        >
            <View className="flex-row items-center justify-between mb-1.5">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 14,
                        flex: 1,
                    }}
                    numberOfLines={1}
                >
                    {campaign.campaign_title}
                </Text>

                {campaign.opted_in ? (
                    <View
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Opted in
                        </Text>
                    </View>
                ) : (
                    <View
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            {campaign.days_remaining}d left
                        </Text>
                    </View>
                )}
            </View>

            <View className="flex-row flex-wrap gap-1.5">
                <MiniBadge label={campaign.wholesaler_title} />
                {campaign.published_bonus_quantity > 0 ? (
                    <MiniBadge
                        label={`+${campaign.published_bonus_quantity} bonus`}
                        tone="success"
                    />
                ) : null}
                <MiniBadge label={`Suggested ${campaign.suggested_quantity}`} />
            </View>

            <Text
                className="text-[11px] mt-2"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {campaign.rationale}
            </Text>
        </View>
    );
}

/* =========================================================
 * Mini badge
 * ======================================================= */
function MiniBadge({
    label,
    tone = 'default',
}: {
    label: string;
    tone?: 'default' | 'success' | 'warning';
}) {
    const { theme, isDarkMode } = useAuth();

    const bg =
        tone === 'success'
            ? 'rgba(16,185,129,0.15)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.15)'
                : isDarkMode ? '#0f172a' : '#f8fafc';

    const border =
        tone === 'success'
            ? 'rgba(16,185,129,0.3)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.3)'
                : isDarkMode ? '#334155' : '#e2e8f0';

    const color =
        tone === 'success'
            ? '#10b981'
            : tone === 'warning'
                ? '#f59e0b'
                : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{ backgroundColor: bg, borderColor: border }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{ color, fontFamily: theme.font.bold, fontSize: 10 }}
            >
                {label}
            </Text>
        </View>
    );
}

/* =========================================================
 * Summary cell
 * ======================================================= */
function SummaryCell({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ minWidth: 100 }}>
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                numberOfLines={1}
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

/* =========================================================
 * Helpers
 * ======================================================= */
function formatKES(raw: string | number | null | undefined): string {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
}