// components/retailers/forecast/ForecastOffersModal.tsx
//
// Offer picker for a forecast row: pick one wholesaler offer, set the quantity
// (pre-filled with the forecast's suggestion) and add it to the open indent.
// Campaigns for the product are listed for reference. When the product is
// already on the indent, the picker offers "Remove from indent" instead.

import { AdminBadgePill, AdminSheet, SheetButton, textOr, useListTokens, useSheetIsWide, webNoOutline, webPointer } from '@/components/common/listScreen';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type { RetailerForecastCampaign, RetailerForecastNormalized, RetailerForecastOffer } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { formatKES, units } from './forecastsConfig';

export interface AcceptedForecastOfferPayload {
    forecast: RetailerForecastNormalized;
    offer: RetailerForecastOffer;
    quantity: number;
}

interface Props {
    forecast: RetailerForecastNormalized | null;
    onClose: () => void;
    onSelectOffer: (payload: AcceptedForecastOfferPayload) => void;
    onRemoveForecast: (forecast: RetailerForecastNormalized) => void;
    isForecastChecked: (forecast: RetailerForecastNormalized) => boolean;
}

export function ForecastOffersModal({ forecast, onClose, onSelectOffer, onRemoveForecast, isForecastChecked }: Props) {
    const wide = useSheetIsWide();
    const { theme, chipBg } = useListTokens();
    const { currentOpenIndent } = useRetailerIndentsSync();

    const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
    const [quantity, setQuantity] = useState<number>(0);
    const [quantityText, setQuantityText] = useState<string>('');

    useEffect(() => {
        if (!forecast) return;
        setSelectedOfferId(forecast.wholesaler_offers[0]?.receipt_id ?? null);
        setQuantity(forecast.required_quantity);
        setQuantityText(String(forecast.required_quantity));
    }, [forecast]);

    /** Offers already on the open indent. */
    const savedByReceiptId = useMemo(() => {
        const map: Record<string, string> = {};
        if (!forecast || !currentOpenIndent) return map;
        const receiptIds = new Set(forecast.wholesaler_offers.map((o) => o.receipt_id));
        for (const it of currentOpenIndent.retailer_indent_items ?? []) {
            if (it.wholesale_receipt && receiptIds.has(it.wholesale_receipt)) map[it.wholesale_receipt] = it.remote_id ?? it.draft_id ?? '';
        }
        return map;
    }, [forecast, currentOpenIndent]);

    const selectedOffer = forecast?.wholesaler_offers.find((o) => o.receipt_id === selectedOfferId) ?? null;

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

    const setQty = useCallback((n: number) => {
        const next = Math.max(0, Math.floor(n));
        setQuantity(next);
        setQuantityText(String(next));
    }, []);

    if (!forecast) return <AdminSheet visible={false} onClose={onClose} title="">{null}</AdminSheet>;

    const checked = isForecastChecked(forecast);
    const noIndent = !currentOpenIndent;
    const indentLabel = currentOpenIndent ? currentOpenIndent.indent_number || currentOpenIndent.entity_title || 'open indent' : null;
    const lineTotal = selectedOffer ? Number(selectedOffer.effective_unit_price || 0) * quantity : 0;

    return (
        <AdminSheet
            visible={!!forecast}
            onClose={onClose}
            title={textOr(forecast.product_title, 'Offers')}
            subtitle={`${units(forecast.total_forecast)} forecast over ${forecast.days_covered} days · suggest ${units(forecast.required_quantity)}`}
            icon="pricetags-outline"
            width={720}
            footer={
                <>
                    <SheetButton label="Close" variant="ghost" onPress={onClose} grow={!wide} />
                    {checked ? <SheetButton label="Remove from indent" variant="danger" icon="trash-outline" onPress={handleRemoveAll} grow={!wide} /> : null}
                    {selectedOffer && !checked ? (
                        <SheetButton label="Add to indent" icon="add" onPress={handleConfirm} disabled={quantity <= 0 || noIndent} grow={!wide} />
                    ) : null}
                </>
            }
        >
            {/* Target indent / state */}
            {checked ? (
                <Banner tone="success" icon="checkmark-circle" text="This product is already on your open indent." />
            ) : noIndent ? (
                <Banner tone="warning" icon="alert-circle-outline" text="There is no open indent. Add an item from the marketplace or stock-outs to start one, then come back." />
            ) : (
                <Banner tone="info" icon="document-text-outline" text={`Adds to indent ${indentLabel}.`} />
            )}

            {/* Offers */}
            <View style={{ gap: 8 }}>
                <Label text={`Wholesaler offers (${forecast.wholesaler_offers.length})`} />
                {forecast.wholesaler_offers.length === 0 ? (
                    <View style={{ borderRadius: 16, padding: 16, alignItems: 'center', backgroundColor: chipBg }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No offers for this product{forecast.wholesaler_campaigns.length ? ', only campaigns below' : ''}.</Text>
                    </View>
                ) : (
                    forecast.wholesaler_offers.map((o, i) => (
                        <OfferRow key={o.receipt_id} offer={o} best={i === 0} selected={o.receipt_id === selectedOfferId} onIndent={!!savedByReceiptId[o.receipt_id]} onPress={() => setSelectedOfferId(o.receipt_id)} />
                    ))
                )}
            </View>

            {/* Quantity */}
            {selectedOffer && !checked ? (
                <View style={{ gap: 8 }}>
                    <Label text="Quantity to add" />
                    {selectedOffer.in_placement ? (
                        <Banner tone="violet" icon="swap-horizontal-outline" text={`Consignment: no upfront payment. You settle ${formatKES(selectedOffer.effective_unit_price)} per unit sold.`} />
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <StepButton icon="remove" disabled={quantity <= 0} onPress={() => setQty(quantity - 1)} />
                        <TextInput
                            value={quantityText}
                            onChangeText={(raw) => {
                                const digits = raw.replace(/[^0-9]/g, '');
                                setQuantityText(digits);
                                const n = parseInt(digits, 10);
                                setQuantity(Number.isFinite(n) ? n : 0);
                            }}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            placeholder="0"
                            placeholderTextColor={theme.textDark}
                            accessibilityLabel="Quantity to add"
                            style={{ flex: 1, height: 48, borderRadius: 16, textAlign: 'center', backgroundColor: chipBg, color: theme.text, fontFamily: theme.font.bold, fontSize: 18, ...webNoOutline }}
                        />
                        <StepButton icon="add" onPress={() => setQty(quantity + 1)} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginHorizontal: 4 }}>
                        {quantity !== forecast.required_quantity ? (
                            <Pressable onPress={() => setQty(forecast.required_quantity)} hitSlop={8} style={webPointer}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>Use suggested ({units(forecast.required_quantity)})</Text>
                            </Pressable>
                        ) : (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Suggested by the forecast</Text>
                        )}
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>≈ {formatKES(lineTotal)}</Text>
                    </View>
                    {selectedOffer.quantity_discount ? (
                        <Text style={{ color: '#059669', fontFamily: theme.font.medium, fontSize: 12.5, marginHorizontal: 4 }}>
                            Buy {selectedOffer.quantity_discount.limit_quantity} get {selectedOffer.quantity_discount.awarded_quantity} free
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* Campaigns */}
            {forecast.wholesaler_campaigns.length > 0 ? (
                <View style={{ gap: 8 }}>
                    <Label text={`Campaigns (${forecast.wholesaler_campaigns.length})`} />
                    {forecast.wholesaler_campaigns.map((c) => (
                        <CampaignRow key={c.campaign_id} campaign={c} />
                    ))}
                </View>
            ) : null}
        </AdminSheet>
    );
}

/* ------------------------------------------------------------------ */

const BANNER_TONES = {
    info: { fg: '#4f46e5', bg: 'rgba(99,102,241,0.10)' },
    success: { fg: '#059669', bg: 'rgba(16,185,129,0.10)' },
    warning: { fg: '#b45309', bg: 'rgba(245,158,11,0.12)' },
    violet: { fg: '#7c3aed', bg: 'rgba(139,92,246,0.10)' },
};

function Banner({ tone, icon, text }: { tone: keyof typeof BANNER_TONES; icon: keyof typeof Ionicons.glyphMap; text: string }) {
    const { theme } = useListTokens();
    const t = BANNER_TONES[tone];
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, backgroundColor: t.bg }}>
            <Ionicons name={icon} size={18} color={t.fg} />
            <Text style={{ flex: 1, color: t.fg, fontFamily: theme.font.medium, fontSize: 13 }}>{text}</Text>
        </View>
    );
}

function Label({ text }: { text: string }) {
    const { theme } = useListTokens();
    return <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4 }}>{text}</Text>;
}

