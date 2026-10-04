// components/retailers/stockOuts/RetailerOutOfStocksMobileView.tsx
//
// Small-screen view for retailer out-of-stocks.
//
// Reuses filter primitives and formatters exported from the WebView
// so pills, tints, and formatting stay identical across breakpoints.

import { useAuth, type ThemeShape } from '@/context/AuthContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
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

import { PaginationBar } from './PaginationBar';
import type { PageSize } from './RetailerOutOfStocksList';
import {
    FilterPill,
    formatDate,
    notifyNoOffers,
    StatusPill,
    stockOutState,
    SummaryBadge,
    type SourceTone,
    type StockOutCounts,
} from './RetailerOutOfStocksWebView';

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    query: string;
    setQuery: (v: string) => void;
    onlyPending: boolean;
    setOnlyPending: (fn: (v: boolean) => boolean) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: SourceTone;
    lastSyncedTime: string;
    counts: StockOutCounts;
    items: RetailerOutOfStockNormalized[];
    emptyComponent?: React.ReactNode;
    onViewOffers: (item: RetailerOutOfStockNormalized) => void;
    onPressItem: (item: RetailerOutOfStockNormalized) => void;
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

/* =========================================================
 * Mobile view
 * ======================================================= */

export function RetailerOutOfStocksMobileView({
    query,
    setQuery,
    onlyPending,
    setOnlyPending,
    onOpenCreate,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    counts,
    items,
    emptyComponent,
    onViewOffers,
    onPressItem,
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
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceTint =
        sourceTone === 'server'
            ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', dot: '#10b981' }
            : sourceTone === 'cache'
                ? { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b', dot: '#f59e0b' }
                : { bg: 'rgba(148,163,184,0.15)', fg: theme.textDark, dot: theme.textDark };

    const hasActiveFilter = onlyPending || query.trim() !== '';

    const clearFilters = () => {
        if (onlyPending) setOnlyPending((v) => !v);
        if (query.trim() !== '') setQuery('');
    };

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ---------------- Header ---------------- */}
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
                            Out of Stock
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
                            {counts.pending > 0 ? (
                                <SummaryBadge
                                    label={`${counts.pending} pending`}
                                    tone="warning"
                                />
                            ) : null}
                        </View>

                        {lastSyncedTime ? (
                            <Text
                                className="mt-1"
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

                    <View className="flex-row items-center gap-2">
                        <Pressable
                            onPress={onOpenCreate}
                            accessibilityRole="button"
                            accessibilityLabel="Add out of stock"
                            className="px-3 rounded-full border flex-row items-center justify-center gap-1"
                            style={{
                                borderColor: theme.primary,
                                backgroundColor: `${theme.primary}15`,
                                minHeight: 40,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                +
                            </Text>
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Add
                            </Text>
                        </Pressable>

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
                </View>

                {/* Filter pills */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2 -mx-1"
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                    <FilterPill
                        label="All"
                        active={!onlyPending}
                        count={counts.total}
                        tint={{
                            fg: theme.primary,
                            dot: theme.primary,
                            bg: `${theme.primary}15`,
                        }}
                        onPress={() => {
                            if (onlyPending) setOnlyPending((v) => !v);
                        }}
                    />
                    <FilterPill
                        label="Pending only"
                        active={onlyPending}
                        count={counts.pending}
                        tint={{
                            fg: '#f59e0b',
                            dot: '#f59e0b',
                            bg: 'rgba(251,191,36,0.15)',
                        }}
                        onPress={() => {
                            if (!onlyPending) setOnlyPending((v) => !v);
                        }}
                    />
                    {counts.withOffers > 0 ? (
                        <FilterPill
                            label="With offers"
                            active={false}
                            count={counts.withOffers}
                            tint={{
                                fg: '#10b981',
                                dot: '#10b981',
                                bg: 'rgba(16,185,129,0.12)',
                            }}
                            onPress={() => { }}
                        />
                    ) : null}
                </ScrollView>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search product, customer, wholesaler…"
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

            {/* ---------------- Card list ---------------- */}
            <FlatList
                data={items}
                keyExtractor={(it, idx) =>
                    `${it.remote_id ?? it.id ?? 'oos'}-${idx}`
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
                    emptyComponent ?? (
                        <EmptyState
                            theme={theme}
                            hasActiveFilter={hasActiveFilter}
                            hasItems={counts.total > 0}
                            onClearFilters={clearFilters}
                        />
                    )
                }
                ListFooterComponent={
                    totalItems > 0 ? (
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
                    ) : null
                }
                renderItem={({ item }) => (
                    <OutOfStockCard
                        item={item}
                        onViewOffers={() => onViewOffers(item)}
                        onPressItem={() => onPressItem(item)}
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

function OutOfStockCard({
    item,
    onViewOffers,
    onPressItem,
}: {
    item: RetailerOutOfStockNormalized;
    onViewOffers: () => void;
    onPressItem: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const offers = item.wholesaler_offers?.length ?? 0;

    const previewOffers = (item.wholesaler_offers || [])
        .slice(0, 3)
        .map(
            (o) =>
                o.title ||
                o.product_title ||
                o.manufacturer_title ||
                ''
        )
        .filter(Boolean);

    const state = stockOutState(item);
    const statusLabel =
        state === 'draft'
            ? 'Draft'
            : state === 'ordered'
                ? 'Ordered'
                : 'Pending';
    const statusTone =
        state === 'draft'
            ? 'special'
            : state === 'ordered'
                ? 'closed'
                : 'open';

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            {/* Title + status */}
            <View className="flex-row items-center mb-2">
                <Text
                    className="flex-1"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 15,
                    }}
                    numberOfLines={2}
                >
                    {item.product_title || '—'}
                </Text>
                <StatusPill
                    label={statusLabel}
                    tone={statusTone as any}
                />
            </View>

            {/* Chips */}
            <View className="flex-row items-center flex-wrap gap-1.5 mt-2.5">
                <Chip theme={theme} borderColor={borderColor}>
                    Qty {item.required_quantity}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {item.unit_of_receipt || '—'}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {formatDate(item.created)}
                </Chip>
                {item.is_special_order ? (
                    <View
                        className="px-2 py-0.5 rounded-md"
                        style={{
                            backgroundColor:
                                'rgba(251,191,36,0.15)',
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Special
                        </Text>
                    </View>
                ) : null}
            </View>

            {/* Customer / Offers block */}
            <View
                className="rounded-xl px-3 py-2 mt-2.5 flex-row items-center justify-between"
                style={{ backgroundColor: subBg }}
            >
                <View className="flex-1 min-w-0 mr-3">
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Customer
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            marginTop: 2,
                        }}
                        numberOfLines={1}
                    >
                        {item.customer_name || '—'}
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
                        Offers
                    </Text>
                    <Text
                        style={{
                            color:
                                offers > 0
                                    ? '#10b981'
                                    : theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            marginTop: 2,
                        }}
                    >
                        {offers}
                    </Text>
                </View>
            </View>

            {/* Offer preview */}
            {previewOffers.length > 0 && (
                <View className="mt-2.5">
                    {previewOffers.map((t, i) => (
                        <Text
                            key={`${item.remote_id}-p-${i}`}
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
                    {offers > 3 && (
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                                opacity: 0.7,
                            }}
                        >
                            +{offers - 3} more
                        </Text>
                    )}
                </View>
            )}

            {/* Actions */}
            <View
                className="flex-row gap-2 mt-3 pt-2.5 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                {offers > 0 ? (
                    <Pressable
                        onPress={onViewOffers}
                        accessibilityRole="button"
                        accessibilityLabel="View offers"
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{
                            backgroundColor: theme.primary,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 12,
                            }}
                        >
                            View Offers
                        </Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() =>
                            notifyNoOffers(item.product_title)
                        }
                        accessibilityRole="button"
                        accessibilityLabel="No offers available"
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{
                            backgroundColor: theme.primary,
                            opacity: 0.45,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 12,
                            }}
                        >
                            View Offers
                        </Text>
                    </Pressable>
                )}

                <Pressable
                    onPress={onPressItem}
                    accessibilityRole="button"
                    accessibilityLabel="View details"
                    className="flex-1 py-2.5 rounded-xl border items-center"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                        }}
                    >
                        Details
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
                        : 'No out-of-stocks yet'}
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
                    : 'New items will appear here as they are logged.'}
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