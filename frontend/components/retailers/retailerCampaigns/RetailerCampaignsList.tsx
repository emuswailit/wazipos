// components/retailers/retailerCampaigns/RetailerCampaignsList.tsx
//
// Retailer campaign inbox — container.
//   1. Owns the list data (useRetailerCampaigns, live campaigns only).
//   2. Owns search + paging (wide screens page; phones show the whole list).
//   3. Owns the detail modal's open/close state.
//   4. Picks the table (wide) or cards (phones / narrow web) by window width.

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

    // The inbox shows only campaigns running today.
    const { campaigns, isLoading, error, refresh } = useRetailerCampaigns({ active_only: true });

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
        refreshing: false,
        onRefresh: refresh,
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
            {isLarge ? <RetailerCampaignsWebView {...viewProps} /> : <RetailerCampaignsMobileView {...viewProps} />}

            {/* Mounted once and toggled by `visible` so its fetch state resets on open. */}
            <RetailerCampaignDetailModal visible={!!openId} campaignId={openId} onClose={() => setOpenId(undefined)} onChanged={refresh} />
        </>
    );
}
