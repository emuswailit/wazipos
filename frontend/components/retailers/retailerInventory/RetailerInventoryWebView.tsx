// components/retailers/retailerInventory/RetailerInventoryWebView.tsx
//
// Wide-screen view for the retailer's inventory (stock receipts), styled like Customer
// Orders: compact header line, one table card with a toolbar, shared PaginationBar.
// Pills, formatters and filter helpers are exported for the mobile view and the details modal.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import type { PageSize } from '@/components/common/PaginationBar';
import { PaginationBar } from '@/components/common/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { resolveImageUrl } from '@/lib/images';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

const TABLE_MAX_WIDTH = 1600;
const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

/* =========================================================
 * Filters
 * ======================================================= */

export const INVENTORY_FILTERS = ['ALL', 'ACTIVE', 'LOW', 'EXPIRING', 'EXPIRED'] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export const INVENTORY_FILTER_LABELS: Record<InventoryFilter, string> = {
    ALL: 'All',
    ACTIVE: 'In date',
    LOW: 'Low stock',
    EXPIRING: 'Expiring soon',
    EXPIRED: 'Expired',
};

export const INVENTORY_FILTER_ICONS: Record<InventoryFilter, keyof typeof Ionicons.glyphMap> = {
    ALL: 'apps-outline',
    ACTIVE: 'checkmark-circle-outline',
    LOW: 'trending-down-outline',
    EXPIRING: 'hourglass-outline',
    EXPIRED: 'close-circle-outline',
};

export const INVENTORY_FILTER_COLORS: Record<InventoryFilter, string | null> = {
    ALL: null, // theme primary
    ACTIVE: '#10b981',
    LOW: '#f59e0b',
    EXPIRING: '#f97316',
    EXPIRED: '#f43f5e',
};

/** Stock at or below this (but above zero) counts as low. */
const LOW_STOCK_THRESHOLD = 5;
/** Batches expiring within this many days count as "expiring soon". */
const EXPIRING_SOON_DAYS = 90;

export interface InventoryCounts {
    total: number;
    active: number;
    expired: number;
    lowStock: number;
    expiring: number;
    /** Items in the current filtered list. */
    visible: number;
    byFilter: Record<InventoryFilter, number>;
}

export function isExpired(item: any): boolean {
    return (typeof item?.days_to_expiry === 'number' && item.days_to_expiry <= 0) || item?.expiry_status === 'EXPIRED';
}

export function stockQty(item: any): number {
    const n = Number(item?.current_unit_quantity ?? 0);
    return Number.isFinite(n) ? n : 0;
}

export function isLowStock(item: any): boolean {
    const q = stockQty(item);
    return q > 0 && q <= LOW_STOCK_THRESHOLD;
}

export function isExpiringSoon(item: any): boolean {
    if (isExpired(item)) return false;
    const status = String(item?.expiry_status || '').toUpperCase();
    if (status === 'EXPIRING' || status === 'EXPIRING_SOON') return true;
    return typeof item?.days_to_expiry === 'number' && item.days_to_expiry <= EXPIRING_SOON_DAYS;
}

export function matchesInventoryFilter(item: any, filter: InventoryFilter): boolean {
    switch (filter) {
        case 'ACTIVE':
            return !isExpired(item);
        case 'LOW':
            return isLowStock(item);
        case 'EXPIRING':
            return isExpiringSoon(item);
        case 'EXPIRED':
            return isExpired(item);
        default:
            return true;
    }
}

/* =========================================================
 * Formatting
 * ======================================================= */

export function expiryLabel(item: any): string {
    if (isExpired(item)) return 'EXPIRED';
    if (isExpiringSoon(item)) return 'EXPIRING';
    if (!item?.expiry_status || item.expiry_status === 'UNKNOWN') return 'ACTIVE';
    return item.expiry_status;
}

