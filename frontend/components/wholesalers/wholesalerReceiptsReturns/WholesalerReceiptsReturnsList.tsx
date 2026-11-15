// components/wholesalers/wholesalerReceiptsReturns/WholesalerReceiptsReturnsList.tsx
//
// Stock retailers sent back. A wholesaler accepts (takes the goods back, with
// the refund worked out), rejects, or cancels a pending return.
// Shared list kit: cards on phones, a table on wide screens. Offline-first:
// opens from the copy saved on this device and refreshes when online
// (hooks/useCachedList). Decisions need a connection.

import wholesalersApi, { type WholesalerReturnReason, type WholesalerReturnRecord, type WholesalerReturnStatus } from '@/api/wholesalersApi';
import { useAlert } from '@/components/common/AlertProvider';
import ApiResponseModal, { extractEnvelope, routeEnvelope, type ApiResponseEnvelope, type ResponseKind } from '@/components/common/ApiResponseModal';
import { AdminListView, formatDateTime, type AdminListConfig, type BadgeTone } from '@/components/common/listScreen';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { WholesalerReceiptReturnDecisionModal, type DecisionStatus } from './WholesalerReceiptDecisionModal';

type Filter = 'ALL' | WholesalerReturnStatus;
type Mode = 'accept' | 'reject' | 'cancel';

const MODE_TO_STATUS: Record<Mode, DecisionStatus> = { accept: 'ACCEPTED', reject: 'REJECTED', cancel: 'CANCELLED' };
const STATUS_TO_MODE: Record<string, Mode> = { ACCEPTED: 'accept', REJECTED: 'reject', CANCELLED: 'cancel' };
const STATUS: Record<WholesalerReturnStatus, { label: string; tone: BadgeTone }> = {
    PENDING: { label: 'To decide', tone: 'warning' },
    ACCEPTED: { label: 'Accepted', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
const REASON: Record<WholesalerReturnReason, string> = {
    EXPIRED: 'Expired',
    NEAR_EXPIRY: 'Near expiry',
    DAMAGED: 'Damaged',
    WRONG_ITEM: 'Wrong item',
    SHORT_DATED: 'Short-dated',
    QUALITY: 'Quality issue',
    OVER_ORDERED: 'Over-ordered',
    RECALL: 'Recall',
    OTHER: 'Other',
};
const TYPE: Record<string, string> = { REFUND: 'Refund', EXCHANGE: 'Exchange', REPLACEMENT: 'Replacement' };
const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const refundOf = (r: WholesalerReturnRecord) => Number(r.total_refund_amount || 0) || Number(r.quantity || 0) * Number(r.unit_price_refunded || r.unit_price_paid || 0);

const config: AdminListConfig<WholesalerReturnRecord> = {
    title: 'Receipts & returns',
    noun: ['return', 'returns'],
    icon: 'return-down-back-outline',
    searchPlaceholder: 'Search product, reason, reference…',
    emptyTitle: 'No returns',
    emptyMessage: 'Stock retailers send back appears here for you to accept or reject.',
    keyOf: (r) => r.id,
    titleOf: (r) => r.product_title || 'Product',
    subtitleOf: (r) => [REASON[r.reason] ?? r.reason, TYPE[r.return_type] ?? r.return_type, r.reference_number].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'return-down-back-outline' }),
    badgesOf: (r) => [STATUS[r.status] ?? { label: r.status, tone: 'neutral' }],
    metaOf: (r) => (r.created ? formatDateTime(r.created) : null),
    metaIcon: 'time-outline',
    metricOf: (r) => ({ value: `${r.quantity ?? 0} units`, label: refundOf(r) ? kes(refundOf(r)) : 'refund not set' }),
    primaryColumn: { label: 'Product', flex: 1.9 },
    columns: [
        { key: 'qty', label: 'Units', flex: 0.6, align: 'right', render: (r) => String(r.quantity ?? 0) },
        { key: 'reason', label: 'Reason', flex: 1, render: (r) => REASON[r.reason] ?? r.reason },
        { key: 'type', label: 'Type', flex: 0.8, render: (r) => TYPE[r.return_type] ?? r.return_type },
        { key: 'refund', label: 'Refund', flex: 1, align: 'right', render: (r) => (refundOf(r) ? kes(refundOf(r)) : '—') },
        { key: 'status', label: 'Status', flex: 0.9, render: (r) => STATUS[r.status]?.label ?? r.status },
        { key: 'when', label: 'Sent', flex: 1.2, render: (r) => (r.created ? formatDateTime(r.created) : '—') },
    ],
};

export default function WholesalerReceiptsReturnsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const list = useCachedList<WholesalerReturnRecord>({
        key: 'wholesaler_receipt_returns',
        fetch: () => wholesalersApi.listReturnsAction({ page: 1, page_size: 500 } as any),
        pick: (d) => d?.results ?? d?.returns ?? [],
        pollMs: 60000,
    });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [target, setTarget] = useState<WholesalerReturnRecord | null>(null);
    const [mode, setMode] = useState<Mode>('accept');
    const [submitting, setSubmitting] = useState(false);
    const [response, setResponse] = useState<{ kind: ResponseKind; title: string; envelope: ApiResponseEnvelope | null; fallback: string | null } | null>(null);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: list.items.length };
        let pendingUnits = 0;
        for (const r of list.items) {
            c[r.status] = (c[r.status] ?? 0) + 1;
            if (r.status === 'PENDING') pendingUnits += Number(r.quantity || 0);
        }
        return { ...c, pendingUnits } as Record<string, number> & { pendingUnits: number };
    }, [list.items]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((r) => filter === 'ALL' || r.status === filter)
            .filter((r) => !q || `${r.product_title ?? ''} ${REASON[r.reason] ?? r.reason} ${r.justification ?? ''} ${r.reference_number ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || String(b.created).localeCompare(String(a.created)));
    }, [list.items, filter, query]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    const open = (m: Mode, r: WholesalerReturnRecord) => {
        if (!list.isOnline) return alert('You’re offline', 'Deciding on a return needs an internet connection. The returns are still shown from this device.');
        if (m === 'cancel') {
            return alert(
                'Cancel return',
                `Cancel this return of ${r.quantity ?? 0} unit(s)? The retailer's stock adjustment will be reversed.`,
                [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Cancel return', style: 'destructive', onPress: () => { setMode('cancel'); setTarget(r); } },
                ],
                'danger',
            );
        }
        setMode(m);
        setTarget(r);
    };

    const decide = useCallback(
        async (values: Record<string, string>) => {
            if (!target) return;
            const m: Mode = STATUS_TO_MODE[values.status] ?? mode;
            const what = m === 'accept' ? 'accept' : m === 'reject' ? 'reject' : 'cancel';
            setSubmitting(true);
            try {
                const res =
                    m === 'accept'
                        ? await wholesalersApi.acceptReturnAction({ return_id: target.id, unit_price_refunded: values.unit_price_refunded || undefined, restocking_fee_percent: values.restocking_fee_percent || undefined, notes: values.notes || undefined })
                        : m === 'reject'
                          ? await wholesalersApi.rejectReturnAction({ return_id: target.id, reason: values.reason || undefined })
                          : await wholesalersApi.cancelReturnAction({ return_id: target.id, reason: values.reason || undefined });
                const env = extractEnvelope(res);
                if (routeEnvelope(env) === 'success') {
                    setTarget(null);
                    await list.refresh();
                    setResponse({ kind: 'success', title: m === 'accept' ? 'Return accepted' : m === 'reject' ? 'Return rejected' : 'Return cancelled', envelope: env, fallback: null });
                } else {
                    setResponse({ kind: 'error', title: `Could not ${what} the return`, envelope: env, fallback: null });
                }
            } catch (e: any) {
                const env = e?.response ? extractEnvelope(e.response) : null;
                const has = !!(env?.response_message || env?.errors);
                setResponse({ kind: 'error', title: `Could not ${what} the return`, envelope: has ? env : null, fallback: has ? null : e?.message ?? 'Network error.' });
            } finally {
                setSubmitting(false);
            }
        },
        [target, mode, list],
    );

    return (
        <>
            <AdminListView<WholesalerReturnRecord, Filter>
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
                onPressItem={(r) => (r.status === 'PENDING' ? open('accept', r) : undefined)}
                rowActions={(r) =>
                    r.status === 'PENDING'
                        ? [
                              { icon: 'checkmark-circle-outline', label: 'Accept', onPress: () => open('accept', r), tone: 'primary' },
                              { icon: 'close-circle-outline', label: 'Reject', onPress: () => open('reject', r), tone: 'danger' },
                              { icon: 'ban-outline', label: 'Cancel', onPress: () => open('cancel', r), tone: 'muted' },
                          ]
                        : []
                }
                stats={[
                    { label: 'To decide', value: String(counts.PENDING ?? 0), color: counts.PENDING ? '#f59e0b' : undefined },
                    { label: 'Units waiting', value: String(counts.pendingUnits) },
                    { label: 'Accepted', value: String(counts.ACCEPTED ?? 0) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: counts.ALL },
                        { key: 'PENDING', label: 'To decide', icon: 'hourglass-outline', count: counts.PENDING ?? 0 },
                        { key: 'ACCEPTED', label: 'Accepted', icon: 'checkmark-circle-outline', count: counts.ACCEPTED ?? 0 },
                        { key: 'REJECTED', label: 'Rejected', icon: 'close-circle-outline', count: counts.REJECTED ?? 0 },
                        { key: 'CANCELLED', label: 'Cancelled', icon: 'ban-outline', count: counts.CANCELLED ?? 0 },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
            />
            <WholesalerReceiptReturnDecisionModal
                visible={!!target}
                initialStatus={MODE_TO_STATUS[mode]}
                target={target}
                submitting={submitting}
                onClose={() => !submitting && setTarget(null)}
                onSubmit={decide}
            />
            <ApiResponseModal
                isOpen={!!response}
                variant={response?.kind ?? 'success'}
                title={response?.title ?? ''}
                envelope={response?.envelope ?? null}
                fallbackMessage={response?.fallback ?? null}
                onClose={() => setResponse(null)}
            />
        </>
    );
}
