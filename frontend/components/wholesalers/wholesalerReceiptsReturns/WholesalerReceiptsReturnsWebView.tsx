// components/wholesalers/wholesalerReceiptsReturns/WholesalerReceiptsReturnsWebView.tsx
//
// Desktop view for wholesaler receipt returns — a decision table.
//
// Wholesalers don't create returns; they only decide on ones the
// retailer initiated. Row actions are Accept / Reject / Cancel and
// are shown only while status === 'PENDING'.

import type {
    WholesalerReturnReason,
    WholesalerReturnRecord,
    WholesalerReturnStatus,
} from '@/api/wholesalersApi';
import { DateField } from '@/components/common/DateField';
import {
    PAGE_SIZE_OPTIONS,
    PaginationBar,
    type PageSize,
} from '@/components/common/PaginationBar';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Props
 * ======================================================= */

type WholesalerReceiptsReturnsViewProps = {
    returns: WholesalerReturnRecord[];
    counts: {
        all: number;
        visible: number;
        pending: number;
        accepted: number;
        rejected: number;
        cancelled: number;
        totalQuantity: number;
    };
    query: string;
    onQueryChange: (q: string) => void;
    statusFilter: WholesalerReturnStatus | 'ALL';
    onStatusChange: (s: WholesalerReturnStatus | 'ALL') => void;
    reasonFilter: WholesalerReturnReason | 'ALL';
    onReasonChange: (r: WholesalerReturnReason | 'ALL') => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearFilters: () => void;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onAccept: (r: WholesalerReturnRecord) => void;
    onReject: (r: WholesalerReturnRecord) => void;
    onCancel: (r: WholesalerReturnRecord) => void;

    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
};

/* =========================================================
 * Formatters + metadata
 * ======================================================= */

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatNumber(value: number | string | null | undefined): string {
    const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-KE');
}

const STATUS_META: Record<
    WholesalerReturnStatus,
    { label: string; tint: string }
> = {
    PENDING: { label: 'Pending', tint: '#f59e0b' },
    ACCEPTED: { label: 'Accepted', tint: '#10b981' },
    REJECTED: { label: 'Rejected', tint: '#f43f5e' },
    CANCELLED: { label: 'Cancelled', tint: '#64748b' },
};

const REASON_OPTIONS: WholesalerReturnReason[] = [
    'EXPIRED',
    'NEAR_EXPIRY',
    'DAMAGED',
    'WRONG_ITEM',
    'SHORT_DATED',
    'QUALITY',
    'OVER_ORDERED',
    'RECALL',
    'OTHER',
];

/* =========================================================
 * Component
 * ======================================================= */

