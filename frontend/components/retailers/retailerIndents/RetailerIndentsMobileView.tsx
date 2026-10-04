// components/retailers/retailerIndents/RetailerIndentsMobileView.tsx
//
// Small-screen view for retailer indents.

import type { RetailerIndent } from '@/databases/types';
import React from 'react';
import {
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth, type ThemeShape } from '@/context/AuthContext';

/* =========================================================
 * Props
 * ======================================================= */

type IndentsCounts = {
    total: number;
    visible: number;
    open: number;
    overBudget: number;
    drafts: number;
};

type Props = {
    indents: RetailerIndent[];
    counts: IndentsCounts;
    query: string;
    onQueryChange: (q: string) => void;
    onlyOpen: boolean;
    onToggleOnlyOpen: () => void;
    refreshing: boolean;
    onRefresh: () => void;
    isLiveConnected: boolean;
    pendingIndentOpCount: number;
    lastSyncedTime: string;
    onView: (indent: RetailerIndent) => void;
};

/* =========================================================
 * Helpers
 * ======================================================= */

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

const isDraftIndent = (i: RetailerIndent): boolean =>
    typeof i.remote_id === 'string' &&
    i.remote_id.startsWith('local-');

const formatDate = (raw: string): string => {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
};

const formatKES = (
    raw: string | number | null | undefined,
): string => {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

const hasBudgetSet = (i: RetailerIndent): boolean => {
    if (i.budget_amount === null || i.budget_amount === undefined) {
        return false;
    }
    const s = String(i.budget_amount).trim();
    if (s === '') return false;
    const n = Number(s);
    return !isNaN(n) && n > 0;
};

const indentItemCount = (i: RetailerIndent): number => {
    if (
        typeof i.active_item_count === 'number' &&
        i.active_item_count > 0
    ) {
        return i.active_item_count;
    }
    return i.retailer_indent_items?.length ?? 0;
};

const budgetPct = (i: RetailerIndent): number | null => {
    if (!hasBudgetSet(i)) return null;
    const budget = Number(i.budget_amount);
    if (!budget || isNaN(budget)) return null;
    const total = Number(i.total_cost || 0);
    if (isNaN(total)) return null;
    return (total / budget) * 100;
};

const campaignTitleOf = (i: RetailerIndent): string =>
    String((i as any).campaign_title ?? '');

/* =========================================================
 * Atoms
 * ======================================================= */

function FilterPill({
    label,
    active,
    count,
    tint,
    onPress,
}: {
    label: string;
    active?: boolean;
    count?: number;
    tint?: { fg: string; bg: string; dot?: string };
    onPress?: () => void;
}) {
    const fg = active ? tint?.fg ?? '#10b981' : undefined;
    const bg = active
        ? tint?.bg ?? 'rgba(16,185,129,0.12)'
        : 'transparent';

    return (
        <Pressable
            onPress={onPress}
            className="px-3 py-1.5 rounded-full flex-row items-center gap-2"
            style={{
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: active ? fg : 'transparent',
            }}
        >
            {active && tint?.dot ? (
                <View
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: tint.dot,
                    }}
                />
            ) : null}
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: active ? fg : '#94a3b8',
                    fontFamily: 'System',
                    fontWeight: '700',
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            {typeof count === 'number' && (
                <View
                    className="px-1.5 rounded-full"
                    style={{
                        backgroundColor: active
                            ? tint?.fg ?? '#10b981'
                            : 'rgba(148,163,184,0.2)',
                    }}
                >
                    <Text
                        style={{
                            color: active ? '#ffffff' : '#94a3b8',
                            fontFamily: 'System',
                            fontWeight: '700',
                            fontSize: 9,
                        }}
                    >
                        {count}
                    </Text>
                </View>
            )}
        </Pressable>
    );
}

