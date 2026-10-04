// components/retailers/retailerInventory/RetailerInventoryMobileView.tsx
//
// Small-screen view for retailer inventory — mirrors the
// requisitions MobileView structure.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import { resolveImageUrl } from '@/lib/images';
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

import {
    expiryLabel,
    FilterPill,
    formatDate,
    formatKES,
    isExpired,
    StatusPill,
    SummaryBadge,
    SyncPill,
    type InventoryCounts,
    type InventoryFilter,
} from './RetailerInventoryWebView';

/* =========================================================
 * Props
 * ======================================================= */
interface Props {
    query: string;
    setQuery: (v: string) => void;
    activeFilter: InventoryFilter;
    setActiveFilter: (v: InventoryFilter) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    isLiveConnected: boolean;
    lastSyncedTime: string;
    counts: InventoryCounts;
    totalValue: number;
    items: any[];
    onView?: (item: any) => void;
    onEdit?: (item: any) => void;
}

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerInventoryMobileView({
    query,
    setQuery,
    activeFilter,
    setActiveFilter,
    onOpenCreate,
    onRefresh,
    refreshing,
    isLiveConnected,
    lastSyncedTime,
    counts,
    totalValue,
    items,
    onView,
    onEdit,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceLabel = isLiveConnected ? 'Live' : 'Offline';

    const sourceTint = isLiveConnected
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', dot: '#10b981' }
        : { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e', dot: '#f43f5e' };

    const hasActiveFilter =
        activeFilter !== 'ALL' || query.trim() !== '';

    const clearFilters = () => {
        if (activeFilter !== 'ALL') setActiveFilter('ALL');
        if (query.trim() !== '') setQuery('');
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
                            Inventory
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <FilterPill
                                label={sourceLabel}
                                active
                                tint={sourceTint}
                                onPress={() => { }}
                            />
                            <SummaryBadge
                                label={`${counts.total} item${counts.total === 1 ? '' : 's'
                                    }`}
                            />
                            {counts.expired > 0 ? (
                                <SummaryBadge
                                    label={`${counts.expired} expired`}
                                    tone="danger"
                                />
                            ) : null}
                        </View>

                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <Text
                                className="text-[11px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                }}
                            >
                                Value:{' '}
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                    }}
                                >
                                    KES {formatKES(totalValue)}
                                </Text>
                            </Text>
                            {lastSyncedTime ? (
                                <Text
                                    className="text-[11px]"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                    }}
                                >
                                    • Synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                        <Pressable
                            onPress={onOpenCreate}
                            accessibilityRole="button"
                            accessibilityLabel="Add inventory"
                            className="px-3 min-h-[40px] rounded-full border items-center justify-center"
                            style={{
                                borderColor: theme.primary,
                                backgroundColor: `${theme.primary}15`,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest text-sm"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                + Add
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onRefresh}
                            disabled={refreshing}
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: refreshing,
                            }}
                            className="px-4 min-h-[40px] rounded-full items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: refreshing ? 0.5 : 1,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest text-white text-sm"
                                style={{ fontFamily: theme.font.bold }}
                            >
                                {refreshing ? '…' : 'Refresh'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* Pill row */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="-mx-1 mb-2"
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                    <FilterPill
                        label="All"
                        active={activeFilter === 'ALL'}
                        count={counts.total}
                        tint={{
                            fg: theme.primary,
                            dot: theme.primary,
                            bg: `${theme.primary}15`,
                        }}
                        onPress={() => setActiveFilter('ALL')}
                    />
                    <FilterPill
                        label="Active"
                        active={activeFilter === 'ACTIVE'}
                        count={counts.active}
                        tint={{
                            fg: '#10b981',
                            dot: '#10b981',
                            bg: 'rgba(16,185,129,0.12)',
                        }}
                        onPress={() => setActiveFilter('ACTIVE')}
                    />
                    <FilterPill
                        label="Expired"
                        active={activeFilter === 'EXPIRED'}
                        count={counts.expired}
                        tint={{
                            fg: '#f43f5e',
                            dot: '#f43f5e',
                            bg: 'rgba(244,63,94,0.12)',
                        }}
                        onPress={() => setActiveFilter('EXPIRED')}
                    />
                </ScrollView>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search product, barcode, supplier…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-11 rounded-xl border px-3.5 text-sm"
                    style={{
                        borderColor,
                        backgroundColor: inputBg,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                    }}
                />

                {hasActiveFilter && (
                    <Pressable
                        onPress={clearFilters}
                        className="mt-2 self-start"
                    >
                        <Text
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Clear filters
                        </Text>
                    </Pressable>
                )}
            </View>

            {/* ============ List ============ */}
            <FlatList
                data={items}
                keyExtractor={(item, idx) =>
                    `${item?.remote_id ??
                    item?.key ??
                    item?.id ??
                    'item'
                    }-${idx}`
                }
                contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingTop: 16,
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
                        hasItems={counts.total > 0}
                        onClearFilters={clearFilters}
                    />
                }
                renderItem={({ item }) => (
                    <InventoryCard
                        item={item}
                        onView={() => onView?.(item)}
                        onEdit={() => onEdit?.(item)}
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

function InventoryCard({
    item,
    onEdit,
    onView,
}: {
    item: any;
    onEdit: () => void;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const exp = isExpired(item);
    const qty = Number(item?.current_unit_quantity ?? 0);
    const fp = parseFloat(
        item?.final_unit_selling_price || '0'
    );
    const stockValue = qty * fp;

    const url = resolveImageUrl(
        item?.thumbnail_url ||
        item?.image_url ||
        item?.images?.[0]
    );

    const statusTone: 'active' | 'expired' | 'warning' = exp
        ? 'expired'
        : item?.expiry_status === 'EXPIRING' ||
            item?.expiry_status === 'EXPIRING_SOON'
            ? 'warning'
            : 'active';

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            {/* Top row: barcode + sync + status */}
            <View className="flex-row items-center mb-2 gap-2">
                <Text
                    className="flex-1 uppercase tracking-widest text-[10px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                    }}
                    numberOfLines={1}
                >
                    {item?.bar_code || '—'}
                </Text>
                <SyncPill
                    synced={item?.synced}
                    error={item?.sync_error}
                    size="sm"
                />
                <StatusPill
                    label={expiryLabel(item)}
                    tone={statusTone}
                    size="sm"
                />
            </View>

            {/* Image + title */}
            <View className="flex-row items-center gap-3 mb-2">
                <View className="w-12 h-12 rounded-lg overflow-hidden items-center justify-center shrink-0">
                    <ImageWithFallback
                        uri={url}
                        width={48}
                        height={48}
                        fallback="📦"
                        fallbackSize={20}
                        borderRadius={10}
                    />
                </View>
                <View className="flex-1 min-w-0">
                    <Text
                        className="text-[15px]"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                        }}
                        numberOfLines={2}
                    >
                        {item?.title ||
                            item?.product_title ||
                            'Unnamed'}
                    </Text>
                    <Text
                        className="mt-0.5 text-[11px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                        }}
                        numberOfLines={1}
                    >
                        {item?.manufacturer_title ||
                            'Unknown manufacturer'}
                    </Text>
                </View>
            </View>

            {/* Chip row */}
            <View className="flex-row items-center flex-wrap gap-1.5 mt-1">
                <Chip theme={theme} borderColor={borderColor}>
                    Qty {qty}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {item?.unit_of_receipt || 'Unit'}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {formatDate(item?.created)}
                </Chip>
                {item?.batch ? (
                    <Chip
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {item.batch}
                    </Chip>
                ) : null}
            </View>

            {/* Totals block */}
            <View
                className="rounded-xl px-3 py-2 mt-2.5 flex-row items-center justify-between"
                style={{ backgroundColor: subBg }}
            >
                <View>
                    <Text
                        className="uppercase tracking-widest text-[9px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Unit Price
                    </Text>
                    <Text
                        className="mt-0.5 text-[14px]"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        KES {formatKES(fp)}
                    </Text>
                </View>
                <View className="items-end">
                    <Text
                        className="uppercase tracking-widest text-[9px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Stock Value
                    </Text>
                    <Text
                        className="mt-0.5 text-[14px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        KES {formatKES(stockValue)}
                    </Text>
                </View>
            </View>

            {/* Meta row */}
            <View className="flex-row items-center gap-2 mt-2.5">
                <Text
                    className="uppercase tracking-widest text-[9px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                    }}
                    numberOfLines={1}
                >
                    {item?.received_from_title ||
                        'Unknown supplier'}
                </Text>
            </View>

            {/* Bottom action — View details + Edit */}
            <View
                className="flex-row justify-end gap-4 mt-3 pt-2.5 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                <Pressable
                    onPress={onView}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="View inventory item"
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        View details
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onEdit}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Edit inventory item"
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Edit
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
                className="uppercase tracking-wide text-[10px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
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
    hasItems,
    onClearFilters,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    hasItems: boolean;
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
                    : hasItems
                        ? 'Nothing to show'
                        : 'No inventory yet'}
            </Text>
            <Text
                className="mt-1 text-center text-sm"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.regular,
                }}
            >
                {hasActiveFilter
                    ? 'Try adjusting your filters.'
                    : 'Add inventory items to see them here.'}
            </Text>
            {hasActiveFilter && (
                <Pressable
                    onPress={onClearFilters}
                    className="mt-4 px-5 min-h-[44px] rounded-full items-center justify-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-widest text-white text-sm"
                        style={{ fontFamily: theme.font.bold }}
                    >
                        Clear filters
                    </Text>
                </Pressable>
            )}
        </View>
    );
}