export function WholesalerReceiptsReturnsWebView({
    returns,
    counts,
    query,
    onQueryChange,
    statusFilter,
    onStatusChange,
    reasonFilter,
    onReasonChange,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    onClearFilters,
    loading,
    error,
    onRefresh,
    onAccept,
    onReject,
    onCancel,
    page,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    onPrev,
    onNext,
    onPageSizeChange,
}: WholesalerReceiptsReturnsViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const hasActiveFilter =
        !!dateFrom ||
        !!dateTo ||
        query.trim() !== '' ||
        statusFilter !== 'ALL' ||
        reasonFilter !== 'ALL';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header ============ */}
            <View
                className="px-6 py-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                {/* Row 1: title + search */}
                <View className="flex-row items-center gap-3 flex-wrap">
                    <View className="min-w-0">
                        <Text
                            className="tracking-tight"
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xl,
                            }}
                        >
                            Purchases returns
                        </Text>
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            {counts.visible} of {counts.all} ·{' '}
                            {counts.pending} pending ·{' '}
                            {formatNumber(counts.totalQuantity)} units total
                        </Text>
                    </View>

                    <View className="flex-1" />

                    <TextInput
                        value={query}
                        onChangeText={onQueryChange}
                        placeholder="Search product, reason, reference…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="rounded-lg border px-3 text-sm"
                        style={{
                            borderColor,
                            backgroundColor: inputBg,
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            height: 38,
                            minWidth: 260,
                            maxWidth: 340,
                        }}
                    />
                </View>

                {/* Row 2: status chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-3"
                    contentContainerStyle={{ gap: 8 }}
                >
                    <StatusChip
                        label="All"
                        count={counts.all}
                        active={statusFilter === 'ALL'}
                        theme={theme}
                        onPress={() => onStatusChange('ALL')}
                    />
                    <StatusChip
                        label="Pending"
                        count={counts.pending}
                        active={statusFilter === 'PENDING'}
                        tint={STATUS_META.PENDING.tint}
                        theme={theme}
                        onPress={() => onStatusChange('PENDING')}
                    />
                    <StatusChip
                        label="Accepted"
                        count={counts.accepted}
                        active={statusFilter === 'ACCEPTED'}
                        tint={STATUS_META.ACCEPTED.tint}
                        theme={theme}
                        onPress={() => onStatusChange('ACCEPTED')}
                    />
                    <StatusChip
                        label="Rejected"
                        count={counts.rejected}
                        active={statusFilter === 'REJECTED'}
                        tint={STATUS_META.REJECTED.tint}
                        theme={theme}
                        onPress={() => onStatusChange('REJECTED')}
                    />
                    <StatusChip
                        label="Cancelled"
                        count={counts.cancelled}
                        active={statusFilter === 'CANCELLED'}
                        tint={STATUS_META.CANCELLED.tint}
                        theme={theme}
                        onPress={() => onStatusChange('CANCELLED')}
                    />
                </ScrollView>

                {/* Row 3: reason + dates + clear */}
                <View className="flex-row items-end gap-3 flex-wrap mt-3">
                    <View style={{ minWidth: 180 }}>
                        <Text
                            className="uppercase tracking-widest mb-1"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Reason
                        </Text>
                        <View
                            className="rounded-lg border px-2 justify-center"
                            style={{
                                borderColor,
                                backgroundColor: inputBg,
                                height: 46,
                            }}
                        >
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 6 }}
                            >
                                <ReasonPill
                                    label="All"
                                    active={reasonFilter === 'ALL'}
                                    theme={theme}
                                    onPress={() => onReasonChange('ALL')}
                                />
                                {REASON_OPTIONS.map((r) => (
                                    <ReasonPill
                                        key={r}
                                        label={r.replace(/_/g, ' ')}
                                        active={reasonFilter === r}
                                        theme={theme}
                                        onPress={() => onReasonChange(r)}
                                    />
                                ))}
                            </ScrollView>
                        </View>
                    </View>

                    <View style={{ width: 160 }}>
                        <DateField
                            label="From"
                            value={dateFrom}
                            onChangeText={onDateFromChange}
                            placeholder="YYYY-MM-DD"
                        />
                    </View>
                    <View style={{ width: 160 }}>
                        <DateField
                            label="To"
                            value={dateTo}
                            onChangeText={onDateToChange}
                            placeholder="YYYY-MM-DD"
                        />
                    </View>

                    {hasActiveFilter ? (
                        <Pressable
                            onPress={onClearFilters}
                            accessibilityRole="button"
                            hitSlop={8}
                            className="px-3 h-[46px] rounded-lg items-center justify-center"
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
                    ) : null}
                </View>
            </View>

            {/* ============ Table ============ */}
            <View className="flex-1">
                {loading && returns.length === 0 ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator color={theme.primary} />
                        <Text
                            className="mt-3"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                            }}
                        >
                            Loading returns…
                        </Text>
                    </View>
                ) : error ? (
                    <View className="flex-1 items-center justify-center p-6">
                        <Text
                            style={{
                                color: '#f43f5e',
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                        >
                            Could not load returns
                        </Text>
                        <Text
                            className="mt-1 text-center"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.sm,
                            }}
                        >
                            {error}
                        </Text>
                        <Pressable
                            onPress={onRefresh}
                            accessibilityRole="button"
                            className="mt-4 px-5 h-10 rounded-lg items-center justify-center"
                            style={{ backgroundColor: theme.primary }}
                        >
                            <Text
                                className="uppercase tracking-widest text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                }}
                            >
                                Retry
                            </Text>
                        </Pressable>
                    </View>
                ) : returns.length === 0 ? (
                    <View className="flex-1 items-center justify-center p-6">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                        >
                            {counts.all === 0 ? 'No returns yet' : 'No matches'}
                        </Text>
                        <Text
                            className="mt-1 text-center"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.sm,
                            }}
                        >
                            {counts.all === 0
                                ? 'Returns initiated by retailers will appear here.'
                                : 'Try clearing your search or filters.'}
                        </Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        {/* Header row */}
                        <View
                            className="flex-row px-6 py-2.5 border-b"
                            style={{
                                backgroundColor: theme.panel,
                                borderBottomColor: borderColor,
                            }}
                        >
                            <Cell flex={3} header theme={theme}>
                                Product
                            </Cell>
                            <Cell flex={1.2} header theme={theme}>
                                Qty
                            </Cell>
                            <Cell flex={2} header theme={theme}>
                                Reason
                            </Cell>
                            <Cell flex={4} header theme={theme}>
                                Justification
                            </Cell>
                            <Cell flex={1.6} header theme={theme}>
                                Status
                            </Cell>
                            <Cell flex={1.6} header theme={theme}>
                                Created
                            </Cell>
                            <Cell flex={2.2} header theme={theme}>
                                Actions
                            </Cell>
                        </View>

                        {/* Data rows */}
                        <ScrollView
                            className="flex-1"
                            contentContainerStyle={{ paddingBottom: 8 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {returns.map((r) => {
                                const meta = STATUS_META[r.status];
                                const canDecide = r.status === 'PENDING';
                                return (
                                    <View
                                        key={r.id}
                                        className="flex-row px-6 py-3 border-b items-center"
                                        style={{
                                            borderBottomColor: borderColor,
                                        }}
                                    >
                                        <Cell flex={3} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily: theme.font.bold,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {r.product_title ?? '—'}
                                            </Text>
                                        </Cell>

                                        <Cell flex={1.2} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.mono,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                            >
                                                {formatNumber(r.quantity)}
                                            </Text>
                                        </Cell>

                                        <Cell flex={2} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.medium,
                                                    fontSize:
                                                        theme.fontSize.xs,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {r.reason ?? '—'}
                                            </Text>
                                        </Cell>

                                        <Cell flex={4} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.regular,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                                numberOfLines={2}
                                            >
                                                {r.justification || '—'}
                                            </Text>
                                        </Cell>

                                        <Cell flex={1.6} theme={theme}>
                                            <View
                                                className="px-2 py-0.5 rounded-full self-start"
                                                style={{
                                                    backgroundColor: `${meta.tint}20`,
                                                }}
                                            >
                                                <Text
                                                    className="uppercase tracking-widest text-[9px]"
                                                    style={{
                                                        color: meta.tint,
                                                        fontFamily:
                                                            theme.font.bold,
                                                    }}
                                                >
                                                    {meta.label}
                                                </Text>
                                            </View>
                                        </Cell>

                                        <Cell flex={1.6} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.mono,
                                                    fontSize:
                                                        theme.fontSize.xs,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {formatDate(r.created)}
                                            </Text>
                                        </Cell>

                                        <Cell flex={2.2} theme={theme}>
                                            {canDecide ? (
                                                <View className="flex-row items-center gap-2">
                                                    <IconButton
                                                        glyph="✓"
                                                        label="Accept return"
                                                        tint={theme.primary}
                                                        onPress={() =>
                                                            onAccept(r)
                                                        }
                                                    />
                                                    <IconButton
                                                        glyph="✕"
                                                        label="Reject return"
                                                        tint="#f43f5e"
                                                        onPress={() =>
                                                            onReject(r)
                                                        }
                                                    />
                                                    <IconButton
                                                        glyph="⊘"
                                                        label="Cancel return"
                                                        tint="#64748b"
                                                        onPress={() =>
                                                            onCancel(r)
                                                        }
                                                    />
                                                </View>
                                            ) : (
                                                <Text
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.regular,
                                                        fontSize:
                                                            theme.fontSize.xs,
                                                        opacity: 0.6,
                                                    }}
                                                >
                                                    —
                                                </Text>
                                            )}
                                        </Cell>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}
            </View>

            {/* ============ Pagination ============ */}
            {totalItems > 0 && (
                <View
                    className="px-6 py-3 border-t"
                    style={{
                        borderTopColor: borderColor,
                        backgroundColor: theme.panel,
                    }}
                >
                    <PaginationBar
                        page={page}
                        totalPages={totalPages}
                        pageStart={pageStart}
                        pageEnd={pageEnd}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        onPrev={onPrev}
                        onNext={onNext}
                        onPageSizeChange={onPageSizeChange}
                    />
                </View>
            )}
        </View>
    );
}

/* =========================================================
 * Status chip
 * ======================================================= */

function StatusChip({
    label,
    count,
    active,
    tint,
    theme,
    onPress,
}: {
    label: string;
    count: number;
    active: boolean;
    tint?: string;
    theme: ThemeShape;
    onPress: () => void;
}) {
    const color = tint ?? theme.primary;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="px-3 h-[32px] rounded-full border flex-row items-center"
            style={{
                borderColor: active ? color : theme.textDark + '33',
                backgroundColor: active ? `${color}15` : 'transparent',
            }}
        >
            <Text
                className="uppercase tracking-widest text-[10px]"
                style={{
                    color: active ? color : theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>
            <Text
                className="ml-1.5 text-[10px]"
                style={{
                    color: active ? color : theme.textDark,
                    fontFamily: theme.font.mono,
                    opacity: 0.75,
                }}
            >
                {count}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Reason pill (used inside the header's compact picker)
 * ======================================================= */

function ReasonPill({
    label,
    active,
    theme,
    onPress,
}: {
    label: string;
    active: boolean;
    theme: ThemeShape;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="px-2.5 h-[30px] rounded-full items-center justify-center"
            style={{
                backgroundColor: active
                    ? `${theme.primary}20`
                    : 'transparent',
                borderWidth: active ? 0 : 1,
                borderColor: theme.textDark + '22',
            }}
        >
            <Text
                className="uppercase tracking-widest text-[9px]"
                style={{
                    color: active ? theme.primary : theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Cell
 * ======================================================= */

function Cell({
    children,
    flex,
    header,
    theme,
}: {
    children: React.ReactNode;
    flex: number;
    header?: boolean;
    theme: ThemeShape;
}) {
    return (
        <View style={{ flex, paddingRight: 12 }}>
            {header ? (
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    {children}
                </Text>
            ) : (
                children
            )}
        </View>
    );
}

/* =========================================================
 * Icon button
 * ======================================================= */

function IconButton({
    glyph,
    label,
    tint,
    onPress,
}: {
    glyph: string;
    label: string;
    tint: string;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={6}
            className="items-center justify-center"
            style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: `${tint}10`,
                borderWidth: 1,
                borderColor: `${tint}30`,
            }}
        >
            <Text
                style={{
                    fontSize: 13,
                    lineHeight: 15,
                    color: tint,
                    fontWeight: '700',
                }}
            >
                {glyph}
            </Text>
        </Pressable>
    );
}