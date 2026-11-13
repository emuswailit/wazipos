// components/retailers/stockOuts/OutOfStockDetailsModal.tsx
//
// Out-of-stock request details (shared list-screen details sheet): what's needed,
// for whom, and the wholesaler offers — marking ones already on the open indent.

import { AdminBadgePill, AdminDetailsSheet, SheetButton, formatDateTime, textOr, useListTokens, useSheetIsWide } from '@/components/common/listScreen';
import ImageWithFallback from '@/components/common/ImageWithFallback';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { RetailerIndentItem, RetailerOutOfStockNormalized, RetailerOutOfStockWholesalerOffer } from '@/databases/types';
import { resolveImageUrl } from '@/lib/images';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { formatKES, stockOutImageUrl, stockOutState, stockOutTitle } from './RetailerOutOfStocksWebView';

interface OutOfStockDetailsModalProps {
    item: RetailerOutOfStockNormalized | null;
    onClose: () => void;
    onViewOffers?: (item: RetailerOutOfStockNormalized) => void;
    onEdit?: (item: RetailerOutOfStockNormalized) => void;
}

const STATE_BADGE = {
    pending: { label: 'Waiting', tone: 'warning' as const },
    ordered: { label: 'Ordered', tone: 'neutral' as const },
    draft: { label: 'Not uploaded', tone: 'info' as const, icon: 'cloud-upload-outline' as const },
};

export function OutOfStockDetailsModal({ item, onClose, onViewOffers, onEdit }: OutOfStockDetailsModalProps) {
    const wide = useSheetIsWide();
    const { currentOpenIndent } = useRetailerIndentsSync();

    // Offers already on the open indent (matched by wholesale receipt).
    const savedOfferIds = useMemo(() => {
        const ids = new Set<string>();
        if (!item || !currentOpenIndent) return ids;
        const lines: RetailerIndentItem[] = currentOpenIndent.retailer_indent_items ?? [];
        for (const o of item.wholesaler_offers ?? []) if (lines.some((l) => l.wholesale_receipt === o.id)) ids.add(o.id);
        return ids;
    }, [item, currentOpenIndent]);

    const offers = item?.wholesaler_offers ?? [];
    const state = item ? stockOutState(item) : 'pending';
    const isDraft = state === 'draft';
    const customer = [item?.customer_name, item?.customer_phone].filter(Boolean).join(' · ');

    return (
        <AdminDetailsSheet
            visible={!!item}
            onClose={onClose}
            heading="Out of stock"
            icon="alert-circle-outline"
            title={item ? stockOutTitle(item) : ''}
            subtitle={[item?.unit_of_receipt, item?.units_per_pack ? `${item.units_per_pack} per pack` : ''].filter(Boolean).join(' · ') || null}
            avatar={{ uri: item ? stockOutImageUrl(item) : null, icon: 'cube-outline', label: item?.product_title }}
            badges={[STATE_BADGE[state], ...(item?.is_special_order ? [{ label: 'Special order', tone: 'violet' as const, icon: 'star' as const }] : [])]}
            stats={[
                { label: 'Needed', value: Number(item?.required_quantity ?? 0).toLocaleString() },
                { label: 'Offers', value: String(offers.length), color: offers.length ? '#10b981' : undefined },
                { label: 'On indent', value: String(savedOfferIds.size) },
            ]}
            sections={[
                {
                    title: 'Customer',
                    icon: 'person-outline',
                    fields: [
                        { label: 'Who asked', value: customer || 'Walk-in customer', full: true },
                        { label: 'Recorded', value: formatDateTime(item?.created) },
                    ],
                },
                {
                    title: `Wholesaler offers (${offers.length})`,
                    icon: 'pricetags-outline',
                    children: <OfferList offers={offers} saved={savedOfferIds} />,
                },
            ]}
            actions={
                item && offers.length > 0 && onViewOffers && !isDraft ? (
                    <SheetButton label="View offers" icon="pricetags-outline" variant={onEdit ? 'secondary' : 'primary'} onPress={() => (onClose(), onViewOffers(item))} grow={!wide} />
                ) : null
            }
            onEdit={item && onEdit ? () => (onClose(), onEdit(item)) : undefined}
            editLabel="Edit"
        />
    );
}

function OfferList({ offers, saved }: { offers: RetailerOutOfStockWholesalerOffer[]; saved: Set<string> }) {
    const { theme, chipBg, border } = useListTokens();
    if (offers.length === 0) {
        return (
            <View className="rounded-2xl items-center px-4 py-6 border" style={{ borderColor: border, borderStyle: 'dashed' }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>No wholesaler offers yet.</Text>
            </View>
        );
    }
    return (
        <View style={{ gap: 8 }}>
            {offers.map((o) => {
                const price = o.final_unit_selling_price || o.unit_selling_price || '0';
                const discounted = !!o.discount_unit_selling_price && o.discount_unit_selling_price !== '0.00';
                const img: any = o.images?.[0];
                return (
                    <View key={o.id} className="flex-row items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: chipBg }}>
                        <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden' }}>
                            <ImageWithFallback uri={resolveImageUrl(img?.thumbnail || img?.image || img)} width={44} height={44} borderRadius={12} fallback="🏭" fallbackSize={18} />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>
                                {o.title || o.product_title || 'Untitled offer'}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                {textOr(o.manufacturer_title, 'Unknown supplier')} · {Number(o.current_unit_quantity ?? 0).toLocaleString()} in stock
                            </Text>
                            {saved.has(o.id) ? (
                                <View style={{ marginTop: 4 }}>
                                    <AdminBadgePill badge={{ label: 'On your indent', tone: 'success', icon: 'checkmark-circle' }} />
                                </View>
                            ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>KES {formatKES(price)}</Text>
                            {discounted ? (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, textDecorationLine: 'line-through' }}>
                                    KES {formatKES(o.unit_selling_price)}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}
