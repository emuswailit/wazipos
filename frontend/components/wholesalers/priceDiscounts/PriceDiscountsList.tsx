// components/wholesalers/priceDiscounts/PriceDiscountsList.tsx
//
// Wholesaler price discounts (percent off a stock item for a date range).
// Shared list kit: cards on phones, a table on wide screens. Offline-first:
// opens from the copy saved on this device and refreshes when online
// (hooks/useCachedList). Creating / editing needs a connection.

import api from '@/api/wholesalersApi';
import { useAlert } from '@/components/common/AlertProvider';
import { AdminListView, type AdminListConfig } from '@/components/common/listScreen';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import PriceDiscountDetailsModal from './PriceDiscountDetailsModal';
import PriceDiscountEditModal from './PriceDiscountEditModal';
import { discountStatus, effectivePrices, fmtDate, type PriceDiscount } from './types';

type Filter = 'ALL' | 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';

const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const TONE = { ACTIVE: 'success', SCHEDULED: 'info', EXPIRED: 'warning', INACTIVE: 'neutral' } as const;
const LABEL = { ACTIVE: 'Running', SCHEDULED: 'Scheduled', EXPIRED: 'Ended', INACTIVE: 'Off' } as const;
const productOf = (d: PriceDiscount) => d.product_title || d.wholesaler_receipt_title || 'Stock item';

const config: AdminListConfig<PriceDiscount> = {
    title: 'Price discounts',
    noun: ['discount', 'discounts'],
    icon: 'pricetag-outline',
    searchPlaceholder: 'Search product or discount…',
    addLabel: 'New discount',
    emptyTitle: 'No price discounts',
    emptyMessage: 'Put a stock item on offer: a percentage off for the dates you choose.',
    keyOf: (d) => d.id,
    titleOf: productOf,
    subtitleOf: (d) => [d.title, `${fmtDate(d.start)} – ${fmtDate(d.end)}`].filter(Boolean).join(' · '),
    avatarOf: (d) => ({ icon: 'pricetag-outline', uri: d.price_discount_banners?.[0]?.thumbnail || d.price_discount_banners?.[0]?.price_discount_banner || undefined }),
    badgesOf: (d) => {
        const s = discountStatus(d).label;
        return [{ label: LABEL[s], tone: TONE[s] }];
    },
    metricOf: (d) => {
        const { normal, offer } = effectivePrices(d);
        return { value: `${Number(d.percent || 0)}% off`, label: Number(offer) > 0 ? `${kes(offer)} (was ${kes(normal)})` : 'off' };
    },
    primaryColumn: { label: 'Product', flex: 2 },
    columns: [
        { key: 'off', label: 'Off', flex: 0.6, render: (d) => `${Number(d.percent || 0)}%` },
        { key: 'was', label: 'Was', flex: 0.9, align: 'right', render: (d) => kes(effectivePrices(d).normal) },
        { key: 'now', label: 'Offer', flex: 0.9, align: 'right', render: (d) => kes(effectivePrices(d).offer) },
        { key: 'dates', label: 'Runs', flex: 1.4, render: (d) => `${fmtDate(d.start)} – ${fmtDate(d.end)}` },
        { key: 'status', label: 'Status', flex: 0.9, render: (d) => LABEL[discountStatus(d).label] },
    ],
};

export default function PriceDiscountsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const list = useCachedList<PriceDiscount>({
        key: 'wholesaler_price_discounts',
        fetch: () => api.wholesaleReceiptsAction({ action: 'WholesalerPriceDiscounts' } as any),
        pick: (d) => d?.price_discounts ?? d?.discounts ?? d?.results,
    });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [detailsId, setDetailsId] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState<PriceDiscount | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: list.items.length };
        for (const d of list.items) c[discountStatus(d).label] = (c[discountStatus(d).label] ?? 0) + 1;
        return c;
    }, [list.items]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((d) => filter === 'ALL' || discountStatus(d).label === filter)
            .filter((d) => !q || `${productOf(d)} ${d.title ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => String(b.start).localeCompare(String(a.start)));
    }, [list.items, filter, query]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    const needOnline = (what: string) => {
        if (list.isOnline) return true;
        alert('You’re offline', `${what} needs an internet connection. Your discounts are still shown from this device.`);
        return false;
    };

    return (
        <>
            <AdminListView<PriceDiscount, Filter>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={list.refresh}
                refreshing={list.refreshing}
                sourceLabel={list.sourceLabel}
                sourceTone={list.source}
                lastSyncedTime={list.lastSynced}
                error={list.error}
                {...paged}
                onOpenCreate={() => needOnline('Creating a discount') && setCreateOpen(true)}
                onPressItem={(d) => setDetailsId(d.id)}
                rowActions={(d) => [
                    { icon: 'eye-outline', label: 'View', onPress: () => setDetailsId(d.id), tone: 'primary' },
                    { icon: 'create-outline', label: 'Edit', onPress: () => needOnline('Editing a discount') && setEditTarget(d) },
                ]}
                stats={[
                    { label: 'Running', value: String(counts.ACTIVE ?? 0), color: counts.ACTIVE ? '#10b981' : undefined },
                    { label: 'Scheduled', value: String(counts.SCHEDULED ?? 0) },
                    { label: 'Ended', value: String(counts.EXPIRED ?? 0) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: counts.ALL },
                        { key: 'ACTIVE', label: 'Running', icon: 'flash-outline', count: counts.ACTIVE ?? 0 },
                        { key: 'SCHEDULED', label: 'Scheduled', icon: 'calendar-outline', count: counts.SCHEDULED ?? 0 },
                        { key: 'EXPIRED', label: 'Ended', icon: 'time-outline', count: counts.EXPIRED ?? 0 },
                        { key: 'INACTIVE', label: 'Off', icon: 'pause-circle-outline', count: counts.INACTIVE ?? 0 },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
            />

            <PriceDiscountDetailsModal
                visible={detailsId !== null}
                discountId={detailsId ?? undefined}
                onClose={() => setDetailsId(null)}
                onEdit={(d) => {
                    setDetailsId(null);
                    if (needOnline('Editing a discount')) setEditTarget(d);
                }}
            />
            <PriceDiscountEditModal
                visible={createOpen || editTarget !== null}
                discount={editTarget}
                onClose={() => {
                    setCreateOpen(false);
                    setEditTarget(null);
                }}
                onSaved={async () => {
                    setCreateOpen(false);
                    setEditTarget(null);
                    alert('Saved', 'Price discount saved.', undefined, 'success');
                    await list.refresh();
                }}
            />
        </>
    );
}
