// components/entities/entityExpenses/EntityExpensesMobileView.tsx
//
// Small-screen view for entity expenses — a card list.
//
// Cards show the full detail set: category, date, amount, description,
// draft reference, and created / updated timestamps. No text is
// truncated — long descriptions wrap.

import type {
    EntityExpense,
    EntityExpenseCategory,
} from '@/api/expensesApi';
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
 * Local primitives
 * ======================================================= */

type EntityExpensesViewProps = {
    expenses: EntityExpense[];
    categories: EntityExpenseCategory[];
    categoryTitleById: Map<string, string>;
    counts: { all: number; visible: number; totalAmount: number };
    query: string;
    onQueryChange: (q: string) => void;
    categoryFilter: string | null;
    onCategoryFilterChange: (id: string | null) => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearFilters: () => void;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onNewExpense: () => void;
    onEditExpense: (e: EntityExpense) => void;
    onDeleteExpense: (e: EntityExpense) => void;

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

function formatKES(value: number | string | null | undefined): string {
    const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

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

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/* =========================================================
 * Component
 * ======================================================= */

export function EntityExpensesMobileView({
    expenses,
    categories,
    categoryTitleById,
    counts,
    query,
    onQueryChange,
    categoryFilter,
    onCategoryFilterChange,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    onClearFilters,
    loading,
    error,
    onRefresh,
    onNewExpense,
    onEditExpense,
    onDeleteExpense,
    page,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    onPrev,
    onNext,
    onPageSizeChange,
}: EntityExpensesViewProps) {
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

    const handleEdit = useCallback(
        (e: EntityExpense) => onEditExpense(e),
        [onEditExpense],
    );
    const handleDelete = useCallback(
        (e: EntityExpense) => onDeleteExpense(e),
        [onDeleteExpense],
    );

    const hasActiveFilter =
        !!categoryFilter || !!dateFrom || !!dateTo || query.trim() !== '';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Pinned header ============ */}
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
                            Expenses
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
                            {counts.visible} of {counts.all} · KES{' '}
                            {formatKES(counts.totalAmount)}
                        </Text>
                    </View>

                    <Pressable
                        onPress={onNewExpense}
                        accessibilityRole="button"
                        accessibilityLabel="New expense"
                        className="px-3 min-h-[32px] rounded-full items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white text-[11px]"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            + New
                        </Text>
                    </Pressable>
                </View>

                <TextInput
                    value={query}
                    onChangeText={onQueryChange}
                    placeholder="Search category, description, amount…"
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

            {/* ============ List ============ */}
            {loading && expenses.length === 0 ? (
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
                        Loading expenses…
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
                        Could not load expenses
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
                    data={expenses}
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
                            hasExpenses={counts.all > 0}
                        />
                    }
                    renderItem={({ item }) => (
                        <ExpenseCard
                            expense={item}
                            categoryTitle={
                                item.expense_category
                                    ? categoryTitleById.get(
                                        item.expense_category,
                                    ) ?? '—'
                                    : '—'
                            }
                            borderColor={borderColor}
                            subBg={subBg}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
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

            {/* ============ Filters bottom sheet ============ */}
            <FilterSheet
                visible={filtersOpen}
                onClose={closeFilters}
                categories={categories}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={onCategoryFilterChange}
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
 * Card — full detail, no truncation
 * ======================================================= */

const ExpenseCard = React.memo(function ExpenseCard({
    expense,
    categoryTitle,
    borderColor,
    subBg,
    onEdit,
    onDelete,
}: {
    expense: EntityExpense;
    categoryTitle: string;
    borderColor: string;
    subBg: string;
    onEdit: (e: EntityExpense) => void;
    onDelete: (e: EntityExpense) => void;
}) {
    const { theme } = useAuth();

    return (
        <View
            className="rounded-2xl border p-4 mb-3"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            {/* ---- Header: full category title + amount ---- */}
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
                        Category
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 16,
                            marginTop: 2,
                        }}
                    >
                        {categoryTitle}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Amount
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 18,
                            marginTop: 2,
                        }}
                    >
                        KES {formatKES(expense.amount)}
                    </Text>
                </View>
            </View>

            {/* ---- Detail grid ---- */}
            <View
                className="rounded-xl px-3 py-3 mt-3"
                style={{ backgroundColor: subBg, gap: 10 }}
            >
                <DetailRow
                    label="Expense date"
                    value={formatDate(expense.expense_date)}
                    theme={theme}
                    mono
                />
                <DetailRow
                    label="Created"
                    value={formatDateTime(expense.created)}
                    theme={theme}
                    mono
                />
                <DetailRow
                    label="Updated"
                    value={formatDateTime(expense.updated)}
                    theme={theme}
                    mono
                />
            </View>

            {/* ---- Description (full, no truncation) ---- */}
            {expense.description ? (
                <View className="mt-3">
                    <Text
                        className="uppercase tracking-widest mb-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Description
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
                            {expense.description}
                        </Text>
                    </View>
                </View>
            ) : null}

            {/* ---- Footer: edit + delete icons ---- */}
            <View
                className="flex-row items-center justify-end gap-2 mt-3 pt-3 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                <IconButton
                    glyph="✏️"
                    label="Edit expense"
                    tint={theme.primary}
                    onPress={() => onEdit(expense)}
                />
                <IconButton
                    glyph="🗑️"
                    label="Delete expense"
                    tint="#f43f5e"
                    onPress={() => onDelete(expense)}
                />
            </View>
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
            hitSlop={8}
            className="items-center justify-center"
            style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: `${tint}10`,
                borderWidth: 1,
                borderColor: `${tint}30`,
            }}
        >
            <Text style={{ fontSize: 15, lineHeight: 17 }}>{glyph}</Text>
        </Pressable>
    );
}

/* =========================================================
 * Filter sheet
 * ======================================================= */

function FilterSheet({
    visible,
    onClose,
    categories,
    categoryFilter,
    onCategoryFilterChange,
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
    categories: EntityExpenseCategory[];
    categoryFilter: string | null;
    onCategoryFilterChange: (id: string | null) => void;
    dateFrom: string;
    onDateFromChange: (d: string) => void;
    dateTo: string;
    onDateToChange: (d: string) => void;
    onClearAll: () => void;
    theme: ThemeShape;
    isDarkMode: boolean;
}) {
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const hasActive = !!categoryFilter || !!dateFrom || !!dateTo;

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
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Category
                            </Text>
                            <View className="flex-row flex-wrap gap-1.5 mb-4">
                                <Chip
                                    label="All"
                                    active={!categoryFilter}
                                    theme={theme}
                                    onPress={() =>
                                        onCategoryFilterChange(null)
                                    }
                                />
                                {categories.map((c) => (
                                    <Chip
                                        key={c.id}
                                        label={c.title}
                                        active={categoryFilter === c.id}
                                        theme={theme}
                                        onPress={() =>
                                            onCategoryFilterChange(c.id)
                                        }
                                    />
                                ))}
                            </View>

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

function Chip({
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
            className="px-3 py-1.5 rounded-full border"
            style={{
                borderColor: active ? theme.primary : theme.textDark + '33',
                backgroundColor: active
                    ? `${theme.primary}15`
                    : 'transparent',
            }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: active ? theme.primary : theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({
    theme,
    hasActiveFilter,
    hasExpenses,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    hasExpenses: boolean;
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
                    : hasExpenses
                        ? 'Nothing to show'
                        : 'No expenses yet'}
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
                    : 'Record your first expense to start tracking spending.'}
            </Text>
        </View>
    );
}