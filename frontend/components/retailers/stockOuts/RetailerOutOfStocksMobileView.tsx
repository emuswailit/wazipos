// components/retailers/stockOuts/RetailerOutOfStocksMobileView.tsx

import { useAuth } from '@/context/AuthContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
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
import { notifyNoOffers } from './outOfStockStyles';
import { PaginationBar } from './PaginationBar';
import type { PageSize } from './RetailerOutOfStocksList';
import { StatusPill } from './RetailerOutOfStocksWebView';

interface Props {
    query: string;
    setQuery: (v: string) => void;
    onlyPending: boolean;
    setOnlyPending: (fn: (v: boolean) => boolean) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
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
                <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-1">
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

                        <View className="flex-row items-center gap-2 mt-1">
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
                                        fontFamily:
                                            theme.font.bold,
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
                                    Synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                        <Pressable
                            onPress={onOpenCreate}
                            className="px-3 py-1.5 rounded-full border flex-row items-center gap-1.5"
                            style={{
                                borderColor: theme.primary,
                                backgroundColor: `${theme.primary}15`,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                +
                            </Text>
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Add
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={() =>
                                setOnlyPending((v) => !v)
                            }
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                                borderColor: onlyPending
                                    ? theme.primary
                                    : borderColor,
                                backgroundColor: onlyPending
                                    ? `${theme.primary}15`
                                    : 'transparent',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: onlyPending
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Pending
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onRefresh}
                            disabled={refreshing}
                            className="px-3 py-1.5 rounded-full"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: refreshing ? 0.6 : 1,
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
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Refresh
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search product, customer, wholesaler..."
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-10 rounded-xl border px-3.5"
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

            {/* ---------------- Card list ---------------- */}
            <FlatList
                data={items}
                keyExtractor={(it) =>
                    it.remote_id || String(it.id ?? '')
                }
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 40,
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
                        <View className="p-8 items-center">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            >
                                No out-of-stocks match the
                                filters.
                            </Text>
                        </View>
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

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            {/* Title + status */}
            <View className="flex-row items-center justify-between mb-2">
                <Text
                    className="flex-1"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 15,
                    }}
                    numberOfLines={1}
                >
                    {item.product_title || '—'}
                </Text>
                <StatusPill
                    label={
                        item.is_pending
                            ? 'Draft'
                            : item.is_ordered
                                ? 'Ordered'
                                : 'Pending'
                    }
                    tone={
                        item.is_pending
                            ? 'special'
                            : item.is_ordered
                                ? 'closed'
                                : 'open'
                    }
                />
            </View>

            {/* Chips */}
            <View className="flex-row flex-wrap gap-1.5 mb-2">
                <Chip label={`Qty ${item.required_quantity}`} />
                <Chip label={item.unit_of_receipt || '—'} />

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
                            Special order
                        </Text>
                    </View>
                ) : null}

                <Chip label={formatDate(item.created)} />
            </View>

            {/* Customer / Offers divider block */}
            <View
                className="flex-row items-center justify-between py-2 mb-2 border-t border-b"
                style={{ borderColor }}
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
                        Customer
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                        numberOfLines={1}
                    >
                        {item.customer_name || '—'}
                    </Text>
                </View>
                <View className="items-end">
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Wholesaler offers
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color:
                                offers > 0
                                    ? '#10b981'
                                    : theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                    >
                        {offers}
                    </Text>
                </View>
            </View>

            {/* Offer preview */}
            {previewOffers.length > 0 ? (
                <View className="mb-2.5">
                    {previewOffers.map((t, i) => (
                        <Text
                            key={`${item.remote_id}-p-${i}`}
                            className="text-[12px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                            }}
                            numberOfLines={1}
                        >
                            • {t}
                        </Text>
                    ))}
                    {offers > 3 ? (
                        <Text
                            className="mt-0.5 text-[11px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                opacity: 0.7,
                            }}
                        >
                            +{offers - 3} more
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* Actions */}
            <View
                className="flex-row gap-2 pt-2.5 border-t"
                style={{ borderColor }}
            >
                {offers > 0 ? (
                    <Pressable
                        onPress={onViewOffers}
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{
                            backgroundColor: theme.primary,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white text-[12px]"
                            style={{
                                fontFamily: theme.font.bold,
                            }}
                        >
                            View Offers
                        </Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() =>
                            notifyNoOffers(
                                item.product_title
                            )
                        }
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{
                            backgroundColor: theme.primary,
                            opacity: 0.45,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white text-[12px]"
                            style={{
                                fontFamily: theme.font.bold,
                            }}
                        >
                            View Offers
                        </Text>
                    </Pressable>
                )}

                <Pressable
                    onPress={onPressItem}
                    className="flex-1 py-2.5 rounded-xl border items-center"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-[12px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        View Details
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Chip
 * ======================================================= */
function Chip({ label }: { label: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: isDarkMode
                    ? '#0f172a'
                    : '#f1f5f9',
                borderColor: isDarkMode
                    ? '#334155'
                    : '#e2e8f0',
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

/* =========================================================
 * Helper
 * ======================================================= */
function formatDate(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}