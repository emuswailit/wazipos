// components/retailers/stockOuts/OutOfStockOffersModal.tsx
//
// Offer picker for a product the retailer has flagged as out of stock.
// Shows every wholesaler offer available for that product and lets the
// user add one of them (or several, sequentially) to the current open
// indent.
//
// Consumes `useIndentBridge` directly, so the same offline-first
// semantics apply here as in the marketplace: the local row updates
// instantly, the remote write is attempted, and a failed POST is
// enqueued for background retry.
//
// The parent passes only the target out-of-stock row and an optional
// feedback callback. No more `onSelectOffer` / `onRemoveItem` props.
//
// Toggle semantics (matches the pre-existing UX):
//   - Tap an unselected offer  →  select it and save to the indent
//   - Tap the selected offer   →  deselect it and remove from the indent
//   - Blur the quantity field  →  update the quantity on the saved row

import { AdminAvatarTile, AdminBadgePill, AdminSheet, SheetButton, useListTokens, webNoOutline, webPointer } from '@/components/common/listScreen';
import type {
    RetailerOutOfStockNormalized,
    RetailerOutOfStockWholesalerOffer,
} from '@/databases/types';
import { useIndentBridge } from '@/hooks/useIndentBridge';
import { resolveImageUrl } from '@/lib/images';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

/* ------------------------------------------------------------------ */
/* Feedback shape                                                      */
/* ------------------------------------------------------------------ */

