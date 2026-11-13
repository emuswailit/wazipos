// components/entities/entityExpenseCategories/EntityExpenseCategoriesWebView.tsx
//
// Desktop view for entity expense categories — a table.

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
    Pressable,
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
    if (c.is_recurrent !== 'true') return '—';
    if (!c.recurrence_period) return '—';
    return (
        c.recurrence_period.charAt(0) +
        c.recurrence_period.slice(1).toLowerCase()
    );
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

export function EntityExpenseCategoriesWebView({
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
    const rowHoverBg = isDarkMode ? '#111827' : '#f8fafc';

    const [hovered, setHovered] = useState<string | null>(null);

    const onRowEnter = useCallback((id: string) => setHovered(id), []);
    const onRowLeave = useCallback(() => setHovered(null), []);

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header ============ */}
            <View
                className="px-6 py-4 border-b flex-row items-center gap-3 flex-wrap"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="min-w-0">
                    <Text
                        className="tracking-tight"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xl,
                        }}
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
                    >
                        {counts.visible} of {counts.total} ·{' '}
                        {counts.recurrent} recurrent
                    </Text>
                </View>

                <View className="flex-1" />

                <TextInput
                    value={query}
                    onChangeText={onQueryChange}
                    placeholder="Search title or description…"
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
                    onPress={onToggleOnlyRecurrent}
                    accessibilityRole="button"
                    accessibilityState={{ selected: onlyRecurrent }}
                    className="px-3 h-[38px] rounded-lg border items-center justify-center"
                    style={{
                        borderColor: onlyRecurrent
                            ? theme.primary
                            : borderColor,
                        backgroundColor: onlyRecurrent
                            ? `${theme.primary}15`
                            : 'transparent',
                    }}
                >
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: onlyRecurrent
                                ? theme.primary
                                : theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                        }}
                    >
                        Recurrent only
                    </Text>
                </Pressable>

                <Pressable
                    onPress={onNewCategory}
                    accessibilityRole="button"
                    accessibilityLabel="New category"
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
                        + New category
                    </Text>
                </Pressable>
            </View>

            {/* ============ Table ============ */}
            <View className="flex-1">
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
                ) : categories.length === 0 ? (
                    <View className="flex-1 items-center justify-center p-6">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                        >
                            {counts.total === 0
                                ? 'No categories yet'
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
                            {counts.total === 0
                                ? 'Create your first expense category to start categorizing expenses.'
                                : 'Try clearing your search or filter.'}
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
                            <Cell flex={3} header theme={theme}>
                                Title
                            </Cell>
                            <Cell flex={4} header theme={theme}>
                                Description
                            </Cell>
                            <Cell flex={1.4} header theme={theme}>
                                Recurrent
                            </Cell>
                            <Cell flex={1.6} header theme={theme}>
                                Period
                            </Cell>
                            <Cell flex={1.6} header theme={theme}>
                                Updated
                            </Cell>
                            <Cell flex={1.4} header theme={theme}>
                                Actions
                            </Cell>
                        </View>

                        <View className="flex-1">
                            {categories.map((c) => {
                                const isHovered = hovered === c.id;
                                return (
                                    <Pressable
                                        key={c.id}
                                        // @ts-ignore — web-only hover
                                        onHoverIn={() => onRowEnter(c.id)}
                                        // @ts-ignore
                                        onHoverOut={onRowLeave}
                                        onPress={() => onEditCategory(c)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Edit ${c.title}`}
                                        className="flex-row px-6 py-3 border-b"
                                        style={{
                                            borderBottomColor: borderColor,
                                            backgroundColor: isHovered
                                                ? rowHoverBg
                                                : 'transparent',
                                        }}
                                    >
                                        <Cell flex={3} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily: theme.font.bold,
                                                    fontSize: theme.fontSize.sm,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {c.title}
                                            </Text>
                                        </Cell>
                                        <Cell flex={4} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.regular,
                                                    fontSize: theme.fontSize.sm,
                                                }}
                                                numberOfLines={2}
                                            >
                                                {c.description || '—'}
                                            </Text>
                                        </Cell>
                                        <Cell flex={1.4} theme={theme}>
                                            <BoolPill
                                                value={
                                                    c.is_recurrent === 'true'
                                                }
                                                theme={theme}
                                            />
                                        </Cell>
                                        <Cell flex={1.6} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.medium,
                                                    fontSize: theme.fontSize.sm,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {periodLabel(c)}
                                            </Text>
                                        </Cell>
                                        <Cell flex={1.6} theme={theme}>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily: theme.font.mono,
                                                    fontSize: theme.fontSize.xs,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {formatDate(c.updated)}
                                            </Text>
                                        </Cell>
                                        <Cell flex={1.4} theme={theme}>
                                            <View className="flex-row items-center gap-2">
                                                <IconButton
                                                    glyph="✏️"
                                                    label={`Edit ${c.title}`}
                                                    tint={theme.primary}
                                                    onPress={(e) => {
                                                        e?.stopPropagation?.();
                                                        onEditCategory(c);
                                                    }}
                                                />
                                                <IconButton
                                                    glyph="🗑️"
                                                    label={`Delete ${c.title}`}
                                                    tint="#f43f5e"
                                                    onPress={(e) => {
                                                        e?.stopPropagation?.();
                                                        onDeleteCategory(c);
                                                    }}
                                                />
                                            </View>
                                        </Cell>
                                    </Pressable>
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
 * Row helpers
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
    onPress: (e: any) => void;
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

function BoolPill({ value, theme }: { value: boolean; theme: ThemeShape }) {
    const tint = value ? '#10b981' : '#64748b';
    const label = value ? 'Yes' : 'No';
    return (
        <View
            className="self-start px-2 py-0.5 rounded-full border"
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
                {label}
            </Text>
        </View>
    );
}