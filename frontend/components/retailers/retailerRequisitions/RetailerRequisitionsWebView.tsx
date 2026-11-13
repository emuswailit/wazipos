// components/retailers/retailerRequisitions/RetailerRequisitionsWebView.tsx
//
// Web table view for retailer requisitions (wide web screens).
// Layout matches the Customer Orders web table: compact header with stats, a table card
// with a search/filter toolbar, flex columns, hover rows and the shared PaginationBar.

import { InitialsAvatar } from '@/components/common/InitialsAvatar';
import { PaginationBar, type PageSize } from '@/components/common/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import type { RetailerOrder } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

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
    type RetailerRequisitionsViewProps,
} from './primitives';

const MAX_WIDTH = 1600;
const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

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

const COLS = {
    reference: 1.3,
    wholesaler: 2,
    items: 0.6,
    origin: 0.9,
    status: 1,
    payment: 0.9,
    balance: 1.1,
    total: 1.1,
    chevron: 0.3,
} as const;

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
    const borderColor = isDarkMode ? '#1e293b' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0b1220' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const live = isLiveConnected;
    const statusText = live ? 'Live' : syncStatus === 'offline' ? 'Offline' : 'Connecting…';
    const statusDot = live ? '#10b981' : syncStatus === 'offline' ? '#f43f5e' : '#f59e0b';

    const hasActiveFilter = onlyUnpaid || query.trim() !== '';
    const clearFilters = () => {
        if (onlyUnpaid) onToggleOnlyUnpaid();
        if (query.trim() !== '') onQueryChange('');
    };

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className="flex-1 w-full self-center px-6 pt-4 pb-4" style={{ maxWidth: MAX_WIDTH }}>
                {/* ============ Compact header ============ */}
                <View className="flex-row items-center mb-3 gap-4">
                    <Text className="tracking-tight" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>
                        Requisitions
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: statusDot }} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {statusText}
                            {lastSyncedTime ? ` · ${lastSyncedTime}` : ''}
                        </Text>
                    </View>

                    <View className="flex-1" />

                    <InlineStat label="Requisitions" value={counts.total.toLocaleString()} />
                    <InlineStat label="Submitted" value={counts.submitted.toLocaleString()} color={theme.primary} />
                    <InlineStat label="Unpaid" value={counts.unpaid.toLocaleString()} color={counts.unpaid > 0 ? '#f43f5e' : undefined} />
                    <InlineStat
                        label={hasActiveFilter ? 'Balance (filtered)' : 'Balance due'}
                        value={`KES ${formatKES(counts.visibleBalance)}`}
                        color={counts.visibleBalance > 0 ? '#f43f5e' : '#10b981'}
                    />

                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh requisitions"
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg"
                        style={{ backgroundColor: theme.primary, opacity: refreshing ? 0.6 : 1, ...webPointer }}
                    >
                        <Ionicons name="refresh" size={14} color="#fff" />
                        <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12 }}>
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>

                {/* ============ Table card ============ */}
                <View
                    className="flex-1 rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                        ...(isWeb ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)' } as any) : {}),
                    }}
                >
                    {/* Toolbar */}
                    <View className="flex-row flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderBottomColor: borderColor }}>
                        <View
                            className="flex-row items-center flex-1 min-w-[220px] max-w-[380px] h-9 rounded-xl border px-3"
                            style={{ borderColor, backgroundColor: inputBg }}
                        >
                            <Ionicons name="search" size={16} color={theme.textDark} />
                            <TextInput
                                value={query}
                                onChangeText={onQueryChange}
                                placeholder="Search reference, wholesaler, product, batch…"
                                placeholderTextColor="#94a3b8"
                                autoCorrect={false}
                                autoCapitalize="none"
                                className="flex-1 h-full ml-2"
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.medium,
                                    fontSize: 13,
                                    ...(isWeb ? ({ outlineStyle: 'none' } as any) : {}),
                                }}
                            />
                            {query ? (
                                <Pressable onPress={() => onQueryChange('')} hitSlop={8} style={webPointer}>
                                    <Ionicons name="close-circle" size={16} color={theme.textDark} />
                                </Pressable>
                            ) : null}
                        </View>

                        <SegmentedFilter onlyUnpaid={onlyUnpaid} onToggle={onToggleOnlyUnpaid} unpaid={counts.unpaid} />

                        {hasActiveFilter ? (
                            <Pressable onPress={clearFilters} hitSlop={6} style={webPointer}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear</Text>
                            </Pressable>
                        ) : null}

                        <View className="flex-1" />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {counts.visible.toLocaleString()} {counts.visible === 1 ? 'requisition' : 'requisitions'} · KES{' '}
                            {formatKES(counts.visibleValue)}
                        </Text>
                    </View>

                    {/* Column header */}
                    <View className="flex-row items-center px-5 py-2.5" style={{ backgroundColor: headerBg }}>
                        <HeaderCell flex={COLS.reference}>Reference</HeaderCell>
                        <HeaderCell flex={COLS.wholesaler}>Wholesaler</HeaderCell>
                        <HeaderCell flex={COLS.items} align="center">Items</HeaderCell>
                        <HeaderCell flex={COLS.origin}>Origin</HeaderCell>
                        <HeaderCell flex={COLS.status}>Status</HeaderCell>
                        <HeaderCell flex={COLS.payment}>Payment</HeaderCell>
                        <HeaderCell flex={COLS.balance} align="right">Balance</HeaderCell>
                        <HeaderCell flex={COLS.total} align="right">Total</HeaderCell>
                        <View style={{ flex: COLS.chevron }} />
                    </View>

                    {/* Rows */}
                    <FlatList
                        data={orders}
                        keyExtractor={(item, idx) => `${item.remote_id || item.id || 'req'}-${idx}`}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                        ListEmptyComponent={
                            <View className="py-16 items-center">
                                <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                                    <Ionicons name={hasActiveFilter ? 'search' : 'cart-outline'} size={22} color={theme.primary} />
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                                    {hasActiveFilter ? 'No matching requisitions' : 'No requisitions yet'}
                                </Text>
                                <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                                    {hasActiveFilter ? 'Try a different search or filter.' : 'Requisitions you send to wholesalers will appear here.'}
                                </Text>
                                {hasActiveFilter && (
                                    <Pressable
                                        onPress={clearFilters}
                                        className="mt-4 px-4 h-9 rounded-xl items-center justify-center border"
                                        style={{ borderColor, ...webPointer }}
                                    >
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>Clear filters</Text>
                                    </Pressable>
                                )}
                            </View>
                        }
                        renderItem={({ item, index }) => <Row item={item} isFirst={index === 0} onView={() => onView(item)} />}
                        showsVerticalScrollIndicator={false}
                    />

                    {/* Pagination (shared component; draws its own top border) */}
                    {totalItems > 0 && (
                        <View className="px-5 pb-3">
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
                    )}
                </View>
            </View>
        </View>
    );
}

