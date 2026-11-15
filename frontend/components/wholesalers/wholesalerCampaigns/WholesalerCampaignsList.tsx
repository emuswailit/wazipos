// components/wholesalers/wholesalerCampaigns/WholesalerCampaignsList.tsx
//
// Wholesaler campaigns: a set of discounted products sent to chosen retailers.
// Shared list kit: cards on phones, a table on wide screens. Offline-first:
// opens from the copy saved on this device and refreshes when online
// (hooks/useCachedList). Creating, building and publishing need a connection.
//
//   Draft  -> build (products, retailers, discounts) -> Published -> Closed
//   The details sheet runs the status changes; the builder edits drafts.

import campaignsApi from '@/api/campaignsApi';
import type { Campaign, CampaignStatus, UUID } from '@/campaigns/types';
import { useAlert } from '@/components/common/AlertProvider';
import { AdminListView, type AdminListConfig } from '@/components/common/listScreen';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import WholesalerCampaignBuilderModal from './WholesalerCampaignBuilderModal';
import WholesalerCampaignDetailsModal from './WholesalerCampaignDetailsModal';
import WholesalerCampaignEditModal from './WholesalerCampaignEditModal';

type Filter = 'ALL' | 'LIVE' | CampaignStatus;

const STATUS: Record<CampaignStatus, { label: string; tone: 'neutral' | 'success' | 'info' | 'danger' }> = {
    DRAFT: { label: 'Draft', tone: 'neutral' },
    PUBLISHED: { label: 'Published', tone: 'info' },
    CLOSED: { label: 'Closed', tone: 'neutral' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const runs = (c: Campaign) => c.duration?.display || (c.start && c.end ? `${fmt(c.start)} – ${fmt(c.end)}` : '—');
const counts = (c: Campaign) =>
    [c.item_count != null ? `${c.item_count} product${c.item_count === 1 ? '' : 's'}` : null, c.audience_count != null ? `${c.audience_count} retailer${c.audience_count === 1 ? '' : 's'}` : null]
        .filter(Boolean)
        .join(' · ');

const config: AdminListConfig<Campaign> = {
    title: 'Campaigns',
    noun: ['campaign', 'campaigns'],
    icon: 'megaphone-outline',
    searchPlaceholder: 'Search campaigns…',
    addLabel: 'New campaign',
    emptyTitle: 'No campaigns yet',
    emptyMessage: 'Bundle discounted products and send them to the retailers you choose.',
    keyOf: (c) => c.id,
    titleOf: (c) => c.title || 'Untitled campaign',
    subtitleOf: (c) => [c.discount_summary, runs(c), counts(c)].filter(Boolean).join(' · '),
    avatarOf: (c) => ({ icon: 'megaphone-outline', uri: c.campaign_banners?.[0]?.thumbnail || c.campaign_banners?.[0]?.campaign_banner || undefined }),
    badgesOf: (c) => [
        { label: STATUS[c.status]?.label ?? c.status_display ?? c.status, tone: STATUS[c.status]?.tone ?? 'neutral' },
        ...(c.is_currently_active ? [{ label: 'Live now', tone: 'success' as const, icon: 'radio-outline' as const }] : []),
    ],
    metaOf: (c) => (c.updated ? `Updated ${fmt(c.updated)}` : null),
    metaIcon: 'time-outline',
    metricOf: (c) => (Number(c.budget_cap) > 0 ? { value: kes(c.budget_cap), label: 'budget' } : null),
    primaryColumn: { label: 'Campaign', flex: 2 },
    columns: [
        { key: 'offer', label: 'Offer', flex: 1.6, render: (c) => c.discount_summary || '—' },
        { key: 'runs', label: 'Runs', flex: 1.3, render: runs },
        { key: 'reach', label: 'Reach', flex: 1.2, render: (c) => counts(c) || '—' },
        { key: 'status', label: 'Status', flex: 0.9, render: (c) => STATUS[c.status]?.label ?? c.status_display ?? c.status },
        { key: 'budget', label: 'Budget', flex: 0.9, align: 'right', render: (c) => (Number(c.budget_cap) > 0 ? kes(c.budget_cap) : '—') },
    ],
};

export default function WholesalerCampaignsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const list = useCachedList<Campaign>({
        key: 'wholesaler_campaigns',
        fetch: () => campaignsApi.getEntityCampaignsAction({}),
        pick: (d) => {
            if (!d) return [];
            if (Array.isArray(d.results)) return d.results;
            const found = Object.entries(d).find(([k, v]) => !['response_code', 'response_message', 'errors'].includes(k) && (Array.isArray(v) || (v && typeof v === 'object' && Array.isArray((v as any).results))));
            const v: any = found?.[1];
            return Array.isArray(v) ? v : v?.results ?? [];
        },
    });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [detailsId, setDetailsId] = useState<UUID | null>(null);
    const [editingMeta, setEditingMeta] = useState<Campaign | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [builderId, setBuilderId] = useState<UUID | null>(null);

    const tally = useMemo(() => {
        const c: Record<string, number> = { ALL: list.items.length, LIVE: 0 };
        for (const x of list.items) {
            c[x.status] = (c[x.status] ?? 0) + 1;
            if (x.is_currently_active) c.LIVE += 1;
        }
        return c;
    }, [list.items]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((c) => filter === 'ALL' || (filter === 'LIVE' ? c.is_currently_active : c.status === filter))
            .filter((c) => !q || `${c.title} ${c.description ?? ''} ${c.discount_summary ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
    }, [list.items, filter, query]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    const needOnline = (what: string) => {
        if (list.isOnline) return true;
        alert('You’re offline', `${what} needs an internet connection. Your campaigns are still shown from this device.`);
        return false;
    };

    return (
        <>
            <AdminListView<Campaign, Filter>
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
                onOpenCreate={() => needOnline('Creating a campaign') && setCreateOpen(true)}
                onPressItem={(c) => (list.isOnline ? setDetailsId(c.id) : needOnline('Opening a campaign'))}
                rowActions={(c) => [
                    { icon: 'eye-outline', label: 'View', onPress: () => needOnline('Opening a campaign') && setDetailsId(c.id), tone: 'primary' },
                    ...(c.status === 'DRAFT'
                        ? [{ icon: 'construct-outline' as const, label: 'Build', onPress: () => needOnline('Building a campaign') && setBuilderId(c.id) }]
                        : []),
                ]}
                stats={[
                    { label: 'Live now', value: String(tally.LIVE), color: tally.LIVE ? '#10b981' : undefined },
                    { label: 'Drafts', value: String(tally.DRAFT ?? 0) },
                    { label: 'Published', value: String(tally.PUBLISHED ?? 0) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: tally.ALL },
                        { key: 'LIVE', label: 'Live now', icon: 'radio-outline', count: tally.LIVE },
                        { key: 'DRAFT', label: 'Drafts', icon: 'document-text-outline', count: tally.DRAFT ?? 0 },
                        { key: 'PUBLISHED', label: 'Published', icon: 'paper-plane-outline', count: tally.PUBLISHED ?? 0 },
                        { key: 'CLOSED', label: 'Closed', icon: 'lock-closed-outline', count: tally.CLOSED ?? 0 },
                        { key: 'CANCELLED', label: 'Cancelled', icon: 'close-circle-outline', count: tally.CANCELLED ?? 0 },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
            />

            {/* Read-only details + status changes */}
            <WholesalerCampaignDetailsModal
                visible={detailsId !== null}
                campaignId={detailsId ?? undefined}
                onClose={() => setDetailsId(null)}
                onChanged={list.refresh}
                onEditMeta={(c) => {
                    setDetailsId(null);
                    setEditingMeta(c);
                }}
                onEditBuilder={(c) => {
                    setDetailsId(null);
                    setBuilderId(c.id);
                }}
            />

            {/* Name, dates, budget — create and edit share the form */}
            <WholesalerCampaignEditModal
                visible={createOpen || editingMeta !== null}
                campaign={editingMeta}
                onClose={() => {
                    setCreateOpen(false);
                    setEditingMeta(null);
                }}
                onSaved={async () => {
                    const wasCreate = createOpen;
                    setCreateOpen(false);
                    setEditingMeta(null);
                    alert('Saved', wasCreate ? 'Campaign created.' : 'Campaign updated.', undefined, 'success');
                    await list.refresh();
                }}
            />

            {/* Products / retailers / discounts — drafts only */}
            <WholesalerCampaignBuilderModal visible={builderId !== null} campaignId={builderId ?? undefined} onClose={() => setBuilderId(null)} onSaved={list.refresh} />
        </>
    );
}