function StepButton({ icon, onPress, disabled }: { icon: 'add' | 'remove'; onPress: () => void; disabled?: boolean }) {
    const { theme, chipBg } = useListTokens();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={icon === 'add' ? 'Increase quantity' : 'Decrease quantity'}
            style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: chipBg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, ...webPointer })}
        >
            <Ionicons name={icon} size={20} color={theme.text} />
        </Pressable>
    );
}

function OfferRow({ offer, best, selected, onIndent, onPress }: { offer: RetailerForecastOffer; best: boolean; selected: boolean; onIndent: boolean; onPress: () => void }) {
    const { theme, chipBg } = useListTokens();
    const discounted = offer.price_discount_percent > 0;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${offer.wholesaler_title || 'Wholesaler'} at ${formatKES(offer.effective_unit_price)}`}
            style={({ pressed }) => ({
                borderRadius: 18,
                padding: 12,
                gap: 6,
                borderWidth: 1.5,
                borderColor: selected ? theme.primary : 'transparent',
                backgroundColor: selected ? `${theme.primary}12` : chipBg,
                opacity: pressed ? 0.85 : 1,
                ...webPointer,
            })}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.primary : theme.textDark} />
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                    {textOr(offer.wholesaler_title, 'Unknown wholesaler')}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(offer.effective_unit_price)}</Text>
                    {discounted ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, textDecorationLine: 'line-through' }}>{formatKES(offer.list_unit_price)}</Text>
                    ) : null}
                </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 28 }}>
                {best ? <AdminBadgePill badge={{ label: 'Best', tone: 'primary', icon: 'star' }} /> : null}
                {onIndent ? <AdminBadgePill badge={{ label: 'On indent', tone: 'success', icon: 'checkmark' }} /> : null}
                {offer.in_placement ? <AdminBadgePill badge={{ label: 'Consignment', tone: 'violet' }} /> : null}
                {discounted ? <AdminBadgePill badge={{ label: `${offer.price_discount_percent.toFixed(0)}% off`, tone: 'success' }} /> : null}
                {offer.quantity_discount ? <AdminBadgePill badge={{ label: `Buy ${offer.quantity_discount.limit_quantity} get ${offer.quantity_discount.awarded_quantity}`, tone: 'success' }} /> : null}
                <AdminBadgePill badge={{ label: `${units(offer.current_quantity)} in stock`, tone: 'neutral' }} />
                {offer.days_to_expiry != null ? <AdminBadgePill badge={{ label: `Expires in ${offer.days_to_expiry}d`, tone: offer.days_to_expiry < 60 ? 'warning' : 'neutral' }} /> : null}
                {offer.batch ? <AdminBadgePill badge={{ label: `Batch ${offer.batch}`, tone: 'neutral' }} /> : null}
            </View>
            {offer.placement_note || offer.rationale ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginLeft: 28 }} numberOfLines={2}>
                    {offer.placement_note || offer.rationale}
                </Text>
            ) : null}
        </Pressable>
    );
}

function CampaignRow({ campaign: c }: { campaign: RetailerForecastCampaign }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View style={{ borderRadius: 16, padding: 12, gap: 6, backgroundColor: chipBg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="megaphone-outline" size={16} color="#f59e0b" />
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                    {textOr(c.campaign_title, 'Campaign')}
                </Text>
                {c.opted_in ? <AdminBadgePill badge={{ label: 'Opted in', tone: 'success', icon: 'checkmark' }} /> : <AdminBadgePill badge={{ label: `${c.days_remaining}d left`, tone: 'warning' }} />}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 24 }}>
                <AdminBadgePill badge={{ label: textOr(c.wholesaler_title, 'Wholesaler'), tone: 'neutral' }} />
                {c.published_bonus_quantity > 0 ? <AdminBadgePill badge={{ label: `+${c.published_bonus_quantity} bonus`, tone: 'success' }} /> : null}
                <AdminBadgePill badge={{ label: `Suggested ${units(c.suggested_quantity)}`, tone: 'neutral' }} />
            </View>
            {(c as any).rationale ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginLeft: 24 }} numberOfLines={2}>
                    {(c as any).rationale}
                </Text>
            ) : null}
        </View>
    );
}
