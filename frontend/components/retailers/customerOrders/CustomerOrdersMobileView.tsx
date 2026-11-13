// components/retailers/customerOrders/CustomerOrdersMobileView.tsx
//
// Small-screen view for customer orders (native apps and narrow web).
//
//   - No pagination: every order in one scrolling list.
//   - Compact cards; tapping a card opens the order sheet (InvoiceModal, rendered by
//     CustomerOrdersList) with details, print and payment.
//
// Pills, formatters and the avatar are shared with the web view.

import type { CustomerOrder } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';

import {
    Avatar,
    formatDate,
    formatKES,
    PAYMENT_METHOD_FILTERS,
    PAYMENT_METHOD_ICONS,
    PAYMENT_METHOD_LABELS,
    orderAmount,
    orderItemCount,
    orderRef,
    PaymentPill,
    StatusPill,
    statusTint,
    toBool,
    UploadStatus,
    type CustomerOrdersViewProps,
} from './CustomerOrdersWebView';
import { ActiveFilterPill, AdminSheet, SearchField, SheetButton, SheetChoiceGroup, SheetSyncRow, SheetTile } from '@/components/common/listScreen';

const isWeb = Platform.OS === 'web';

/* =========================================================
 * Component
 * ======================================================= */

export function CustomerOrdersMobileView({
    orders,
    counts,
    query,
    onQueryChange,
    onlyUnpaid,
    onToggleOnlyUnpaid,
    paymentMethod,
    onPaymentMethodChange,
    refreshing,
    onRefresh,
    isConnected,
    lastSynced,
    totalValue,
    onView,
    onRetryUpload,
    isUploading,
}: CustomerOrdersViewProps) {
    const { theme, isDarkMode } = useAuth();
    const [filtersOpen, setFiltersOpen] = useState(false);

    const hasActiveFilter = onlyUnpaid || paymentMethod !== 'ALL' || query.trim() !== '';
    const clearFilters = () => {
        if (onlyUnpaid) onToggleOnlyUnpaid();
        if (paymentMethod !== 'ALL') onPaymentMethodChange('ALL');
        if (query.trim() !== '') onQueryChange('');
    };


    const searchBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sheetActive = onlyUnpaid || paymentMethod !== 'ALL';

    // Compact header: search · filters. Summary, Unpaid/All, payment method and
    // sync + refresh live in the filters sheet.
    const header = (
        <View style={{ paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <SearchField variant="mobile" value={query} onChangeText={onQueryChange} placeholder="Search orders, customers, phone…" />
                </View>
                <Pressable
                    onPress={() => setFiltersOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={sheetActive ? 'Filters and sync, filters applied' : 'Filters and sync'}
                    style={({ pressed }) => ({
                        width: 44,
                        height: 44,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sheetActive ? `${theme.primary}18` : searchBg,
                        opacity: pressed ? 0.8 : 1,
                        ...(isWeb ? ({ cursor: 'pointer' } as any) : {}),
                    })}
                >
                    <Ionicons name="options-outline" size={19} color={sheetActive ? theme.primary : theme.text} />
                    {sheetActive ? (
                        <View style={{ position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.primary, borderWidth: 1.5, borderColor: theme.background }} />
                    ) : null}
                </Pressable>
            </View>

            {/* One line of context: live dot · count · value · active filters */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4, gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isConnected ? '#10b981' : '#f59e0b' }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {orders.length.toLocaleString()} {orders.length === 1 ? 'order' : 'orders'} · KES {formatKES(totalValue)}
                </Text>
                <View style={{ flex: 1 }} />
                {onlyUnpaid ? <ActiveFilterPill label="Unpaid" onClear={onToggleOnlyUnpaid} /> : null}
                {paymentMethod !== 'ALL' ? <ActiveFilterPill label={PAYMENT_METHOD_LABELS[paymentMethod]} onClear={() => onPaymentMethodChange('ALL')} /> : null}
            </View>
        </View>
    );

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <FlatList
                data={orders}
                keyExtractor={(item, idx) => `${item.remote_id ?? item.draft_id ?? item.id ?? 'order'}-${idx}`}
                ListHeaderComponent={header}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                ListEmptyComponent={
                    <EmptyState hasActiveFilter={hasActiveFilter} onClearFilters={clearFilters} />
                }
                renderItem={({ item }) => (
                    <OrderCard order={item} onPress={onView} onRetryUpload={onRetryUpload} isUploading={isUploading} />
                )}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                windowSize={11}
            />

            <AdminSheet
                visible={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                title="Filter orders"
                subtitle="Customer orders"
                icon="options-outline"
                footer={
                    <>
                        <SheetButton
                            label="Reset"
                            variant="ghost"
                            disabled={!sheetActive}
                            onPress={() => {
                                if (onlyUnpaid) onToggleOnlyUnpaid();
                                if (paymentMethod !== 'ALL') onPaymentMethodChange('ALL');
                            }}
                            grow
                        />
                        <SheetButton label={`Show ${orders.length.toLocaleString()} ${orders.length === 1 ? 'order' : 'orders'}`} onPress={() => setFiltersOpen(false)} grow />
                    </>
                }
            >
                {/* Summary */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <SheetTile label={hasActiveFilter ? 'Filtered value' : 'Total value'} value={`KES ${formatKES(totalValue)}`} />
                    <SheetTile label="Orders" value={counts.total.toLocaleString()} />
                    <SheetTile label="Unpaid" value={counts.unpaid.toLocaleString()} color={counts.unpaid ? '#f59e0b' : undefined} />
                </View>

                <SheetChoiceGroup
                    label="Show"
                    options={[
                        { key: 'all', label: 'All orders', icon: 'apps-outline', count: counts.total },
                        { key: 'unpaid', label: 'Unpaid', icon: 'alert-circle-outline', count: counts.unpaid },
                    ]}
                    value={onlyUnpaid ? 'unpaid' : 'all'}
                    onChange={(k) => {
                        if ((k === 'unpaid') !== onlyUnpaid) onToggleOnlyUnpaid();
                    }}
                />

                <SheetChoiceGroup
                    label="Payment method"
                    options={PAYMENT_METHOD_FILTERS.map((m) => ({ key: m, label: PAYMENT_METHOD_LABELS[m], icon: PAYMENT_METHOD_ICONS[m], count: counts.byMethod?.[m] }))}
                    value={paymentMethod}
                    onChange={(k) => onPaymentMethodChange(k as typeof paymentMethod)}
                />

                {/* Sync + manual refresh (pull-to-refresh on the list works too) */}
                <SheetSyncRow dotColor={isConnected ? '#10b981' : '#f59e0b'} label={`${isConnected ? 'Live' : 'Offline'}${lastSynced ? ` · synced ${lastSynced}` : ''}`} refreshing={refreshing} onRefresh={onRefresh} refreshLabel="Refresh orders" />
            </AdminSheet>
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

const OrderCard = memo(function OrderCard({
    order,
    onPress,
    onRetryUpload,
    isUploading,
}: {
    order: CustomerOrder;
    onPress: (o: CustomerOrder) => void;
    onRetryUpload?: () => void;
    isUploading?: boolean;
}) {
    const { theme, isDarkMode } = useAuth();
    const paid = toBool(order.is_paid);
    const itemCount = orderItemCount(order);
    const tint = statusTint(order.status);
    const pendingUpload = String((order as any).synced).toUpperCase() === 'FALSE';
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';

    return (
        <Pressable
            onPress={() => onPress(order)}
            // The card holds a Retry button; on web a button role here would nest <button>s.
            accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
            accessibilityLabel={`Order ${orderRef(order)} for ${order.customer_name || 'walk-in customer'}, KES ${formatKES(orderAmount(order))}, ${paid ? 'paid' : 'unpaid'}`}
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
                {/* Customer + amount */}
                <View className="flex-row items-center gap-3">
                    <Avatar name={order.customer_name} size={42} />
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>
                            {order.customer_name || 'Walk-in Customer'}
                        </Text>
                        <View className="flex-row items-center gap-1 mt-0.5">
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                {orderRef(order)}
                            </Text>
                            {pendingUpload ? <Ionicons name="cloud-upload-outline" size={12} color="#f59e0b" /> : null}
                        </View>
                    </View>
                    <View className="items-end">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={1}>
                            KES {formatKES(orderAmount(order))}
                        </Text>
                        <View className="mt-1">
                            <PaymentPill paid={paid} compact />
                        </View>
                    </View>
                </View>

                {/* Meta row */}
                <View className="flex-row items-center mt-3.5 pt-3 gap-3" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <StatusPill status={order.status} size="sm" />
                    <Meta icon="cube-outline" text={`${itemCount} item${itemCount === 1 ? '' : 's'}`} />
                    <Meta icon="calendar-outline" text={formatDate(order.created)} />
                    <View className="flex-1" />
                    <Ionicons name="chevron-forward" size={16} color={tint.fg} />
                </View>

                {/* Offline order: waiting to upload / upload failed + Retry */}
                <UploadStatus order={order} onRetry={onRetryUpload} retrying={isUploading} />
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

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({ hasActiveFilter, onClearFilters }: { hasActiveFilter: boolean; onClearFilters: () => void }) {
    const { theme } = useAuth();
    return (
        <View className="py-14 items-center px-6">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name={hasActiveFilter ? 'search' : 'receipt-outline'} size={24} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>
                {hasActiveFilter ? 'No matching orders' : 'No customer orders yet'}
            </Text>
            <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                {hasActiveFilter ? 'Try a different search or filter.' : 'New orders will appear here as they arrive.'}
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
