// components/retailers/customerOrders/CustomerOrdersWebView.tsx
//
// Web table view for customer orders.
//
// Also exports the shared primitives (CustomerOrdersViewProps,
// CustomerOrdersCounts, formatters, pills, FilterPill,
// SummaryBadge) reused by the mobile view and the shell.

import type { CustomerOrder } from '@/databases/types';
import React from 'react';
import {
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth, type ThemeShape } from '@/context/AuthContext';

/* =========================================================
 * View-layer contracts
 * ======================================================= */

export interface CustomerOrdersCounts {
    total: number;
    visible: number;
    unpaid: number;
}

export interface CustomerOrdersViewProps {
    orders: CustomerOrder[];
    counts: CustomerOrdersCounts;

    query: string;
    onQueryChange: (q: string) => void;

    onlyUnpaid: boolean;
    onToggleOnlyUnpaid: () => void;

    refreshing: boolean;
    onRefresh: () => void;

    isConnected: boolean;
    lastSynced: string;
    totalValue: number;

    onView: (order: CustomerOrder) => void;
}

/* =========================================================
 * Formatting
 * ======================================================= */

export const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

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
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
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

export interface StatusTint {
    bg: string;
    fg: string;
}

export const STATUS_TINTS: Record<string, StatusTint> = {
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
 * Summary + filter badges
 * ======================================================= */

export function SummaryBadge({
    label,
    tone = 'neutral',
}: {
    label: string;
    tone?: 'neutral' | 'primary' | 'danger';
}) {
    const { theme, isDarkMode } = useAuth();
    const bg =
        tone === 'primary'
            ? `${theme.primary}20`
            : tone === 'danger'
                ? 'rgba(244,63,94,0.12)'
                : isDarkMode
                    ? 'rgba(148,163,184,0.15)'
                    : 'rgba(148,163,184,0.22)';
    const fg =
        tone === 'primary'
            ? theme.primary
            : tone === 'danger'
                ? '#f43f5e'
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
 * Column widths
 * ======================================================= */

const COLS = {
    orderNumber: '15%',
    customer: '18%',
    status: '12%',
    method: '12%',
    providerRef: '14%',
    amount: '15%',
    actions: '14%',
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
    refreshing,
    onRefresh,
    isConnected,
    lastSynced,
    totalValue,
    onView,
}: CustomerOrdersViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceLabel = isConnected
        ? 'Live · websocket'
        : 'Offline';

    const sourceTint = isConnected
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', dot: '#10b981' }
        : { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b', dot: '#f59e0b' };

    const hasActiveFilter = onlyUnpaid || query.trim() !== '';

    const clearFilters = () => {
        if (onlyUnpaid) onToggleOnlyUnpaid();
        if (query.trim() !== '') onQueryChange('');
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
                            Customer Orders
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <FilterPill
                                label={sourceLabel}
                                active
                                tint={sourceTint}
                                onPress={() => { }}
                            />
                            <SummaryBadge
                                label={`${counts.visible} of ${counts.total}`}
                            />
                            {counts.unpaid > 0 ? (
                                <SummaryBadge
                                    label={`${counts.unpaid} unpaid`}
                                    tone="danger"
                                />
                            ) : null}
                            <SummaryBadge
                                label={`KES ${formatKES(totalValue)}`}
                                tone="primary"
                            />
                            {lastSynced ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Synced {lastSynced}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onToggleOnlyUnpaid}
                            accessibilityRole="button"
                            accessibilityState={{
                                selected: onlyUnpaid,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center border"
                            style={{
                                borderColor: onlyUnpaid
                                    ? theme.primary
                                    : borderColor,
                                backgroundColor: onlyUnpaid
                                    ? `${theme.primary}15`
                                    : 'transparent',
                                minHeight: 40,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: onlyUnpaid
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Unpaid only
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
                            <Text
                                className="uppercase tracking-widest text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                {refreshing ? 'Refreshing…' : 'Refresh'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                <View className="flex-row items-center gap-3">
                    <TextInput
                        value={query}
                        onChangeText={onQueryChange}
                        placeholder="Search order number, customer…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-11 rounded-xl border px-3.5 max-w-[480px] flex-1"
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

            {/* ============ Table ============ */}
            <View className="p-4 flex-1">
                <View
                    className="flex-row rounded-xl border px-3 py-2.5 mb-1"
                    style={{ backgroundColor: headerBg, borderColor }}
                >
                    <Text style={headerStyle(theme, COLS.orderNumber)}>
                        Order Number
                    </Text>
                    <Text style={headerStyle(theme, COLS.customer)}>
                        Customer
                    </Text>
                    <Text style={headerStyle(theme, COLS.status)}>
                        Status
                    </Text>
                    <Text style={headerStyle(theme, COLS.method)}>
                        Method
                    </Text>
                    <Text style={headerStyle(theme, COLS.providerRef)}>
                        Provider Ref
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.amount),
                            textAlign: 'right',
                        }}
                    >
                        Amount
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

                <FlatList
                    data={orders}
                    keyExtractor={(item) =>
                        item.remote_id ||
                        item.draft_id ||
                        String(item.id ?? '')
                    }
                    contentContainerStyle={{ paddingBottom: 40 }}
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
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                {hasActiveFilter
                                    ? 'No orders match the filters.'
                                    : 'No customer orders yet.'}
                            </Text>
                            {hasActiveFilter && (
                                <Pressable
                                    onPress={clearFilters}
                                    className="mt-4 px-4 py-2.5 rounded-full"
                                    style={{
                                        backgroundColor: theme.primary,
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
                                        Clear filters
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    }
                    renderItem={({ item }) => (
                        <Row
                            item={item}
                            onView={() => onView(item)}
                        />
                    )}
                    showsVerticalScrollIndicator={false}
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
    onView,
}: {
    item: CustomerOrder;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const paid = toBool(item.is_paid);

    return (
        <Pressable
            onPress={onView}
            className="flex-row rounded-xl border px-3 py-2.5 mb-1 items-center"
            style={{ borderColor }}
        >
            <Text
                style={cellStyle(theme, COLS.orderNumber, true)}
                numberOfLines={1}
            >
                {orderRef(item)}
            </Text>
            <Text
                style={cellStyle(theme, COLS.customer)}
                numberOfLines={1}
            >
                {item.customer_name || '—'}
            </Text>
            <View style={{ width: COLS.status }}>
                <StatusPill status={item.status} size="sm" />
            </View>
            <Text
                style={cellStyle(theme, COLS.method)}
                numberOfLines={1}
            >
                {item.selected_payment_method_title || '—'}
            </Text>
            <Text
                style={cellStyle(theme, COLS.providerRef)}
                numberOfLines={1}
            >
                {item.provider_reference_number || '—'}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.amount),
                    textAlign: 'right',
                    color: paid ? '#10b981' : theme.text,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                KES {formatKES(orderAmount(item))}
            </Text>
            <View
                style={{
                    width: COLS.actions,
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                <PaymentPill paid={paid} compact />
                <Text
                    className="uppercase tracking-wide"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    View
                </Text>
            </View>
        </Pressable>
    );
}

/* =========================================================
 * Styles
 * ======================================================= */

function headerStyle(theme: ThemeShape, width: string) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
    };
}

function cellStyle(
    theme: ThemeShape,
    width: string,
    bold = false
) {
    return {
        width,
        color: bold ? theme.text : theme.textDark,
        fontFamily: bold ? theme.font.bold : theme.font.medium,
        fontSize: 11,
        paddingRight: 8,
    };
}