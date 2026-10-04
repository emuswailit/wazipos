// components/retailers/customerOrders/CustomerOrdersMobileView.tsx
//
// Small-screen view for customer orders.
//
// Reuses filter primitives and formatters exported from the WebView
// so pills, tints, and formatting stay identical across breakpoints.

import type { CustomerOrder } from '@/databases/types';
import React from 'react';
import {
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth, type ThemeShape } from '@/context/AuthContext';

import {
    FilterPill,
    formatDate,
    formatKES,
    orderAmount,
    orderItemCount,
    orderRef,
    PaymentPill,
    StatusPill,
    SummaryBadge,
    toBool,
    type CustomerOrdersViewProps,
} from './CustomerOrdersWebView';

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
    refreshing,
    onRefresh,
    isConnected,
    lastSynced,
    totalValue,
    onView,
}: CustomerOrdersViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceLabel = isConnected ? 'Live' : 'Offline';

    const sourceTint = isConnected
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', dot: '#10b981' }
        : { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b', dot: '#f59e0b' };

    const hasActiveFilter = onlyUnpaid || query.trim() !== '';

    const clearFilters = () => {
        if (onlyUnpaid) onToggleOnlyUnpaid();
        if (query.trim() !== '') onQueryChange('');
    };

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header ============ */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row items-start justify-between mb-3 gap-3">
                    <View className="flex-1 min-w-0">
                        <Text
                            className="tracking-tight"
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.lg,
                            }}
                        >
                            Customer Orders
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <FilterPill
                                label={sourceLabel}
                                active
                                tint={sourceTint}
                                onPress={() => { }}
                            />
                            <SummaryBadge
                                label={`${counts.total} order${counts.total === 1 ? '' : 's'
                                    }`}
                            />
                            {counts.unpaid > 0 ? (
                                <SummaryBadge
                                    label={`${counts.unpaid} unpaid`}
                                    tone="danger"
                                />
                            ) : null}
                        </View>

                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Value:{' '}
                                <Text
                                    style={{
                                        color: '#10b981',
                                        fontFamily: theme.font.bold,
                                    }}
                                >
                                    KES {formatKES(totalValue)}
                                </Text>
                            </Text>
                            {lastSynced ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    • Synced {lastSynced}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityState={{
                            disabled: refreshing,
                        }}
                        className="px-4 rounded-full items-center justify-center"
                        style={{
                            backgroundColor: theme.primary,
                            opacity: refreshing ? 0.5 : 1,
                            minHeight: 40,
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                            }}
                        >
                            {refreshing ? '…' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2 -mx-1"
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                    <FilterPill
                        label="All"
                        active={!onlyUnpaid}
                        count={counts.total}
                        tint={{
                            fg: theme.primary,
                            dot: theme.primary,
                            bg: `${theme.primary}15`,
                        }}
                        onPress={() => {
                            if (onlyUnpaid) onToggleOnlyUnpaid();
                        }}
                    />
                    <FilterPill
                        label="Unpaid only"
                        active={onlyUnpaid}
                        count={counts.unpaid}
                        tint={{
                            fg: '#f43f5e',
                            dot: '#f43f5e',
                            bg: 'rgba(244,63,94,0.12)',
                        }}
                        onPress={() => {
                            if (!onlyUnpaid) onToggleOnlyUnpaid();
                        }}
                    />
                </ScrollView>

                <TextInput
                    value={query}
                    onChangeText={onQueryChange}
                    placeholder="Search order number, customer…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-11 rounded-xl border px-3.5"
                    style={{
                        borderColor,
                        backgroundColor: inputBg,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                />

                {hasActiveFilter && (
                    <Pressable
                        onPress={clearFilters}
                        className="mt-2 self-start"
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Clear filters
                        </Text>
                    </Pressable>
                )}
            </View>

            {/* ============ List ============ */}
            <FlatList
                data={orders}
                keyExtractor={(item, idx) =>
                    `${item.remote_id ??
                    item.draft_id ??
                    item.id ??
                    'order'}-${idx}`
                }
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 32,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        theme={theme}
                        hasActiveFilter={hasActiveFilter}
                        hasOrders={counts.total > 0}
                        onClearFilters={clearFilters}
                    />
                }
                renderItem={({ item }) => (
                    <OrderCard
                        order={item}
                        onView={() => onView(item)}
                    />
                )}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

function OrderCard({
    order,
    onView,
}: {
    order: CustomerOrder;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const paid = toBool(order.is_paid);
    const itemCount = orderItemCount(order);
    const amount = orderAmount(order);

    const previewItems = (order.order_items ?? [])
        .slice(0, 3)
        .map(
            (i) =>
                i.title ||
                i.receipt_details?.product_title ||
                ''
        )
        .filter(Boolean);

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <View className="flex-row items-center mb-2">
                <Text
                    className="flex-1 uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                    numberOfLines={1}
                >
                    {orderRef(order)}
                </Text>
                <StatusPill status={order.status} />
            </View>

            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 15,
                }}
                numberOfLines={2}
            >
                {order.customer_name || '—'}
            </Text>

            <View className="flex-row items-center flex-wrap gap-1.5 mt-2.5">
                <Chip theme={theme} borderColor={borderColor}>
                    {itemCount} item{itemCount === 1 ? '' : 's'}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {order.order_type || '—'}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {formatDate(order.created)}
                </Chip>
            </View>

            <View
                className="rounded-xl px-3 py-2 mt-2.5 flex-row items-center justify-between"
                style={{ backgroundColor: subBg }}
            >
                <View>
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Amount
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            marginTop: 2,
                        }}
                    >
                        KES {formatKES(amount)}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Settlement
                    </Text>
                    <Text
                        style={{
                            color: paid ? '#10b981' : '#f43f5e',
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            marginTop: 2,
                        }}
                    >
                        {paid ? 'Settled' : 'Unsettled'}
                    </Text>
                </View>
            </View>

            <View className="flex-row items-center gap-2 mt-2.5">
                <PaymentPill paid={paid} />
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                    }}
                    numberOfLines={1}
                >
                    {order.selected_payment_method_title || 'N/A'}
                </Text>
            </View>

            {previewItems.length > 0 && (
                <View className="mt-2.5">
                    {previewItems.map((t, i) => (
                        <Text
                            key={`${order.remote_id}-p-${i}`}
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 12,
                            }}
                            numberOfLines={1}
                        >
                            • {t}
                        </Text>
                    ))}
                    {itemCount > 3 && (
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                                opacity: 0.7,
                            }}
                        >
                            +{itemCount - 3} more
                        </Text>
                    )}
                </View>
            )}

            <View
                className="flex-row justify-end gap-4 mt-3 pt-2.5 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                <Pressable
                    onPress={onView}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="View order"
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                        }}
                    >
                        View details
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Chip
 * ======================================================= */

