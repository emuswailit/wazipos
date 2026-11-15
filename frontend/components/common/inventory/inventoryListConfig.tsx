// components/common/inventory/inventoryListConfig.tsx
//
// One list design for both inventories (retailer stock receipts, wholesaler
// receipts): cards on phones, a table on wide screens (shared AdminListView).

import { AdminBadgePill, CellText, type AdminListConfig, useListTokens } from '@/components/common/listScreen';
import React from 'react';
import { Text, View } from 'react-native';

import {
    expiryBadge,
    expiryRelative,
    formatDate,
    formatKES,
    healthColor,
    inventoryBadges,
    itemImageUrl,
    preparationTitle,
    productTitle,
    stockBadge,
    stockQty,
    stockValue,
    syncBadge,
    unitPrice,
} from './inventoryHelpers';

const keyOf = (r: any, i: number) => String(r?.remote_id || r?.draft_id || r?.id || `row-${i}`);

/** Quantity with a thin health bar (relative to what was received). */
function StockCell({ item }: { item: any }) {
    const { theme, chipBg } = useListTokens();
    const qty = stockQty(item);
    const received = Math.max(qty, Number(item?.received_unit_quantity) || 0);
    const pct = received > 0 ? Math.min(1, qty / received) : 0;
    const color = healthColor(item);
    return (
        <View style={{ gap: 4, alignItems: 'flex-end' }}>
            <Text style={{ color: qty > 0 ? theme.text : '#f43f5e', fontFamily: theme.font.bold, fontSize: 13 }}>
                {qty.toLocaleString()}
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}> {String(item?.unit_of_receipt || 'units').toLowerCase()}</Text>
            </Text>
            <View style={{ width: 64, height: 4, borderRadius: 2, backgroundColor: chipBg, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(pct * 100)}%`, height: 4, backgroundColor: color }} />
            </View>
        </View>
    );
}

function StatusCell({ item }: { item: any }) {
    const extra = [stockBadge(item), syncBadge(item)].filter(Boolean);
    return (
        <View style={{ gap: 4 }}>
            <AdminBadgePill badge={expiryBadge(item)} />
            {extra.map((b: any) => (
                <AdminBadgePill key={b.label} badge={b} />
            ))}
        </View>
    );
}

export function buildInventoryConfig(opts: { title: string; addLabel?: string; emptyMessage: string; showBuyingPrice?: boolean }): AdminListConfig<any> {
    return {
        title: opts.title,
        noun: ['item', 'items'],
        icon: 'cube-outline',
        searchPlaceholder: 'Search product, barcode, batch, supplier…',
        addLabel: opts.addLabel,
        emptyTitle: 'No stock yet',
        emptyMessage: opts.emptyMessage,
        keyOf,
        titleOf: productTitle,
        subtitleOf: (r) =>
            [preparationTitle(r), r?.batch ? `Batch ${r.batch}` : null, r?.bar_code || null].filter(Boolean).join(' · ') || null,
        avatarOf: (r) => ({ uri: itemImageUrl(r), label: productTitle(r), icon: 'cube-outline' }),
        badgesOf: inventoryBadges,
        metaOf: (r) => (r?.expiry_date ? `Expires ${formatDate(r.expiry_date)}` : null),
        metaIcon: 'calendar-outline',
        metricOf: (r) => ({
            value: `${stockQty(r).toLocaleString()} ${String(r?.unit_of_receipt || '').toLowerCase()}`.trim(),
            label: `KES ${formatKES(unitPrice(r))} each`,
            color: healthColor(r),
        }),
        primaryColumn: { label: 'Product', flex: 3 },
        columns: [
            { key: 'batch', label: 'Batch', flex: 1.1, render: (r) => r?.batch || '—' },
            {
                key: 'expiry',
                label: 'Expiry',
                flex: 1.3,
                render: (r) => (
                    <View>
                        <CellText strong>{formatDate(r?.expiry_date)}</CellText>
                        {expiryRelative(r) ? <CellText>{expiryRelative(r)}</CellText> : null}
                    </View>
                ),
            },
            { key: 'stock', label: 'Stock', flex: 1.1, align: 'right', render: (r) => <StockCell item={r} /> },
            ...(opts.showBuyingPrice
                ? [{ key: 'buy', label: 'Buying', flex: 1, align: 'right' as const, render: (r: any) => <CellText align="right">{formatKES(r?.unit_buying_price)}</CellText> }]
                : []),
            { key: 'price', label: 'Selling', flex: 1, align: 'right', render: (r) => <CellText strong align="right">{formatKES(unitPrice(r))}</CellText> },
            { key: 'value', label: 'Value', flex: 1.1, align: 'right', render: (r) => <CellText align="right">{formatKES(stockValue(r))}</CellText> },
            { key: 'status', label: 'Status', flex: 1.4, render: (r) => <StatusCell item={r} /> },
        ],
    };
}
