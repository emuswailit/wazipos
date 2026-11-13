// components/retailers/productRequests/productRequestsConfig.tsx
//
// How a product request (a retailer asking wholesalers to supply products it
// can't find) is shown in lists.

import { CellText, formatDate, textOr, type AdminBadge, type AdminListConfig, type BadgeTone } from '@/components/common/listScreen';
import type { ProductRequestSummary } from '@/databases/types';
import React from 'react';

import { STATUS_OPTIONS } from './statusPrimitives';

const STATUS_TONE: Record<string, BadgeTone> = {
    DRAFT: 'neutral',
    PUBLISHED: 'success',
    ACKNOWLEDGED: 'primary',
    PARTIALLY_FULFILLED: 'warning',
    FULFILLED: 'info',
    CANCELLED: 'danger',
    EXPIRED: 'neutral',
};

const URGENCY_TONE: Record<string, BadgeTone> = { high: 'danger', critical: 'danger', medium: 'warning', low: 'neutral' };

const statusKey = (r: { status?: string | null }) => String(r.status ?? '').trim().toUpperCase();

export function requestStatusBadge(r: { status?: string | null; status_display?: string | null }): AdminBadge {
    const key = statusKey(r);
    const label = STATUS_OPTIONS.find((s) => s.value === key)?.label ?? textOr(r.status_display || r.status, 'Unknown');
    return { label, tone: STATUS_TONE[key] ?? 'neutral' };
}

export function urgencyBadge(urgency?: string | null): AdminBadge | null {
    const key = String(urgency ?? '').trim().toLowerCase();
    if (!key) return null;
    return { label: `${key.charAt(0).toUpperCase()}${key.slice(1)} urgency`, tone: URGENCY_TONE[key] ?? 'neutral', icon: key === 'high' || key === 'critical' ? 'flame-outline' : undefined };
}

/** Requests that need the retailer's attention (review offers / publish draft). */
export const needsAction = (r: { status?: string | null }) => ['DRAFT', 'ACKNOWLEDGED', 'PARTIALLY_FULFILLED'].includes(statusKey(r));

function requestTitle(r: ProductRequestSummary): string {
    const lines = r.items ?? [];
    const first = lines[0]?.product_title;
    if (!first) return textOr(r.request_number, 'Product request');
    const extra = Math.max(lines.length, r.total_line_count ?? 0) - 1;
    return extra > 0 ? `${first} +${extra} more` : first;
}

export function offerCount(r: ProductRequestSummary): number {
    return (r.items ?? []).reduce((sum, i) => sum + (Number(i.offer_count) || 0), 0);
}

function wholesalerNames(r: ProductRequestSummary): string {
    const names = new Set<string>();
    for (const line of r.items ?? []) {
        for (const w of line.target_wholesalers ?? []) if (w?.title) names.add(w.title);
        for (const w of line.wholesalers ?? []) if (w?.title) names.add(w.title);
    }
    const list = [...names];
    if (list.length === 0) return 'All wholesalers';
    return list.length > 2 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(', ');
}

export const productRequestsConfig: AdminListConfig<ProductRequestSummary> = {
    title: 'Product requests',
    noun: ['request', 'requests'],
    icon: 'search-circle-outline',
    searchPlaceholder: 'Search request, product, wholesaler…',
    addLabel: 'New request',
    emptyTitle: 'No product requests',
    emptyMessage: "Ask wholesalers for products you can't find in the marketplace. Their offers show up here.",
    keyOf: (r, i) => `${r.remote_id ?? r.draft_id ?? 'request'}-${i}`,
    titleOf: requestTitle,
    subtitleOf: (r) => [textOr(r.request_number, ''), wholesalerNames(r)].filter(Boolean).join(' · '),
    avatarOf: (r) => ({ icon: 'search-circle-outline', color: STATUS_OPTIONS.find((s) => s.value === statusKey(r))?.fg ?? '#94a3b8' }),
    badgesOf: (r) => {
        const out: AdminBadge[] = [requestStatusBadge(r)];
        const urg = urgencyBadge(r.urgency);
        if (urg && urg.tone !== 'neutral') out.push(urg);
        const offers = offerCount(r);
        if (offers > 0 && needsAction(r)) out.push({ label: `${offers} offer${offers === 1 ? '' : 's'} to review`, tone: 'primary', icon: 'pricetags-outline' });
        if (r.is_pending) out.push({ label: 'Waiting to upload', tone: 'warning', icon: 'cloud-upload-outline' });
        return out;
    },
    metricOf: (r) => ({ value: `${r.fulfilled_line_count ?? 0}/${r.total_line_count ?? 0}`, label: 'fulfilled' }),
    metaOf: (r) => (r.expires_at ? `Expires ${formatDate(r.expires_at)}` : formatDate(r.created)),
    metaIcon: 'time-outline',
    primaryColumn: { label: 'Request', flex: 2.6 },
    columns: [
        { key: 'status', label: 'Status', flex: 1.1, render: (r) => <CellText strong>{requestStatusBadge(r).label}</CellText> },
        { key: 'urgency', label: 'Urgency', flex: 0.8, render: (r) => textOr(r.urgency_display || r.urgency) },
        {
            key: 'offers',
            label: 'Offers',
            flex: 0.7,
            align: 'right',
            render: (r) => (
                <CellText strong align="right">
                    {offerCount(r).toLocaleString()}
                </CellText>
            ),
        },
        {
            key: 'fulfilled',
            label: 'Fulfilled',
            flex: 0.8,
            align: 'right',
            render: (r) => <CellText align="right">{`${r.fulfilled_line_count ?? 0}/${r.total_line_count ?? 0}`}</CellText>,
        },
        { key: 'expires', label: 'Expires', flex: 1, render: (r) => formatDate(r.expires_at) },
        { key: 'created', label: 'Created', flex: 1, render: (r) => formatDate(r.created) },
    ],
};
