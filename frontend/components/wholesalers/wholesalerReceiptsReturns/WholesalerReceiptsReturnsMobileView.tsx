// components/wholesalers/wholesalerReceiptsReturns/WholesalerReceiptsReturnsMobileView.tsx
//
// Small-screen view for wholesaler receipt returns — a decision card list.
//
// Wholesalers don't create returns; they only decide on ones the
// retailer initiated. Card actions are Accept / Reject / Cancel and
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
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
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

export function WholesalerReceiptsReturnsMobileView({
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
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [refreshing, setRefreshing] = useState(false);
    const onPullRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            onRefresh();
        } finally {
            setRefreshing(false);
        }
    }, [onRefresh]);

    const [filtersOpen, setFiltersOpen] = useState(false);
    const openFilters = useCallback(() => setFiltersOpen(true), []);
    const closeFilters = useCallback(() => setFiltersOpen(false), []);

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
            {/* Pinned header */}
            <View
                className="px-4 pt-3 pb-2.5 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row items-center justify-between">
                    <View className="min-w-0 flex-1">
                        <Text
                            className="tracking-tight"
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xl,
                            }}
                            numberOfLines={1}
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
                            numberOfLines={1}
                        >
                            {counts.visible} of {counts.all} ·{' '}
                            {counts.pending} pending ·{' '}
                            {formatNumber(counts.totalQuantity)} units
                        </Text>
                    </View>
                </View>

                {/* Status chips — always visible, primary filter */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-2.5 -mx-4 px-4"
                    contentContainerStyle={{ gap: 8, paddingRight: 16 }}
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

                <TextInput
                    value={query}
                    onChangeText={onQueryChange}
                    placeholder="Search product, reason, reference…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="mt-2.5 h-9 rounded-lg border px-3 text-sm"
                    style={{
                        borderColor,
                        backgroundColor: inputBg,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                    }}
                />

                <View className="mt-2 flex-row items-center gap-2">
                    <Pressable
                        onPress={openFilters}
                        accessibilityRole="button"
                        accessibilityLabel="Open filters"
                        className="px-3 min-h-[30px] rounded-full border flex-row items-center"
                        style={{
                            borderColor: hasActiveFilter
                                ? theme.primary
                                : theme.textDark + '33',
                            backgroundColor: hasActiveFilter
                                ? `${theme.primary}15`
                                : 'transparent',
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: hasActiveFilter
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Filters
                        </Text>
                    </Pressable>

                    {hasActiveFilter ? (
                        <Pressable
                            onPress={onClearFilters}
                            accessibilityRole="button"
                            hitSlop={8}
                        >
                            <Text
                                className="uppercase tracking-widest text-[10px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>

            {/* List */}
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
                        Loading purchases returns…
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
                        Could not load purchases returns
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
                        className="mt-4 px-5 min-h-[40px] rounded-full items-center justify-center"
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
            ) : (
                <FlatList
                    data={returns}
                    keyExtractor={(item, idx) => item.id ?? `row-${idx}`}
                    contentContainerStyle={{
                        padding: 16,
                        paddingBottom: 32,
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onPullRefresh}
                            tintColor={theme.primary}
                        />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            theme={theme}
                            hasActiveFilter={hasActiveFilter}
                            hasReturns={counts.all > 0}
                        />
                    }
                    renderItem={({ item }) => (
                        <ReturnCard
                            record={item}
                            borderColor={borderColor}
                            subBg={subBg}
                            onAccept={onAccept}
                            onReject={onReject}
                            onCancel={onCancel}
                        />
                    )}
                    ListFooterComponent={
                        totalItems > 0 ? (
                            <View className="mt-3">
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
                        ) : null
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Filters sheet */}
            <FilterSheet
                visible={filtersOpen}
                onClose={closeFilters}
                statusFilter={statusFilter}
                onStatusChange={onStatusChange}
                reasonFilter={reasonFilter}
                onReasonChange={onReasonChange}
                dateFrom={dateFrom}
                onDateFromChange={onDateFromChange}
                dateTo={dateTo}
                onDateToChange={onDateToChange}
                onClearAll={onClearFilters}
                theme={theme}
                isDarkMode={isDarkMode}
            />
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
            className="px-3 min-h-[30px] rounded-full border flex-row items-center"
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
 * Card
 * ======================================================= */

const ReturnCard = React.memo(function ReturnCard({
    record,
    borderColor,
    subBg,
    onAccept,
    onReject,
    onCancel,
}: {
    record: WholesalerReturnRecord;
    borderColor: string;
    subBg: string;
    onAccept: (r: WholesalerReturnRecord) => void;
    onReject: (r: WholesalerReturnRecord) => void;
    onCancel: (r: WholesalerReturnRecord) => void;
}) {
    const { theme } = useAuth();
    const meta = STATUS_META[record.status];
    const canDecide = record.status === 'PENDING';

    return (
        <View
            className="rounded-2xl border p-4 mb-3"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            {/* Header: product + status + qty */}
            <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3 min-w-0">
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Product
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 15,
                            marginTop: 2,
                        }}
                        numberOfLines={2}
                    >
                        {record.product_title ?? '—'}
                    </Text>
                </View>

                <View className="items-end">
                    <View
                        className="px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${meta.tint}20` }}
                    >
                        <Text
                            className="uppercase tracking-widest text-[9px]"
                            style={{
                                color: meta.tint,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {meta.label}
                        </Text>
                    </View>
                    <Text
                        className="mt-1"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 16,
                        }}
                    >
                        ×{formatNumber(record.quantity)}
                    </Text>
                </View>
            </View>

            {/* Details block */}
            <View
                className="rounded-xl px-3 py-3 mt-3"
                style={{ backgroundColor: subBg, gap: 10 }}
            >
                <DetailRow
                    label="Reason"
                    value={record.reason ?? '—'}
                    theme={theme}
                />
                <DetailRow
                    label="Return type"
                    value={record.return_type ?? '—'}
                    theme={theme}
                />
                {record.reference_number ? (
                    <DetailRow
                        label="Reference"
                        value={record.reference_number}
                        theme={theme}
                        mono
                    />
                ) : null}
                <DetailRow
                    label="Created"
                    value={formatDate(record.created)}
                    theme={theme}
                    mono
                />
            </View>

            {/* Justification */}
            <View className="mt-2.5">
                <Text
                    className="uppercase tracking-widest mb-1"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                    }}
                >
                    Justification
                </Text>
                <View
                    className="rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: subBg }}
                >
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.regular,
                            fontSize: 13,
                            lineHeight: 19,
                        }}
                    >
                        {record.justification || '—'}
                    </Text>
                </View>
            </View>

            {/* Decision note (if any) */}
            {record.decision_notes ? (
                <View className="mt-2.5">
                    <Text
                        className="uppercase tracking-widest mb-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Decision note
                    </Text>
                    <View
                        className="rounded-xl px-3 py-2.5"
                        style={{ backgroundColor: subBg }}
                    >
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.regular,
                                fontSize: 13,
                                lineHeight: 19,
                            }}
                        >
                            {record.decision_notes}
                        </Text>
                    </View>
                </View>
            ) : null}

            {/* Actions — only while PENDING */}
            {canDecide ? (
                <View
                    className="flex-row items-center justify-end gap-2 mt-3 pt-3 border-t"
                    style={{ borderTopColor: `${theme.textDark}20` }}
                >
                    <DecisionButton
                        label="Reject"
                        tint="#f43f5e"
                        onPress={() => onReject(record)}
                    />
                    <DecisionButton
                        label="Cancel"
                        tint="#64748b"
                        onPress={() => onCancel(record)}
                    />
                    <DecisionButton
                        label="Accept"
                        tint={theme.primary}
                        onPress={() => onAccept(record)}
                    />
                </View>
            ) : null}
        </View>
    );
});