function Chip({
    children,
    theme,
    borderColor,
}: {
    children: React.ReactNode;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: theme.isDarkMode
                    ? '#0f172a'
                    : '#f1f5f9',
                borderColor,
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
                numberOfLines={1}
            >
                {children}
            </Text>
        </View>
    );
}

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({
    theme,
    hasActiveFilter,
    hasOrders,
    onClearFilters,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    hasOrders: boolean;
    onClearFilters: () => void;
}) {
    return (
        <View className="p-8 items-center">
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.base,
                }}
            >
                {hasActiveFilter
                    ? 'No matches'
                    : hasOrders
                        ? 'Nothing to show'
                        : 'No customer orders yet'}
            </Text>
            <Text
                className="mt-1 text-center"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.regular,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {hasActiveFilter
                    ? 'Try adjusting your filters.'
                    : 'New orders will appear here as they arrive.'}
            </Text>
            {hasActiveFilter && (
                <Pressable
                    onPress={onClearFilters}
                    className="mt-4 px-5 rounded-full items-center justify-center"
                    style={{
                        backgroundColor: theme.primary,
                        minHeight: 44,
                    }}
                >
                    <Text
                        className="uppercase tracking-widest text-white"
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        Clear filters
                    </Text>
                </Pressable>
            )}
        </View>
    );
}