// components/entities/entityExpenses/EntityExpensesWebView.tsx
//
// Desktop view for entity expenses — a table.

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
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
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

/* =========================================================
 * Component
 * ======================================================= */

export function EntityExpensesWebView({
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

    const hasActiveFilter =
        !!categoryFilter || !!dateFrom || !!dateTo || query.trim() !== '';

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
                            Expenses
                        </Text>
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            {counts.visible} of {counts.all} · KES{' '}
                            {formatKES(counts.totalAmount)} total
                        </Text>
                    </View>

                    <View className="flex-1" />

                    <TextInput
                        value={query}
                        onChangeText={onQueryChange}
                        placeholder="Search category, description, amount…"
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

                    <Pressable
                        onPress={onNewExpense}
                        accessibilityRole="button"
                        accessibilityLabel="New expense"
                        className="px-4 h-[38px] rounded-lg items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                            }}
                        >
                            + New expense
                        </Text>
                    </Pressable>
                </View>

                <View className="flex-row items-end gap-3 flex-wrap mt-3">
                    <CategoryFilter
                        categories={categories}
                        value={categoryFilter}
                        onChange={onCategoryFilterChange}
                        theme={theme}
                        borderColor={borderColor}
                        inputBg={inputBg}
                    />

                    <View style={{ width: 170 }}>
                        <DateField
                            label="From"
                            value={dateFrom}
                            onChangeText={onDateFromChange}
                            placeholder="YYYY-MM-DD"
                        />
                    </View>

                    <View style={{ width: 170 }}>
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
                ) : expenses.length === 0 ? (
                    <View className="flex-1 items-center justify-center p-6">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                        >
                            {counts.all === 0
                                ? 'No expenses yet'
                                : 'No matches'}
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
                                ? 'Record your first expense to start tracking spending.'
                                : 'Try clearing your search or filters.'}
                        </Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <View
                            className="flex-row px-6 py-2.5 border-b"
                            style={{
                                backgroundColor: theme.panel,
                                borderBottomColor: borderColor,
                            }}
                        >
                            <Cell flex={2.4} header theme={theme}>
                                Date
                            </Cell>
                            <Cell flex={3} header theme={theme}>
                                Category
                            </Cell>
                            <Cell flex={5} header theme={theme}>
                                Description
                            </Cell>
                            <Cell flex={2} header theme={theme}>
                                Amount
                            </Cell>
                            <Cell flex={1.4} header theme={theme}>
                                Actions
                            </Cell>
                        </View>

                        <View className="flex-1">
                            {expenses.map((e) => {
                                const categoryTitle = e.expense_category
                                    ? categoryTitleById.get(
                                        e.expense_category,
                                    ) ?? '—'
                                    : '—';
                                return (
                                    <View
                                        key={e.id}
                                        className="flex-row px-6 py-3 border-b"
                                        style={{
                                            borderBottomColor: borderColor,
                                            backgroundColor: 'transparent',
                                        }}
                                    >
                                        <Cell flex={2.4} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.mono,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {formatDate(e.expense_date)}
                                            </Text>
                                        </Cell>
                                        <Cell flex={3} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {categoryTitle}
                                            </Text>
                                        </Cell>
                                        <Cell flex={5} theme={theme}>
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
                                                {e.description || '—'}
                                            </Text>
                                        </Cell>
                                        <Cell flex={2} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.mono,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                    textAlign: 'right',
                                                }}
                                                numberOfLines={1}
                                            >
                                                KES {formatKES(e.amount)}
                                            </Text>
                                        </Cell>
                                        <Cell flex={1.4} theme={theme}>
                                            <View className="flex-row items-center gap-2">
                                                <IconButton
                                                    glyph="✏️"
                                                    label="Edit expense"
                                                    tint={theme.primary}
                                                    onPress={() =>
                                                        onEditExpense(e)
                                                    }
                                                />
                                                <IconButton
                                                    glyph="🗑️"
                                                    label="Delete expense"
                                                    tint="#f43f5e"
                                                    onPress={() =>
                                                        onDeleteExpense(e)
                                                    }
                                                />
                                            </View>
                                        </Cell>
                                    </View>
                                );
                            })}
                        </View>
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
 * Row helper
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
            <Text style={{ fontSize: 13, lineHeight: 15 }}>{glyph}</Text>
        </Pressable>
    );
}

/* =========================================================
 * Category filter
 * ======================================================= */

function CategoryFilter({
    categories,
    value,
    onChange,
    theme,
    borderColor,
    inputBg,
}: {
    categories: EntityExpenseCategory[];
    value: string | null;
    onChange: (id: string | null) => void;
    theme: ThemeShape;
    borderColor: string;
    inputBg: string;
}) {
    const [open, setOpen] = React.useState(false);
    const selected = categories.find((c) => c.id === value);
    const label = selected ? selected.title : 'All categories';

    return (
        <View
            style={{
                position: 'relative',
                zIndex: 10,
                alignSelf: 'flex-start',
            }}
        >
            <Text
                className="uppercase tracking-widest mb-1.5"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                Category
            </Text>
            <Pressable
                onPress={() => setOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel="Filter by category"
                className="px-3 h-[46px] rounded-lg border flex-row items-center justify-between"
                style={{
                    minWidth: 200,
                    borderColor: value ? theme.primary : borderColor,
                    backgroundColor: value ? `${theme.primary}15` : inputBg,
                }}
            >
                <Text
                    className="uppercase tracking-widest mr-2"
                    style={{
                        color: value ? theme.primary : theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                    numberOfLines={1}
                >
                    {label}
                </Text>
                <Text
                    style={{
                        color: value ? theme.primary : theme.textDark,
                        fontSize: 10,
                    }}
                >
                    {open ? '▲' : '▼'}
                </Text>
            </Pressable>

            {open ? (
                <View
                    className="rounded-lg border overflow-hidden"
                    style={{
                        position: 'absolute',
                        top: 70,
                        left: 0,
                        minWidth: 220,
                        backgroundColor: theme.panel,
                        borderColor,
                        shadowColor: '#000',
                        shadowOpacity: 0.15,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 4,
                    }}
                >
                    <Pressable
                        onPress={() => {
                            onChange(null);
                            setOpen(false);
                        }}
                        className="px-3 py-2"
                    >
                        <Text
                            style={{
                                color: !value ? theme.primary : theme.text,
                                fontFamily: !value
                                    ? theme.font.bold
                                    : theme.font.regular,
                                fontSize: 12,
                            }}
                        >
                            All categories
                        </Text>
                    </Pressable>
                    {categories.map((c) => {
                        const active = value === c.id;
                        return (
                            <Pressable
                                key={c.id}
                                onPress={() => {
                                    onChange(c.id);
                                    setOpen(false);
                                }}
                                className="px-3 py-2 border-t"
                                style={{ borderTopColor: borderColor }}
                            >
                                <Text
                                    style={{
                                        color: active
                                            ? theme.primary
                                            : theme.text,
                                        fontFamily: active
                                            ? theme.font.bold
                                            : theme.font.regular,
                                        fontSize: 12,
                                    }}
                                    numberOfLines={1}
                                >
                                    {c.title}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
        </View>
    );
}