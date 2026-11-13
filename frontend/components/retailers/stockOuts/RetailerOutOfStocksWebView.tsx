// components/retailers/stockOuts/RetailerOutOfStocksWebView.tsx
//
// Wide-screen view for the retailer's out-of-stocks, styled like Inventory / Customer
// Orders: compact header line, one table card with a toolbar, shared PaginationBar.
// Pills, formatters and filter helpers are exported for the mobile view.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import { PaginationBar, type PageSize } from '@/components/common/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import { resolveImageUrl } from '@/lib/images';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

const TABLE_MAX_WIDTH = 1600;
const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

/* =========================================================
 * State + filters
 * ======================================================= */

export type SourceTone = 'server' | 'cache' | 'none';

/** draft = created offline, not uploaded yet; pending = waiting to be ordered; ordered = on an indent. */
type StockOutState = 'draft' | 'ordered' | 'pending';

export function stockOutState(item: RetailerOutOfStockNormalized): StockOutState {
    if (item.is_pending) return 'draft';
    if (item.is_ordered) return 'ordered';
    return 'pending';
}

export const STOCKOUT_FILTERS = ['ALL', 'PENDING', 'OFFERS', 'SPECIAL', 'ORDERED'] as const;
export type StockOutFilter = (typeof STOCKOUT_FILTERS)[number];

export const STOCKOUT_FILTER_LABELS: Record<StockOutFilter, string> = {
    ALL: 'All',
    PENDING: 'Waiting',
    OFFERS: 'Has offers',
    SPECIAL: 'Special orders',
    ORDERED: 'Ordered',
};

export const STOCKOUT_FILTER_ICONS: Record<StockOutFilter, keyof typeof Ionicons.glyphMap> = {
    ALL: 'apps-outline',
    PENDING: 'time-outline',
    OFFERS: 'pricetags-outline',
    SPECIAL: 'star-outline',
    ORDERED: 'checkmark-done-outline',
};

export const STOCKOUT_FILTER_COLORS: Record<StockOutFilter, string | null> = {
    ALL: null, // theme primary
    PENDING: '#f59e0b',
    OFFERS: '#10b981',
    SPECIAL: '#8b5cf6',
    ORDERED: '#64748b',
};

function offerCount(item: RetailerOutOfStockNormalized): number {
    return item.wholesaler_offers?.length ?? 0;
}

export function matchesStockOutFilter(item: RetailerOutOfStockNormalized, filter: StockOutFilter): boolean {
    switch (filter) {
        case 'PENDING':
            return !item.is_ordered;
        case 'OFFERS':
            return !item.is_ordered && offerCount(item) > 0;
        case 'SPECIAL':
            return !!item.is_special_order;
        case 'ORDERED':
            return !!item.is_ordered;
        default:
            return true;
    }
}

export interface StockOutCounts {
    total: number;
    pending: number;
    ordered: number;
    withOffers: number;
    /** Items in the current filtered list. */
    visible: number;
    byFilter: Record<StockOutFilter, number>;
}

/* =========================================================
 * Formatting
 * ======================================================= */

export function formatDate(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatKES(raw: string | number | null | undefined): string {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Lowest offered unit price, or null when there are no priced offers. */
function bestOfferPrice(item: RetailerOutOfStockNormalized): number | null {
    let best: number | null = null;
    for (const o of item.wholesaler_offers ?? []) {
        const p = Number((o as any).final_unit_selling_price ?? (o as any).unit_selling_price);
        if (Number.isFinite(p) && p > 0 && (best === null || p < best)) best = p;
    }
    return best;
}

export function stockOutImageUrl(item: RetailerOutOfStockNormalized): string | null {
    const img: any = item.images?.[0];
    return resolveImageUrl(img?.thumbnail || img?.image || img) as any;
}

export function stockOutTitle(item: RetailerOutOfStockNormalized): string {
    return String(item.product_title ?? '').trim() || 'Unnamed product';
}

function notifyNoOffers(productTitle: string) {
    const title = 'No Offers';
    const message = `There are no wholesaler offers for "${productTitle}" yet. Check back once suppliers submit quotes.`;
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], { cancelable: true });
}

