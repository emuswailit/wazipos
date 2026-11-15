// components/retailers/retailerRequisitions/RetailerRequisitionsList.tsx
//
// Retailer-side requisitions view — shell.
//
// Data lives in RetailerOrdersSyncContext (mirrored over the
// RetailerOrders websocket). This shell reads it, computes search
// and filter state, owns pagination state, dispatches to the Web or
// Mobile breakpoint, and mounts the details modal.

import {
    PAGE_SIZE_OPTIONS,
    type PageSize,
} from '@/components/common/PaginationBar';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import type { RetailerOrder } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { AdminListView, useListTokens, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { Modal, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RequisitionCart } from './RequisitionCart';
import { RetailerRequisitionsDetailsModal } from './RetailerRequisitionsDetailsModal';
import {
    balanceOf,
    formatDate,
    formatKES,
    orderItemCount,
    orderRef,
    PaymentPill,
    StatusPill,
    toBool,
    totalOf,
    type RequisitionsCounts,
} from './primitives';

type ReqFilter = 'ALL' | 'UNPAID' | 'SUBMITTED';

const STATUS_TONE: Record<string, AdminBadge['tone']> = {
    SUBMITTED: 'info', PROCESSING: 'violet', PACKED: 'info', READY: 'primary', COLLECTED: 'success',
    DISPATCHED: 'primary', RECEIVED: 'success', COMPLETED: 'success', CANCELLED: 'danger', DRAFT: 'neutral',
};
const cap = (v: string) => (v ? v.charAt(0) + v.slice(1).toLowerCase() : v);

/** Cards on phones, a table on wide screens (shared list kit); compact = the cart sits beside it. */
function buildConfig(compact: boolean): AdminListConfig<RetailerOrder> {
    const cols: AdminListConfig<RetailerOrder>['columns'] = [
        { key: 'ref', label: 'Reference', flex: 1.3, render: orderRef },
        { key: 'items', label: 'Items', flex: 0.6, align: 'center', render: (o) => String(orderItemCount(o)) },
        { key: 'status', label: 'Status', flex: 1.1, render: (o) => <StatusPill status={String(o.status || '')} size="sm" /> },
        { key: 'payment', label: 'Payment', flex: 0.9, render: (o) => <PaymentPill paid={toBool(o.is_paid)} compact /> },
        { key: 'balance', label: 'Balance', flex: 1, align: 'right', render: (o) => (balanceOf(o) > 0 ? `KES ${formatKES(balanceOf(o))}` : '—') },
        { key: 'total', label: 'Total', flex: 1, align: 'right', render: (o) => `KES ${formatKES(totalOf(o))}` },
    ];
    return {
        title: 'Requisitions',
        noun: ['requisition', 'requisitions'],
        icon: 'cart-outline',
        searchPlaceholder: 'Search reference, wholesaler, product…',
        emptyTitle: 'No requisitions yet',
        emptyMessage: 'Orders you place with wholesalers appear here with their payment and delivery.',
        keyOf: (o, i) => String(o.remote_id || o.draft_id || i),
        titleOf: (o) => o.wholesaler_title || 'Wholesaler',
        subtitleOf: (o) => [orderRef(o), `${orderItemCount(o)} item${orderItemCount(o) === 1 ? '' : 's'}`, formatDate(o.created as any)].filter(Boolean).join(' · '),
        avatarOf: (o) => ({ label: o.wholesaler_title || 'W' }),
        badgesOf: (o) => {
            const st = String(o.status || '').toUpperCase();
            return [
                ...(st ? [{ label: cap(st), tone: STATUS_TONE[st] ?? 'neutral' } as AdminBadge] : []),
                toBool(o.is_paid) ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Not paid', tone: 'warning' },
            ];
        },
        metricOf: (o) => ({ value: `KES ${formatKES(totalOf(o))}`, label: balanceOf(o) > 0 ? `KES ${formatKES(balanceOf(o))} due` : 'paid' }),
        primaryColumn: { label: 'Wholesaler', flex: 1.8 },
        columns: compact ? cols.filter((c) => c.key !== 'items' && c.key !== 'payment') : cols,
    };
}

// Same rule as the Customer Orders screen: paginated table only on wide web screens;
// native apps and narrow web get the full card list (no pagination).
const LARGE_SCREEN_MIN_WIDTH = 768;
/** From here the selected requisition sits in a pane beside the table. */
const TWO_PANE_MIN_WIDTH = 1100;
const PANE_WIDTH = 420;

/** Newest first. */
const createdMs = (o: RetailerOrder): number => {
    const t = new Date(String(o.created ?? '').replace(' ', 'T')).getTime();
    return Number.isNaN(t) ? 0 : t;
};

/* =========================================================
 * Search
 * ======================================================= */

function matchesQuery(o: RetailerOrder, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();

    const haystacks = [
        orderRef(o),
        o.wholesaler_title,
        o.retailer_title,
        o.title,
        o.order_origin,
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

    for (const h of haystacks) {
        if (h.includes(needle)) return true;
    }

    for (const item of o.order_items ?? []) {
        const t = String(item.product_title || '').toLowerCase();
        if (t.includes(needle)) return true;

        const b = String(item.batch || '').toLowerCase();
        if (b.includes(needle)) return true;
    }

    return false;
}

/* =========================================================
 * Component
 * ======================================================= */

const RetailerRequisitionsList: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = Platform.OS === 'web' && width >= LARGE_SCREEN_MIN_WIDTH;
    // From here the requisition opens in a side pane instead of a sheet.
    const twoPane = isLarge && width >= TWO_PANE_MIN_WIDTH;
    const { theme, border } = useListTokens();

    const {
        retailerOrders,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        syncStatus,
        lastSyncedTime,
        forceManualRefresh,
    } = useRetailerOrdersSync();

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<ReqFilter>('ALL');
    const onlyUnpaid = filter === 'UNPAID';
    const [selected, setSelected] =
        useState<RetailerOrder | null>(null);

    /* ---------------- Pagination state ---------------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- Filtering ---------------- */
    const visible = useMemo(() => {
        const base =
            filter === 'UNPAID'
                ? retailerOrders.filter((o) => !toBool(o.is_paid))
                : filter === 'SUBMITTED'
                  ? retailerOrders.filter((o) => String(o.status || '').toUpperCase() === 'SUBMITTED')
                  : retailerOrders;

        return base
            .filter((o) => matchesQuery(o, query))
            .sort((a, b) => createdMs(b) - createdMs(a));
    }, [retailerOrders, filter, query]);

    const counts: RequisitionsCounts = useMemo(
        () => ({
            total: retailerOrders.length,
            visible: visible.length,
            unpaid: retailerOrders.filter(
                (o) => !toBool(o.is_paid)
            ).length,
            submitted: retailerOrders.filter(
                (o) =>
                    (o.status || '').toUpperCase() ===
                    'SUBMITTED'
            ).length,
            visibleValue: visible.reduce((sum, o) => sum + totalOf(o), 0),
            visibleBalance: visible.reduce((sum, o) => sum + balanceOf(o), 0),
        }),
        [retailerOrders, visible]
    );

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    // Reset to page 1 whenever the filter or page size changes.
    useEffect(() => {
        setPage(1);
    }, [query, filter, pageSize]);

    // Clamp page if the list shrinks below the current page.
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => visible.slice(pageStart, pageEnd),
        [visible, pageStart, pageEnd]
    );

    const goPrev = useCallback(
        () => setPage((p) => Math.max(1, p - 1)),
        []
    );
    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages]
    );
    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
        setPage(1);
    }, []);

    /* ---------------- Refresh / handlers ---------------- */
    const refreshing = isSyncing || isManualRefreshing;

    const onRefresh = useCallback(() => {
        forceManualRefresh();
    }, [forceManualRefresh]);

    // Phones / narrow screens: the cart full screen; (i) opens the details sheet.
    const insets = useSafeAreaInsets();
    const [cartOpen, setCartOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const onView = useCallback(
        (order: RetailerOrder) => {
            setSelected(order);
            if (!twoPane) setCartOpen(true);
        },
        [twoPane],
    );
    // iOS can't show a second modal over the first: close the cart first.
    const showDetails = useCallback(() => {
        setCartOpen(false);
        setDetailsOpen(true);
    }, []);

    // The pane follows live updates (payments, status) for the picked order;
    // with nothing picked it shows the newest unpaid one, else the newest.
    const paneOrder = useMemo<RetailerOrder | null>(() => {
        const id = selected?.remote_id;
        const live = id ? retailerOrders.find((o) => o.remote_id === id) : undefined;
        if (live) return live;
        if (selected) return selected;
        return visible.find((o) => !toBool(o.is_paid)) ?? visible[0] ?? null;
    }, [selected, retailerOrders, visible]);

    const onQueryChange = useCallback((q: string) => {
        setQuery(q);
    }, []);


    const config = useMemo(() => buildConfig(twoPane), [twoPane]);
    const selectedKey = twoPane ? paneOrder?.remote_id ?? null : null;

    const list = (
        <AdminListView<RetailerOrder, ReqFilter>
            variant={isLarge ? 'web' : 'mobile'}
            config={config}
            query={query}
            setQuery={onQueryChange}
            onRefresh={onRefresh}
            refreshing={refreshing}
            sourceLabel={isLiveConnected ? 'Live sync' : syncStatus === 'offline' ? 'Offline · on this device' : 'Saved on this device'}
            sourceTone={isLiveConnected ? 'server' : 'cache'}
            lastSyncedTime={lastSyncedTime ?? undefined}
            items={paginated}
            allItems={visible}
            onPressItem={onView}
            rowActions={(o) => [
                { icon: selectedKey && o.remote_id === selectedKey ? 'eye' : 'eye-outline', label: 'Open', onPress: () => onView(o), tone: 'primary' },
            ]}
            stats={[
                { label: 'Requisitions', value: counts.total.toLocaleString() },
                { label: 'Not paid', value: counts.unpaid.toLocaleString(), color: counts.unpaid ? '#f59e0b' : undefined },
                { label: 'Balance due', value: `KES ${formatKES(counts.visibleBalance)}`, color: counts.visibleBalance ? '#f43f5e' : undefined },
            ]}
            filters={{
                options: [
                    { key: 'ALL', label: 'All', icon: 'apps-outline', count: counts.total },
                    { key: 'UNPAID', label: 'Not paid', icon: 'alert-circle-outline', count: counts.unpaid },
                    { key: 'SUBMITTED', label: 'Submitted', icon: 'paper-plane-outline', count: counts.submitted },
                ],
                value: filter,
                onChange: setFilter,
                allKey: 'ALL',
            }}
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            onPrev={goPrev}
            onNext={goNext}
            onPageSizeChange={changePageSize}
        />
    );

    return (
        <>
            {twoPane ? (
                <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
                    <View style={{ flex: 1, minWidth: 0 }}>{list}</View>
                    {/* The cart beside the list: scrolls on its own, totals + payment pinned */}
                    <View style={{ width: PANE_WIDTH, borderLeftWidth: 1, borderLeftColor: border, backgroundColor: theme.panel }}>
                        <RequisitionCart order={paneOrder} onRefreshParentLedger={onRefresh} onShowDetails={paneOrder ? showDetails : undefined} />
                    </View>
                </View>
            ) : (
                list
            )}

            {/* The cart's (i): lifecycle, identifiers, payments */}
            <RetailerRequisitionsDetailsModal
                order={paneOrder}
                visible={detailsOpen && !!paneOrder}
                onClose={() => setDetailsOpen(false)}
                onRefreshParentLedger={onRefresh}
            />

            {!twoPane ? (
                <Modal visible={cartOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCartOpen(false)}>
                    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.panel }}>
                        <RequisitionCart
                            order={paneOrder}
                            onRefreshParentLedger={onRefresh}
                            onShowDetails={showDetails}
                            onClose={() => setCartOpen(false)}
                            bottomInset={insets.bottom}
                        />
                    </View>
                </Modal>
            ) : null}

        </>
    );
};

export default RetailerRequisitionsList;