// components/retailers/stockOuts/RetailerOutOfStocksWebView.tsx

import { useAuth } from '@/context/AuthContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { notifyNoOffers } from './outOfStockStyles';
import { PaginationBar } from './PaginationBar';
import type { PageSize } from './RetailerOutOfStocksList';

/* =========================================================
 * Layout
 * ======================================================= */
const TABLE_MAX_WIDTH = 1600;

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'Product', flex: 3.2 },
    { label: 'Customer', flex: 1.8 },
    { label: 'Qty', flex: 0.5 },
    { label: 'Offers', flex: 0.6 },
    { label: 'Special', flex: 0.7 },
    { label: 'Status', flex: 0.9 },
    { label: 'Created', flex: 1.0 },
    { label: 'Actions', flex: 1.6 },
];

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

/* =========================================================
 * Web view
 * ======================================================= */
export function RetailerOutOfStocksWebView({
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
                <View
                    className="w-full self-center"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
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
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.xs,
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
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Pending only
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
            </View>

            {/* ---------------- Body ---------------- */}
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 40,
                    alignItems: 'center',
                }}
            >
                <View
                    className="w-full"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
                >
                    {/* Table header */}
                    <View
                        className="flex-row rounded-xl border px-3 py-2.5"
                        style={{
                            backgroundColor: theme.panel,
                            borderColor,
                        }}
                    >
                        {COLUMNS.map((h) => (
                            <Text
                                key={h.label}
                                className="uppercase tracking-widest"
                                style={{
                                    flex: h.flex,
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                {h.label}
                            </Text>
                        ))}
                    </View>

                    {/* Rows */}
                    {items.length === 0 ? (
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
                    ) : (
                        items.map((item) => (
                            <TableRow
                                key={
                                    item.remote_id ||
                                    String(item.id ?? '')
                                }
                                item={item}
                                onViewOffers={() =>
                                    onViewOffers(item)
                                }
                                onPressItem={() =>
                                    onPressItem(item)
                                }
                            />
                        ))
                    )}

                    {/* Pagination */}
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
            </ScrollView>
        </View>
    );
}

/* =========================================================
 * Table row
 * ======================================================= */
function TableRow({
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
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    return (
        <View
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <Text
                className="text-[13px]"
                style={{
                    flex: 3.2,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {item.product_title || '—'}
            </Text>

            <Text
                className="text-[13px]"
                style={{
                    flex: 1.8,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {item.customer_name || '—'}
            </Text>

            <Text
                className="text-[13px]"
                style={{
                    flex: 0.5,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {item.required_quantity}
            </Text>

            <Text
                className="text-[13px]"
                style={{
                    flex: 0.6,
                    color:
                        offers > 0
                            ? '#10b981'
                            : theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {offers}
            </Text>

            {/* Special */}
            <View style={{ flex: 0.7 }}>
                {item.is_special_order ? (
                    <View
                        className="px-2 py-0.5 rounded-full self-start"
                        style={{
                            backgroundColor:
                                'rgba(251,191,36,0.15)',
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Yes
                        </Text>
                    </View>
                ) : (
                    <Text
                        className="text-[11px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            opacity: 0.5,
                        }}
                    >
                        —
                    </Text>
                )}
            </View>

            {/* Status */}
            <View
                className="items-start"
                style={{ flex: 0.9 }}
            >
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

            <Text
                className="text-[11px]"
                style={{
                    flex: 1.0,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {formatDate(item.created)}
            </Text>

            <View
                className="flex-row gap-1.5"
                style={{ flex: 1.6 }}
            >
                {offers > 0 ? (
                    <Pressable
                        onPress={onViewOffers}
                        className="px-3 py-1.5 rounded-lg"
                        style={{
                            backgroundColor: theme.primary,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white text-[11px]"
                            style={{
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Offers
                        </Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={() =>
                            notifyNoOffers(
                                item.product_title
                            )
                        }
                        className="px-3 py-1.5 rounded-lg"
                        style={{
                            backgroundColor: theme.primary,
                            opacity: 0.45,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white text-[11px]"
                            style={{
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Offers
                        </Text>
                    </Pressable>
                )}

                <Pressable
                    onPress={onPressItem}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        View
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * StatusPill (shared with the mobile view)
 * ======================================================= */
export function StatusPill({
    label,
    tone,
}: {
    label: string;
    tone: 'open' | 'closed' | 'special';
}) {
    const { theme } = useAuth();
    const bg =
        tone === 'open'
            ? 'rgba(16,185,129,0.12)'
            : tone === 'special'
                ? 'rgba(251,191,36,0.15)'
                : 'rgba(148,163,184,0.15)';
    const color =
        tone === 'open'
            ? '#10b981'
            : tone === 'special'
                ? '#f59e0b'
                : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-full self-start"
            style={{ backgroundColor: bg }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color,
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
 * Helpers
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