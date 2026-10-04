// components/retailers/retailerInventory/RetailerInventoryWebView.tsx
//
// Web table view for retailer inventory.
//
// Also exports the shared primitives (StatusPill, SummaryBadge,
// FilterPill, SyncPill, isExpired, expiryLabel, formatKES,
// formatDate) reused by the mobile view and the shell.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import type { PageSize } from '@/components/common/PaginationBar';
import { PaginationBar } from '@/components/common/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { resolveImageUrl } from '@/lib/images';
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

/* =========================================================
 * Column widths
 * ======================================================= */

const COLS = {
    asset: '25%',
    barcode: '14%',
    qty: '7%',
    price: '12%',
    status: '12%',
    sync: '15%',
    actions: '15%',
} as const;

/* =========================================================
 * Shared primitives
 * ======================================================= */

export type InventoryFilter = 'ALL' | 'ACTIVE' | 'EXPIRED';

export interface InventoryCounts {
    total: number;
    active: number;
    expired: number;
    lowStock: number;
}

export function isExpired(item: any): boolean {
    return (
        (typeof item?.days_to_expiry === 'number' &&
            item.days_to_expiry <= 0) ||
        item?.expiry_status === 'EXPIRED'
    );
}

export function expiryLabel(item: any): string {
    if (item?.expiry_status === 'UNKNOWN') {
        return isExpired(item) ? 'EXPIRED' : 'ACTIVE';
    }
    return item?.expiry_status || 'ACTIVE';
}

