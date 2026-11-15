// components/wholesalers/orders/RetailerOrdersList.tsx
//
// Wholesaler: orders retailers sent (mirrored by RetailerOrdersSyncContext).
// Shared list kit: cards on phones, table on wide screens. Columns, badges
// and statuses: retailerOrdersConfig.
//   >= 1100 px: the selected order sits in a cart-style pane on the right
//               (RequisitionCart viewer="wholesaler": items, totals, Retry payment);
//   narrower : tapping an order opens that cart full screen.
// The cart's (i) button opens RetailerOrderDetailsModal (lifecycle, identifiers).

import { AdminListView, useListTokens } from '@/components/common/listScreen';
import { RequisitionCart } from '@/components/retailers/retailerRequisitions/RequisitionCart';
import type { PageSize } from '@/components/common/PaginationBar';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import type { RetailerOrder } from '@/databases/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { balanceOf, formatKES, isPaid, orderRef } from '@/components/retailers/retailerRequisitions/primitives';
import { RetailerOrderDetailsModal } from './RetailerOrderDetailsModal';
import { ORDER_STATUSES, retailerOrdersConfig, statusLabel, type OrderStatus } from './retailerOrdersConfig';

type Filter = 'ALL' | 'UNPAID' | OrderStatus;

/** From here the selected order sits beside the table. */
const TWO_PANE_MIN_WIDTH = 1100;
const PANE_WIDTH = 420;

const STATUS_ICONS: Record<OrderStatus, React.ComponentProps<typeof AdminListView>['config']['icon']> = {
    SUBMITTED: 'paper-plane-outline',
    PROCESSING: 'construct-outline',
    DISPATCHED: 'car-outline',
    RECEIVED: 'download-outline',
    COMPLETED: 'checkmark-done-outline',
    CANCELLED: 'close-circle-outline',
};

const createdMs = (o: RetailerOrder) => {
    const t = Date.parse(String(o.created || '').replace(' ', 'T'));
    return Number.isNaN(t) ? 0 : t;
};

export default function RetailerOrdersList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const twoPane = width >= TWO_PANE_MIN_WIDTH;
    const { theme, border } = useListTokens();
    const insets = useSafeAreaInsets();

    const { retailerOrders, isSyncing, isManualRefreshing, isLiveConnected, forceManualRefresh, syncUiState } = useRetailerOrdersSync();
    const orders = retailerOrders ?? [];

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [selected, setSelected] = useState<RetailerOrder | null>(null);
    const [cartOpen, setCartOpen] = useState(false); // phones: full-screen cart
    const [detailsOpen, setDetailsOpen] = useState(false);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return orders
            .filter((o) => {
                const status = String(o.status || '').toUpperCase();
                if (filter === 'UNPAID' && isPaid(o)) return false;
                if (filter !== 'ALL' && filter !== 'UNPAID' && status !== filter) return false;
                if (!needle) return true;
                return [o.retailer_title, o.wholesaler_title, orderRef(o), o.draft_id, o.owner_title, o.payment_method_title]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(needle);
            })
            .sort((a, b) => createdMs(b) - createdMs(a));
    }, [orders, query, filter]);

    const counts = useMemo(() => {
        const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
        let unpaid = 0;
        let due = 0;
        for (const o of orders) {
            const s = String(o.status || '').toUpperCase() as OrderStatus;
            if (s in byStatus) byStatus[s] += 1;
            if (!isPaid(o)) {
                unpaid += 1;
                due += balanceOf(o);
            }
        }
        return { byStatus, unpaid, due };
    }, [orders]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    // The open order follows live updates (status, payments). In the side
    // pane, with nothing picked, it shows the newest unpaid order.
    const liveSelected = useMemo(() => {
        if (selected) {
            const id = selected.remote_id || selected.draft_id;
            return orders.find((o) => (o.remote_id || o.draft_id) === id) ?? selected;
        }
        return twoPane ? (filtered.find((o) => !isPaid(o)) ?? filtered[0] ?? null) : null;
    }, [selected, orders, twoPane, filtered]);

    const onRefresh = useCallback(() => forceManualRefresh(), [forceManualRefresh]);
    const openOrder = useCallback(
        (o: RetailerOrder) => {
            setSelected(o);
            if (!twoPane) setCartOpen(true);
        },
        [twoPane],
    );
    // iOS can't show a second modal over the first: close the cart first.
    const showDetails = useCallback(() => {
        setCartOpen(false);
        setDetailsOpen(true);
    }, []);
    const selectedId = liveSelected ? liveSelected.remote_id || liveSelected.draft_id : null;

    const list = (
            <AdminListView<RetailerOrder, Filter>
                variant={isLarge ? 'web' : 'mobile'}
                config={retailerOrdersConfig}
                query={query}
                setQuery={setQuery}
                onRefresh={onRefresh}
                refreshing={isManualRefreshing}
                sourceLabel={isLiveConnected ? 'Live sync' : isSyncing ? 'Syncing…' : 'Local cache'}
                sourceTone={isLiveConnected || isSyncing ? 'server' : 'cache'}
                lastSyncedTime={syncUiState.lastSyncedTime}
                items={paginated}
                allItems={filtered}
                onPressItem={openOrder}
                rowActions={(o) => [
                    {
                        icon: twoPane && (o.remote_id || o.draft_id) === selectedId ? 'eye' : 'eye-outline',
                        label: 'View order',
                        onPress: () => openOrder(o),
                        tone: 'primary',
                    },
                ]}
                stats={[
                    { label: 'Orders', value: orders.length.toLocaleString() },
                    { label: 'To process', value: counts.byStatus.SUBMITTED.toLocaleString(), color: counts.byStatus.SUBMITTED ? '#3b82f6' : undefined },
                    { label: 'Unpaid', value: counts.unpaid.toLocaleString(), color: counts.unpaid ? '#f59e0b' : undefined },
                    { label: 'Due', value: `KES ${formatKES(counts.due)}`, color: counts.due > 0 ? '#f43f5e' : undefined },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: orders.length },
                        { key: 'UNPAID', label: 'Unpaid', icon: 'alert-circle-outline', count: counts.unpaid },
                        ...ORDER_STATUSES.map((s) => ({ key: s as Filter, label: statusLabel(s), icon: STATUS_ICONS[s], count: counts.byStatus[s] })),
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
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
            />
    );

    return (
        <>
            {twoPane ? (
                <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
                    <View style={{ flex: 1, minWidth: 0 }}>{list}</View>
                    {/* Cart-style pane: scrolls on its own, totals + payment pinned */}
                    <View style={{ width: PANE_WIDTH, borderLeftWidth: 1, borderLeftColor: border, backgroundColor: theme.panel }}>
                        <RequisitionCart viewer="wholesaler" order={liveSelected} onRefreshParentLedger={onRefresh} onShowDetails={liveSelected ? showDetails : undefined} />
                    </View>
                </View>
            ) : (
                list
            )}

            {/* Phones / narrow screens: the cart full screen */}
            {!twoPane ? (
                <Modal visible={cartOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCartOpen(false)}>
                    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.panel }}>
                        <RequisitionCart
                            viewer="wholesaler"
                            order={liveSelected}
                            onRefreshParentLedger={onRefresh}
                            onShowDetails={showDetails}
                            onClose={() => setCartOpen(false)}
                            bottomInset={insets.bottom}
                        />
                    </View>
                </Modal>
            ) : null}

            {liveSelected ? <RetailerOrderDetailsModal visible={detailsOpen} order={liveSelected} onClose={() => setDetailsOpen(false)} /> : null}
        </>
    );
}
