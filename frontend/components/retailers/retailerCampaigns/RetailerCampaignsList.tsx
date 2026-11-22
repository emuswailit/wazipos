// components/retailers/retailerCampaigns/RetailerCampaignsList.tsx
//
// Retailer campaign inbox — container.
//   1. Owns the list data (useRetailerCampaigns, live campaigns only).
//   2. Owns search + paging (wide screens page; phones show the whole list).
//   3. Owns the detail modal's open/close state.
//   4. Picks the table (wide) or cards (phones / narrow web) by window width.

import campaignsApi from '@/api/campaignsApi';
import type { Campaign } from '@/campaigns/types';
import { DetailsDock } from '@/components/common/listScreen';
import { useCachedList } from '@/hooks/useCachedList';
import type { PageSize } from '@/components/common/PaginationBar';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import RetailerCampaignDetailModal from './RetailerCampaignDetailModal';
import { useRetailerCampaigns } from './retailerCampaigns';
import RetailerCampaignsMobileView from './RetailerCampaignsMobileView';
import RetailerCampaignsWebView from './RetailerCampaignsWebView';
import type { UUID } from './types';

const LARGE_SCREEN_MIN_WIDTH = 900;

export default function RetailerCampaignsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [openId, setOpenId] = useState<UUID | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    // The inbox shows only campaigns running today. Saved on this device, refreshed when online.
    const list = useCachedList<Campaign>({
        key: 'retailer_campaign_inbox',
        fetch: () => campaignsApi.getMyCampaignsAction({ active_only: true } as any),
        pick: (d) => {
            if (!d) return [];
            if (Array.isArray(d.results)) return d.results;
            const found = Object.entries(d).find(([k, v]) => !['response_code', 'response_message', 'errors'].includes(k) && (Array.isArray(v) || (v && typeof v === 'object' && Array.isArray((v as any).results))));
            const v: any = found?.[1];
            return Array.isArray(v) ? v : v?.results ?? [];
        },
    });
    const campaigns = list.items;
    const isLoading = list.loading;
    const error = list.error;
    const refresh = list.refresh;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return campaigns;
        return campaigns.filter((c) =>
            [c.title, c.entity_title, c.description, c.discount_summary].some((v) => String(v ?? '').toLowerCase().includes(q))
        );
    }, [campaigns, query]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => setPage(1), [query, pageSize]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    const viewProps = {
        campaigns: paginated,
        allCampaigns: filtered,
        totalCampaigns: campaigns.length,
        isLoading,
        error,
        refreshing: list.refreshing,
        onRefresh: refresh,
        sourceLabel: list.sourceLabel,
        sourceTone: list.source,
        lastSyncedTime: list.lastSynced,
        onOpen: (id: UUID) => setOpenId(id),
        query,
        setQuery,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => {
            setPageSize(size);
            setPage(1);
        },
    };

    return (
        <>
            {/* Offer details: beside the list on wide screens, a sheet on phones. Mounted once and
                toggled by `visible` so its fetch state resets on open. */}
            <DetailsDock
                placeholder="Pick an offer to see its products and opt in."
                pane={<RetailerCampaignDetailModal visible={!!openId} campaignId={openId} onClose={() => setOpenId(undefined)} onChanged={refresh} />}
            >
                {isLarge ? <RetailerCampaignsWebView {...viewProps} /> : <RetailerCampaignsMobileView {...viewProps} />}
            </DetailsDock>
        </>
    );
}
