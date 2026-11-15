// components/wholesalers/inventory/WholesalerReceiptsList.tsx
//
// The wholesaler's stock (receipts), kept on the device and synced with the
// server (WholesalerReceiptsSyncContext): receive / edit stock offline, see
// where sync stands, cards on phones / a table on wide screens.

import { InventorySyncStrip } from '@/components/common/inventory/InventorySyncStrip';
import { INVENTORY_FILTER_ICONS, INVENTORY_FILTER_LABELS, INVENTORY_FILTERS, formatKES, type InventoryFilter } from '@/components/common/inventory/inventoryHelpers';
import { buildInventoryConfig } from '@/components/common/inventory/inventoryListConfig';
import { useInventoryList } from '@/components/common/inventory/useInventoryList';
import { AdminListView } from '@/components/common/listScreen';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useWholesalerReceiptsSync } from '@/context/WholesalerReceiptsSyncContext';
import type { WholesalerReceipt } from '@/databases/types';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { WholesalerReceiptDetailsModal } from './WholesalerReceiptDetailsModal';
import { WholesalerReceiptEditModal } from './WholesalerReceiptEditModal';

const config = buildInventoryConfig({
    title: 'Inventory',
    addLabel: 'Receive stock',
    emptyMessage: 'Stock you receive shows here — it works offline and syncs when you are back online.',
    showBuyingPrice: true,
});

interface Props {
    onReceiptPress?: (receipt: WholesalerReceipt) => void;
    emptyComponent?: React.ReactElement | null;
}

export default function WholesalerReceiptsList({ onReceiptPress, emptyComponent }: Props) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;
    const { isOnline } = useNetworkStatus();
    const {
        wholesalerReceipts,
        isSyncing,
        isManualRefreshing,
        isPushSyncing,
        isLiveConnected,
        pendingCount,
        syncUiState,
        forceManualRefresh,
        pushPending,
    } = useWholesalerReceiptsSync();

    const inv = useInventoryList<WholesalerReceipt>(wholesalerReceipts);
    const [details, setDetails] = useState<WholesalerReceipt | null>(null);
    const [editing, setEditing] = useState<WholesalerReceipt | null>(null);
    const [formOpen, setFormOpen] = useState(false);

    const refresh = useCallback(() => void forceManualRefresh(), [forceManualRefresh]);
    const openDetails = useCallback(
        (r: WholesalerReceipt) => {
            setDetails(r);
            onReceiptPress?.(r);
        },
        [onReceiptPress],
    );
    const openEdit = useCallback((r: WholesalerReceipt | null) => {
        setDetails(null);
        setEditing(r);
        setFormOpen(true);
    }, []);

    const header = useMemo(
        () => (
            <View style={{ gap: 8 }}>
                <InventorySyncStrip
                    online={isOnline}
                    live={isLiveConnected}
                    syncing={isManualRefreshing || isPushSyncing}
                    pending={pendingCount}
                    error={syncUiState.lastError}
                    lastSynced={syncUiState.lastSyncedTime}
                    onSync={refresh}
                />
                <PendingSyncBanner kind="wholesale" />
            </View>
        ),
        [isOnline, isLiveConnected, isManualRefreshing, isPushSyncing, pendingCount, syncUiState.lastError, syncUiState.lastSyncedTime, refresh],
    );

    return (
        <>
            <AdminListView<WholesalerReceipt, InventoryFilter>
                variant={isLarge ? 'web' : 'mobile'}
                config={config}
                header={header}
                emptyComponent={emptyComponent}
                query={inv.query}
                setQuery={inv.setQuery}
                onRefresh={refresh}
                refreshing={isManualRefreshing || isSyncing}
                sourceLabel={isLiveConnected ? 'Live sync' : isOnline ? 'Connecting…' : 'Offline · on this device'}
                sourceTone={isLiveConnected ? 'server' : 'cache'}
                lastSyncedTime={syncUiState.lastSyncedTime}
                onOpenCreate={() => openEdit(null)}
                onPressItem={openDetails}
                onEditItem={openEdit}
                rowActions={(r) => [
                    { icon: 'eye-outline', label: 'View', onPress: () => openDetails(r) },
                    { icon: 'create-outline', label: 'Edit', onPress: () => openEdit(r), tone: 'primary' },
                ]}
                stats={[
                    { label: 'Items', value: inv.total.toLocaleString() },
                    { label: 'Stock value', value: `KES ${formatKES(inv.stockWorth)}` },
                    { label: 'Low', value: inv.counts.LOW.toLocaleString(), color: inv.counts.LOW ? '#f59e0b' : undefined },
                    { label: 'Expired', value: inv.counts.EXPIRED.toLocaleString(), color: inv.counts.EXPIRED ? '#f43f5e' : undefined },
                ]}
                filters={{
                    options: INVENTORY_FILTERS.filter((f) => f !== 'UNSYNCED' || inv.counts.UNSYNCED > 0).map((f) => ({
                        key: f,
                        label: INVENTORY_FILTER_LABELS[f],
                        icon: INVENTORY_FILTER_ICONS[f],
                        count: inv.counts[f],
                    })),
                    value: inv.filter,
                    onChange: inv.setFilter,
                    allKey: 'ALL',
                }}
                {...inv.paging}
            />

            <WholesalerReceiptDetailsModal receipt={details} onClose={() => setDetails(null)} />

            <WholesalerReceiptEditModal
                visible={formOpen}
                receipt={editing}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                onSave={async () => {
                    // Saved on the device first; send it now when online (else it syncs later).
                    if (isOnline) void pushPending();
                }}
            />
        </>
    );
}
