// components/retailers/stockOuts/OutOfStockOffersModal.tsx

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import {
    RetailerIndentItem,
    RetailerOutOfStockNormalized,
    RetailerOutOfStockWholesalerOffer,
} from '@/databases/types';
import React, {
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export interface AcceptedOfferPayload {
    outOfStock: RetailerOutOfStockNormalized;
    quantity: number;
    offer: RetailerOutOfStockWholesalerOffer;
}

interface OutOfStockOffersModalProps {
    item: RetailerOutOfStockNormalized | null;
    onClose: () => void;
    onSelectOffer: (payload: AcceptedOfferPayload) => void;
    onRemoveItem: (
        outOfStock: RetailerOutOfStockNormalized,
        offer: RetailerOutOfStockWholesalerOffer,
        existingItemId: string
    ) => void;
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
    v: string | number | null | undefined
): string => {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    if (isNaN(n)) return '—';
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
    onSelectOffer,
    onRemoveItem,
}: OutOfStockOffersModalProps) {
    const { theme } = useAuth();
    const {
        currentOpenIndent,
        openCount,
        queueRevision,
    } = useRetailerIndentsSync();

    const [quantityText, setQuantityText] = useState('');
    const [selectedOfferId, setSelectedOfferId] = useState<
        string | null
    >(null);

    const offers = item?.wholesaler_offers ?? [];

    /* Map of offerId -> existing RetailerIndentItem */
    const savedItemsByOfferId = useMemo(() => {
        const map: Record<string, RetailerIndentItem> = {};
        if (!currentOpenIndent) return map;

        const savedItems =
            currentOpenIndent.retailer_indent_items ?? [];

        for (const offer of offers) {
            const match = savedItems.find(
                (it) => it.wholesale_receipt === offer.id
            );
            if (match) map[offer.id] = match;
        }
        return map;
    }, [currentOpenIndent, offers]);

    /* Seed form whenever the target changes */
    useEffect(() => {
        if (!item) return;

        const savedMap: Record<string, RetailerIndentItem> = {};
        const savedItems =
            currentOpenIndent?.retailer_indent_items ?? [];
        for (const offer of item.wholesaler_offers ?? []) {
            const match = savedItems.find(
                (it) => it.wholesale_receipt === offer.id
            );
            if (match) savedMap[offer.id] = match;
        }

        const preSelectedId = Object.keys(savedMap)[0] ?? null;
        const preItem = preSelectedId
            ? savedMap[preSelectedId]
            : null;

        setSelectedOfferId(preSelectedId);
        setQuantityText(
            String(
                preItem?.required_quantity ??
                item.required_quantity ??
                0
            )
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        item,
        currentOpenIndent?.remote_id,
        queueRevision,
    ]);

    /* Web: ESC closes the modal */
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (!item) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () =>
            window.removeEventListener('keydown', handler);
    }, [item, onClose]);

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
        [offers, selectedOfferId]
    );

    const selectionIsSaved = !!(
        selectedOfferId &&
        savedItemsByOfferId[selectedOfferId]
    );

    const handleToggle = (
        offer: RetailerOutOfStockWholesalerOffer
    ) => {
        if (!item) return;

        const isCurrentlySelected =
            selectedOfferId === offer.id;

        if (isCurrentlySelected) {
            setSelectedOfferId(null);
            const existing =
                savedItemsByOfferId[offer.id];
            if (existing) {
                onRemoveItem(item, offer, existing.id);
            }
            return;
        }

        setSelectedOfferId(offer.id);
        const existing = savedItemsByOfferId[offer.id];
        setQuantityText(
            String(
                existing?.required_quantity ??
                item.required_quantity ??
                0
            )
        );
    };

    const handleQuantityBlur = () => {
        if (!item || !selectedOffer) return;
        if (!selectionIsSaved) return;
        if (parsedQuantity <= 0) return;

        onSelectOffer({
            outOfStock: item,
            quantity: parsedQuantity,
            offer: selectedOffer,
        });
    };

    const handleSave = () => {
        if (!item) return;
        if (!selectedOffer) return;
        if (parsedQuantity <= 0) return;
        if (selectionIsSaved) return;

        onSelectOffer({
            outOfStock: item,
            quantity: parsedQuantity,
            offer: selectedOffer,
        });
    };

    if (!item) return null;

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';

    return (
        <Modal
            visible={!!item}
            transparent
            animationType="fade"
            onRequestClose={onClose}
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
                    onPress={onClose}
                />

                <View
                    className="w-full rounded-2xl border p-5"
                    style={{
                        maxWidth: 720,
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* Header */}
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
                                    No open indent available
                                </Text>
                            )}
                        </View>
                        <Pressable
                            onPress={onClose}
                            className="p-1.5"
                            hitSlop={10}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontSize: 16,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    <ScrollView
                        style={{ maxHeight: 460 }}
                        contentContainerStyle={{
                            paddingBottom: 8,
                        }}
                    >
                        {/* Quantity */}
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
                                            ''
                                        )
                                    )
                                }
                                onBlur={handleQuantityBlur}
                                keyboardType="number-pad"
                                inputMode="numeric"
                                placeholder="0"
                                placeholderTextColor="#94a3b8"
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

                        {/* Offers — single select */}
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
                                        onSelect={() => {
                                            handleToggle(o);
                                            setTimeout(
                                                handleSave,
                                                0
                                            );
                                        }}
                                    />
                                ))
                            )}
                        </View>
                    </ScrollView>

                    {/* Footer */}
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
                                ? `Saved • Qty ${parsedQuantity || 0}`
                                : selectedOffer
                                    ? `Selected • Qty ${parsedQuantity || 0}`
                                    : `No offer selected • Qty ${parsedQuantity || 0}`}
                        </Text>
                        <View className="flex-row gap-2">
                            <Pressable
                                onPress={onClose}
                                className="px-3.5 py-2.5 rounded-xl border"
                                style={{
                                    borderColor,
                                    backgroundColor:
                                        'transparent',
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
    onSelect,
}: {
    offer: RetailerOutOfStockWholesalerOffer;
    selected: boolean;
    saved: boolean;
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
                {thumbnail ? (
                    <Text
                        style={{
                            fontSize: 12,
                            color: theme.textDark,
                            opacity: 0.4,
                        }}
                    >
                        📦
                    </Text>
                ) : null}
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
                        offer.unit_selling_price
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
                            offer.unit_selling_price
                        )}
                    </Text>
                ) : null}
            </View>
        </Pressable>
    );
}