export interface OutOfStockFeedback {
    ok: boolean;
    mode: 'remote' | 'draft' | 'failed';
    action: 'add' | 'remove';
    offerId: string;
    message?: string;
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface OutOfStockOffersModalProps {
    item: RetailerOutOfStockNormalized | null;
    onClose: () => void;
    /** Optional parent feedback hook for toasts / analytics. */
    onFeedback?: (result: OutOfStockFeedback) => void;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const formatMoney = (
    v: string | number | null | undefined,
): string => {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function OutOfStockOffersModal({
    item,
    onClose,
    onFeedback,
}: OutOfStockOffersModalProps) {
    const { theme, chipBg } = useListTokens();
    const {
        currentOpenIndent,
        findItemByReceipt,
        addToIndent,
        removeFromIndent,
        queueRevision,
    } = useIndentBridge();

    const [quantityText, setQuantityText] = useState('');
    const [selectedOfferId, setSelectedOfferId] = useState<
        string | null
    >(null);
    const [busy, setBusy] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    const offers = item?.wholesaler_offers ?? [];

    /* Map of offerId → existing RetailerIndentItem. Delegated to
       the bridge, but recomputed whenever the target list changes. */
    const savedItemsByOfferId = useMemo(() => {
        const map: Record<string, any> = {};
        for (const offer of offers) {
            const match = findItemByReceipt(offer.id);
            if (match) map[offer.id] = match;
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offers, findItemByReceipt, queueRevision]);

    /* Seed form whenever the target or indent state changes. */
    useEffect(() => {
        if (!item) return;

        const savedIds = (item.wholesaler_offers ?? [])
            .map((o) => o.id)
            .filter((id) => !!findItemByReceipt(id));

        const preSelectedId = savedIds[0] ?? null;
        const preItem = preSelectedId
            ? findItemByReceipt(preSelectedId)
            : null;

        setSelectedOfferId(preSelectedId);
        setQuantityText(
            String(
                preItem?.required_quantity ??
                item.required_quantity ??
                0,
            ),
        );
        setErrorText(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item, currentOpenIndent?.remote_id, queueRevision]);

    /* Web: ESC closes the modal (skipped while a mutation is busy). */
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (!item) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', handler);
        return () =>
            window.removeEventListener('keydown', handler);
    }, [item, onClose, busy]);

    /* ── Derived ───────────────────────────────────────────── */

    const parsedQuantity = useMemo(() => {
        const n = Number(quantityText);
        return Number.isFinite(n) && n > 0
            ? Math.floor(n)
            : 0;
    }, [quantityText]);

    const selectedOffer = useMemo(
        () =>
            offers.find((o) => o.id === selectedOfferId) ??
            null,
        [offers, selectedOfferId],
    );

    const selectionIsSaved = !!(
        selectedOfferId && savedItemsByOfferId[selectedOfferId]
    );


    /* ── Mutations ─────────────────────────────────────────── */

    const commitAdd = async (
        offer: RetailerOutOfStockWholesalerOffer,
        qty: number,
    ) => {
        if (!item || qty <= 0) return;

        setBusy(true);
        setErrorText(null);

        const res = await addToIndent({
            wholesaleReceipt: offer.id,
            quantity: qty,
            meta: {
                wholesaleReceiptTitle:
                    offer.title ||
                    offer.product_title ||
                    item.product_title,
                wholesaler: offer.received_from ?? null,
                wholesalerTitle:
                    offer.received_from_details?.title ?? '',
                unitOfReceipt: offer.unit_of_receipt,
                unitSellingPrice: offer.unit_selling_price,
                finalUnitSellingPrice:
                    offer.final_unit_selling_price,
                images: Array.isArray(offer.images)
                    ? offer.images
                    : [],
            },
        });

        setBusy(false);

        if (!res.ok) {
            setErrorText(
                res.message ?? 'Could not add to indent.',
            );
        }

        onFeedback?.({
            ok: res.ok,
            mode: res.mode,
            action: 'add',
            offerId: offer.id,
            message: res.message,
        });
    };

    const commitRemove = async (
        offer: RetailerOutOfStockWholesalerOffer,
    ) => {
        const existing = savedItemsByOfferId[offer.id];
        if (!existing) return;

        setBusy(true);
        setErrorText(null);

        const res = await removeFromIndent(existing.id);

        setBusy(false);

        if (!res.ok) {
            setErrorText(
                res.message ?? 'Could not remove from indent.',
            );
        }

        onFeedback?.({
            ok: res.ok,
            mode: res.mode,
            action: 'remove',
            offerId: offer.id,
            message: res.message,
        });
    };

    const handleToggle = async (
        offer: RetailerOutOfStockWholesalerOffer,
    ) => {
        if (!item || busy) return;

        const isCurrentlySelected =
            selectedOfferId === offer.id;

        if (isCurrentlySelected) {
            setSelectedOfferId(null);
            await commitRemove(offer);
            return;
        }

        setSelectedOfferId(offer.id);
        const existing = savedItemsByOfferId[offer.id];
        const qty = Number(
            existing?.required_quantity ??
            item.required_quantity ??
            0,
        );
        setQuantityText(String(qty));

        // Auto-commit the new selection immediately (matches the
        // existing stock-outs UX — tap once to add).
        if (!existing && qty > 0) {
            await commitAdd(offer, qty);
        }
    };

    const handleQuantityBlur = async () => {
        if (!item || !selectedOffer || busy) return;
        if (!selectionIsSaved) return;
        if (parsedQuantity <= 0) return;

        // Only re-commit if the value actually changed.
        const existing =
            savedItemsByOfferId[selectedOffer.id];
        if (
            existing?.required_quantity === parsedQuantity
        )
            return;

        await commitAdd(selectedOffer, parsedQuantity);
    };

    if (!item) return null;

    const qtyLabel = `Qty ${parsedQuantity.toLocaleString()}`;
    const footerStatus = selectionIsSaved ? `Saved on indent · ${qtyLabel}` : selectedOffer ? `Selected · ${qtyLabel}` : `No offer selected · ${qtyLabel}`;
    const indentLabel = currentOpenIndent
        ? `${currentOpenIndent.indent_number || currentOpenIndent.remote_id}${currentOpenIndent.entity_title ? ` · ${currentOpenIndent.entity_title}` : ''}`
        : null;

    return (
        <AdminSheet
            visible={!!item}
            onClose={onClose}
            dismissible={!busy}
            title={item.product_title || 'Out of stock item'}
            subtitle={selectionIsSaved ? 'Saved to indent' : 'Add to indent'}
            icon="cart-outline"
            width={720}
            footer={
                <>
                    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {busy ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                        <Text numberOfLines={2} style={{ flexShrink: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {busy ? 'Saving…' : footerStatus}
                        </Text>
                    </View>
                    <SheetButton label="Done" variant="secondary" onPress={onClose} disabled={busy} />
                </>
            }
        >
            {/* Target indent */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, backgroundColor: indentLabel ? chipBg : 'rgba(245,158,11,0.10)' }}>
                <Ionicons name={indentLabel ? 'document-text-outline' : 'sparkles-outline'} size={18} color={indentLabel ? theme.primary : '#d97706'} />
                <Text style={{ flex: 1, color: indentLabel ? theme.text : '#b45309', fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={2}>
                    {indentLabel ? `Saving to indent ${indentLabel}` : 'A new indent will be created when you pick an offer.'}
                </Text>
            </View>

            {errorText ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, backgroundColor: 'rgba(244,63,94,0.08)' }}>
                    <Ionicons name="alert-circle" size={17} color="#e11d48" />
                    <Text style={{ flex: 1, color: '#e11d48', fontFamily: theme.font.medium, fontSize: 13 }}>{errorText}</Text>
                </View>
            ) : null}

            {/* Quantity */}
            <View style={{ gap: 8 }}>
                <SectionLabel text="Required quantity" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <StepButton icon="remove" disabled={busy || parsedQuantity <= 1} onPress={() => setQuantityText(String(Math.max(1, parsedQuantity - 1)))} />
                    <TextInput
                        value={quantityText}
                        onChangeText={(t) => setQuantityText(t.replace(/[^0-9]/g, ''))}
                        onBlur={handleQuantityBlur}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        placeholder="0"
                        placeholderTextColor={theme.textDark}
                        editable={!busy}
                        accessibilityLabel="Required quantity"
                        style={{
                            flex: 1,
                            height: 48,
                            borderRadius: 16,
                            paddingHorizontal: 14,
                            textAlign: 'center',
                            backgroundColor: chipBg,
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 18,
                            ...webNoOutline,
                        }}
                    />
                    <StepButton icon="add" disabled={busy} onPress={() => setQuantityText(String(parsedQuantity + 1))} />
                </View>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginLeft: 4 }}>
                    {selectionIsSaved ? 'Change the quantity, then tap Update quantity.' : 'Pre-filled from the request. Pick an offer to save it.'}
                </Text>
                {selectionIsSaved && selectedOffer && parsedQuantity > 0 && savedItemsByOfferId[selectedOffer.id]?.required_quantity !== parsedQuantity ? (
                    <SheetButton label="Update quantity" icon="checkmark" onPress={handleQuantityBlur} loading={busy} />
                ) : null}
            </View>

            {/* Offers */}
            <View style={{ gap: 8 }}>
                <SectionLabel text={`Wholesaler offers (${offers.length})`} />
                {offers.length === 0 ? (
                    <View style={{ alignItems: 'center', gap: 6, borderRadius: 16, paddingVertical: 24, backgroundColor: chipBg }}>
                        <Ionicons name="storefront-outline" size={22} color={theme.textDark} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No wholesaler has this in stock yet.</Text>
                    </View>
                ) : (
                    offers.map((o) => (
                        <OfferRow key={o.id} offer={o} selected={selectedOfferId === o.id} saved={!!savedItemsByOfferId[o.id]} busy={busy} onSelect={() => handleToggle(o)} />
                    ))
                )}
                {offers.length > 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginLeft: 4 }}>Tap an offer to add it to the indent; tap it again to remove it.</Text>
                ) : null}
            </View>
        </AdminSheet>
    );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function SectionLabel({ text }: { text: string }) {
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

function OfferRow({
    offer,
    selected,
    saved,
    busy,
    onSelect,
}: {
    offer: RetailerOutOfStockWholesalerOffer;
    selected: boolean;
    saved: boolean;
    busy: boolean;
    onSelect: () => void;
}) {
    const { theme, chipBg } = useListTokens();
    const title = offer.title || offer.product_title || 'Untitled offer';
    const hasDiscount = !!offer.discount_unit_selling_price && offer.discount_unit_selling_price !== '0.00';
    const supplier = offer.received_from_details?.title || offer.manufacturer_title || 'Unknown supplier';

    return (
        <Pressable
            onPress={onSelect}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: busy }}
            accessibilityLabel={`${title} from ${supplier}`}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: selected ? theme.primary : 'transparent',
                backgroundColor: selected ? `${theme.primary}12` : chipBg,
                opacity: busy ? 0.7 : pressed ? 0.85 : 1,
                ...webPointer,
            })}
        >
            <AdminAvatarTile avatar={{ uri: resolveImageUrl(offer.images?.[0]), icon: 'cube-outline' }} title={title} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                        {title}
                    </Text>
                    {saved ? <AdminBadgePill badge={{ label: 'Saved', tone: 'success', icon: 'checkmark' }} /> : null}
                </View>
                <Text numberOfLines={1} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 2 }}>
                    {supplier}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, marginTop: 1 }}>
                    {Number(offer.current_unit_quantity ?? 0).toLocaleString()} in stock{offer.unit_of_receipt ? ` · ${offer.unit_of_receipt}` : ''}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>KES {formatMoney(offer.final_unit_selling_price ?? offer.unit_selling_price)}</Text>
                {hasDiscount ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2, textDecorationLine: 'line-through' }}>KES {formatMoney(offer.unit_selling_price)}</Text>
                ) : null}
            </View>
            <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.primary : theme.textDark} />
        </Pressable>
    );
}
