// components/retailers/stockOuts/RetailerOutOfStocksWebView.tsx
//
// Web table view for retailer out-of-stocks — matches the
// requisitions table look: separate row cards with small gaps,
// tight padding, right-aligned numerics, single text action.

import { useAuth } from '@/context/AuthContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import React from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { PaginationBar } from './PaginationBar';
import type { PageSize } from './RetailerOutOfStocksList';

/* =========================================================
 * Layout
 * ======================================================= */
const TABLE_MAX_WIDTH = 1600;

/* Percentage widths — sum to 100 so cells fill evenly. */
const COLS = {
    product: '24%',
    customer: '18%',
    qty: '6%',
    offers: '8%',
    special: '10%',
    status: '12%',
    created: '12%',
    actions: '10%',
} as const;

/* =========================================================
 * Shared primitives
 * ======================================================= */

export type SourceTone = 'server' | 'cache' | 'none';

export interface StockOutCounts {
    total: number;
    pending: number;
    ordered: number;
    withOffers: number;
}

export type StockOutState = 'draft' | 'ordered' | 'pending';

export function stockOutState(
    item: RetailerOutOfStockNormalized
): StockOutState {
    if (item.is_pending) return 'draft';
    if (item.is_ordered) return 'ordered';
    return 'pending';
}

