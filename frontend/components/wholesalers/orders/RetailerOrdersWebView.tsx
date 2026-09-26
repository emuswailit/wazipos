// components/wholesalers/orders/RetailerOrdersWebView.tsx

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import type { RetailerOrder } from '@/databases/types';
import React, { useMemo } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import type { PageSize } from './RetailerOrdersList';

interface Props {
    query: string;
    setQuery: (v: string) => void;
    statusFilter: string | null;
    setStatusFilter: (v: string | null) => void;
    statusFilters: readonly {
        value: string;
        label: string;
    }[];
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    items: RetailerOrder[];
    onPressOrder: (o: RetailerOrder) => void;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

function rowKey(o: RetailerOrder): string {
    return o.remote_id || o.draft_id;
}

/* Status → color */
function statusColor(status: string, primary: string): string {
    const s = String(status ?? '').toUpperCase();
    if (s === 'DELIVERED') return '#10b981';
    if (s === 'CANCELLED') return '#ef4444';
    if (s === 'DRAFT') return '#f59e0b';
    if (s === 'APPROVED') return '#0ea5e9';
    return primary;
}

export default function RetailerOrdersWebView({
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    statusFilters,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    items,
    onPressOrder,
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
    const rowHover = isDarkMode ? '#1e293b' : '#f8fafc';

    const sourceColor =
        sourceTone === 'server'
            ? '#10b981'
            : sourceTone === 'cache'
                ? '#f59e0b'
                : theme.textDark;
    const sourceBg =
        sourceTone === 'server'
            ? 'rgba(16,185,129,0.12)'
            : sourceTone === 'cache'
                ? 'rgba(251,191,36,0.15)'
                : 'rgba(148,163,184,0.15)';

    /* Column widths — sum to 100% */
    const cols = useMemo(
        () => ({
            reference: '16%',
            retailer: '22%',
            items: '8%',
            payment: '14%',
            status: '12%',
            total: '14%',
            actions: '14%',
        }),
        []
    );

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* -------- Header -------- */}
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
                            Retailer Orders
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <View
                                className="px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: sourceBg }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: sourceColor,
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                    }}
                                >
                                    {sourceLabel}
                                </Text>
                            </View>
                            {lastSyncedTime ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Last synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onRefresh}
                            disabled={refreshing}
                            hitSlop={8}
                            className="px-4 py-2.5 rounded-full items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: refreshing ? 0.6 : 1,
                                minHeight: 40,
                                minWidth: 40,
                            }}
                        >
                            {refreshing ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#ffffff"
                                />
                            ) : (
                                <Text
                                    className="uppercase tracking-widest text-white"
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    Sync now
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                {/* Status filters */}
                <View className="flex-row flex-wrap gap-1.5 mb-2">
                    {statusFilters.map((f) => {
                        const active =
                            statusFilter === f.value;
                        return (
                            <Pressable
                                key={f.value}
                                onPress={() =>
                                    setStatusFilter(
                                        active ? null : f.value
                                    )
                                }
                                className="px-2.5 py-1 rounded-full border"
                                style={{
                                    borderColor: active
                                        ? theme.primary
                                        : borderColor,
                                    backgroundColor: active
                                        ? `${theme.primary}15`
                                        : 'transparent',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: active
                                            ? theme.primary
                                            : theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {f.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by reference, retailer, payment…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-11 rounded-xl border px-3.5 max-w-[480px]"
                    style={{
                        borderColor,
                        backgroundColor: isDarkMode
                            ? '#0f172a'
                            : '#f1f5f9',
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                />
            </View>

            {/* -------- Table -------- */}
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
            >
                <View className="p-4">
                    {/* Header row */}
                    <View
                        className="flex-row rounded-xl border px-3 py-2.5 mb-1"
                        style={{
                            backgroundColor: headerBg,
                            borderColor,
                        }}
                    >
                        <Text
                            style={headerStyle(
                                theme,
                                cols.reference
                            )}
                        >
                            Reference
                        </Text>
                        <Text
                            style={headerStyle(
                                theme,
                                cols.retailer
                            )}
                        >
                            Retailer
                        </Text>
                        <Text
                            style={headerStyle(
                                theme,
                                cols.items,
                                'center'
                            )}
                        >
                            Items
                        </Text>
                        <Text
                            style={headerStyle(
                                theme,
                                cols.payment,
                                'center'
                            )}
                        >
                            Payment
                        </Text>
                        <Text
                            style={headerStyle(
                                theme,
                                cols.status,
                                'center'
                            )}
                        >
                            Status
                        </Text>
                        <Text
                            style={headerStyle(
                                theme,
                                cols.total,
                                'right'
                            )}
                        >
                            Total
                        </Text>
                        <Text
                            style={{
                                ...headerStyle(
                                    theme,
                                    cols.actions
                                ),
                                textAlign: 'right',
                            }}
                        >
                            Actions
                        </Text>
                    </View>

                    {/* Rows */}
                    {items.length === 0 ? (
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
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            >
                                No orders match the filters.
                            </Text>
                        </View>
                    ) : (
                        items.map((order) => (
                            <Row
                                key={rowKey(order)}
                                order={order}
                                cols={cols}
                                rowHover={rowHover}
                                onPress={() =>
                                    onPressOrder(order)
                                }
                            />
                        ))
                    )}

                    {/* Pagination */}
                    {totalItems > 0 ? (
                        <View className="mt-3">
                            <PaginationBar
                                page={page}
                                pageSize={pageSize}
                                totalItems={totalItems}
                                totalPages={totalPages}
                                pageStart={pageStart}
                                pageEnd={pageEnd}
                                onPrev={onPrev}
                                onNext={onNext}
                                onPageSizeChange={
                                    onPageSizeChange
                                }
                            />
                        </View>
                    ) : null}
                </View>
            </ScrollView>
        </View>
    );
}

/* =========================================================
 * Row
 * ======================================================= */
function Row({
    order,
    cols,
    rowHover,
    onPress,
}: {
    order: RetailerOrder;
    cols: {
        reference: string;
        retailer: string;
        items: string;
        payment: string;
        status: string;
        total: string;
        actions: string;
    };
    rowHover: string;
    onPress: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const status = String(order.status ?? '').toUpperCase();
    const tint = statusColor(status, theme.primary);

    const itemCount = order.order_items?.length ?? 0;

    const reference =
        order.reference_number ||
        order.document_number_display ||
        order.draft_id ||
        '—';

    return (
        <Pressable
            onPress={onPress}
            className="flex-row rounded-xl border px-3 py-3 mb-1 items-center"
            style={{ borderColor }}
        >
            {/* Reference */}
            <Text
                style={cellStyle(theme, cols.reference)}
                numberOfLines={1}
            >
                {reference}
            </Text>

            {/* Retailer */}
            <View style={{ width: cols.retailer, paddingRight: 8 }}>
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 12,
                    }}
                    numberOfLines={1}
                >
                    {order.retailer_title || '—'}
                </Text>
                {order.wholesaler_title ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 10,
                            marginTop: 1,
                        }}
                        numberOfLines={1}
                    >
                        → {order.wholesaler_title}
                    </Text>
                ) : null}
            </View>

            {/* Items count */}
            <Text
                style={{
                    ...cellStyle(theme, cols.items, 'center'),
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {itemCount}
            </Text>

            {/* Payment */}
            <Text
                style={{
                    ...cellStyle(theme, cols.payment, 'center'),
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    fontSize: 10,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {order.payment_method_title || '—'}
            </Text>

            {/* Status chip */}
            <View
                style={{
                    width: cols.status,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <View
                    style={{
                        backgroundColor: `${tint}20`,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                    }}
                >
                    <Text
                        style={{
                            color: tint,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                            letterSpacing: 0.5,
                        }}
                        numberOfLines={1}
                    >
                        {status}
                    </Text>
                </View>
            </View>

            {/* Total */}
            <Text
                style={{
                    ...cellStyle(theme, cols.total, 'right'),
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                    fontSize: 12,
                }}
                numberOfLines={1}
            >
                KES{' '}
                {Number(
                    order.final_price_total ?? 0
                ).toFixed(2)}
            </Text>

            {/* Actions */}
            <View
                style={{
                    width: cols.actions,
                    alignItems: 'flex-end',
                }}
            >
                <Pressable
                    onPress={(e) => {
                        e?.stopPropagation?.();
                        onPress();
                    }}
                    hitSlop={6}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                        borderColor: theme.primary,
                        backgroundColor: `${theme.primary}15`,
                        minHeight: 32,
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
                </Pressable>
            </View>
        </Pressable>
    );
}

/* =========================================================
 * Helpers
 * ======================================================= */
function headerStyle(
    theme: any,
    width: string,
    align: 'left' | 'center' | 'right' = 'left'
) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        textAlign: align,
    };
}

function cellStyle(
    theme: any,
    width: string,
    align: 'left' | 'center' | 'right' = 'left'
) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.medium,
        fontSize: 11,
        paddingRight: 8,
        textAlign: align,
    };
}