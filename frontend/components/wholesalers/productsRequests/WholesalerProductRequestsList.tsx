// components/wholesalers/productsRequests/WholesalerProductRequestsList.tsx
//
// Products retailers are looking for: open requests a wholesaler can make an
// offer on. Shared list kit: cards on phones, a table on wide screens.
// Offline-first: requests come from RetailerProductRequestsSyncContext (saved
// on this device, live updates when online). Making an offer needs a connection.

import wholesalersApi from '@/api/wholesalersApi';
import { useAlert } from '@/components/common/AlertProvider';
import { AdminListView, formatDateTime, type AdminListConfig, type BadgeTone } from '@/components/common/listScreen';
import { useRetailerProductRequestsSync } from '@/context/RetailerProductRequestsSyncContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import type { ProductRequestSummary } from '@/databases/types';
import { usePaged } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import MakeOfferModal, { type RespondPayload } from './MakeOfferModal';
import ViewRequestDetailsModal from './ViewRequestDetailsModal';

type Filter = 'ALL' | 'PUBLISHED' | 'ACKNOWLEDGED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
    PUBLISHED: { label: 'Open', tone: 'success' },
    ACKNOWLEDGED: { label: 'Acknowledged', tone: 'info' },
    PARTIALLY_FULFILLED: { label: 'Partly filled', tone: 'warning' },
    FULFILLED: { label: 'Filled', tone: 'primary' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
    EXPIRED: { label: 'Expired', tone: 'neutral' },
};
const URGENCY: Record<string, BadgeTone> = { high: 'danger', critical: 'danger', medium: 'warning', low: 'info' };

const statusOf = (r: ProductRequestSummary) => String(r.status ?? '').trim().toUpperCase();
const canOffer = (r: ProductRequestSummary) => statusOf(r) === 'PUBLISHED';
const products = (r: ProductRequestSummary) =>
    (r.items_preview ?? (r as any).items ?? [])
        .map((i: any) => i?.product_title)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
const when = (iso?: string | null) => (iso ? formatDateTime(iso) : '—');

const config: AdminListConfig<ProductRequestSummary> = {
    title: 'Product requests',
    noun: ['request', 'requests'],
    icon: 'search-outline',
    searchPlaceholder: 'Search retailer, product, reference…',
    emptyTitle: 'No product requests',
    emptyMessage: 'When retailers ask for products they can’t find, the requests appear here for you to offer on.',
    keyOf: (r, i) => String(r.remote_id || r.draft_id || r.request_number || i),
    titleOf: (r) => r.entity_title || 'Retailer',
    subtitleOf: (r) => [r.request_number, products(r)].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'search-outline' }),
    badgesOf: (r) => {
        const s = STATUS[statusOf(r)] ?? { label: r.status_display || r.status, tone: 'neutral' as BadgeTone };
        const u = String(r.urgency ?? '').toLowerCase();
        return [s, ...(u ? [{ label: r.urgency_display || u, tone: URGENCY[u] ?? 'info' }] : [])];
    },
    metaOf: (r) => (r.expires_at ? `Expires ${when(r.expires_at)}` : r.created ? when(r.created) : null),
    metaIcon: 'time-outline',
    metricOf: (r) => ({ value: `${r.fulfilled_line_count ?? 0}/${r.total_line_count ?? 0}`, label: 'lines filled' }),
    primaryColumn: { label: 'Retailer', flex: 1.8 },
    columns: [
        { key: 'products', label: 'Products', flex: 2, render: (r) => products(r) || '—' },
        { key: 'urgency', label: 'Urgency', flex: 0.8, render: (r) => r.urgency_display || r.urgency || '—' },
        { key: 'lines', label: 'Filled', flex: 0.7, align: 'right', render: (r) => `${r.fulfilled_line_count ?? 0}/${r.total_line_count ?? 0}` },
        { key: 'status', label: 'Status', flex: 1, render: (r) => STATUS[statusOf(r)]?.label ?? r.status_display ?? r.status },
        { key: 'expires', label: 'Expires', flex: 1.2, render: (r) => when(r.expires_at) },
    ],
};