/** "in 45 days" / "12 days ago" / "today", from days_to_expiry. */
export function expiryRelative(item: any): string | null {
    const d = item?.days_to_expiry;
    if (typeof d !== 'number') return null;
    if (d === 0) return 'today';
    if (d < 0) return `${Math.abs(d)} day${d === -1 ? '' : 's'} ago`;
    return `in ${d} day${d === 1 ? '' : 's'}`;
}

export function formatKES(raw: any): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(raw: string | null | undefined): string {
    if (!raw) return '—';
    const d = new Date(String(raw).replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function productTitle(item: any): string {
    const t = item?.title || item?.product_title || item?.long_title || item?.product_name;
    return String(t ?? '').trim() || 'Unnamed product';
}

/** The preparation (strength / form / pack), or null when absent or already part of the product title. */
export function preparationTitle(item: any): string | null {
    const prep = String(item?.preparation_title ?? '').trim();
    if (!prep) return null;
    if (productTitle(item).toLowerCase().includes(prep.toLowerCase())) return null;
    return prep;
}

export function unitPrice(item: any): number {
    const p = parseFloat(item?.final_unit_selling_price ?? item?.unit_selling_price ?? '0');
    return Number.isFinite(p) ? p : 0;
}

export function stockValue(item: any): number {
    return Math.max(0, stockQty(item)) * unitPrice(item);
}

export function itemImageUrl(item: any): string | null {
    return resolveImageUrl(item?.thumbnail_url || item?.image_url || item?.images?.[0]) as any;
}

/** Red for expired, amber for low stock, orange for expiring soon, green otherwise. */
export function healthColor(item: any): string {
    if (isExpired(item)) return '#f43f5e';
    if (isLowStock(item)) return '#f59e0b';
    if (isExpiringSoon(item)) return '#f97316';
    return '#10b981';
}

/* =========================================================
 * Pills
 * ======================================================= */

export function StatusPill({ label, tone, size = 'md' }: { label: string; tone: 'active' | 'expired' | 'warning'; size?: 'sm' | 'md' }) {
    const { theme } = useAuth();
    const tint =
        tone === 'active'
            ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' }
            : tone === 'expired'
                ? { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e' }
                : { bg: 'rgba(249,115,22,0.14)', fg: '#f97316' };
    return (
        <View
            className="self-start rounded-full"
            style={{ backgroundColor: tint.bg, paddingHorizontal: size === 'sm' ? 6 : 8, paddingVertical: size === 'sm' ? 1 : 2 }}
        >
            <Text className="uppercase tracking-wide" style={{ color: tint.fg, fontFamily: theme.font.bold, fontSize: size === 'sm' ? 9 : 10 }} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

export function statusToneOf(item: any): 'active' | 'expired' | 'warning' {
    if (isExpired(item)) return 'expired';
    if (isExpiringSoon(item)) return 'warning';
    return 'active';
}

/** All / In date / Low stock / Expiring soon / Expired chips with counts (web toolbar and mobile). */
function InventoryFilterChips({
    value,
    onChange,
    counts,
    large = false,
}: {
    value: InventoryFilter;
    onChange: (f: InventoryFilter) => void;
    counts: Record<InventoryFilter, number>;
    large?: boolean;
}) {
    const { theme, isDarkMode } = useAuth();
    const idleBorder = isDarkMode ? '#1e293b' : '#e2e8f0';
    return (
        <View className="flex-row items-center gap-1.5" style={large ? undefined : { flexWrap: 'wrap' }}>
            {INVENTORY_FILTERS.map((f) => {
                const active = f === value;
                const color = INVENTORY_FILTER_COLORS[f] ?? theme.primary;
                const n = counts?.[f] ?? 0;
                return (
                    <Pressable
                        key={f}
                        onPress={() => onChange(f)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={`flex-row items-center gap-1.5 px-3 rounded-full border ${large ? 'h-9' : 'h-8'}`}
                        style={{ borderColor: active ? color : idleBorder, backgroundColor: active ? `${color}14` : 'transparent', ...webPointer }}
                    >
                        <Ionicons name={INVENTORY_FILTER_ICONS[f]} size={13} color={active ? color : f !== 'ALL' && n > 0 ? color : theme.textDark} />
                        <Text style={{ color: active ? color : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{INVENTORY_FILTER_LABELS[f]}</Text>
                        <Text style={{ color: active ? color : theme.textDark, fontFamily: theme.font.medium, fontSize: 11, opacity: 0.85 }}>{n}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Thin stock-left bar (current vs received). */
export function StockBar({ item, width = '100%' }: { item: any; width?: any }) {
    const { isDarkMode } = useAuth();
    const qty = stockQty(item);
    const received = Number(item?.received_unit_quantity ?? 0);
    const ratio = received > 0 ? Math.max(0, Math.min(1, qty / received)) : qty > 0 ? 1 : 0;
    return (
        <View className="h-1 rounded-full overflow-hidden" style={{ width, backgroundColor: isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(15,23,42,0.06)' }}>
            <View className="h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: healthColor(item) }} />
        </View>
    );
}

/* =========================================================
 * Props
 * ======================================================= */

export interface InventoryViewProps {
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

interface WebProps extends InventoryViewProps {
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

/* Column flex weights */
const COLS = { product: 3.8, batch: 1.5, expiry: 1.5, stock: 1.2, price: 1.1, value: 1.3, status: 1.1, actions: 0.8 } as const;

/* =========================================================
 * Component
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
}: WebProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#1e293b' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0b1220' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const hasActiveFilter = activeFilter !== 'ALL' || query.trim() !== '';
    const clearFilters = () => {
        if (activeFilter !== 'ALL') setActiveFilter('ALL');
        if (query.trim() !== '') setQuery('');
    };

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className="flex-1 w-full self-center px-6 pt-4 pb-4" style={{ maxWidth: TABLE_MAX_WIDTH }}>
                {/* ============ Compact header: title · live · stats · actions ============ */}
                <View className="flex-row items-center mb-3 gap-4 flex-wrap">
                    <Text className="tracking-tight" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>
                        Inventory
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: isLiveConnected ? '#10b981' : '#f59e0b' }} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {isLiveConnected ? 'Live' : 'Offline'}
                            {lastSyncedTime ? ` · ${lastSyncedTime}` : ''}
                        </Text>
                    </View>

                    <View className="flex-1" />

                    <InlineStat label="Items" value={counts.total.toLocaleString()} />
                    <InlineStat label="Low" value={counts.lowStock.toLocaleString()} color={counts.lowStock > 0 ? '#f59e0b' : undefined} />
                    <InlineStat label="Expired" value={counts.expired.toLocaleString()} color={counts.expired > 0 ? '#f43f5e' : undefined} />
                    <InlineStat label={hasActiveFilter ? 'Value (filtered)' : 'Stock value'} value={`KES ${formatKES(totalValue)}`} color="#10b981" />

                    <Pressable
                        onPress={onOpenCreate}
                        accessibilityRole="button"
                        accessibilityLabel="Add stock"
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg border"
                        style={{ borderColor: theme.primary, backgroundColor: `${theme.primary}12`, ...webPointer }}
                    >
                        <Ionicons name="add" size={15} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Add stock</Text>
                    </Pressable>
                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh inventory"
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
                        <View className="flex-row items-center flex-1 min-w-[220px] max-w-[360px] h-9 rounded-xl border px-3" style={{ borderColor, backgroundColor: inputBg }}>
                            <Ionicons name="search" size={16} color={theme.textDark} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder="Search product, batch, barcode, supplier…"
                                placeholderTextColor="#94a3b8"
                                autoCorrect={false}
                                autoCapitalize="none"
                                className="flex-1 h-full ml-2"
                                style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13, ...(isWeb ? ({ outlineStyle: 'none' } as any) : {}) }}
                            />
                            {query ? (
                                <Pressable onPress={() => setQuery('')} hitSlop={8} style={webPointer}>
                                    <Ionicons name="close-circle" size={16} color={theme.textDark} />
                                </Pressable>
                            ) : null}
                        </View>

                        <InventoryFilterChips value={activeFilter} onChange={setActiveFilter} counts={counts.byFilter} />

                        {hasActiveFilter ? (
                            <Pressable onPress={clearFilters} hitSlop={6} style={webPointer}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear</Text>
                            </Pressable>
                        ) : null}

                        <View className="flex-1" />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {counts.visible.toLocaleString()} {counts.visible === 1 ? 'item' : 'items'}
                        </Text>
                    </View>

                    {/* Column header */}
                    <View className="flex-row items-center px-5 py-2.5" style={{ backgroundColor: headerBg }}>
                        <HeaderCell flex={COLS.product}>Product</HeaderCell>
                        <HeaderCell flex={COLS.batch}>Batch / barcode</HeaderCell>
                        <HeaderCell flex={COLS.expiry}>Expiry</HeaderCell>
                        <HeaderCell flex={COLS.stock} align="right">Stock</HeaderCell>
                        <HeaderCell flex={COLS.price} align="right">Unit price</HeaderCell>
                        <HeaderCell flex={COLS.value} align="right">Value</HeaderCell>
                        <HeaderCell flex={COLS.status}>Status</HeaderCell>
                        <View style={{ flex: COLS.actions }} />
                    </View>

                    {/* Rows */}
                    <FlatList
                        data={items}
                        keyExtractor={(item, idx) => `${item?.remote_id ?? item?.key ?? item?.id ?? 'item'}-${idx}`}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                        ListEmptyComponent={
                            <View className="py-16 items-center">
                                <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                                    <Ionicons name={hasActiveFilter ? 'search' : 'cube-outline'} size={22} color={theme.primary} />
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                                    {hasActiveFilter ? 'No matching items' : 'No inventory yet'}
                                </Text>
                                <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                                    {hasActiveFilter ? 'Try a different search or filter.' : 'Add stock to start selling.'}
                                </Text>
                                <Pressable
                                    onPress={hasActiveFilter ? clearFilters : onOpenCreate}
                                    className="mt-4 px-4 h-9 rounded-xl items-center justify-center border"
                                    style={{ borderColor, ...webPointer }}
                                >
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>
                                        {hasActiveFilter ? 'Clear filters' : 'Add stock'}
                                    </Text>
                                </Pressable>
                            </View>
                        }
                        renderItem={({ item, index }) => (
                            <Row item={item} isFirst={index === 0} onView={() => onView?.(item)} onEdit={() => onEdit?.(item)} />
                        )}
                        showsVerticalScrollIndicator={false}
                    />

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
 * Small building blocks
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
                paddingRight: 12,
            }}
            numberOfLines={1}
        >
            {children}
        </Text>
    );
}

/* =========================================================
 * Row
 * ======================================================= */

function Row({ item, isFirst, onView, onEdit }: { item: any; isFirst: boolean; onView: () => void; onEdit: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const [hovered, setHovered] = useState(false);

    const borderColor = isDarkMode ? '#1e293b' : '#f1f5f9';
    const hoverBg = isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.025)';

    const qty = stockQty(item);
    const price = unitPrice(item);
    const health = healthColor(item);
    const attention = isExpired(item) || isLowStock(item) || isExpiringSoon(item);
    const notUploaded = item?.synced === false || !!item?.sync_error;
    const meta = [item?.manufacturer_title, item?.received_from_title].filter(Boolean).join(' · ');
    const rel = expiryRelative(item);
    const prep = preparationTitle(item);

    return (
        <Pressable
            onPress={onView}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${productTitle(item)}`}
            className="flex-row items-center px-5 py-3"
            style={{
                backgroundColor: hovered ? hoverBg : 'transparent',
                borderTopWidth: isFirst ? 0 : 1,
                borderTopColor: borderColor,
                ...webPointer,
            }}
        >
            {/* Product */}
            <View style={{ flex: COLS.product, paddingRight: 12 }} className="flex-row items-start gap-3">
                <View className="w-9 h-9 rounded-xl overflow-hidden items-center justify-center" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
                    <ImageWithFallback uri={itemImageUrl(item)} width={36} height={36} fallback="📦" fallbackSize={15} borderRadius={10} />
                </View>
                <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5">
                        {/* Full title, wrapping as needed — never truncated */}
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13, lineHeight: 18, flexShrink: 1 }}>
                            {productTitle(item)}
                        </Text>
                        {notUploaded ? <Ionicons name="cloud-upload-outline" size={13} color={item?.sync_error ? '#ef4444' : '#f59e0b'} /> : null}
                    </View>
                    {prep ? (
                        <Text style={{ color: theme.primary, fontFamily: theme.font.semibold, fontSize: 12, lineHeight: 16, marginTop: 1 }}>
                            {prep}
                        </Text>
                    ) : null}
                    {meta ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            {meta}
                        </Text>
                    ) : null}
                </View>
            </View>

            {/* Batch / barcode */}
            <View style={{ flex: COLS.batch, paddingRight: 12 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                    {item?.batch ? `Batch ${item.batch}` : '—'}
                </Text>
                {item?.bar_code ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.mono ?? theme.font.medium, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {item.bar_code}
                    </Text>
                ) : null}
            </View>

            {/* Expiry */}
            <View style={{ flex: COLS.expiry, paddingRight: 12 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                    {formatDate(item?.expiry_date)}
                </Text>
                {rel ? (
                    <Text
                        style={{ color: isExpired(item) || isExpiringSoon(item) ? health : theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }}
                        numberOfLines={1}
                    >
                        {rel}
                    </Text>
                ) : null}
            </View>

            {/* Stock */}
            <View style={{ flex: COLS.stock, paddingRight: 12, alignItems: 'flex-end' }}>
                <Text style={{ color: attention && isLowStock(item) ? health : theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                    {qty.toLocaleString()}
                </Text>
                <View className="mt-1" style={{ width: 56 }}>
                    <StockBar item={item} />
                </View>
            </View>

            {/* Unit price */}
            <Text style={{ flex: COLS.price, textAlign: 'right', color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingRight: 12 }} numberOfLines={1}>
                {formatKES(price)}
            </Text>

            {/* Value */}
            <Text style={{ flex: COLS.value, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 13, paddingRight: 12 }} numberOfLines={1}>
                KES {formatKES(stockValue(item))}
            </Text>

            {/* Status */}
            <View style={{ flex: COLS.status, paddingRight: 12, gap: 3 }}>
                <StatusPill label={expiryLabel(item)} tone={statusToneOf(item)} size="sm" />
                {isLowStock(item) ? <StatusPill label="Low" tone="warning" size="sm" /> : null}
            </View>

            {/* Actions */}
            <View style={{ flex: COLS.actions }} className="flex-row items-center justify-end gap-2">
                <Pressable
                    onPress={(e: any) => {
                        e?.stopPropagation?.();
                        onEdit();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${productTitle(item)}`}
                    hitSlop={6}
                    className="w-7 h-7 rounded-lg items-center justify-center"
                    style={{ backgroundColor: hovered ? `${theme.primary}14` : 'transparent', ...webPointer }}
                >
                    <Ionicons name="create-outline" size={15} color={hovered ? theme.primary : theme.textDark} />
                </Pressable>
                <Ionicons name="chevron-forward" size={16} color={hovered ? theme.primary : theme.textDark} />
            </View>
        </Pressable>
    );
}