function SummaryBadge({
    label,
    tone,
}: {
    label: string;
    tone?: 'primary' | 'danger' | 'neutral' | 'warn';
}) {
    const tint =
        tone === 'primary'
            ? { fg: '#2563eb', bg: 'rgba(37,99,235,0.12)' }
            : tone === 'danger'
                ? { fg: '#f43f5e', bg: 'rgba(244,63,94,0.12)' }
                : tone === 'warn'
                    ? { fg: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
                    : { fg: '#64748b', bg: 'rgba(148,163,184,0.15)' };

    return (
        <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: tint.bg }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: tint.fg,
                    fontFamily: 'System',
                    fontWeight: '700',
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function StatusPill({
    isOpen,
    size = 'md',
}: {
    isOpen: boolean;
    size?: 'sm' | 'md';
}) {
    const fg = isOpen ? '#10b981' : '#64748b';
    const bg = isOpen
        ? 'rgba(16,185,129,0.12)'
        : 'rgba(148,163,184,0.15)';

    return (
        <View
            className={`${size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'} rounded-full`}
            style={{ backgroundColor: bg }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: fg,
                    fontFamily: 'System',
                    fontWeight: '700',
                    fontSize: size === 'sm' ? 9 : 10,
                }}
            >
                {isOpen ? 'Open' : 'Closed'}
            </Text>
        </View>
    );
}

function DraftPill({ size = 'sm' }: { size?: 'sm' | 'md' }) {
    return (
        <View
            className={`${size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'} rounded-full`}
            style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: '#f59e0b',
                    fontFamily: 'System',
                    fontWeight: '700',
                    fontSize: size === 'sm' ? 9 : 10,
                }}
            >
                Draft
            </Text>
        </View>
    );
}