export default function WholesalerProductRequestsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const { isOnline } = useNetworkStatus();
    const { requests, isSyncing, isManualRefreshing, isLiveConnected, lastSyncedTime, dataSource, reconnectLiveSync } = useRetailerProductRequestsSync();
    const rows = requests ?? [];

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [viewing, setViewing] = useState<ProductRequestSummary | null>(null);
    const [offering, setOffering] = useState<ProductRequestSummary | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: rows.length };
        for (const r of rows) c[statusOf(r)] = (c[statusOf(r)] ?? 0) + 1;
        return c;
    }, [rows]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows
            .filter((r) => filter === 'ALL' || statusOf(r) === filter)
            .filter((r) => !q || `${r.entity_title} ${r.request_number} ${products(r)} ${r.note ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => Number(canOffer(b)) - Number(canOffer(a)) || String(b.created).localeCompare(String(a.created)));
    }, [rows, filter, query]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    const openOffer = (r: ProductRequestSummary) => {
        if (!isOnline) return alert('You’re offline', 'Making an offer needs an internet connection. The requests are still shown from this device.');
        setOffering(r);
    };

    const submitResponse = useCallback(async (payload: RespondPayload) => {
        setSubmitting(true);
        try {
            const res: any = await wholesalersApi.wholesalerProductRequestsAction(payload);
            if (!isServerOk(res, res?.data)) {
                // The offer sheet reads the server's errors from err.response.data / err.data.
                const body: any = res?.data ?? res ?? {};
                const err: any = new Error(body?.response_message ?? 'Offer not sent');
                err.response = { data: body };
                err.data = body;
                throw err;
            }
            void reconnectLiveSync();
        } finally {
            setSubmitting(false);
        }
    }, [reconnectLiveSync]);

    const sourceTone = !isOnline ? (rows.length ? 'cache' : 'none') : isLiveConnected || dataSource === 'server' ? 'server' : dataSource === 'cache' ? 'cache' : 'none';
    const sourceLabel = !isOnline ? 'Offline · saved copy' : isLiveConnected ? 'Live sync' : isSyncing ? 'Syncing…' : dataSource === 'cache' ? 'Saved on this device' : 'Not synced';

    return (
        <>
            <AdminListView<ProductRequestSummary, Filter>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={() => void reconnectLiveSync()}
                refreshing={isManualRefreshing}
                sourceLabel={sourceLabel}
                sourceTone={sourceTone as any}
                lastSyncedTime={lastSyncedTime}
                {...paged}
                onPressItem={setViewing}
                rowActions={(r) => [
                    { icon: 'eye-outline', label: 'View', onPress: () => setViewing(r) },
                    ...(canOffer(r) ? [{ icon: 'pricetags-outline' as const, label: 'Make offer', onPress: () => openOffer(r), tone: 'primary' as const }] : []),
                ]}
                stats={[
                    { label: 'Open', value: String(counts.PUBLISHED ?? 0), color: counts.PUBLISHED ? '#10b981' : undefined },
                    { label: 'Partly filled', value: String(counts.PARTIALLY_FULFILLED ?? 0) },
                    { label: 'Filled', value: String(counts.FULFILLED ?? 0) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: counts.ALL },
                        { key: 'PUBLISHED', label: 'Open', icon: 'flash-outline', count: counts.PUBLISHED ?? 0 },
                        { key: 'ACKNOWLEDGED', label: 'Acknowledged', icon: 'checkmark-outline', count: counts.ACKNOWLEDGED ?? 0 },
                        { key: 'PARTIALLY_FULFILLED', label: 'Partly filled', icon: 'pie-chart-outline', count: counts.PARTIALLY_FULFILLED ?? 0 },
                        { key: 'FULFILLED', label: 'Filled', icon: 'checkmark-done-outline', count: counts.FULFILLED ?? 0 },
                        { key: 'EXPIRED', label: 'Expired', icon: 'time-outline', count: counts.EXPIRED ?? 0 },
                        { key: 'CANCELLED', label: 'Cancelled', icon: 'close-circle-outline', count: counts.CANCELLED ?? 0 },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
            />
            <ViewRequestDetailsModal visible={!!viewing} request={viewing} onClose={() => setViewing(null)} />
            <MakeOfferModal
                visible={!!offering}
                request={offering}
                isSubmitting={submitting}
                onClose={() => !submitting && setOffering(null)}
                onSubmit={async (payload) => {
                    await submitResponse(payload);
                    setOffering(null);
                    alert('Offer sent', 'The retailer can now accept your offer.', undefined, 'success');
                }}
            />
        </>
    );
}
