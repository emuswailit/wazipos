// components/wholesalers/orders/RetailerOrdersMobileView.tsx

import { useAuth } from '@/context/AuthContext';
import type { RetailerOrder } from '@/databases/types';
import React from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
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

export default function RetailerOrdersMobileView(
    props: Props
) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const sourceColor =
        props.sourceTone === 'server'
            ? '#10b981'
            : props.sourceTone === 'cache'
                ? '#f59e0b'
                : theme.textDark;
    const sourceBg =
        props.sourceTone === 'server'
            ? 'rgba(16,185,129,0.12)'
            : props.sourceTone === 'cache'
                ? 'rgba(251,191,36,0.15)'
                : 'rgba(148,163,184,0.15)';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* Header */}
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
                                style={{
                                    backgroundColor: sourceBg,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: sourceColor,
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                    }}
                                >
                                    {props.sourceLabel}
                                </Text>
                            </View>
                            {props.lastSyncedTime ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Synced {props.lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <Pressable
                        onPress={props.onRefresh}
                        disabled={props.refreshing}
                        hitSlop={8}
                        className="px-4 py-2.5 rounded-full"
                        style={{
                            backgroundColor: theme.primary,
                            opacity: props.refreshing ? 0.6 : 1,
                            minHeight: 40,
                        }}
                    >
                        {props.refreshing ? (
                            <ActivityIndicator
                                size="small"
                                color="#ffffff"
                            />
                        ) : (
                            <Text
                                className="uppercase tracking-widest text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Sync
                            </Text>
                        )}
                    </Pressable>
                </View>

                {/* Status filters */}
                <View className="flex-row flex-wrap gap-1.5 mb-2">
                    {props.statusFilters.map((f) => {
                        const active =
                            props.statusFilter === f.value;
                        return (
                            <Pressable
                                key={f.value}
                                onPress={() =>
                                    props.setStatusFilter(
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
                    value={props.query}
                    onChangeText={props.setQuery}
                    placeholder="Search by reference, retailer…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-11 rounded-xl border px-3.5"
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

            {/* Cards */}
            <FlatList
                data={props.items}
                keyExtractor={rowKey}
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 40,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={props.refreshing}
                        onRefresh={props.onRefresh}
                        tintColor={theme.primary}
                    />
                }
                ListEmptyComponent={
                    <View className="p-8 items-center">
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                            }}
                        >
                            No orders match the filters.
                        </Text>
                    </View>
                }
                ListFooterComponent={
                    props.totalItems > 0 ? (
                        <PaginationBar
                            page={props.page}
                            pageSize={props.pageSize}
                            totalItems={props.totalItems}
                            totalPages={props.totalPages}
                            pageStart={props.pageStart}
                            pageEnd={props.pageEnd}
                            onPrev={props.onPrev}
                            onNext={props.onNext}
                            onPageSizeChange={
                                props.onPageSizeChange
                            }
                        />
                    ) : null
                }
                renderItem={({ item }) => (
                    <OrderCard
                        order={item}
                        onPress={() => props.onPressOrder(item)}
                    />
                )}
            />
        </View>
    );
}

/* =========================================================
 * Order card
 * ======================================================= */
function OrderCard({
    order,
    onPress,
}: {
    order: RetailerOrder;
    onPress: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const statusColor =
        order.status === 'DELIVERED'
            ? '#10b981'
            : order.status === 'CANCELLED'
                ? '#ef4444'
                : order.status === 'DRAFT'
                    ? '#f59e0b'
                    : theme.primary;

    return (
        <Pressable
            onPress={onPress}
            className="rounded-2xl border p-3.5 mb-3"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            <View className="flex-row items-start justify-between mb-2">
                <View className="flex-1 min-w-0 pr-2">
                    <Text
                        numberOfLines={1}
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 15,
                        }}
                    >
                        {order.retailer_title || '—'}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.mono,
                            fontSize: 10,
                            marginTop: 2,
                        }}
                    >
                        {order.reference_number ||
                            order.draft_id}
                    </Text>
                </View>

                <View
                    className="px-2 py-0.5 rounded-md"
                    style={{
                        backgroundColor: `${statusColor}20`,
                    }}
                >
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: statusColor,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        {order.status}
                    </Text>
                </View>
            </View>

            <View className="flex-row items-center justify-between">
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {order.order_items?.length ?? 0} items ·{' '}
                    {order.payment_method_title}
                </Text>
                <Text
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: 14,
                    }}
                >
                    KES{' '}
                    {Number(
                        order.final_price_total ?? 0
                    ).toFixed(2)}
                </Text>
            </View>
        </Pressable>
    );
}

/* ------------------------------------------------ */
/* Imports that were truncated above                */
/* ------------------------------------------------ */
import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
