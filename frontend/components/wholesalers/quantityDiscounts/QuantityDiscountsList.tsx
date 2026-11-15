// components/wholesalers/quantityDiscounts/QuantityDiscountsList.tsx
//
// Wholesaler quantity discounts ("buy 10 get 1 free" on a stock item for a
// date range). Shared list kit: cards on phones, a table on wide screens.
// Offline-first: opens from the copy saved on this device and refreshes when
// online (hooks/useCachedList). Creating / editing needs a connection.

import api from '@/api/wholesalersApi';
import { useAlert } from '@/components/common/AlertProvider';
import { AdminListView, type AdminListConfig } from '@/components/common/listScreen';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import QuantityDiscountDetailsModal from './QuantityDiscountDetailsModal';
import QuantityDiscountEditModal from './QuantityDiscountEditModal';
import { bonusLabel, bonusPercent, discountStatus, fmtDate, type QuantityDiscount } from './types';

type Filter = 'ALL' | 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';

const TONE = { ACTIVE: 'success', SCHEDULED: 'info', EXPIRED: 'warning', INACTIVE: 'neutral' } as const;
const LABEL = { ACTIVE: 'Running', SCHEDULED: 'Scheduled', EXPIRED: 'Ended', INACTIVE: 'Off' } as const;
const productOf = (d: QuantityDiscount) => d.product_title || d.wholesaler_receipt_title || 'Stock item';
const pct = (d: QuantityDiscount) => `${Math.round(bonusPercent(Number(d.limit_quantity) || 0, Number(d.awarded_quantity) || 0))}% free`;

const config: AdminListConfig<QuantityDiscount> = {
    title: 'Quantity discounts',
    noun: ['offer', 'offers'],
    icon: 'gift-outline',
    searchPlaceholder: 'Search product or offer…',
    addLabel: 'New offer',
    emptyTitle: 'No quantity offers',
    emptyMessage: 'Reward bigger orders: e.g. buy 10, get 1 free, for the dates you choose.',
    keyOf: (d) => d.id,
    titleOf: productOf,
    subtitleOf: (d) => [d.title, `${fmtDate(d.start)} – ${fmtDate(d.end)}`].filter(Boolean).join(' · '),
    avatarOf: (d) => ({ icon: 'gift-outline', uri: d.quantity_discount_banners?.[0]?.thumbnail || d.quantity_discount_banners?.[0]?.quantity_discount_banner || undefined }),
    badgesOf: (d) => {
        const s = discountStatus(d).label;
        return [{ label: LABEL[s], tone: TONE[s] }];
    },
    metricOf: (d) => ({ value: bonusLabel(d), label: pct(d) }),
    primaryColumn: { label: 'Product', flex: 2 },
    columns: [
        { key: 'offer', label: 'Offer', flex: 1.3, render: bonusLabel },
        { key: 'share', label: 'Free share', flex: 0.8, render: pct },
        { key: 'dates', label: 'Runs', flex: 1.4, render: (d) => `${fmtDate(d.start)} – ${fmtDate(d.end)}` },
        { key: 'status', label: 'Status', flex: 0.9, render: (d) => LABEL[discountStatus(d).label] },
    ],
};

export default function QuantityDiscountsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const list = useCachedList<QuantityDiscount>({
        key: 'wholesaler_quantity_discounts',
        fetch: () => api.wholesaleReceiptsAction({ action: 'WholesalerQuantityDiscounts' } as any),
        pick: (d) => d?.quantity_discounts ?? d?.discounts ?? d?.results,
    });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [detailsId, setDetailsId] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState<QuantityDiscount | null>(null);
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
        alert('You’re offline', `${what} needs an internet connection. Your offers are still shown from this device.`);
        return false;
    };

    return (
        <>
            <AdminListView<QuantityDiscount, Filter>
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
                onOpenCreate={() => needOnline('Creating an offer') && setCreateOpen(true)}
                onPressItem={(d) => setDetailsId(d.id)}
                rowActions={(d) => [
                    { icon: 'eye-outline', label: 'View', onPress: () => setDetailsId(d.id), tone: 'primary' },
                    { icon: 'create-outline', label: 'Edit', onPress: () => needOnline('Editing an offer') && setEditTarget(d) },
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

            <QuantityDiscountDetailsModal
                visible={detailsId !== null}
                discountId={detailsId ?? undefined}
                onClose={() => setDetailsId(null)}
                onEdit={(d) => {
                    setDetailsId(null);
                    if (needOnline('Editing an offer')) setEditTarget(d);
                }}
            />
            <QuantityDiscountEditModal
                visible={createOpen || editTarget !== null}
                discount={editTarget}
                onClose={() => {
                    setCreateOpen(false);
                    setEditTarget(null);
                }}
                onSaved={async () => {
                    setCreateOpen(false);
                    setEditTarget(null);
                    alert('Saved', 'Quantity offer saved.', undefined, 'success');
                    await list.refresh();
                }}
            />
        </>
    );
}