/* =========================================================
 * Pills
 * ======================================================= */

const STATE_META: Record<StockOutState, { label: string; bg: string; fg: string }> = {
    pending: { label: 'Waiting', bg: 'rgba(245,158,11,0.14)', fg: '#f59e0b' },
    ordered: { label: 'Ordered', bg: 'rgba(100,116,139,0.15)', fg: '#64748b' },
    draft: { label: 'Not uploaded', bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6' },
};

export function StateBadge({ item, size = 'md' }: { item: RetailerOutOfStockNormalized; size?: 'sm' | 'md' }) {
    const { theme } = useAuth();
    const meta = STATE_META[stockOutState(item)];
    return (
        <View className="self-start rounded-full" style={{ backgroundColor: meta.bg, paddingHorizontal: size === 'sm' ? 7 : 9, paddingVertical: size === 'sm' ? 1 : 2 }}>
            <Text className="uppercase tracking-wide" style={{ color: meta.fg, fontFamily: theme.font.bold, fontSize: size === 'sm' ? 9 : 10 }} numberOfLines={1}>
                {meta.label}
            </Text>
        </View>
    );
}

/** "3 offers · from KES 120" chip; tapping opens the offers (or says there are none). */
export function OffersChip({ item, onPress, size = 'md' }: { item: RetailerOutOfStockNormalized; onPress: () => void; size?: 'sm' | 'md' }) {
    const { theme, isDarkMode } = useAuth();
    const n = offerCount(item);
    const best = bestOfferPrice(item);
    const has = n > 0;
    return (
        <Pressable
            onPress={(e: any) => {
                e?.stopPropagation?.();
                if (has) onPress();
                else notifyNoOffers(stockOutTitle(item));
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={has ? `View ${n} offer${n === 1 ? '' : 's'}` : 'No offers yet'}
            className="flex-row items-center self-start gap-1 rounded-full"
            style={{
                paddingHorizontal: size === 'sm' ? 8 : 10,
                height: size === 'sm' ? 24 : 28,
                backgroundColor: has ? 'rgba(16,185,129,0.12)' : isDarkMode ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.14)',
                ...webPointer,
            }}
        >
            <Ionicons name="pricetags-outline" size={size === 'sm' ? 11 : 12} color={has ? '#10b981' : theme.textDark} />
            <Text style={{ color: has ? '#10b981' : theme.textDark, fontFamily: theme.font.bold, fontSize: size === 'sm' ? 11 : 12 }} numberOfLines={1}>
                {has ? `${n} offer${n === 1 ? '' : 's'}` : 'No offers'}
            </Text>
            {has && best !== null ? (
                <Text style={{ color: '#10b981', fontFamily: theme.font.medium, fontSize: size === 'sm' ? 10 : 11, opacity: 0.85 }} numberOfLines={1}>
                    · from {formatKES(best)}
                </Text>
            ) : null}
        </Pressable>
    );
}

/** All / Waiting / Has offers / Special / Ordered chips with counts. */
function StockOutFilterChips({ value, onChange, counts }: { value: StockOutFilter; onChange: (f: StockOutFilter) => void; counts: Record<StockOutFilter, number> }) {
    const { theme, isDarkMode } = useAuth();
    const idleBorder = isDarkMode ? '#1e293b' : '#e2e8f0';
    return (
        <View className="flex-row flex-wrap items-center gap-1.5">
            {STOCKOUT_FILTERS.map((f) => {
                const active = f === value;
                const color = STOCKOUT_FILTER_COLORS[f] ?? theme.primary;
                const n = counts?.[f] ?? 0;
                return (
                    <Pressable
                        key={f}
                        onPress={() => onChange(f)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-full border"
                        style={{ borderColor: active ? color : idleBorder, backgroundColor: active ? `${color}14` : 'transparent', ...webPointer }}
                    >
                        <Ionicons name={STOCKOUT_FILTER_ICONS[f]} size={13} color={active ? color : theme.textDark} />
                        <Text style={{ color: active ? color : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{STOCKOUT_FILTER_LABELS[f]}</Text>
                        <Text style={{ color: active ? color : theme.textDark, fontFamily: theme.font.medium, fontSize: 11, opacity: 0.85 }}>{n}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function sourceDotColor(tone: SourceTone): string {
    return tone === 'server' ? '#10b981' : tone === 'cache' ? '#f59e0b' : '#94a3b8';
}

/* =========================================================
 * Props
 * ======================================================= */

export interface StockOutsViewProps {
    query: string;
    setQuery: (v: string) => void;
    activeFilter: StockOutFilter;
    setActiveFilter: (f: StockOutFilter) => void;
    onOpenCreate: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: SourceTone;
    lastSyncedTime: string;
    counts: StockOutCounts;
    items: RetailerOutOfStockNormalized[];
    emptyComponent?: React.ReactElement | null;
    onViewOffers: (item: RetailerOutOfStockNormalized) => void;
    onPressItem: (item: RetailerOutOfStockNormalized) => void;
}

interface WebProps extends StockOutsViewProps {
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
const COLS = { product: 3.6, customer: 2, qty: 0.9, offers: 2.1, status: 1.2, created: 1.3, chevron: 0.4 } as const;

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerOutOfStocksWebView({
    query,
    setQuery,
    activeFilter,
    setActiveFilter,
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
                {/* ============ Compact header: title · source · stats · actions ============ */}
                <View className="flex-row items-center mb-3 gap-4 flex-wrap">
                    <Text className="tracking-tight" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>
                        Out of Stock
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceDotColor(sourceTone) }} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {sourceLabel}
                            {lastSyncedTime ? ` · ${lastSyncedTime}` : ''}
                        </Text>
                    </View>

                    <View className="flex-1" />

                    <InlineStat label="Requests" value={counts.total.toLocaleString()} />
                    <InlineStat label="Waiting" value={counts.pending.toLocaleString()} color={counts.pending > 0 ? '#f59e0b' : undefined} />
                    <InlineStat label="With offers" value={counts.withOffers.toLocaleString()} color={counts.withOffers > 0 ? '#10b981' : undefined} />

                    <Pressable
                        onPress={onOpenCreate}
                        accessibilityRole="button"
                        accessibilityLabel="Add out-of-stock"
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg border"
                        style={{ borderColor: theme.primary, backgroundColor: `${theme.primary}12`, ...webPointer }}
                    >
                        <Ionicons name="add" size={15} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Add</Text>
                    </Pressable>
                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh out-of-stocks"
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
                                placeholder="Search product, customer, wholesaler…"
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

                        <StockOutFilterChips value={activeFilter} onChange={setActiveFilter} counts={counts.byFilter} />

                        {hasActiveFilter ? (
                            <Pressable onPress={clearFilters} hitSlop={6} style={webPointer}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear</Text>
                            </Pressable>
                        ) : null}

                        <View className="flex-1" />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {counts.visible.toLocaleString()} {counts.visible === 1 ? 'request' : 'requests'}
                        </Text>
                    </View>

                    {/* Column header */}
                    <View className="flex-row items-center px-5 py-2.5" style={{ backgroundColor: headerBg }}>
                        <HeaderCell flex={COLS.product}>Product</HeaderCell>
                        <HeaderCell flex={COLS.customer}>Customer</HeaderCell>
                        <HeaderCell flex={COLS.qty} align="right">Needed</HeaderCell>
                        <HeaderCell flex={COLS.offers}>Offers</HeaderCell>
                        <HeaderCell flex={COLS.status}>Status</HeaderCell>
                        <HeaderCell flex={COLS.created}>Created</HeaderCell>
                        <View style={{ flex: COLS.chevron }} />
                    </View>

                    {/* Rows */}
                    <FlatList
                        data={items}
                        keyExtractor={(item, idx) => `${item.remote_id || item.draft_id || 'oos'}-${idx}`}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                        ListEmptyComponent={
                            !hasActiveFilter && emptyComponent ? (
                                <>{emptyComponent}</>
                            ) : (
                                <View className="py-16 items-center">
                                    <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                                        <Ionicons name={hasActiveFilter ? 'search' : 'alert-circle-outline'} size={22} color={theme.primary} />
                                    </View>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                                        {hasActiveFilter ? 'No matching requests' : 'No out-of-stocks yet'}
                                    </Text>
                                    <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                                        {hasActiveFilter ? 'Try a different search or filter.' : 'Record products customers asked for that you don’t have.'}
                                    </Text>
                                    <Pressable
                                        onPress={hasActiveFilter ? clearFilters : onOpenCreate}
                                        className="mt-4 px-4 h-9 rounded-xl items-center justify-center border"
                                        style={{ borderColor, ...webPointer }}
                                    >
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>
                                            {hasActiveFilter ? 'Clear filters' : 'Add out-of-stock'}
                                        </Text>
                                    </Pressable>
                                </View>
                            )
                        }
                        renderItem={({ item, index }) => (
                            <Row item={item} isFirst={index === 0} onPress={() => onPressItem(item)} onViewOffers={() => onViewOffers(item)} />
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
            style={{ flex, textAlign: align, color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', paddingRight: 12 }}
            numberOfLines={1}
        >
            {children}
        </Text>
    );
}

/* =========================================================
 * Row
 * ======================================================= */

function Row({ item, isFirst, onPress, onViewOffers }: { item: RetailerOutOfStockNormalized; isFirst: boolean; onPress: () => void; onViewOffers: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const [hovered, setHovered] = useState(false);

    const borderColor = isDarkMode ? '#1e293b' : '#f1f5f9';
    const hoverBg = isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.025)';
    const isDraft = stockOutState(item) === 'draft';

    return (
        <Pressable
            onPress={onPress}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${stockOutTitle(item)}`}
            className="flex-row items-center px-5 py-3"
            style={{
                backgroundColor: hovered ? hoverBg : 'transparent',
                borderTopWidth: isFirst ? 0 : 1,
                borderTopColor: borderColor,
                ...webPointer,
            }}
        >
            {/* Product — full title, wrapping as needed */}
            <View style={{ flex: COLS.product, paddingRight: 12 }} className="flex-row items-start gap-3">
                <View className="w-9 h-9 rounded-xl overflow-hidden items-center justify-center" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
                    <ImageWithFallback uri={stockOutImageUrl(item)} width={36} height={36} fallback="📦" fallbackSize={15} borderRadius={10} />
                </View>
                <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13, lineHeight: 18, flexShrink: 1 }}>{stockOutTitle(item)}</Text>
                        {isDraft ? <Ionicons name="cloud-upload-outline" size={13} color="#3b82f6" /> : null}
                    </View>
                    {item.is_special_order ? (
                        <View className="flex-row items-center gap-1 mt-1">
                            <Ionicons name="star" size={11} color="#8b5cf6" />
                            <Text style={{ color: '#8b5cf6', fontFamily: theme.font.bold, fontSize: 11 }}>Special order</Text>
                        </View>
                    ) : null}
                </View>
            </View>

            {/* Customer */}
            <View style={{ flex: COLS.customer, paddingRight: 12 }}>
                <Text style={{ color: item.customer_name ? theme.text : theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                    {item.customer_name || 'Walk-in'}
                </Text>
                {item.customer_phone ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {item.customer_phone}
                    </Text>
                ) : null}
            </View>

            {/* Needed */}
            <Text style={{ flex: COLS.qty, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 13, paddingRight: 12 }} numberOfLines={1}>
                {Number(item.required_quantity ?? 0).toLocaleString()}
            </Text>

            {/* Offers */}
            <View style={{ flex: COLS.offers, paddingRight: 12 }}>
                <OffersChip item={item} onPress={onViewOffers} size="sm" />
            </View>

            {/* Status */}
            <View style={{ flex: COLS.status, paddingRight: 12 }}>
                <StateBadge item={item} size="sm" />
            </View>

            {/* Created */}
            <Text style={{ flex: COLS.created, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingRight: 12 }} numberOfLines={1}>
                {formatDate(item.created)}
            </Text>

            <View style={{ flex: COLS.chevron, alignItems: 'flex-end' }}>
                <Ionicons name="chevron-forward" size={16} color={hovered ? theme.primary : theme.textDark} />
            </View>
        </Pressable>
    );
}