export function formatDate(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

export function formatKES(
    raw: string | number | null | undefined
): string {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
}

export function notifyNoOffers(productTitle: string) {
    const title = 'No Offers';
    const message =
        `There are no wholesaler offers for "${productTitle}" yet. ` +
        `Check back once suppliers submit quotes.`;

    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }

    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

export function StatusPill({
    label,
    tone,
    size = 'md',
}: {
    label: string;
    tone: 'open' | 'closed' | 'special';
    size?: 'sm' | 'md';
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
            className="self-start rounded"
            style={{
                backgroundColor: bg,
                paddingHorizontal: size === 'sm' ? 6 : 8,
                paddingVertical: size === 'sm' ? 1 : 2,
            }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: size === 'sm' ? 9 : 10,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

export function SummaryBadge({
    label,
    tone = 'neutral',
}: {
    label: string;
    tone?: 'neutral' | 'primary' | 'danger' | 'warning';
}) {
    const { theme, isDarkMode } = useAuth();
    const bg =
        tone === 'primary'
            ? `${theme.primary}20`
            : tone === 'danger'
                ? 'rgba(244,63,94,0.12)'
                : tone === 'warning'
                    ? 'rgba(251,191,36,0.15)'
                    : isDarkMode
                        ? 'rgba(148,163,184,0.15)'
                        : 'rgba(148,163,184,0.22)';
    const fg =
        tone === 'primary'
            ? theme.primary
            : tone === 'danger'
                ? '#f43f5e'
                : tone === 'warning'
                    ? '#f59e0b'
                    : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: bg }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: fg,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

export function FilterPill({
    label,
    active,
    count,
    tint,
    onPress,
}: {
    label: string;
    active: boolean;
    count?: number;
    tint: { fg: string; dot: string; bg: string };
    onPress: () => void;
}) {
    const { theme } = useAuth();
    const fg = active ? tint.fg : theme.textDark;

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center px-2.5 py-1 mr-2 rounded-full border"
            style={{
                backgroundColor: active ? tint.bg : 'transparent',
                borderColor: active
                    ? tint.fg + '55'
                    : theme.textDark + '33',
            }}
        >
            <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{
                    backgroundColor: active ? tint.fg : tint.dot,
                }}
            />
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: fg,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
            {count && count > 0 ? (
                <Text
                    style={{
                        color: fg,
                        opacity: 0.7,
                        marginLeft: 6,
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                    }}
                >
                    {count}
                </Text>
            ) : null}
        </Pressable>
    );
}

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
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';

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
                <View
                    className="w-full self-center"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
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
                                    label={`${counts.total} total`}
                                />
                                {counts.pending > 0 ? (
                                    <SummaryBadge
                                        label={`${counts.pending} pending`}
                                        tone="warning"
                                    />
                                ) : null}
                                {counts.withOffers > 0 ? (
                                    <SummaryBadge
                                        label={`${counts.withOffers} with offers`}
                                        tone="primary"
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

                        <View className="flex-row items-center gap-2">
                            <Pressable
                                onPress={onOpenCreate}
                                accessibilityRole="button"
                                className="px-4 py-2.5 rounded-full border flex-row items-center gap-1.5"
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
                                onPress={() =>
                                    setOnlyPending((v) => !v)
                                }
                                accessibilityRole="button"
                                accessibilityState={{
                                    selected: onlyPending,
                                }}
                                className="px-4 py-2.5 rounded-full border items-center justify-center"
                                style={{
                                    borderColor: onlyPending
                                        ? theme.primary
                                        : borderColor,
                                    backgroundColor: onlyPending
                                        ? `${theme.primary}15`
                                        : 'transparent',
                                    minHeight: 40,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: onlyPending
                                            ? theme.primary
                                            : theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    Pending only
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
                                {refreshing ? (
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
                                        Refresh
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-3">
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search product, customer, wholesaler…"
                            placeholderTextColor="#94a3b8"
                            autoCorrect={false}
                            autoCapitalize="none"
                            className="h-11 rounded-xl border px-3.5 max-w-[480px] flex-1"
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
                    {/* Table header — standalone bar */}
                    <View
                        className="flex-row rounded-xl border px-3 py-2.5 mb-1.5"
                        style={{
                            backgroundColor: headerBg,
                            borderColor,
                        }}
                    >
                        <Text
                            style={headerStyle(theme, COLS.product)}
                        >
                            Product
                        </Text>
                        <Text
                            style={headerStyle(theme, COLS.customer)}
                        >
                            Customer
                        </Text>
                        <Text
                            style={{
                                ...headerStyle(theme, COLS.qty),
                                textAlign: 'right',
                            }}
                        >
                            Qty
                        </Text>
                        <Text
                            style={{
                                ...headerStyle(theme, COLS.offers),
                                textAlign: 'right',
                            }}
                        >
                            Offers
                        </Text>
                        <Text
                            style={headerStyle(theme, COLS.special)}
                        >
                            Special
                        </Text>
                        <Text
                            style={headerStyle(theme, COLS.status)}
                        >
                            Status
                        </Text>
                        <Text
                            style={headerStyle(theme, COLS.created)}
                        >
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

                    {/* Rows — each its own card with small margin */}
                    {items.length === 0 ? (
                        emptyComponent ?? (
                            <View
                                className="rounded-xl border p-8 items-center"
                                style={{
                                    borderColor,
                                    backgroundColor: isDarkMode
                                        ? '#0f172a'
                                        : '#f8fafc',
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
                                    {hasActiveFilter
                                        ? 'No out-of-stocks match the filters.'
                                        : 'No out-of-stocks yet.'}
                                </Text>
                                {hasActiveFilter && (
                                    <Pressable
                                        onPress={clearFilters}
                                        className="mt-4 px-4 py-2.5 rounded-full"
                                        style={{
                                            backgroundColor:
                                                theme.primary,
                                            minHeight: 40,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-widest text-white"
                                            style={{
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize:
                                                    theme.fontSize.sm,
                                            }}
                                        >
                                            Clear filters
                                        </Text>
                                    </Pressable>
                                )}
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
                                borderColor={borderColor}
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
 * Table row — its own card with a small bottom margin
 * ======================================================= */
function TableRow({
    item,
    borderColor,
    onViewOffers,
    onPressItem,
}: {
    item: RetailerOutOfStockNormalized;
    borderColor: string;
    onViewOffers: () => void;
    onPressItem: () => void;
}) {
    const { theme } = useAuth();
    const offers = item.wholesaler_offers?.length ?? 0;

    const state = stockOutState(item);
    const statusLabel =
        state === 'draft'
            ? 'DRAFT'
            : state === 'ordered'
                ? 'ORDERED'
                : 'PENDING';
    const statusTone =
        state === 'draft'
            ? 'special'
            : state === 'ordered'
                ? 'closed'
                : 'open';

    const handleOffersTap = () => {
        if (offers > 0) {
            onViewOffers();
        } else {
            notifyNoOffers(item.product_title);
        }
    };

    return (
        <View
            className="flex-row rounded-xl border px-3 py-2.5 mb-1.5 items-center"
            style={{
                borderColor,
                backgroundColor: theme.panel,
            }}
        >
            {/* Product */}
            <Text
                style={cellStyle(theme, COLS.product, true)}
                numberOfLines={1}
            >
                {item.product_title || '—'}
            </Text>

            {/* Customer */}
            <Text
                style={cellStyle(theme, COLS.customer)}
                numberOfLines={1}
            >
                {item.customer_name || '—'}
            </Text>

            {/* Qty */}
            <Text
                style={{
                    ...cellStyle(theme, COLS.qty),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {item.required_quantity}
            </Text>

            {/* Offers — clickable */}
            <View
                style={{
                    width: COLS.offers,
                    alignItems: 'flex-end',
                    paddingRight: 8,
                }}
            >
                <Pressable
                    onPress={handleOffersTap}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="View offers"
                >
                    <Text
                        style={{
                            color:
                                offers > 0
                                    ? '#10b981'
                                    : theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                            opacity: offers > 0 ? 1 : 0.5,
                        }}
                    >
                        {offers}
                    </Text>
                </Pressable>
            </View>

            {/* Special */}
            <View style={{ width: COLS.special }}>
                {item.is_special_order ? (
                    <View
                        className="self-start rounded"
                        style={{
                            backgroundColor:
                                'rgba(251,191,36,0.15)',
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Special
                        </Text>
                    </View>
                ) : (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 12,
                            opacity: 0.3,
                        }}
                    >
                        —
                    </Text>
                )}
            </View>

            {/* Status */}
            <View style={{ width: COLS.status }}>
                <StatusPill
                    label={statusLabel}
                    tone={statusTone as any}
                    size="sm"
                />
            </View>

            {/* Created */}
            <Text
                style={cellStyle(theme, COLS.created)}
                numberOfLines={1}
            >
                {formatDate(item.created)}
            </Text>

            {/* Actions */}
            <View
                style={{
                    width: COLS.actions,
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                }}
            >
                <Pressable
                    onPress={onPressItem}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="View details"
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 11,
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
 * Styles
 * ======================================================= */

function headerStyle(
    theme: ReturnType<typeof useAuth>['theme'],
    width: string
) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.3,
    };
}

function cellStyle(
    theme: ReturnType<typeof useAuth>['theme'],
    width: string,
    bold = false
) {
    return {
        width,
        color: bold ? theme.text : theme.textDark,
        fontFamily: bold ? theme.font.bold : theme.font.medium,
        fontSize: 12,
        paddingRight: 8,
    };
}