/* =========================================================
 * Pieces
 * ======================================================= */

function InlineStat({ label, value, color }: { label: string; value: string; color?: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
}

function SegmentedFilter({ onlyUnpaid, onToggle, unpaid }: { onlyUnpaid: boolean; onToggle: () => void; unpaid: number }) {
    const { theme, isDarkMode } = useAuth();
    const options = [
        { key: 'all', label: 'All', active: !onlyUnpaid },
        { key: 'unpaid', label: unpaid > 0 ? `Unpaid · ${unpaid}` : 'Unpaid', active: onlyUnpaid },
    ];
    return (
        <View className="flex-row p-1 rounded-xl" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
            {options.map((o) => (
                <Pressable
                    key={o.key}
                    onPress={() => {
                        if (!o.active) onToggle();
                    }}
                    className="px-3.5 h-7 rounded-lg items-center justify-center"
                    style={{
                        backgroundColor: o.active ? theme.panel : 'transparent',
                        ...(isWeb && o.active ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.08)' } as any) : {}),
                        ...webPointer,
                    }}
                >
                    <Text style={{ color: o.active ? theme.text : theme.textDark, fontFamily: theme.font.bold, fontSize: 12 }}>{o.label}</Text>
                </Pressable>
            ))}
        </View>
    );
}

function HeaderCell({ flex, align = 'left', children }: { flex: number; align?: 'left' | 'center' | 'right'; children: React.ReactNode }) {
    const { theme } = useAuth();
    return (
        <Text
            style={{
                flex,
                textAlign: align,
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                paddingRight: align === 'right' ? 0 : 12,
            }}
            numberOfLines={1}
        >
            {children}
        </Text>
    );
}

function Row({ item, isFirst, onView }: { item: RetailerOrder; isFirst: boolean; onView: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const [hovered, setHovered] = useState(false);
    const borderColor = isDarkMode ? '#1e293b' : '#f1f5f9';
    const hoverBg = isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.025)';
    const balance = balanceOf(item);

    return (
        <Pressable
            onPress={onView}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            accessibilityRole="button"
            accessibilityLabel={`Open requisition ${orderRef(item)}`}
            className="flex-row items-center px-5 py-3"
            style={{
                backgroundColor: hovered ? hoverBg : 'transparent',
                borderTopWidth: isFirst ? 0 : 1,
                borderTopColor: borderColor,
                ...webPointer,
            }}
        >
            <View style={{ flex: COLS.reference, paddingRight: 12 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                    {orderRef(item)}
                </Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {formatDate(item.created)}
                </Text>
            </View>

            <View style={{ flex: COLS.wholesaler, paddingRight: 12 }} className="flex-row items-center gap-2.5">
                <InitialsAvatar name={item.wholesaler_title} size={32} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                        {item.wholesaler_title || '—'}
                    </Text>
                    {item.payment_method_title ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                            {item.payment_method_title}
                        </Text>
                    ) : null}
                </View>
            </View>

            <Text style={{ flex: COLS.items, textAlign: 'center', color: theme.text, fontFamily: theme.font.medium, fontSize: 13, paddingRight: 12 }}>
                {orderItemCount(item)}
            </Text>

            <Text style={{ flex: COLS.origin, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingRight: 12 }} numberOfLines={1}>
                {item.order_origin || '—'}
            </Text>

            <View style={{ flex: COLS.status, paddingRight: 12 }}>
                <StatusPill status={item.status} size="sm" />
            </View>

            <View style={{ flex: COLS.payment, paddingRight: 12 }}>
                <PaymentPill paid={toBool(item.is_paid)} compact />
            </View>

            <Text
                style={{ flex: COLS.balance, textAlign: 'right', color: balance > 0 ? '#f43f5e' : '#10b981', fontFamily: theme.font.bold, fontSize: 13 }}
                numberOfLines={1}
            >
                KES {formatKES(balance)}
            </Text>

            <Text style={{ flex: COLS.total, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                KES {formatKES(totalOf(item))}
            </Text>

            <View style={{ flex: COLS.chevron, alignItems: 'flex-end' }}>
                <Ionicons name="chevron-forward" size={16} color={hovered ? theme.primary : theme.textDark} />
            </View>
        </Pressable>
    );
}
