// components/retailers/stockOuts/OutOfStockDetailsModal.tsx

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import {
    RetailerIndentItem,
    RetailerOutOfStockNormalized,
    RetailerOutOfStockWholesalerOffer,
} from '@/databases/types';
import React, { useCallback, useMemo } from 'react';
import {
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

const API_BASE_URL = 'https://api.wazipos.co.ke';
const IMAGE_BASE_URL = API_BASE_URL;

const formatKES = (
    raw: string | number | null | undefined
): string => {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

const resolveImage = (raw: any): string | null => {
    if (!raw) return null;
    const p =
        typeof raw === 'string'
            ? raw
            : raw.thumbnail || raw.image || raw.url || null;
    if (!p) return null;
    if (p.startsWith('http')) return p;
    const clean = p.replace(/^\/+/, '');
    return `${IMAGE_BASE_URL}/${clean}`;
};

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
interface OutOfStockDetailsModalProps {
    item: RetailerOutOfStockNormalized | null;
    onClose: () => void;
    onViewOffers?: (item: RetailerOutOfStockNormalized) => void;
    onEdit?: (item: RetailerOutOfStockNormalized) => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function OutOfStockDetailsModal({
    item,
    onClose,
    onViewOffers,
    onEdit,
}: OutOfStockDetailsModalProps) {
    const { theme } = useAuth();
    const { currentOpenIndent } = useRetailerIndentsSync();

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';
    const dividerColor = theme.isDarkMode
        ? '#334155'
        : '#f1f5f9';
    const subBg = theme.isDarkMode ? '#0f172a' : '#f8fafc';

    /* Which offers are already on the open indent */
    const savedByOfferId = useMemo(() => {
        const map: Record<string, RetailerIndentItem> = {};
        if (!item || !currentOpenIndent) return map;
        const existing =
            currentOpenIndent.retailer_indent_items ?? [];
        for (const o of item.wholesaler_offers ?? []) {
            const m = existing.find(
                (it) => it.wholesale_receipt === o.id
            );
            if (m) map[o.id] = m;
        }
        return map;
    }, [item, currentOpenIndent]);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    if (!item) return null;

    const offerCount = item.wholesaler_offers?.length ?? 0;
    const heroThumb =
        resolveImage(item.images?.[0]) ?? null;

    /* Draft rows have no server id yet — hide View Offers */
    const isDraft = !!item.is_pending;

    return (
        <Modal
            visible={!!item}
            animationType="fade"
            transparent
            onRequestClose={handleClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[900px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
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
                                {item.product_title || '—'}
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {isDraft
                                    ? 'Draft · not yet synced'
                                    : item.is_ordered
                                        ? 'Ordered'
                                        : 'Pending'}{' '}
                                · {offerCount} offer
                                {offerCount === 1 ? '' : 's'}
                            </Text>
                        </View>
                        <Pressable
                            onPress={handleClose}
                            hitSlop={10}
                            className="p-1.5"
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
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
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {/* Hero product card */}
                        <View
                            className="flex-row rounded-xl p-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <View
                                className="w-[72px] h-[72px] rounded-xl mr-3 items-center justify-center overflow-hidden"
                                style={{
                                    backgroundColor: theme.panel,
                                    flexShrink: 0,
                                }}
                            >
                                {heroThumb ? (
                                    <Image
                                        source={{ uri: heroThumb }}
                                        style={{
                                            width: 72,
                                            height: 72,
                                        }}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <Text
                                        style={{
                                            fontSize: 24,
                                            opacity: 0.4,
                                        }}
                                    >
                                        📦
                                    </Text>
                                )}
                            </View>
                            <View className="flex-1 min-w-0">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 15,
                                    }}
                                    numberOfLines={2}
                                >
                                    {item.product_title || '—'}
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 12,
                                    }}
                                    numberOfLines={1}
                                >
                                    {item.unit_of_receipt} ·{' '}
                                    {item.units_per_pack} pcs/pack
                                </Text>
                                <View className="flex-row flex-wrap gap-1.5 mt-2">
                                    <MiniBadge
                                        label={`Qty ${item.required_quantity}`}
                                    />
                                    {item.is_special_order ? (
                                        <MiniBadge label="Special order" />
                                    ) : null}
                                    {isDraft ? (
                                        <MiniBadge label="Draft" />
                                    ) : (
                                        <MiniBadge
                                            label={
                                                item.is_ordered
                                                    ? 'Ordered'
                                                    : 'Pending'
                                            }
                                        />
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Summary grid */}
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Customer"
                                value={item.customer_name || '—'}
                            />
                            <SummaryCell
                                label="Phone"
                                value={item.customer_phone || '—'}
                            />
                            <SummaryCell
                                label="Unit"
                                value={item.unit_of_receipt || '—'}
                            />
                            <SummaryCell
                                label="Units / Pack"
                                value={String(item.units_per_pack)}
                            />
                            <SummaryCell
                                label="Offers"
                                value={String(offerCount)}
                            />
                            <SummaryCell
                                label="Status"
                                value={
                                    isDraft
                                        ? 'Draft'
                                        : item.is_ordered
                                            ? 'Ordered'
                                            : 'Pending'
                                }
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
                            Wholesaler Offers ({offerCount})
                        </Text>

                        {offerCount === 0 ? (
                            <View className="p-6 items-center">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    No offers available for this
                                    item.
                                </Text>
                            </View>
                        ) : (
                            item.wholesaler_offers.map((o) => (
                                <OfferRow
                                    key={o.id}
                                    offer={o}
                                    saved={
                                        !!savedByOfferId[o.id]
                                    }
                                />
                            ))
                        )}

                        {Object.keys(savedByOfferId).length >
                            0 ? (
                            <View
                                className="rounded-xl px-3 py-2 mt-4"
                                style={{
                                    backgroundColor:
                                        'rgba(16,185,129,0.10)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#10b981',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    {
                                        Object.keys(
                                            savedByOfferId
                                        ).length
                                    }{' '}
                                    offer
                                    {Object.keys(savedByOfferId)
                                        .length === 1
                                        ? ''
                                        : 's'}{' '}
                                    already added to your open
                                    indent.
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
                            onPress={handleClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
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

                        {onEdit ? (
                            <Pressable
                                onPress={() => {
                                    onEdit(item);
                                    handleClose();
                                }}
                                className="px-4 py-2.5 rounded-xl border"
                                style={{
                                    borderColor: theme.primary,
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Edit out of stock"
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Edit Out of Stock
                                </Text>
                            </Pressable>
                        ) : null}

                        {offerCount > 0 &&
                            onViewOffers &&
                            !isDraft ? (
                            <Pressable
                                onPress={() => {
                                    onViewOffers(item);
                                    handleClose();
                                }}
                                className="px-4 py-2.5 rounded-xl"
                                style={{
                                    backgroundColor:
                                        theme.primary,
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="View wholesaler offers"
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    View Offers
                                </Text>
                            </Pressable>
                        ) : null}
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
    saved,
}: {
    offer: RetailerOutOfStockWholesalerOffer;
    saved: boolean;
}) {
    const { theme } = useAuth();
    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';
    const subBg = theme.isDarkMode ? '#0f172a' : '#f8fafc';

    const thumb = resolveImage(offer.images?.[0]) ?? null;

    const unitPrice =
        offer.final_unit_selling_price ||
        offer.unit_selling_price ||
        '0.00';

    const hasDiscount =
        !!offer.discount_unit_selling_price &&
        offer.discount_unit_selling_price !== '0.00';

    return (
        <View
            className="flex-row items-center rounded-xl border p-2.5 mb-2"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <View
                className="w-[52px] h-[52px] rounded-[10px] mr-3 items-center justify-center overflow-hidden"
                style={{
                    backgroundColor: subBg,
                    flexShrink: 0,
                }}
            >
                {thumb ? (
                    <Image
                        source={{ uri: thumb }}
                        style={{ width: 52, height: 52 }}
                        resizeMode="cover"
                    />
                ) : (
                    <Text
                        style={{ fontSize: 20, opacity: 0.4 }}
                    >
                        🏭
                    </Text>
                )}
            </View>

            <View className="flex-1 min-w-0">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 14,
                    }}
                    numberOfLines={1}
                >
                    {offer.title ||
                        offer.product_title ||
                        'Untitled offer'}
                </Text>
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                    numberOfLines={1}
                >
                    {offer.manufacturer_title ||
                        'Unknown supplier'}
                </Text>

                <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                    <MiniBadge
                        label={`${offer.current_unit_quantity} in stock`}
                    />
                    <MiniBadge label={offer.unit_of_receipt} />
                    {saved ? (
                        <MiniBadge label="On indent" />
                    ) : null}
                </View>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 13,
                    }}
                >
                    KES {formatKES(unitPrice)}
                </Text>
                {hasDiscount ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontSize: 10,
                            marginTop: 2,
                            textDecorationLine:
                                'line-through',
                            opacity: 0.7,
                        }}
                    >
                        KES{' '}
                        {formatKES(
                            offer.unit_selling_price
                        )}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function SummaryCell({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
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

function MiniBadge({ label }: { label: string }) {
    const { theme } = useAuth();
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: theme.isDarkMode
                    ? '#0f172a'
                    : '#f8fafc',
                borderColor: theme.isDarkMode
                    ? '#334155'
                    : '#e2e8f0',
            }}
        >
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
        </View>
    );
}