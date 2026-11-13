// components/entities/entityExpenseCategories/EntityExpenseCategoriesMobileView.tsx
//
// Small-screen view for entity expense categories — a card list.

import type { EntityExpenseCategory } from '@/api/expensesApi';
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
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Local primitives
 * ======================================================= */

type EntityExpenseCategoriesViewProps = {
    categories: EntityExpenseCategory[];
    counts: { total: number; visible: number; recurrent: number };
    query: string;
    onQueryChange: (q: string) => void;
    onlyRecurrent: boolean;
    onToggleOnlyRecurrent: () => void;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onNewCategory: () => void;
    onEditCategory: (c: EntityExpenseCategory) => void;
    onDeleteCategory: (c: EntityExpenseCategory) => void;

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

function periodLabel(c: EntityExpenseCategory): string {
    if (c.is_recurrent !== 'true') return 'One-off';
    if (!c.recurrence_period) return 'Recurrent';
    return (
        c.recurrence_period.charAt(0) +
        c.recurrence_period.slice(1).toLowerCase()
    );
}

/* =========================================================
 * Component
 * ======================================================= */

export function EntityExpenseCategoriesMobileView({
    categories,
    counts,
    query,
    onQueryChange,
    onlyRecurrent,
    onToggleOnlyRecurrent,
    loading,
    error,
    onRefresh,
    onNewCategory,
    onEditCategory,
    onDeleteCategory,
    page,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    onPrev,
    onNext,
    onPageSizeChange,
}: EntityExpenseCategoriesViewProps) {
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

    const handleEdit = useCallback(
        (c: EntityExpenseCategory) => onEditCategory(c),
        [onEditCategory],
    );

    const handleDelete = useCallback(
        (c: EntityExpenseCategory) => onDeleteCategory(c),
        [onDeleteCategory],
    );

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
                    <View className="min-w-0">
                        <Text
                            className="tracking-tight"
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xl,
                            }}
                            numberOfLines={1}
                        >
                            Expense categories
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
                            {counts.visible} of {counts.total} ·{' '}
                            {counts.recurrent} recurrent
                        </Text>
                    </View>

                    <Pressable
                        onPress={onNewCategory}
                        accessibilityRole="button"
                        accessibilityLabel="New category"
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
                    placeholder="Search title or description…"
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
                        onPress={onToggleOnlyRecurrent}
                        accessibilityRole="button"
                        accessibilityState={{ selected: onlyRecurrent }}
                        className="px-3 min-h-[30px] rounded-full border items-center justify-center"
                        style={{
                            borderColor: onlyRecurrent
                                ? theme.primary
                                : theme.textDark + '33',
                            backgroundColor: onlyRecurrent
                                ? `${theme.primary}15`
                                : 'transparent',
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: onlyRecurrent
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Recurrent only
                        </Text>
                    </Pressable>
                </View>
            </View>

            {/* ============ List ============ */}
            {loading && categories.length === 0 ? (
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
                        Loading categories…
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
                        Could not load categories
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
                    data={categories}
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
                            hasActiveFilter={
                                query.trim() !== '' || onlyRecurrent
                            }
                            hasCategories={counts.total > 0}
                        />
                    }
                    renderItem={({ item }) => (
                        <CategoryCard
                            category={item}
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
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

const CategoryCard = React.memo(function CategoryCard({
    category,
    borderColor,
    subBg,
    onEdit,
    onDelete,
}: {
    category: EntityExpenseCategory;
    borderColor: string;
    subBg: string;
    onEdit: (c: EntityExpenseCategory) => void;
    onDelete: (c: EntityExpenseCategory) => void;
}) {
    const { theme } = useAuth();
    const recurrent = category.is_recurrent === 'true';

    return (
        <Pressable
            onPress={() => onEdit(category)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${category.title}`}
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <View className="flex-row items-start justify-between">
                <Text
                    className="flex-1 pr-3"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 15,
                    }}
                    numberOfLines={1}
                >
                    {category.title}
                </Text>
                <BoolPill value={recurrent} theme={theme} />
            </View>

            {category.description ? (
                <Text
                    className="mt-1.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: 12,
                    }}
                    numberOfLines={2}
                >
                    {category.description}
                </Text>
            ) : null}

            <View
                className="rounded-xl px-3 py-2 mt-2.5 flex-row items-center justify-between"
                style={{ backgroundColor: subBg }}
            >
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                    }}
                >
                    Period
                </Text>
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 12,
                    }}
                >
                    {periodLabel(category)}
                </Text>
            </View>

            <View
                className="flex-row items-center justify-end gap-2 mt-2.5 pt-2.5 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                <IconButton
                    glyph="✏️"
                    label={`Edit ${category.title}`}
                    tint={theme.primary}
                    onPress={(e) => {
                        e?.stopPropagation?.();
                        onEdit(category);
                    }}
                />
                <IconButton
                    glyph="🗑️"
                    label={`Delete ${category.title}`}
                    tint="#f43f5e"
                    onPress={(e) => {
                        e?.stopPropagation?.();
                        onDelete(category);
                    }}
                />
            </View>
        </Pressable>
    );
});

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
    onPress: (e: any) => void;
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
 * Bool pill
 * ======================================================= */

function BoolPill({ value, theme }: { value: boolean; theme: ThemeShape }) {
    const tint = value ? '#10b981' : '#64748b';
    return (
        <View
            className="px-2 py-0.5 rounded-full border"
            style={{
                borderColor: `${tint}55`,
                backgroundColor: `${tint}15`,
            }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: tint,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
            >
                {value ? 'Recurrent' : 'One-off'}
            </Text>
        </View>
    );
}

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({
    theme,
    hasActiveFilter,
    hasCategories,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    hasCategories: boolean;
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
                    : hasCategories
                        ? 'Nothing to show'
                        : 'No categories yet'}
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
                    ? 'Try clearing your search or filter.'
                    : 'Create your first expense category to start categorizing expenses.'}
            </Text>
        </View>
    );
}