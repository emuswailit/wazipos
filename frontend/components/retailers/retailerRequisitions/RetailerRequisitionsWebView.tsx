// components/retailers/retailerRequisitions/RetailerRequisitionsWebView.tsx
//
// Web table view for retailer requisitions.

import {
    PaginationBar,
    type PageSize,
} from '@/components/common/PaginationBar';
import type { RetailerOrder } from '@/databases/types';
import React from 'react';
import {
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth, type ThemeShape } from '@/context/AuthContext';

import {
    FilterPill,
    formatDate,
    formatKES,
    orderItemCount,
    orderRef,
    PaymentPill,
    StatusPill,
    SummaryBadge,
    toBool,
    type RetailerRequisitionsViewProps,
} from './primitives';

/* =========================================================
 * Pagination props — owned by the parent shell
 * ======================================================= */

type PaginationProps = {
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
};

type Props = RetailerRequisitionsViewProps & PaginationProps;

/* =========================================================
 * Column widths
 * ======================================================= */

const COLS = {
    reference: '15%',
    wholesaler: '16%',
    items: '5%',
    total: '11%',
    balance: '11%',
    paid: '8%',
    status: '11%',
    origin: '8%',
    created: '8%',
    actions: '7%',
} as const;

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerRequisitionsWebView({
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

    /* Pagination */
    page,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    onPrev,
    onNext,
    onPageSizeChange,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceLabel = isLiveConnected
        ? 'Live · websocket'
        : syncStatus === 'offline'
            ? 'Offline'
            : 'Connecting…';

    const sourceTint = isLiveConnected
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', dot: '#10b981' }
        : syncStatus === 'offline'
            ? { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e', dot: '#f43f5e' }
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
                            Retailer Requisitions
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <FilterPill
                                label={sourceLabel}
                                active
                                tint={sourceTint}
                                onPress={() => { }}
                            />
                            <SummaryBadge
                                label={`${counts.visible} of ${counts.total}`}
                            />
                            <SummaryBadge
                                label={`${counts.submitted} submitted`}
                                tone="primary"
                            />
                            {counts.unpaid > 0 ? (
                                <SummaryBadge
                                    label={`${counts.unpaid} unpaid`}
                                    tone="danger"
                                />
                            ) : null}
                            {lastSyncedTime ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onToggleOnlyUnpaid}
                            accessibilityRole="button"
                            accessibilityState={{
                                selected: onlyUnpaid,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center border"
                            style={{
                                borderColor: onlyUnpaid
                                    ? theme.primary
                                    : borderColor,
                                backgroundColor: onlyUnpaid
                                    ? `${theme.primary}15`
                                    : 'transparent',
                                minHeight: 40,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: onlyUnpaid
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Unpaid only
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onRefresh}
                            disabled={refreshing}
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: refreshing,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center"
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
                                {refreshing ? 'Refreshing…' : 'Refresh'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                <View className="flex-row items-center gap-3">
                    <TextInput
                        value={query}
                        onChangeText={onQueryChange}
                        placeholder="Search reference, wholesaler, product, batch…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-11 rounded-xl border px-3.5 max-w-[480px] flex-1"
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
                            className="px-3 py-2 rounded-lg border"
                            style={{ borderColor }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* ============ Table ============ */}
            <View className="p-4 flex-1">
                <View
                    className="flex-row rounded-xl border px-3 py-2.5 mb-1"
                    style={{ backgroundColor: headerBg, borderColor }}
                >
                    <Text style={headerStyle(theme, COLS.reference)}>
                        Reference
                    </Text>
                    <Text style={headerStyle(theme, COLS.wholesaler)}>
                        Wholesaler
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.items),
                            textAlign: 'right',
                        }}
                    >
                        Items
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.total),
                            textAlign: 'right',
                        }}
                    >
                        Total
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.balance),
                            textAlign: 'right',
                        }}
                    >
                        Balance
                    </Text>
                    <Text style={headerStyle(theme, COLS.paid)}>
                        Paid
                    </Text>
                    <Text style={headerStyle(theme, COLS.status)}>
                        Status
                    </Text>
                    <Text style={headerStyle(theme, COLS.origin)}>
                        Origin
                    </Text>
                    <Text style={headerStyle(theme, COLS.created)}>
                        Created
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.actions),
                            textAlign: 'right',
                        }}
                    >
                        Actions
                    </Text>
                </View>

                <FlatList
                    data={orders}
                    keyExtractor={(item) =>
                        item.remote_id || String(item.id ?? '')
                    }
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={theme.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View
                            className="rounded-xl border p-8 items-center"
                            style={{
                                borderColor,
                                backgroundColor: headerBg,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                {hasActiveFilter
                                    ? 'No requisitions match the filters.'
                                    : 'No requisitions yet.'}
                            </Text>
                            {hasActiveFilter && (
                                <Pressable
                                    onPress={clearFilters}
                                    className="mt-4 px-4 py-2.5 rounded-full"
                                    style={{
                                        backgroundColor: theme.primary,
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
                                        Clear filters
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    }
                    renderItem={({ item }) => (
                        <Row
                            item={item}
                            onView={() => onView(item)}
                        />
                    )}
                    showsVerticalScrollIndicator={false}
                />

                {/* ============ Pagination ============ */}
                <PaginationBar
                    page={page}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    onPrev={onPrev}
                    onNext={onNext}
                    onPageSizeChange={onPageSizeChange}
                />
            </View>
        </View>
    );
}

/* =========================================================
 * Row
 * ======================================================= */

function Row({
    item,
    onView,
}: {
    item: RetailerOrder;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const paid = toBool(item.is_paid);
    const balance = item.payment_summary?.balance_due ?? 0;

    return (
        <Pressable
            onPress={onView}
            className="flex-row rounded-xl border px-3 py-2.5 mb-1 items-center"
            style={{ borderColor }}
        >
            <Text
                style={cellStyle(theme, COLS.reference, true)}
                numberOfLines={1}
            >
                {orderRef(item)}
            </Text>
            <Text
                style={cellStyle(theme, COLS.wholesaler)}
                numberOfLines={1}
            >
                {item.wholesaler_title || '—'}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.items),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {orderItemCount(item)}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.total),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                KES {formatKES(item.final_price_total)}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.balance),
                    textAlign: 'right',
                    color: Number(balance) > 0 ? '#f43f5e' : '#10b981',
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                KES {formatKES(balance)}
            </Text>
            <View style={{ width: COLS.paid }}>
                <PaymentPill paid={paid} compact />
            </View>
            <View style={{ width: COLS.status }}>
                <StatusPill status={item.status} size="sm" />
            </View>
            <Text
                style={cellStyle(theme, COLS.origin)}
                numberOfLines={1}
            >
                {item.order_origin || '—'}
            </Text>
            <Text
                style={cellStyle(theme, COLS.created)}
                numberOfLines={1}
            >
                {formatDate(item.created)}
            </Text>
            <View
                style={{
                    width: COLS.actions,
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                }}
            >
                <Text
                    className="uppercase tracking-wide"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    View
                </Text>
            </View>
        </Pressable>
    );
}

/* =========================================================
 * Styles
 * ======================================================= */

function headerStyle(theme: ThemeShape, width: string) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
    };
}

function cellStyle(
    theme: ThemeShape,
    width: string,
    bold = false
) {
    return {
        width,
        color: bold ? theme.text : theme.textDark,
        fontFamily: bold ? theme.font.bold : theme.font.medium,
        fontSize: 11,
        paddingRight: 8,
    };
}