/* =========================================================
 * Detail row
 * ======================================================= */

function DetailRow({
    label,
    value,
    theme,
    mono = false,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    mono?: boolean;
}) {
    return (
        <View className="flex-row items-start justify-between gap-3">
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                    flexShrink: 0,
                }}
            >
                {label}
            </Text>
            <Text
                className="flex-1 text-right"
                style={{
                    color: theme.text,
                    fontFamily: mono ? theme.font.mono : theme.font.medium,
                    fontSize: 12,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

/* =========================================================
 * Decision button
 * ======================================================= */

function DecisionButton({
    label,
    tint,
    onPress,
}: {
    label: string;
    tint: string;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="px-3 min-h-[34px] items-center justify-center"
            style={{
                borderRadius: 10,
                backgroundColor: `${tint}10`,
                borderWidth: 1,
                borderColor: `${tint}30`,
            }}
        >
            <Text
                className="uppercase tracking-widest text-[10px]"
                style={{ color: tint, fontWeight: '700' }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Filter sheet
 * ======================================================= */

function FilterSheet({
    visible,
    onClose,
    statusFilter,
    onStatusChange,
    reasonFilter,
    onReasonChange,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    onClearAll,
    theme,
    isDarkMode,
}: {
    visible: boolean;
    onClose: () => void;
    statusFilter: WholesalerReturnStatus | 'ALL';
    onStatusChange: (s: WholesalerReturnStatus | 'ALL') => void;
    reasonFilter: WholesalerReturnReason | 'ALL';
    onReasonChange: (r: WholesalerReturnReason | 'ALL') => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearAll: () => void;
    theme: ThemeShape;
    isDarkMode: boolean;
}) {
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const hasActive =
        !!dateFrom ||
        !!dateTo ||
        statusFilter !== 'ALL' ||
        reasonFilter !== 'ALL';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/40">
                <Pressable
                    className="flex-1"
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss filters"
                />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View
                        className="rounded-t-2xl overflow-hidden"
                        style={{
                            backgroundColor: theme.panel,
                            maxHeight: '85%',
                        }}
                    >
                        <View className="items-center pt-2">
                            <View
                                className="w-10 h-1 rounded-full"
                                style={{
                                    backgroundColor: theme.textDark + '55',
                                }}
                            />
                        </View>

                        <View
                            className="flex-row items-center justify-between px-5 pt-3 pb-3 border-b"
                            style={{ borderBottomColor: borderColor }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                            >
                                Filters
                            </Text>
                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Close filters"
                                className="w-8 h-8 rounded-full items-center justify-center"
                                style={{ backgroundColor: theme.background }}
                            >
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            className="px-5"
                            contentContainerStyle={{
                                paddingTop: 14,
                                paddingBottom: 20,
                            }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Status */}
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Status
                            </Text>
                            <View className="flex-row flex-wrap gap-2 mb-5">
                                {(
                                    [
                                        'ALL',
                                        'PENDING',
                                        'ACCEPTED',
                                        'REJECTED',
                                        'CANCELLED',
                                    ] as const
                                ).map((s) => {
                                    const active = statusFilter === s;
                                    const label =
                                        s === 'ALL'
                                            ? 'All'
                                            : STATUS_META[s].label;
                                    const color =
                                        s === 'ALL'
                                            ? theme.primary
                                            : STATUS_META[s].tint;
                                    return (
                                        <Pressable
                                            key={s}
                                            onPress={() => onStatusChange(s)}
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected: active,
                                            }}
                                            className="px-3 min-h-[32px] rounded-full border items-center justify-center"
                                            style={{
                                                borderColor: active
                                                    ? color
                                                    : theme.textDark + '33',
                                                backgroundColor: active
                                                    ? `${color}15`
                                                    : 'transparent',
                                            }}
                                        >
                                            <Text
                                                className="uppercase tracking-widest text-[10px]"
                                                style={{
                                                    color: active
                                                        ? color
                                                        : theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                }}
                                            >
                                                {label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* Reason */}
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Reason
                            </Text>
                            <View className="flex-row flex-wrap gap-2 mb-5">
                                <Pressable
                                    onPress={() => onReasonChange('ALL')}
                                    accessibilityRole="button"
                                    accessibilityState={{
                                        selected: reasonFilter === 'ALL',
                                    }}
                                    className="px-3 min-h-[32px] rounded-full border items-center justify-center"
                                    style={{
                                        borderColor:
                                            reasonFilter === 'ALL'
                                                ? theme.primary
                                                : theme.textDark + '33',
                                        backgroundColor:
                                            reasonFilter === 'ALL'
                                                ? `${theme.primary}15`
                                                : 'transparent',
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-widest text-[10px]"
                                        style={{
                                            color:
                                                reasonFilter === 'ALL'
                                                    ? theme.primary
                                                    : theme.textDark,
                                            fontFamily: theme.font.bold,
                                        }}
                                    >
                                        All
                                    </Text>
                                </Pressable>
                                {REASON_OPTIONS.map((r) => {
                                    const active = reasonFilter === r;
                                    return (
                                        <Pressable
                                            key={r}
                                            onPress={() => onReasonChange(r)}
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected: active,
                                            }}
                                            className="px-3 min-h-[32px] rounded-full border items-center justify-center"
                                            style={{
                                                borderColor: active
                                                    ? theme.primary
                                                    : theme.textDark + '33',
                                                backgroundColor: active
                                                    ? `${theme.primary}15`
                                                    : 'transparent',
                                            }}
                                        >
                                            <Text
                                                className="uppercase tracking-widest text-[10px]"
                                                style={{
                                                    color: active
                                                        ? theme.primary
                                                        : theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                }}
                                            >
                                                {r.replace(/_/g, ' ')}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* Date range */}
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Date range
                            </Text>
                            <DateField
                                label="From"
                                value={dateFrom}
                                onChangeText={onDateFromChange}
                                placeholder="YYYY-MM-DD"
                            />
                            <DateField
                                label="To"
                                value={dateTo}
                                onChangeText={onDateToChange}
                                placeholder="YYYY-MM-DD"
                            />
                        </ScrollView>

                        <View
                            className="p-4 border-t flex-row items-center gap-2"
                            style={{
                                borderTopColor: borderColor,
                                backgroundColor: theme.background,
                            }}
                        >
                            <Pressable
                                onPress={onClearAll}
                                disabled={!hasActive}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !hasActive }}
                                className="flex-1 h-10 rounded-xl border items-center justify-center"
                                style={{
                                    borderColor,
                                    opacity: hasActive ? 1 : 0.4,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Clear all
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={onClose}
                                accessibilityRole="button"
                                className="flex-1 h-10 rounded-xl items-center justify-center"
                                style={{ backgroundColor: theme.primary }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Done
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({
    theme,
    hasActiveFilter,
    hasReturns,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    hasReturns: boolean;
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
                    : hasReturns
                        ? 'Nothing to show'
                        : 'No returns yet'}
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
                    ? 'Try clearing your search or filters.'
                    : 'Returns initiated by retailers will appear here.'}
            </Text>
        </View>
    );
}