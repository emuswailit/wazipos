// components/retailers/retailerInventory/RetailerInventoryList.tsx
//
// The shop's stock (retailer receipts), kept on the device and synced with the
// server (InventorySyncContext): works offline, shows where sync stands, and
// lists stock as cards on phones / a table on wide screens.

import { InventorySyncStrip } from '@/components/common/inventory/InventorySyncStrip';
import { INVENTORY_FILTER_ICONS, INVENTORY_FILTER_LABELS, INVENTORY_FILTERS, formatKES, type InventoryFilter } from '@/components/common/inventory/inventoryHelpers';
import { buildInventoryConfig } from '@/components/common/inventory/inventoryListConfig';
import { useInventoryList } from '@/components/common/inventory/useInventoryList';
import { AdminListView, DetailsDock } from '@/components/common/listScreen';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { InventoryDetailsModal } from './InventoryDetailsModal';
import RetailerInventoryAddModal from './RetailerInventoryAddModal';

const config = buildInventoryConfig({
    title: 'Inventory',
    addLabel: 'Receive stock',
    emptyMessage: 'Stock you receive (or receive from wholesaler orders) shows here.',
    showBuyingPrice: true,
});

export default function RetailerInventoryList() {
    const {
        retailerReceipts,
        forceManualRefresh,
        isLiveConnected,
        isManualRefreshing,
        isPushSyncing,
        isSyncing,
        isOnline,
        pendingCount,
        lastSyncedTime,
        lastSyncError,
    } = useInventorySync();
    const { isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const inv = useInventoryList<any>(retailerReceipts);
    const [details, setDetails] = useState<any | null>(null);
    const [editing, setEditing] = useState<any | null>(null);
    const [formOpen, setFormOpen] = useState(false);

    const refresh = useCallback(() => void forceManualRefresh(), [forceManualRefresh]);
    const openEdit = useCallback((item: any | null) => {
        setDetails(null);
        setEditing(item);
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
                    error={lastSyncError}
                    lastSynced={lastSyncedTime}
                    onSync={refresh}
                />
                <PendingSyncBanner kind="customer" />
            </View>
        ),
        [isOnline, isLiveConnected, isManualRefreshing, isPushSyncing, pendingCount, lastSyncError, lastSyncedTime, refresh],
    );

    return (
        <>
            <DetailsDock
                placeholder="Pick a stock item to see its details here."
                pane={
                    <InventoryDetailsModal item={details} onClose={() => setDetails(null)} onEdit={openEdit} />
                }
            >
                <AdminListView<any, InventoryFilter>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={config}
                    header={header}
                    query={inv.query}
                    setQuery={inv.setQuery}
                    onRefresh={refresh}
                    refreshing={isManualRefreshing || isSyncing}
                    sourceLabel={isLiveConnected ? 'Live sync' : isOnline ? 'Connecting…' : 'Offline · on this device'}
                    sourceTone={isLiveConnected ? 'server' : 'cache'}
                    lastSyncedTime={lastSyncedTime}
                    onOpenCreate={() => openEdit(null)}
                    onPressItem={setDetails}
                    onEditItem={openEdit}
                    rowActions={(r) => [
                        { icon: 'eye-outline', label: 'View', onPress: () => setDetails(r) },
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
            </DetailsDock>

            <RetailerInventoryAddModal
                isOpen={formOpen}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                onSuccess={refresh}
                isDarkMode={isDarkMode}
                theme={undefined as any}
                inventoryToEdit={editing}
            />
        </>
    );
}
