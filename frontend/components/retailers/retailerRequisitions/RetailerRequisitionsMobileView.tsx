// components/retailers/retailerRequisitions/RetailerRequisitionsMobileView.tsx
//
// Small-screen view for retailer requisitions (native apps and narrow web).
// Layout matches the Customer Orders mobile view: title row, summary card, search,
// All/Unpaid switch and a single scrolling list of cards (no pagination).
// Tapping a card opens the requisition details modal (owned by the list shell).

import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { useAuth } from '@/context/AuthContext';
import type { RetailerOrder } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import { ActiveFilterPill, AdminSheet, FilterButton, SearchField, SheetButton, SheetChoiceGroup, SheetSyncRow, SheetTile } from '@/components/common/listScreen';
import { FlatList, Platform, Pressable, RefreshControl, Text, View } from 'react-native';

import {
    balanceOf,
    formatDate,
    formatKES,
    orderItemCount,
    orderRef,
    PaymentPill,
    StatusPill,
    statusTint,
    toBool,
    totalOf,
    type RetailerRequisitionsViewProps,
} from './primitives';

const isWeb = Platform.OS === 'web';

export function RetailerRequisitionsMobileView({
    orders,
    counts,
    query,
    onQueryChange,
    onlyUnpaid,
    onToggleOnlyUnpaid,
    refreshing,
    onRefresh,
    isLiveConnected,
    syncStatus,
    lastSyncedTime,
    onView,
}: RetailerRequisitionsViewProps) {
    const { theme } = useAuth();

    const statusText = isLiveConnected ? 'Live' : syncStatus === 'offline' ? 'Offline' : 'Connecting…';
    const statusDot = isLiveConnected ? '#10b981' : syncStatus === 'offline' ? '#f43f5e' : '#f59e0b';

    const hasActiveFilter = onlyUnpaid || query.trim() !== '';
    const clearFilters = () => {
        if (onlyUnpaid) onToggleOnlyUnpaid();
        if (query.trim() !== '') onQueryChange('');
    };

    const [filtersOpen, setFiltersOpen] = useState(false);

    // Compact header: search · filters. Summary, All/Unpaid and sync + refresh live
    // in the filters sheet.
    const header = (
        <View style={{ paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <SearchField variant="mobile" value={query} onChangeText={onQueryChange} placeholder="Search reference, wholesaler, product…" />
                </View>
                <FilterButton active={onlyUnpaid} onPress={() => setFiltersOpen(true)} />
            </View>

            {/* One line of context: sync dot · count · value · active filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4, gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusDot }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {counts.visible.toLocaleString()} requisition{counts.visible === 1 ? '' : 's'} · KES {formatKES(counts.visibleValue)}
                </Text>
                <View style={{ flex: 1 }} />
                {onlyUnpaid ? <ActiveFilterPill label="Unpaid" onClear={onToggleOnlyUnpaid} /> : null}
            </View>
        </View>
    );

    const filtersSheet = (
        <AdminSheet
            visible={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            title="Filter requisitions"
            subtitle="Orders to wholesalers"
            icon="options-outline"
            footer={
                <>
                    <SheetButton label="Reset" variant="ghost" disabled={!onlyUnpaid} onPress={onToggleOnlyUnpaid} grow />
                    <SheetButton label={`Show ${counts.visible.toLocaleString()} requisition${counts.visible === 1 ? '' : 's'}`} onPress={() => setFiltersOpen(false)} grow />
                </>
            }
        >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <SheetTile label={hasActiveFilter ? 'Filtered value' : 'Total value'} value={`KES ${formatKES(counts.visibleValue)}`} />
                <SheetTile label="Unpaid" value={counts.unpaid.toLocaleString()} color={counts.unpaid ? '#f59e0b' : undefined} />
                <SheetTile label="Balance due" value={`KES ${formatKES(counts.visibleBalance)}`} color={counts.visibleBalance > 0 ? '#f43f5e' : undefined} />
            </View>
            <SheetChoiceGroup
                label="Show"
                options={[
                    { key: 'all', label: 'All requisitions', icon: 'apps-outline', count: counts.total },
                    { key: 'unpaid', label: 'Unpaid', icon: 'alert-circle-outline', count: counts.unpaid },
                ]}
                value={onlyUnpaid ? 'unpaid' : 'all'}
                onChange={(k) => {
                    if ((k === 'unpaid') !== onlyUnpaid) onToggleOnlyUnpaid();
                }}
            />
            <SheetSyncRow
                dotColor={statusDot}
                label={`${statusText}${lastSyncedTime ? ` · synced ${lastSyncedTime}` : ''}`}
                refreshing={refreshing}
                onRefresh={onRefresh}
                refreshLabel="Refresh requisitions"
            />
        </AdminSheet>
    );

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <FlatList
                data={orders}
                keyExtractor={(item, idx) => `${item.remote_id || item.id || 'req'}-${idx}`}
                ListHeaderComponent={header}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                ListEmptyComponent={<EmptyState hasActiveFilter={hasActiveFilter} onClearFilters={clearFilters} />}
                renderItem={({ item }) => <RequisitionCard order={item} onPress={onView} />}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                windowSize={11}
            />
            {filtersSheet}
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

const RequisitionCard = memo(function RequisitionCard({
    order,
    onPress,
}: {
    order: RetailerOrder;
    onPress: (o: RetailerOrder) => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const paid = toBool(order.is_paid);
    const itemCount = orderItemCount(order);
    const balance = balanceOf(order);
    const tint = statusTint(order.status);
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';

    const previewItems = (order.order_items ?? [])
        .slice(0, 2)
        .map((i) => i.product_title)
        .filter(Boolean);

    return (
        <Pressable
            onPress={() => onPress(order)}
            accessibilityRole="button"
            accessibilityLabel={`Requisition ${orderRef(order)} to ${order.wholesaler_title || 'wholesaler'}, KES ${formatKES(totalOf(order))}, ${paid ? 'paid' : 'unpaid'}`}
            style={({ pressed }) => ({
                backgroundColor: theme.panel,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDarkMode ? '#1e293b' : '#eef2f7',
                transform: [{ scale: pressed ? 0.985 : 1 }],
                ...(isWeb
                    ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.05)', cursor: 'pointer' } as any)
                    : {
                        shadowColor: '#0f172a',
                        shadowOpacity: 0.06,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 2,
                    }),
            })}
        >
            <View className="p-4">
                {/* Wholesaler + total */}
                <View className="flex-row items-center gap-3">
                    <InitialsAvatar name={order.wholesaler_title} size={42} />
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>
                            {order.wholesaler_title || '—'}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                            {orderRef(order)}
                            {order.payment_method_title ? ` · ${order.payment_method_title}` : ''}
                        </Text>
                    </View>
                    <View className="items-end">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={1}>
                            KES {formatKES(totalOf(order))}
                        </Text>
                        <View className="mt-1">
                            <PaymentPill paid={paid} compact />
                        </View>
                    </View>
                </View>

                {/* Items preview */}
                {previewItems.length > 0 ? (
                    <Text className="mt-2.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                        {previewItems.join(' · ')}
                        {itemCount > previewItems.length ? `  +${itemCount - previewItems.length} more` : ''}
                    </Text>
                ) : null}

                {/* Meta row */}
                <View className="flex-row items-center mt-3 pt-3 gap-3" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <StatusPill status={order.status} size="sm" />
                    <Meta icon="cube-outline" text={`${itemCount} item${itemCount === 1 ? '' : 's'}`} />
                    <Meta icon="calendar-outline" text={formatDate(order.created)} />
                    <View className="flex-1" />
                    <Ionicons name="chevron-forward" size={16} color={tint.fg} />
                </View>

                {/* Balance / origin */}
                {balance > 0 || order.order_origin ? (
                    <View className="flex-row items-center mt-2 gap-3">
                        {balance > 0 ? (
                            <View className="flex-row items-center gap-1">
                                <Ionicons name="wallet-outline" size={13} color="#f43f5e" />
                                <Text style={{ color: '#f43f5e', fontFamily: theme.font.bold, fontSize: 12 }}>
                                    Balance KES {formatKES(balance)}
                                </Text>
                            </View>
                        ) : null}
                        {order.order_origin ? <Meta icon="git-branch-outline" text={order.order_origin} /> : null}
                    </View>
                ) : null}
            </View>
        </Pressable>
    );
});

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    const { theme } = useAuth();
    return (
        <View className="flex-row items-center gap-1 shrink">
            <Ionicons name={icon} size={13} color={theme.textDark} />
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                {text}
            </Text>
        </View>
    );
}

function EmptyState({ hasActiveFilter, onClearFilters }: { hasActiveFilter: boolean; onClearFilters: () => void }) {
    const { theme } = useAuth();
    return (
        <View className="py-14 items-center px-6">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name={hasActiveFilter ? 'search' : 'cart-outline'} size={24} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>
                {hasActiveFilter ? 'No matching requisitions' : 'No requisitions yet'}
            </Text>
            <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                {hasActiveFilter ? 'Try a different search or filter.' : 'Requisitions you send to wholesalers will appear here.'}
            </Text>
            {hasActiveFilter && (
                <Pressable onPress={onClearFilters} className="mt-4 px-5 h-10 rounded-full items-center justify-center" style={{ backgroundColor: theme.primary }}>
                    <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                        Clear filters
                    </Text>
                </Pressable>
            )}
        </View>
    );
}
