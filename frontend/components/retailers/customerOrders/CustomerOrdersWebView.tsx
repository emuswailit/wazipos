// components/retailers/customerOrders/CustomerOrdersWebView.tsx

import { isTrueFlag } from '@/utils/flags';
import { PaginationBar, type PageSize } from '@/components/common/PaginationBar';
import type { CustomerOrder } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';

/* =========================================================
 * Platform
 * ======================================================= */

const TABLE_MAX_WIDTH = 1600;
const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

/* =========================================================
 * View-layer contracts
 * ======================================================= */

/** Payment method filter. Values match the payment method titles the app saves. */
export const PAYMENT_METHOD_FILTERS = ['ALL', 'CASH', 'CREDIT', 'MOBILE MONEY'] as const;
export type PaymentMethodFilter = (typeof PAYMENT_METHOD_FILTERS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodFilter, string> = {
    ALL: 'All methods',
    CASH: 'Cash',
    CREDIT: 'Credit',
    'MOBILE MONEY': 'Mobile money',
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethodFilter, keyof typeof Ionicons.glyphMap> = {
    ALL: 'apps-outline',
    CASH: 'cash-outline',
    CREDIT: 'time-outline',
    'MOBILE MONEY': 'phone-portrait-outline',
};

export function matchesPaymentMethod(o: CustomerOrder, filter: PaymentMethodFilter): boolean {
    if (filter === 'ALL') return true;
    const title = String(o.selected_payment_method_title || '').trim().toUpperCase();
    if (filter === 'MOBILE MONEY') return title === 'MOBILE MONEY' || /MOBILE|M-?PESA|AIRTEL/.test(title);
    return title === filter;
}

export interface CustomerOrdersCounts {
    total: number;
    visible: number;
    unpaid: number;
    /** Orders per payment method, after the paid/unpaid toggle and search. */
    byMethod: Record<PaymentMethodFilter, number>;
}

export interface CustomerOrdersViewProps {
    orders: CustomerOrder[];
    counts: CustomerOrdersCounts;

    query: string;
    onQueryChange: (q: string) => void;

    onlyUnpaid: boolean;
    onToggleOnlyUnpaid: () => void;

    paymentMethod: PaymentMethodFilter;
    onPaymentMethodChange: (m: PaymentMethodFilter) => void;

    refreshing: boolean;
    onRefresh: () => void;

    isConnected: boolean;
    lastSynced: string;
    totalValue: number;

    onView: (order: CustomerOrder) => void;

    /** Retry uploading orders created offline (uploads every pending order). */
    onRetryUpload?: () => void;
    /** True while an upload run is in progress. */
    isUploading?: boolean;
}

/* =========================================================
 * Formatting
 * ======================================================= */

const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

export const toBool = (v: any): boolean =>
    isTrueFlag(v); // case-insensitive: the backend sends "true" / "True" strings

export const formatKES = (
    raw: string | number | null | undefined
): string => {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

export const formatDate = (
    raw: string | null | undefined
): string => {
    if (!raw) return '—';

    const s = String(raw).trim();
    if (!s) return '—';

    const normalized = s.includes(' ') ? s.replace(' ', 'T') : s;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return s;

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()] ?? '???';
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
};

export const orderRef = (o: CustomerOrder): string =>
    o.order_number || '—';

export const orderItemCount = (o: CustomerOrder): number =>
    o.order_items?.length ?? 0;

export const orderAmount = (o: CustomerOrder): number => {
    const raw =
        o.total_amount ||
        o.order_price_total ||
        o.order_net_price_total ||
        '0';
    const val = parseFloat(String(raw));
    return isNaN(val) ? 0 : val;
};

/* =========================================================
 * Pills
 * ======================================================= */

interface StatusTint {
    bg: string;
    fg: string;
}

const STATUS_TINTS: Record<string, StatusTint> = {
    DRAFT: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
    PENDING: { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' },
    CONFIRMED: { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
    PROCESSING: { bg: 'rgba(124,58,237,0.15)', fg: '#7c3aed' },
    PACKED: { bg: 'rgba(124,58,237,0.15)', fg: '#7c3aed' },
    DISPATCHED: { bg: 'rgba(3,105,161,0.15)', fg: '#0369a1' },
    DELIVERED: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
    COMPLETED: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
    COMPLETE: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
    CANCELLED: { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e' },
};

export function statusTint(status: string): StatusTint {
    const key = (status || '').toUpperCase();
    return (
        STATUS_TINTS[key] ?? {
            bg: 'rgba(148,163,184,0.15)',
            fg: '#94a3b8',
        }
    );
}

export function StatusPill({
    status,
    size = 'md',
}: {
    status: string;
    size?: 'sm' | 'md';
}) {
    const { theme } = useAuth();
    const tint = statusTint(status);
    return (
        <View
            className="self-start rounded-full"
            style={{
                backgroundColor: tint.bg,
                paddingHorizontal: size === 'sm' ? 6 : 8,
                paddingVertical: size === 'sm' ? 1 : 2,
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: tint.fg,
                    fontFamily: theme.font.bold,
                    fontSize: size === 'sm' ? 9 : 10,
                }}
                numberOfLines={1}
            >
                {status || 'UNKNOWN'}
            </Text>
        </View>
    );
}

export function PaymentPill({
    paid,
    compact = false,
}: {
    paid: boolean;
    compact?: boolean;
}) {
    const { theme } = useAuth();
    const tint = paid
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' }
        : { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e' };

    return (
        <View
            className="self-start rounded-full"
            style={{
                backgroundColor: tint.bg,
                paddingHorizontal: compact ? 6 : 8,
                paddingVertical: compact ? 1 : 2,
            }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: tint.fg,
                    fontFamily: theme.font.bold,
                    fontSize: compact ? 9 : 10,
                }}
                numberOfLines={1}
            >
                {paid ? 'Paid' : 'Unpaid'}
            </Text>
        </View>
    );
}

/* =========================================================
 * Shared bits for the table + cards
 * ======================================================= */

/** Initials for the customer avatar ("Michael Omaria" -> "MO"). */
function customerInitials(name?: string | null): string {
    const words = String(name || '')
        .replace(/[^A-Za-z\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '#';
    return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

/** Stable pastel colour per customer so avatars are easy to tell apart. */
const AVATAR_TINTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];
function avatarTint(seed?: string | null): string {
    const s = String(seed || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function Avatar({ name, size = 32 }: { name?: string | null; size?: number }) {
    const { theme } = useAuth();
    const tint = avatarTint(name);
    return (
        <View
            className="items-center justify-center rounded-full"
            style={{ width: size, height: size, backgroundColor: `${tint}1f` }}
        >
            <Text style={{ color: tint, fontFamily: theme.font.bold, fontSize: size * 0.36 }}>
                {customerInitials(name)}
            </Text>
        </View>
    );
}

/* =========================================================
 * Upload status (orders created offline)
 * ======================================================= */

export const isPendingUpload = (o: any): boolean => String(o?.synced ?? '').toUpperCase() === 'FALSE';

/**
 * For orders created offline: "Waiting to upload", or "Upload failed: <reason>" with a
 * Retry button when the server rejected the last attempt. Renders nothing for synced orders.
 */
export function UploadStatus({
    order,
    onRetry,
    retrying,
}: {
    order: CustomerOrder;
    onRetry?: () => void;
    retrying?: boolean;
}) {
    const { theme } = useAuth();
    if (!isPendingUpload(order)) return null;

    const error: string = String((order as any).sync_error || '').trim();
    const failed = !!error;
    const color = failed ? '#e11d48' : '#b45309';

    return (
        <View className="flex-row items-center gap-1.5 mt-1 flex-wrap">
            <Ionicons name={failed ? 'alert-circle' : 'cloud-upload-outline'} size={13} color={color} />
            <Text style={{ color, fontFamily: theme.font.medium, fontSize: 11, flexShrink: 1 }} numberOfLines={2}>
                {failed ? `Upload failed: ${error}` : 'Waiting to upload'}
            </Text>
            {failed && onRetry ? (
                <Pressable
                    onPress={(e: any) => {
                        e?.stopPropagation?.(); // don't open the order
                        onRetry();
                    }}
                    disabled={retrying}
                    accessibilityRole="button"
                    accessibilityLabel="Retry upload"
                    hitSlop={6}
                    className="flex-row items-center gap-1 px-2 h-6 rounded-md border"
                    style={{ borderColor: 'rgba(225,29,72,0.4)', opacity: retrying ? 0.5 : 1, ...webPointer }}
                >
                    <Ionicons name="refresh" size={11} color="#e11d48" />
                    <Text style={{ color: '#e11d48', fontFamily: theme.font.bold, fontSize: 11 }}>
                        {retrying ? 'Retrying…' : 'Retry'}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Column layout (flex weights, so the table fills any width)
 * ======================================================= */

const COLS = {
    order: 1.3,
    customer: 2,
    items: 0.7,
    method: 1.1,
    status: 1,
    payment: 0.9,
    amount: 1.2,
    chevron: 0.3,
} as const;

/* =========================================================
 * Web view
 * ======================================================= */

export function CustomerOrdersWebView({
    orders,
    counts,
    query,
    onQueryChange,
    onlyUnpaid,
    onToggleOnlyUnpaid,
    paymentMethod,
    onPaymentMethodChange,
    refreshing,
    onRefresh,
    isConnected,
    lastSynced,
    totalValue,
    onView,
    onRetryUpload,
    isUploading,
}: CustomerOrdersViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#1e293b' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0b1220' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);

    // Back to the first page whenever the filters change
    useEffect(() => {
        setPage(1);
    }, [query, onlyUnpaid, paymentMethod, pageSize]);

    const totalItems = orders.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    // Keep the page valid when live updates shrink the list
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    // PaginationBar contract: zero-based start, exclusive end
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const pageItems = useMemo(
        () => orders.slice(pageStart, pageEnd),
        [orders, pageStart, pageEnd]
    );

    const hasActiveFilter = onlyUnpaid || paymentMethod !== 'ALL' || query.trim() !== '';
    const clearFilters = () => {
        if (onlyUnpaid) onToggleOnlyUnpaid();
        if (paymentMethod !== 'ALL') onPaymentMethodChange('ALL');
        if (query.trim() !== '') onQueryChange('');
    };

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className="flex-1 w-full self-center px-6 pt-4 pb-4" style={{ maxWidth: TABLE_MAX_WIDTH }}>
                {/* ============ Compact header: title · live · stats · refresh ============ */}
                <View className="flex-row items-center mb-3 gap-4">
                    <Text
                        className="tracking-tight"
                        style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}
                    >
                        Customer Orders
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                        <View
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: isConnected ? '#10b981' : '#f59e0b' }}
                        />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {isConnected ? 'Live' : 'Offline'}
                            {lastSynced ? ` · ${lastSynced}` : ''}
                        </Text>
                    </View>

                    <View className="flex-1" />

                    <InlineStat label="Orders" value={counts.total.toLocaleString()} />
                    <InlineStat label="Unpaid" value={counts.unpaid.toLocaleString()} color={counts.unpaid > 0 ? '#f43f5e' : undefined} />
                    <InlineStat
                        label={hasActiveFilter ? 'Value (filtered)' : 'Value'}
                        value={`KES ${formatKES(totalValue)}`}
                        color="#10b981"
                    />

                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh orders"
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
                            className="flex-row items-center flex-1 min-w-[220px] max-w-[360px] h-9 rounded-xl border px-3"
                            style={{ borderColor, backgroundColor: inputBg }}
                        >
                            <Ionicons name="search" size={16} color={theme.textDark} />
                            <TextInput
                                value={query}
                                onChangeText={onQueryChange}
                                placeholder="Search order #, customer, phone, method…"
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

                        <MethodFilter value={paymentMethod} onChange={onPaymentMethodChange} counts={counts.byMethod} />

                        {hasActiveFilter ? (
                            <Pressable onPress={clearFilters} hitSlop={6} style={webPointer}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear</Text>
                            </Pressable>
                        ) : null}

                        <View className="flex-1" />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {counts.visible.toLocaleString()} {counts.visible === 1 ? 'order' : 'orders'}
                        </Text>
                    </View>

                    {/* Column header */}
                    <View className="flex-row items-center px-5 py-2.5" style={{ backgroundColor: headerBg }}>
                        <HeaderCell flex={COLS.order}>Order</HeaderCell>
                        <HeaderCell flex={COLS.customer}>Customer</HeaderCell>
                        <HeaderCell flex={COLS.items} align="center">Items</HeaderCell>
                        <HeaderCell flex={COLS.method}>Method</HeaderCell>
                        <HeaderCell flex={COLS.status}>Status</HeaderCell>
                        <HeaderCell flex={COLS.payment}>Payment</HeaderCell>
                        <HeaderCell flex={COLS.amount} align="right">Amount</HeaderCell>
                        <View style={{ flex: COLS.chevron }} />
                    </View>

                    {/* Rows */}
                    <FlatList
                        data={pageItems}
                        keyExtractor={(item, idx) => `${item.remote_id || item.draft_id || item.id || 'order'}-${idx}`}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                        ListEmptyComponent={
                            <View className="py-16 items-center">
                                <View
                                    className="w-12 h-12 rounded-full items-center justify-center mb-3"
                                    style={{ backgroundColor: `${theme.primary}14` }}
                                >
                                    <Ionicons name={hasActiveFilter ? 'search' : 'receipt-outline'} size={22} color={theme.primary} />
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                                    {hasActiveFilter ? 'No matching orders' : 'No customer orders yet'}
                                </Text>
                                <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                                    {hasActiveFilter ? 'Try a different search or filter.' : 'New orders will appear here as they arrive.'}
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
                        renderItem={({ item, index }) => (
                            <Row
                                item={item}
                                isFirst={index === 0}
                                onView={() => onView(item)}
                                onRetryUpload={onRetryUpload}
                                isUploading={isUploading}
                            />
                        )}
                        showsVerticalScrollIndicator={false}
                    />

                    {/* Pagination footer (shared component; it draws its own top border) */}
                    {totalItems > 0 && (
                        <View className="px-5 pb-3">
                            <PaginationBar
                                page={page}
                                pageSize={pageSize}
                                totalItems={totalItems}
                                totalPages={totalPages}
                                pageStart={pageStart}
                                pageEnd={pageEnd}
                                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                                onPageSizeChange={setPageSize}
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

/** One compact "Label  value" stat in the header line. */
function InlineStat({ label, value, color }: { label: string; value: string; color?: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg"
            style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}
        >
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
}

/** Cash / Credit / Mobile money filter chips with per-method counts. */
export function MethodFilter({
    value,
    onChange,
    counts,
}: {
    value: PaymentMethodFilter;
    onChange: (m: PaymentMethodFilter) => void;
    counts: Record<PaymentMethodFilter, number>;
}) {
    const { theme, isDarkMode } = useAuth();
    const idleBorder = isDarkMode ? '#1e293b' : '#e2e8f0';
    return (
        <View className="flex-row flex-wrap items-center gap-1.5">
            {PAYMENT_METHOD_FILTERS.map((m) => {
                const active = m === value;
                return (
                    <Pressable
                        key={m}
                        onPress={() => onChange(m)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-full border"
                        style={{
                            borderColor: active ? theme.primary : idleBorder,
                            backgroundColor: active ? `${theme.primary}12` : 'transparent',
                            ...webPointer,
                        }}
                    >
                        <Ionicons name={PAYMENT_METHOD_ICONS[m]} size={13} color={active ? theme.primary : theme.textDark} />
                        <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>
                            {PAYMENT_METHOD_LABELS[m]}
                        </Text>
                        <Text style={{ color: active ? theme.primary : theme.textDark, fontFamily: theme.font.medium, fontSize: 11, opacity: 0.8 }}>
                            {counts?.[m] ?? 0}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function SegmentedFilter({ onlyUnpaid, onToggle, unpaid }: { onlyUnpaid: boolean; onToggle: () => void; unpaid: number }) {
    const { theme, isDarkMode } = useAuth();
    const trackBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const options = [
        { key: 'all', label: 'All', active: !onlyUnpaid },
        { key: 'unpaid', label: unpaid > 0 ? `Unpaid · ${unpaid}` : 'Unpaid', active: onlyUnpaid },
    ];
    return (
        <View className="flex-row p-1 rounded-xl" style={{ backgroundColor: trackBg }}>
            {options.map((o) => (
                <Pressable
                    key={o.key}
                    onPress={() => {
                        if (!o.active) onToggle();
                    }}
                    className="px-3.5 h-8 rounded-lg items-center justify-center"
                    style={{
                        backgroundColor: o.active ? theme.panel : 'transparent',
                        ...(isWeb && o.active ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.08)' } as any) : {}),
                        ...webPointer,
                    }}
                >
                    <Text style={{ color: o.active ? theme.text : theme.textDark, fontFamily: theme.font.bold, fontSize: 12 }}>
                        {o.label}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
}

function HeaderCell({
    flex,
    align = 'left',
    children,
}: {
    flex: number;
    align?: 'left' | 'center' | 'right';
    children: React.ReactNode;
}) {
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

/* =========================================================
 * Row
 * ======================================================= */

function Row({
    item,
    isFirst,
    onView,
    onRetryUpload,
    isUploading,
}: {
    item: CustomerOrder;
    isFirst: boolean;
    onView: () => void;
    onRetryUpload?: () => void;
    isUploading?: boolean;
}) {
    const { theme, isDarkMode } = useAuth();
    const [hovered, setHovered] = useState(false);

    const borderColor = isDarkMode ? '#1e293b' : '#f1f5f9';
    const hoverBg = isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.025)';
    const paid = toBool(item.is_paid);
    const itemCount = orderItemCount(item);
    const pendingUpload = String((item as any).synced).toUpperCase() === 'FALSE';

    return (
        <Pressable
            onPress={onView}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            accessibilityRole="button"
            accessibilityLabel={`Open order ${orderRef(item)}`}
            className="flex-row items-center px-5 py-3"
            style={{
                backgroundColor: hovered ? hoverBg : 'transparent',
                borderTopWidth: isFirst ? 0 : 1,
                borderTopColor: borderColor,
                ...webPointer,
            }}
        >
            {/* Order # + date */}
            <View style={{ flex: COLS.order, paddingRight: 12 }}>
                <View className="flex-row items-center gap-1.5">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                        {orderRef(item)}
                    </Text>
                    {pendingUpload ? <Ionicons name="cloud-upload-outline" size={13} color="#f59e0b" /> : null}
                </View>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {formatDate(item.created)}
                </Text>
                <UploadStatus order={item} onRetry={onRetryUpload} retrying={isUploading} />
            </View>

            {/* Customer */}
            <View style={{ flex: COLS.customer, paddingRight: 12 }} className="flex-row items-center gap-2.5">
                <Avatar name={item.customer_name} size={32} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                        {item.customer_name || 'Walk-in Customer'}
                    </Text>
                    {item.customer_phone ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                            {item.customer_phone}
                        </Text>
                    ) : null}
                </View>
            </View>

            {/* Items */}
            <Text
                style={{ flex: COLS.items, textAlign: 'center', color: theme.text, fontFamily: theme.font.medium, fontSize: 13, paddingRight: 12 }}
                numberOfLines={1}
            >
                {itemCount}
            </Text>

            {/* Method */}
            <Text
                style={{ flex: COLS.method, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingRight: 12 }}
                numberOfLines={1}
            >
                {item.selected_payment_method_title || '—'}
            </Text>

            {/* Status */}
            <View style={{ flex: COLS.status, paddingRight: 12 }}>
                <StatusPill status={item.status} size="sm" />
            </View>

            {/* Payment */}
            <View style={{ flex: COLS.payment, paddingRight: 12 }}>
                <PaymentPill paid={paid} compact />
            </View>

            {/* Amount */}
            <Text
                style={{ flex: COLS.amount, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}
                numberOfLines={1}
            >
                KES {formatKES(orderAmount(item))}
            </Text>

            <View style={{ flex: COLS.chevron, alignItems: 'flex-end' }}>
                <Ionicons name="chevron-forward" size={16} color={hovered ? theme.primary : theme.textDark} />
            </View>
        </Pressable>
    );
}