export function formatKES(raw: any): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatDate(
    raw: string | null | undefined
): string {
    if (!raw) return '—';
    const d = new Date(String(raw).replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

export function StatusPill({
    label,
    tone,
    size = 'md',
}: {
    label: string;
    tone: 'active' | 'expired' | 'warning';
    size?: 'sm' | 'md';
}) {
    const { theme } = useAuth();
    const bg =
        tone === 'active'
            ? 'rgba(16,185,129,0.12)'
            : tone === 'expired'
                ? 'rgba(244,63,94,0.12)'
                : 'rgba(251,191,36,0.15)';
    const color =
        tone === 'active'
            ? '#10b981'
            : tone === 'expired'
                ? '#f43f5e'
                : '#f59e0b';

    return (
        <View
            className={`self-start rounded ${size === 'sm' ? 'px-1.5 py-px' : 'px-2 py-0.5'
                }`}
            style={{ backgroundColor: bg }}
        >
            <Text
                className={`uppercase tracking-widest ${size === 'sm' ? 'text-[9px]' : 'text-[10px]'
                    }`}
                style={{
                    color,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

/* =========================================================
 * SyncPill
 *
 * Three states driven by CachedReceipt fields:
 *   - sync_error set  → red   "Sync error"
 *   - synced === true → green "Synced"
 *   - otherwise       → amber "Pending"
 * ======================================================= */
export function SyncPill({
    synced,
    error,
    size = 'md',
}: {
    synced?: boolean;
    error?: string | null;
    size?: 'sm' | 'md';
}) {
    const { theme } = useAuth();

    const state: 'synced' | 'pending' | 'error' = error
        ? 'error'
        : synced
            ? 'synced'
            : 'pending';

    const meta = {
        synced: {
            dot: '#10b981',
            label: 'Synced',
            bg: 'rgba(16,185,129,0.12)',
            fg: '#10b981',
        },
        pending: {
            dot: '#f59e0b',
            label: 'Pending',
            bg: 'rgba(245,158,11,0.12)',
            fg: '#f59e0b',
        },
        error: {
            dot: '#ef4444',
            label: 'Sync error',
            bg: 'rgba(239,68,68,0.12)',
            fg: '#ef4444',
        },
    }[state];

    return (
        <View
            className={`flex-row items-center self-start rounded-full ${size === 'sm'
                ? 'px-1.5 py-px'
                : 'px-2 py-0.5'
                }`}
            style={{ backgroundColor: meta.bg }}
            accessibilityRole="text"
            accessibilityLabel={`Sync status: ${meta.label}`}
        >
            <View
                style={{
                    width: size === 'sm' ? 5 : 6,
                    height: size === 'sm' ? 5 : 6,
                    borderRadius: size === 'sm' ? 2.5 : 3,
                    backgroundColor: meta.dot,
                    marginRight: 4,
                }}
            />
            <Text
                className={`uppercase tracking-widest ${size === 'sm'
                    ? 'text-[9px]'
                    : 'text-[10px]'
                    }`}
                style={{
                    color: meta.fg,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {meta.label}
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
                className="uppercase tracking-widest text-[9px]"
                style={{
                    color: fg,
                    fontFamily: theme.font.bold,
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
                className="uppercase tracking-wide text-[10px]"
                style={{
                    color: fg,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
            {count && count > 0 ? (
                <Text
                    className="ml-1.5 text-[9px]"
                    style={{
                        color: fg,
                        opacity: 0.7,
                        fontFamily: theme.font.bold,
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

    /* Pagination */
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
export function RetailerInventoryWebView({
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
        : 'Offline';

    const sourceTint = isLiveConnected
        ? {
            bg: 'rgba(16,185,129,0.12)',
            fg: '#10b981',
            dot: '#10b981',
        }
        : {
            bg: 'rgba(244,63,94,0.12)',
            fg: '#f43f5e',
            dot: '#f43f5e',
        };

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
                            Retailer Inventory
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
                            <SummaryBadge
                                label={`KES ${formatKES(
                                    totalValue
                                )}`}
                                tone="primary"
                            />
                            {counts.lowStock > 0 ? (
                                <SummaryBadge
                                    label={`${counts.lowStock} low stock`}
                                    tone="warning"
                                />
                            ) : null}
                            {counts.expired > 0 ? (
                                <SummaryBadge
                                    label={`${counts.expired} expired`}
                                    tone="danger"
                                />
                            ) : null}
                            {lastSyncedTime ? (
                                <Text
                                    className="text-[11px]"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                    }}
                                >
                                    Synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onOpenCreate}
                            accessibilityRole="button"
                            accessibilityLabel="Add inventory"
                            className="px-4 py-2.5 min-h-[40px] rounded-full items-center justify-center border"
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
                            className="px-4 py-2.5 min-h-[40px] rounded-full items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: refreshing ? 0.5 : 1,
                            }}
                        >
                            {refreshing ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#ffffff"
                                />
                            ) : (
                                <Text
                                    className="uppercase tracking-widest text-white text-sm"
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
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
                        placeholder="Search product, barcode, supplier…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-11 rounded-xl border px-3.5 max-w-[480px] flex-1 text-sm"
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
                            className="px-3 py-2 rounded-lg border"
                            style={{ borderColor }}
                        >
                            <Text
                                className="uppercase tracking-widest text-[10px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.bold,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    )}
                </View>

                {/* Filter pills */}
                <View className="flex-row items-center mt-3">
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
                </View>
            </View>

            {/* ============ Table ============ */}
            <View className="p-4 flex-1">
                {/* Table header bar */}
                <View
                    className="flex-row rounded-xl border px-3 py-2.5 mb-1"
                    style={{ backgroundColor: headerBg, borderColor }}
                >
                    <Text
                        className="uppercase tracking-wider text-[10px]"
                        style={{
                            width: COLS.asset,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Asset Details
                    </Text>
                    <Text
                        className="uppercase tracking-wider text-[10px]"
                        style={{
                            width: COLS.barcode,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Barcode / SKU
                    </Text>
                    <Text
                        className="uppercase tracking-wider text-[10px] text-right"
                        style={{
                            width: COLS.qty,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Qty
                    </Text>
                    <Text
                        className="uppercase tracking-wider text-[10px] text-right"
                        style={{
                            width: COLS.price,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Pricing
                    </Text>
                    <Text
                        className="uppercase tracking-wider text-[10px]"
                        style={{
                            width: COLS.status,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Status
                    </Text>
                    <Text
                        className="uppercase tracking-wider text-[10px]"
                        style={{
                            width: COLS.sync,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Sync
                    </Text>
                    <Text
                        className="uppercase tracking-wider text-[10px] text-right"
                        style={{
                            width: COLS.actions,
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Actions
                    </Text>
                </View>

                <FlatList
                    data={items}
                    keyExtractor={(item, idx) =>
                        `${item?.remote_id ??
                        item?.key ??
                        item?.id ??
                        'item'
                        }-${idx}`
                    }
                    contentContainerStyle={{ paddingBottom: 8 }}
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
                                className="text-sm"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                }}
                            >
                                {hasActiveFilter
                                    ? 'No items match the filters.'
                                    : 'No inventory yet.'}
                            </Text>
                            {hasActiveFilter && (
                                <Pressable
                                    onPress={clearFilters}
                                    className="mt-4 px-4 py-2.5 min-h-[40px] rounded-full"
                                    style={{
                                        backgroundColor:
                                            theme.primary,
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-widest text-white text-sm"
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
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
                            onView={() => onView?.(item)}
                            onEdit={() => onEdit?.(item)}
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
    onEdit,
    onView,
}: {
    item: any;
    onEdit: () => void;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const exp = isExpired(item);
    const qty = Number(item?.current_unit_quantity ?? 0);
    const fp = parseFloat(
        item?.final_unit_selling_price || '0'
    );
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
        <Pressable
            onPress={onEdit}
            className="flex-row rounded-xl border px-3 py-2.5 mb-1 items-center"
            style={{ borderColor }}
        >
            {/* Asset */}
            <View
                className="flex-row items-center gap-2.5 pr-2"
                style={{ width: COLS.asset }}
            >
                <View className="w-8 h-8 rounded-lg overflow-hidden items-center justify-center shrink-0">
                    <ImageWithFallback
                        uri={url}
                        width={32}
                        height={32}
                        fallback="📦"
                        fallbackSize={14}
                        borderRadius={8}
                    />
                </View>
                <View className="flex-1 min-w-0">
                    <Text
                        className="text-[11px]"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                        }}
                        numberOfLines={1}
                    >
                        {item?.title ||
                            item?.product_title ||
                            'Unnamed'}
                    </Text>
                    <Text
                        className="mt-0.5 text-[9px] opacity-75"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                        }}
                        numberOfLines={1}
                    >
                        {item?.manufacturer_title || '—'}
                    </Text>
                </View>
            </View>

            {/* Barcode */}
            <Text
                className="text-[11px] pr-2"
                style={{
                    width: COLS.barcode,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {item?.bar_code || '—'}
            </Text>

            {/* Qty */}
            <Text
                className="text-[11px] text-right pr-2"
                style={{
                    width: COLS.qty,
                    color: qty <= 5 ? '#f43f5e' : theme.text,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {qty}
            </Text>

            {/* Pricing */}
            <Text
                className="text-[11px] text-right pr-2"
                style={{
                    width: COLS.price,
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                KES {fp.toFixed(2)}
            </Text>

            {/* Status */}
            <View style={{ width: COLS.status }}>
                <StatusPill
                    label={expiryLabel(item)}
                    tone={statusTone}
                    size="sm"
                />
            </View>

            {/* Sync */}
            <View style={{ width: COLS.sync }}>
                <SyncPill
                    synced={item?.synced}
                    error={item?.sync_error}
                    size="sm"
                />
            </View>

            {/* Actions — VIEW (details) + EDIT (form) */}
            <View
                className="flex-row justify-end items-center gap-3"
                style={{ width: COLS.actions }}
            >
                <Pressable
                    onPress={(e: any) => {
                        e?.stopPropagation?.();
                        onView();
                    }}
                    hitSlop={6}
                >
                    <Text
                        className="uppercase tracking-wide text-[10px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        View
                    </Text>
                </Pressable>
                <Pressable
                    onPress={(e: any) => {
                        e?.stopPropagation?.();
                        onEdit();
                    }}
                    hitSlop={6}
                >
                    <Text
                        className="uppercase tracking-wide text-[10px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}