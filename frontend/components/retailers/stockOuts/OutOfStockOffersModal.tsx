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

import { useAuth } from '@/context/AuthContext';
import type {
    RetailerOutOfStockNormalized,
    RetailerOutOfStockWholesalerOffer,
} from '@/databases/types';
import { useIndentBridge } from '@/hooks/useIndentBridge';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

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

const API_BASE_URL = 'https://api.wazipos.co.ke';

const resolveImage = (raw: any): string | null => {
    if (!raw) return null;
    const p =
        typeof raw === 'string'
            ? raw
            : raw.thumbnail || raw.image || raw.url || null;
    if (!p) return null;
    if (p.startsWith('http')) return p;
    const clean = p.replace(/^\/+/, '');
    return `${API_BASE_URL}/${clean}`;
};

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
    const { theme } = useAuth();
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

    const borderColor = theme.isDarkMode ? '#334155' : '#e2e8f0';

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

    /* ── Render ────────────────────────────────────────────── */

    return (
        <Modal
            visible={!!item}
            transparent
            animationType="fade"
            onRequestClose={busy ? undefined : onClose}
        >
            <View
                className="flex-1 items-center justify-center p-4"
                style={{
                    backgroundColor: theme.isDarkMode
                        ? 'rgba(3,6,14,0.72)'
                        : 'rgba(15,20,32,0.55)',
                }}
            >
                <Pressable
                    className="absolute inset-0"
                    onPress={busy ? undefined : onClose}
                />

                <View
                    className="w-full rounded-2xl border p-5"
                    style={{
                        maxWidth: 720,
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* ── Header ───────────────────────────── */}
                    <View className="flex-row items-start mb-4">
                        <View className="flex-1">
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.primary,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 11,
                                    marginBottom: 4,
                                }}
                            >
                                {selectionIsSaved
                                    ? 'Saved to Indent'
                                    : 'Add to Indent'}
                            </Text>
                            <Text
                                numberOfLines={2}
                                style={{
                                    color: theme.text,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 18,
                                }}
                            >
                                {item.product_title}
                            </Text>

                            {currentOpenIndent ? (
                                <Text
                                    className="mt-1"
                                    numberOfLines={1}
                                    style={{
                                        color:
                                            theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    →{' '}
                                    {currentOpenIndent.indent_number ||
                                        currentOpenIndent.remote_id}
                                    {currentOpenIndent.entity_title
                                        ? ` · ${currentOpenIndent.entity_title}`
                                        : ''}
                                </Text>
                            ) : (
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: '#f43f5e',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    A new indent will be created
                                    when you save.
                                </Text>
                            )}
                        </View>

                        {busy && (
                            <ActivityIndicator
                                size="small"
                                color={theme.primary}
                                style={{ marginRight: 8 }}
                            />
                        )}

                        <Pressable
                            onPress={busy ? undefined : onClose}
                            className="p-1.5"
                            hitSlop={10}
                            disabled={busy}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontSize: 16,
                                    opacity: busy ? 0.4 : 1,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* ── Error banner ─────────────────────── */}
                    {errorText ? (
                        <View
                            style={{
                                backgroundColor:
                                    'rgba(220,38,38,0.1)',
                                borderColor:
                                    'rgba(220,38,38,0.35)',
                                borderWidth: 1,
                                borderRadius: 8,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                marginBottom: 12,
                            }}
                        >
                            <Text
                                style={{
                                    color: '#dc2626',
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.xs,
                                }}
                            >
                                {errorText}
                            </Text>
                        </View>
                    ) : null}

                    <ScrollView
                        style={{ maxHeight: 460 }}
                        contentContainerStyle={{
                            paddingBottom: 8,
                        }}
                    >
                        {/* ── Quantity ─────────────────────── */}
                        <View className="mb-1">
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 11,
                                }}
                            >
                                Required quantity
                            </Text>
                            <TextInput
                                value={quantityText}
                                onChangeText={(t) =>
                                    setQuantityText(
                                        t.replace(
                                            /[^0-9]/g,
                                            '',
                                        ),
                                    )
                                }
                                onBlur={handleQuantityBlur}
                                keyboardType="number-pad"
                                inputMode="numeric"
                                placeholder="0"
                                placeholderTextColor="#94a3b8"
                                editable={!busy}
                                className="h-11 rounded-xl border px-3.5"
                                style={{
                                    borderColor,
                                    backgroundColor:
                                        theme.isDarkMode
                                            ? '#0f172a'
                                            : '#f1f5f9',
                                    color: theme.text,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            />
                            <Text
                                className="mt-1.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.xs,
                                }}
                            >
                                Pre-filled from the request —
                                edit to change.
                            </Text>
                        </View>

                        {/* ── Offers ───────────────────────── */}
                        <View className="mt-5">
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 11,
                                }}
                            >
                                Choose one wholesaler offer (
                                {offers.length})
                            </Text>

                            {offers.length === 0 ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.sm,
                                        opacity: 0.7,
                                    }}
                                >
                                    No offers available.
                                </Text>
                            ) : (
                                offers.map((o) => (
                                    <OfferRow
                                        key={o.id}
                                        offer={o}
                                        selected={
                                            selectedOfferId ===
                                            o.id
                                        }
                                        saved={
                                            !!savedItemsByOfferId[
                                            o.id
                                            ]
                                        }
                                        busy={busy}
                                        onSelect={() =>
                                            handleToggle(o)
                                        }
                                    />
                                ))
                            )}
                        </View>
                    </ScrollView>

                    {/* ── Footer ───────────────────────────── */}
                    <View
                        className="flex-row items-center justify-between mt-4 pt-4 border-t gap-3"
                        style={{ borderColor }}
                    >
                        <Text
                            className="flex-shrink"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            {selectionIsSaved
                                ? `Saved • Qty ${parsedQuantity || 0
                                }`
                                : selectedOffer
                                    ? `Selected • Qty ${parsedQuantity || 0
                                    }`
                                    : `No offer selected • Qty ${parsedQuantity || 0
                                    }`}
                        </Text>
                        <View className="flex-row gap-2">
                            <Pressable
                                onPress={onClose}
                                disabled={busy}
                                className="px-3.5 py-2.5 rounded-xl border"
                                style={{
                                    borderColor,
                                    backgroundColor:
                                        'transparent',
                                    opacity: busy ? 0.5 : 1,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Close
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* ------------------------------------------------------------------ */
/* Offer row                                                           */
/* ------------------------------------------------------------------ */

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
    const { theme } = useAuth();

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';

    const thumbnail =
        resolveImage(offer.images?.[0]) ?? null;

    const hasDiscount =
        !!offer.discount_unit_selling_price &&
        offer.discount_unit_selling_price !== '0.00';

    return (
        <Pressable
            onPress={onSelect}
            disabled={busy}
            className="flex-row items-center gap-3 p-3 rounded-xl border mb-2"
            style={{
                backgroundColor: selected
                    ? theme.isDarkMode
                        ? 'rgba(79,140,255,0.14)'
                        : 'rgba(47,107,255,0.12)'
                    : theme.isDarkMode
                        ? '#0f172a'
                        : '#f1f5f9',
                borderColor: selected
                    ? theme.primary
                    : borderColor,
                opacity: busy ? 0.7 : 1,
            }}
        >
            {/* Radio */}
            <View
                className="items-center justify-center rounded-full border"
                style={{
                    width: 22,
                    height: 22,
                    borderWidth: 1.5,
                    borderColor: selected
                        ? theme.primary
                        : theme.isDarkMode
                            ? '#475569'
                            : '#cbd5e1',
                }}
            >
                {selected ? (
                    <View
                        style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: theme.primary,
                        }}
                    />
                ) : null}
            </View>

            {/* Thumb */}
            <View
                className="items-center justify-center rounded-lg"
                style={{
                    width: 40,
                    height: 40,
                    backgroundColor: theme.isDarkMode
                        ? '#0f172a'
                        : '#f1f5f9',
                    overflow: 'hidden',
                }}
            >
                <ImageWithFallback
                    uri={thumbnail}
                    width={40}
                    height={40}
                    fallback="📦"
                />
            </View>

            {/* Details */}
            <View className="flex-1">
                <View className="flex-row items-center">
                    <Text
                        numberOfLines={1}
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            flexShrink: 1,
                        }}
                    >
                        {offer.title ||
                            offer.product_title ||
                            'Untitled offer'}
                    </Text>
                    {saved ? (
                        <View
                            className="ml-2 px-2 py-0.5 rounded-md"
                            style={{
                                backgroundColor:
                                    'rgba(16,185,129,0.15)',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: '#10b981',
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 9,
                                }}
                            >
                                Saved
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Text
                    numberOfLines={1}
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                        marginTop: 2,
                    }}
                >
                    {offer.manufacturer_title ||
                        'Unknown supplier'}
                </Text>
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                        marginTop: 2,
                        opacity: 0.7,
                    }}
                >
                    {offer.current_unit_quantity} in stock •{' '}
                    {offer.unit_of_receipt}
                </Text>
            </View>

            {/* Price */}
            <View className="items-end">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 14,
                    }}
                >
                    KES{' '}
                    {formatMoney(
                        offer.final_unit_selling_price ??
                        offer.unit_selling_price,
                    )}
                </Text>
                {hasDiscount ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontSize: 11,
                            marginTop: 2,
                            textDecorationLine:
                                'line-through',
                            opacity: 0.7,
                        }}
                    >
                        KES{' '}
                        {formatMoney(
                            offer.unit_selling_price,
                        )}
                    </Text>
                ) : null}
            </View>
        </Pressable>
    );
}

/* ------------------------------------------------------------------ */
/* Image with fallback                                                 */
/* ------------------------------------------------------------------ */

function ImageWithFallback({
    uri,
    width,
    height,
    fallback,
}: {
    uri: string | null;
    width: number;
    height: number;
    fallback: string;
}) {
    const [errored, setErrored] = useState(false);

    if (!uri || errored) {
        return (
            <Text style={{ fontSize: 16, opacity: 0.4 }}>
                {fallback}
            </Text>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={{ width, height }}
            resizeMode="cover"
            onError={() => setErrored(true)}
        />
    );
}