function Chip({
    children,
    theme,
    borderColor,
}: {
    children: React.ReactNode;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: theme.isDarkMode
                    ? '#0f172a'
                    : '#f1f5f9',
                borderColor,
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
                numberOfLines={1}
            >
                {children}
            </Text>
        </View>
    );
}

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerIndentsMobileView({
    indents,
    counts,
    query,
    onQueryChange,
    onlyOpen,
    onToggleOnlyOpen,
    refreshing,
    onRefresh,
    isLiveConnected,
    pendingIndentOpCount,
    lastSyncedTime,
    onView,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceLabel = isLiveConnected ? 'Live' : 'Connecting…';

    const sourceTint = isLiveConnected
        ? {
            bg: 'rgba(16,185,129,0.12)',
            fg: '#10b981',
            dot: '#10b981',
        }
        : {
            bg: 'rgba(251,191,36,0.15)',
            fg: '#f59e0b',
            dot: '#f59e0b',
        };

    const hasActiveFilter =
        onlyOpen || query.trim() !== '';
    const hasPendingOps = pendingIndentOpCount > 0;

    const clearFilters = () => {
        if (onlyOpen) onToggleOnlyOpen();
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
                            Indents
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <FilterPill
                                label={sourceLabel}
                                active
                                tint={sourceTint}
                                onPress={() => { }}
                            />
                            <SummaryBadge
                                label={`${counts.total} indent${counts.total === 1 ? '' : 's'}`}
                            />
                            {counts.open > 0 ? (
                                <SummaryBadge
                                    label={`${counts.open} open`}
                                    tone="primary"
                                />
                            ) : null}
                            {counts.drafts > 0 ? (
                                <SummaryBadge
                                    label={`${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}`}
                                    tone="warn"
                                />
                            ) : null}
                            {counts.overBudget > 0 ? (
                                <SummaryBadge
                                    label={`${counts.overBudget} over budget`}
                                    tone="danger"
                                />
                            ) : null}
                        </View>

                        {lastSyncedTime ? (
                            <Text
                                className="mt-1"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Synced {lastSyncedTime}
                            </Text>
                        ) : null}
                    </View>

                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityState={{
                            disabled: refreshing,
                        }}
                        className="px-4 rounded-full items-center justify-center"
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
                            {refreshing ? '…' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>

                {hasPendingOps ? (
                    <Pressable
                        onPress={onRefresh}
                        className="flex-row items-center px-3 py-2 rounded-lg mb-3"
                        style={{
                            backgroundColor:
                                'rgba(245,158,11,0.12)',
                            borderWidth: 1,
                            borderColor:
                                'rgba(245,158,11,0.35)',
                        }}
                    >
                        <View
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: '#f59e0b',
                                marginRight: 8,
                            }}
                        />
                        <Text
                            style={{
                                flex: 1,
                                color: '#b45309',
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            {pendingIndentOpCount} change
                            {pendingIndentOpCount === 1
                                ? ''
                                : 's'}{' '}
                            waiting to sync — tap to try now
                        </Text>
                    </Pressable>
                ) : null}

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2 -mx-1"
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                    <FilterPill
                        label="All"
                        active={!onlyOpen}
                        count={counts.total}
                        tint={{
                            fg: theme.primary,
                            dot: theme.primary,
                            bg: `${theme.primary}15`,
                        }}
                        onPress={() => {
                            if (onlyOpen) onToggleOnlyOpen();
                        }}
                    />
                    <FilterPill
                        label="Open only"
                        active={onlyOpen}
                        count={counts.open}
                        tint={{
                            fg: '#10b981',
                            dot: '#10b981',
                            bg: 'rgba(16,185,129,0.12)',
                        }}
                        onPress={() => {
                            if (!onlyOpen) onToggleOnlyOpen();
                        }}
                    />
                </ScrollView>

                <TextInput
                    value={query}
                    onChangeText={onQueryChange}
                    placeholder="Search entity, indent no, product…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-11 rounded-xl border px-3.5"
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
                        className="mt-2 self-start"
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Clear filters
                        </Text>
                    </Pressable>
                )}
            </View>

            {/* ============ List ============ */}
            <FlatList
                data={indents}
                keyExtractor={(item, idx) =>
                    `${item.remote_id ?? item.id ?? 'indent'}-${idx}`
                }
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 32,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        theme={theme}
                        hasActiveFilter={hasActiveFilter}
                        hasIndents={counts.total > 0}
                        onClearFilters={clearFilters}
                    />
                }
                renderItem={({ item }) => (
                    <IndentCard
                        indent={item}
                        onView={() => onView(item)}
                    />
                )}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

function IndentCard({
    indent,
    onView,
}: {
    indent: RetailerIndent;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const isOpen = toBool(indent.is_open);
    const isDraft = isDraftIndent(indent);
    const itemCount = indentItemCount(indent);
    const budgetSet = hasBudgetSet(indent);
    const pct = budgetPct(indent);
    const campaign = campaignTitleOf(indent);

    const budgetNum = budgetSet ? Number(indent.budget_amount) : 0;
    const costNum = Number(indent.total_cost || 0);
    const overBudget =
        toBool(indent.over_budget) ||
        (budgetSet && budgetNum > 0 && costNum > budgetNum);
    const overage =
        overBudget && budgetNum > 0 ? costNum - budgetNum : 0;

    const previewItems = (indent.retailer_indent_items ?? [])
        .slice(0, 3)
        .map((i) => i.wholesale_receipt_title)
        .filter(Boolean);

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <View className="flex-row items-center mb-2 gap-2">
                <Text
                    className="flex-1 uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                    numberOfLines={1}
                >
                    {indent.indent_number ||
                        (isDraft ? 'Draft' : indent.remote_id)}
                </Text>
                {isDraft ? <DraftPill /> : null}
                <StatusPill isOpen={isOpen} />
            </View>

            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 15,
                }}
                numberOfLines={2}
            >
                {indent.entity_title || '—'}
            </Text>

            {campaign ? (
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: 11,
                    }}
                    numberOfLines={1}
                >
                    From {campaign}
                </Text>
            ) : null}

            <View className="flex-row items-center flex-wrap gap-1.5 mt-2.5">
                <Chip theme={theme} borderColor={borderColor}>
                    {itemCount} item{itemCount === 1 ? '' : 's'}
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    Lead {indent.lead_time ?? 0}d
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    Cycle {indent.order_days ?? 0}d
                </Chip>
                <Chip theme={theme} borderColor={borderColor}>
                    {formatDate(indent.created)}
                </Chip>
            </View>

            <View
                className="rounded-xl px-3 py-2 mt-2.5 flex-row items-center justify-between"
                style={{ backgroundColor: subBg }}
            >
                <View>
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Total cost
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            marginTop: 2,
                        }}
                    >
                        KES {formatKES(indent.total_cost)}
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
                        Projected profit
                    </Text>
                    <Text
                        style={{
                            color:
                                Number(indent.total_profit) > 0
                                    ? '#10b981'
                                    : theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            marginTop: 2,
                        }}
                    >
                        KES {formatKES(indent.total_profit)}
                    </Text>
                </View>
            </View>

            {budgetSet ? (
                <View className="mt-2.5">
                    <View className="flex-row items-center justify-between mb-1">
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: overBudget
                                    ? '#f43f5e'
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Budget
                        </Text>
                        <Text
                            style={{
                                color: overBudget
                                    ? '#f43f5e'
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            {formatKES(costNum)} /{' '}
                            {formatKES(indent.budget_amount)}
                            {pct !== null
                                ? ` · ${pct.toFixed(0)}%`
                                : ''}
                        </Text>
                    </View>
                    <View
                        className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{
                            backgroundColor: isDarkMode
                                ? '#0f172a'
                                : '#f1f5f9',
                        }}
                    >
                        <View
                            style={{
                                height: '100%',
                                width: `${Math.min(
                                    100,
                                    Math.max(0, pct ?? 0),
                                )}%`,
                                backgroundColor: overBudget
                                    ? '#f43f5e'
                                    : theme.primary,
                            }}
                        />
                    </View>
                    {overBudget && overage > 0 ? (
                        <View
                            className="px-2 py-0.5 rounded-md self-start mt-2"
                            style={{
                                backgroundColor:
                                    'rgba(244,63,94,0.12)',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: '#f43f5e',
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                ⚠ Over by KES {formatKES(overage)}
                            </Text>
                        </View>
                    ) : null}
                </View>
            ) : (
                <Text
                    className="uppercase tracking-widest mt-2.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                        opacity: 0.6,
                    }}
                >
                    No budget set
                </Text>
            )}

            {previewItems.length > 0 ? (
                <View className="mt-2.5">
                    {previewItems.map((t, i) => (
                        <Text
                            key={`${indent.remote_id}-p-${i}`}
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 12,
                            }}
                            numberOfLines={1}
                        >
                            • {t}
                        </Text>
                    ))}
                    {itemCount > 3 && (
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                                opacity: 0.7,
                            }}
                        >
                            +{itemCount - 3} more
                        </Text>
                    )}
                </View>
            ) : null}

            <View
                className="flex-row justify-end gap-4 mt-3 pt-2.5 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                <Pressable
                    onPress={onView}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="View indent"
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                        }}
                    >
                        View details
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({
    theme,
    hasActiveFilter,
    hasIndents,
    onClearFilters,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    hasIndents: boolean;
    onClearFilters: () => void;
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
                    : hasIndents
                        ? 'Nothing to show'
                        : 'No indents yet'}
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
                    ? 'Try adjusting your filters.'
                    : 'New indents will appear here as they arrive.'}
            </Text>
            {hasActiveFilter && (
                <Pressable
                    onPress={onClearFilters}
                    className="mt-4 px-5 rounded-full items-center justify-center"
                    style={{
                        backgroundColor: theme.primary,
                        minHeight: 44,
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
    );
}