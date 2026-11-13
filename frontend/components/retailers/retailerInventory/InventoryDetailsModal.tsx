// components/retailers/retailerInventory/InventoryDetailsModal.tsx
//
// Inventory item (retailer receipt) details on the shared details sheet:
// stock, expiry, batch, supplier and pricing, with Edit.

import { AdminDetailsSheet, formatDate, textOr, useListTokens } from '@/components/common/listScreen';
import { resolveImageUrl } from '@/lib/images';
import React from 'react';
import { Text, View } from 'react-native';

import { expiryLabel, formatKES, isExpired, preparationTitle, productTitle } from './RetailerInventoryWebView';

interface InventoryDetailsModalProps {
    item: any | null;
    onClose: () => void;
    onEdit?: (item: any) => void;
}

export function InventoryDetailsModal({ item, onClose, onEdit }: InventoryDetailsModalProps) {
    if (!item) {
        return <AdminDetailsSheet visible={false} onClose={onClose} heading="" icon="cube-outline" title="" sections={[]} />;
    }

    const expired = isExpired(item);
    const expiring = !expired && (item.expiry_status === 'EXPIRING' || item.expiry_status === 'EXPIRING_SOON');
    const qty = Number(item.current_unit_quantity ?? 0);
    const received = Number(item.received_unit_quantity ?? 0);
    const sell = parseFloat(item.unit_selling_price || '0');
    const final = parseFloat(item.final_unit_selling_price || '0');
    const hasDiscount = Number.isFinite(final) && final > 0 && final < sell;
    const stockValue = qty * (Number.isFinite(final) && final > 0 ? final : sell);
    const daysToExpiry = item.days_to_expiry === null || item.days_to_expiry === undefined ? null : Number(item.days_to_expiry);

    return (
        <AdminDetailsSheet
            visible={!!item}
            onClose={onClose}
            heading="Stock item"
            icon="cube-outline"
            title={productTitle(item)}
            subtitle={preparationTitle(item) || textOr(item.manufacturer_title, '') || null}
            avatar={{ uri: resolveImageUrl(item.thumbnail_url || item.image_url || item.images?.[0]), icon: 'cube-outline', label: productTitle(item) }}
            badges={[
                expired
                    ? { label: 'Expired', tone: 'danger', icon: 'close-circle' }
                    : expiring
                        ? { label: expiryLabel(item), tone: 'warning', icon: 'hourglass-outline' }
                        : { label: expiryLabel(item), tone: 'success' },
                ...(qty <= 0 ? [{ label: 'Out of stock', tone: 'danger' as const }] : []),
            ]}
            stats={[
                { label: 'In stock', value: qty.toLocaleString(), color: qty <= 0 ? '#f43f5e' : undefined },
                { label: 'Received', value: received.toLocaleString() },
                { label: 'Stock value', value: `KES ${formatKES(stockValue)}` },
            ]}
            sections={[
                {
                    title: 'Batch & expiry',
                    icon: 'calendar-outline',
                    fields: [
                        { label: 'Batch', value: textOr(item.batch, ''), mono: true },
                        { label: 'Barcode', value: textOr(item.bar_code, ''), mono: true },
                        { label: 'Manufactured', value: formatDate(item.manufacture_date) },
                        { label: 'Expires', value: formatDate(item.expiry_date) },
                        { label: 'Days left', value: daysToExpiry === null ? '' : daysToExpiry.toLocaleString() },
                        { label: 'Units per pack', value: String(item.units_per_pack ?? 1) },
                    ],
                },
                {
                    title: 'Supplier',
                    icon: 'business-outline',
                    fields: [
                        { label: 'Received from', value: textOr(item.received_from_title, '') },
                        { label: 'Manufacturer', value: textOr(item.manufacturer_title, '') },
                        { label: 'Country of origin', value: textOr(item.origin_country_title, '') },
                    ],
                },
                {
                    title: 'Pricing',
                    icon: 'pricetag-outline',
                    children: (
                        <PriceBlock
                            buying={item.unit_buying_price ? `KES ${formatKES(item.unit_buying_price)}` : '—'}
                            selling={`KES ${formatKES(sell)}`}
                            final={hasDiscount ? `KES ${formatKES(final)}` : null}
                            stockValue={`KES ${formatKES(stockValue)}`}
                        />
                    ),
                },
            ]}
            onEdit={onEdit ? () => (onClose(), onEdit(item)) : undefined}
            editLabel="Edit item"
        />
    );
}

function PriceBlock({ buying, selling, final, stockValue }: { buying: string; selling: string; final: string | null; stockValue: string }) {
    const { theme, chipBg, divider } = useListTokens();
    const Row = ({ label, value, color, strike }: { label: string; value: string; color?: string; strike?: boolean }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13, textDecorationLine: strike ? 'line-through' : 'none' }}>{value}</Text>
        </View>
    );
    return (
        <View style={{ borderRadius: 16, padding: 14, gap: 6, backgroundColor: chipBg }}>
            <Row label="Buying price (per unit)" value={buying} />
            <Row label="Selling price (per unit)" value={selling} strike={!!final} color={final ? theme.textDark : undefined} />
            {final ? <Row label="Discounted price" value={final} color="#10b981" /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: divider }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Stock value</Text>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 16 }}>{stockValue}</Text>
            </View>
        </View>
    );
}
