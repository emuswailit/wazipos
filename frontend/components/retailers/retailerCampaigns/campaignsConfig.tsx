// components/retailers/retailerCampaigns/campaignsConfig.tsx
//
// How a wholesaler campaign (offer) is shown in the retailer's campaign inbox.

import { formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { resolveImageUrl } from '@/lib/images';

import type { Campaign } from './types';

function campaignImage(c: Campaign | null | undefined): string | null {
    const first: any = c?.campaign_banners?.[0];
    return resolveImageUrl(first?.thumbnail ?? first?.campaign_banner ?? null);
}

function campaignWindow(c: Campaign): string {
    if (!c.start && !c.end) return '';
    return `${formatDate(c.start)} → ${formatDate(c.end)}`;
}

/** Whole days until the campaign ends (null when no end date). */
export function daysLeft(c: Campaign): number | null {
    if (!c.end) return null;
    const end = new Date(String(c.end).replace(' ', 'T'));
    if (isNaN(end.getTime())) return null;
    return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

function campaignBadges(c: Campaign): AdminBadge[] {
    const badges: AdminBadge[] = [];
    const d = daysLeft(c);
    if (d !== null && d >= 0 && d <= 3) badges.push({ label: d === 0 ? 'Ends today' : `${d} day${d === 1 ? '' : 's'} left`, tone: 'warning', icon: 'hourglass-outline' });
    else badges.push({ label: 'Live', tone: 'success' });
    if (c.discount_summary) badges.push({ label: c.discount_summary, tone: 'violet', icon: 'pricetags-outline' });
    return badges;
}

export const campaignsConfig: AdminListConfig<Campaign> = {
    title: 'Campaigns',
    noun: ['campaign', 'campaigns'],
    icon: 'megaphone-outline',
    searchPlaceholder: 'Search campaigns or wholesalers…',
    emptyTitle: 'No live campaigns',
    emptyMessage: 'Offers from your wholesalers show up here while they run.',
    keyOf: (c, i) => `${c.id || 'campaign'}-${i}`,
    titleOf: (c) => textOr(c.title, 'Untitled campaign'),
    subtitleOf: (c) => [textOr(c.entity_title, ''), textOr(c.description, '')].filter(Boolean).join(' · ') || null,
    avatarOf: (c) => ({ uri: campaignImage(c), icon: 'megaphone-outline', label: c.title }),
    badgesOf: campaignBadges,
    metricOf: (c) => (typeof c.item_count === 'number' ? { value: String(c.item_count), label: c.item_count === 1 ? 'item' : 'items' } : null),
    metaOf: (c) => campaignWindow(c) || null,
    metaIcon: 'calendar-outline',
    primaryColumn: { label: 'Campaign', flex: 3 },
    columns: [
        { key: 'wholesaler', label: 'Wholesaler', flex: 1.6, render: (c) => textOr(c.entity_title) },
        { key: 'deal', label: 'Deal', flex: 1.8, render: (c) => textOr(c.discount_summary) },
        { key: 'window', label: 'Runs', flex: 1.8, render: (c) => campaignWindow(c) || '—' },
    ],
};
