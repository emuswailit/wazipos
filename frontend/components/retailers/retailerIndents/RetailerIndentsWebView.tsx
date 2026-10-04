// components/retailers/retailerIndents/RetailerIndentsWebView.tsx
//
// Web table view for retailer indents.
//
// Pagination is owned by the shell (RetailerIndentsList); this view
// renders the current page and hands the controls down to the shared
// PaginationBar from @/components/common.

import type { PageSize } from '@/components/common/PaginationBar';
import { PaginationBar } from '@/components/common/PaginationBar';
import type { RetailerIndent } from '@/databases/types';
import React from 'react';
import {
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

    /* Pagination — owned by the shell */
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

/* =========================================================
 * Column widths
 * ======================================================= */

const COLS = {
    reference: '14%',
    entity: '15%',
    campaign: '13%',
    items: '5%',
    lead: '6%',
    total: '11%',
    profit: '11%',
    budget: '13%',
    status: '7%',
    created: '8%',
    actions: '7%',
} as const;

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerIndentsWebView({
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
    page,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    onPrev,
    onNext,
    onPageSizeChange,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const sourceLabel = isLiveConnected
        ? 'Live · websocket'
        : 'Connecting…';

    const sourceTint = isLiveConnected
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', dot: '#10b981' }
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
                            Retailer Indents
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
                            <SummaryBadge
                                label={`${counts.open} open`}
                                tone="primary"
                            />
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
                            {lastSyncedTime ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onToggleOnlyOpen}
                            accessibilityRole="button"
                            accessibilityState={{
                                selected: onlyOpen,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center border"
                            style={{
                                borderColor: onlyOpen
                                    ? theme.primary
                                    : borderColor,
                                backgroundColor: onlyOpen
                                    ? `${theme.primary}15`
                                    : 'transparent',
                                minHeight: 40,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: onlyOpen
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Open only
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
                                {refreshing
                                    ? 'Refreshing…'
                                    : 'Refresh'}
                            </Text>
                        </Pressable>
                    </View>
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

                <View className="flex-row items-center gap-3">
                    <TextInput
                        value={query}
                        onChangeText={onQueryChange}
                        placeholder="Search entity, indent no, product…"
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

            {/* ============ Body ============ */}
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 40,
                }}
            >
                <View
                    className="flex-row rounded-xl border px-3 py-2.5"
                    style={{
                        backgroundColor: headerBg,
                        borderColor,
                    }}
                >
                    <Text style={headerStyle(theme, COLS.reference)}>
                        Reference
                    </Text>
                    <Text style={headerStyle(theme, COLS.entity)}>
                        Entity
                    </Text>
                    <Text style={headerStyle(theme, COLS.campaign)}>
                        Campaign
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.items),
                            textAlign: 'right',
                        }}
                    >
                        Items
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.lead),
                            textAlign: 'right',
                        }}
                    >
                        Lead
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.total),
                            textAlign: 'right',
                        }}
                    >
                        Total
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.profit),
                            textAlign: 'right',
                        }}
                    >
                        Profit
                    </Text>
                    <Text style={headerStyle(theme, COLS.budget)}>
                        Budget
                    </Text>
                    <Text style={headerStyle(theme, COLS.status)}>
                        Status
                    </Text>
                    <Text style={headerStyle(theme, COLS.created)}>
                        Created
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

                {indents.length === 0 ? (
                    <View
                        className="rounded-xl border p-8 items-center mt-1"
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
                                ? 'No indents match the filters.'
                                : 'No indents yet.'}
                        </Text>
                        {hasActiveFilter && (
                            <Pressable
                                onPress={clearFilters}
                                className="mt-4 px-4 py-2.5 rounded-full"
                                style={{
                                    backgroundColor:
                                        theme.primary,
                                    minHeight: 40,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    Clear filters
                                </Text>
                            </Pressable>
                        )}
                    </View>
                ) : (
                    indents.map((item) => (
                        <Row
                            key={
                                item.remote_id ||
                                String(item.id ?? '')
                            }
                            item={item}
                            onView={() => onView(item)}
                        />
                    ))
                )}

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
            </ScrollView>
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
    item: RetailerIndent;
    onView: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const isOpen = toBool(item.is_open);
    const budgetSet = hasBudgetSet(item);
    const pct = budgetPct(item);
    const isDraft = isDraftIndent(item);
    const campaign = campaignTitleOf(item);

    const budgetNum = budgetSet ? Number(item.budget_amount) : 0;
    const costNum = Number(item.total_cost || 0);
    const overBudget =
        toBool(item.over_budget) ||
        (budgetSet && budgetNum > 0 && costNum > budgetNum);

    return (
        <Pressable
            onPress={onView}
            className="flex-row rounded-xl border px-3 py-2.5 mt-2 items-center"
            style={{ borderColor }}
        >
            <View style={{ width: COLS.reference, paddingRight: 8 }}>
                <Text
                    numberOfLines={1}
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 11,
                    }}
                >
                    {item.indent_number ||
                        (isDraft ? 'Draft' : item.remote_id)}
                </Text>
                {isDraft ? (
                    <View style={{ marginTop: 2 }}>
                        <DraftPill />
                    </View>
                ) : null}
            </View>
            <Text
                style={cellStyle(theme, COLS.entity)}
                numberOfLines={1}
            >
                {item.entity_title || '—'}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.campaign),
                    color: campaign
                        ? theme.primary
                        : theme.textDark,
                    fontFamily: campaign
                        ? theme.font.bold
                        : theme.font.medium,
                }}
                numberOfLines={1}
            >
                {campaign || '—'}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.items),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {indentItemCount(item)}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.lead),
                    textAlign: 'right',
                }}
                numberOfLines={1}
            >
                {item.lead_time ?? 0}d
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.total),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                KES {formatKES(item.total_cost)}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.profit),
                    textAlign: 'right',
                    color:
                        Number(item.total_profit) > 0
                            ? '#10b981'
                            : theme.text,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                KES {formatKES(item.total_profit)}
            </Text>
            <View style={{ width: COLS.budget, paddingRight: 8 }}>
                {budgetSet ? (
                    <View
                        className="rounded-md px-1.5 py-1"
                        style={{ backgroundColor: subBg }}
                    >
                        <Text
                            style={{
                                color: overBudget
                                    ? '#f43f5e'
                                    : theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                            numberOfLines={1}
                        >
                            {pct !== null
                                ? `${pct.toFixed(0)}%`
                                : '—'}
                        </Text>
                    </View>
                ) : (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 10,
                            opacity: 0.6,
                        }}
                    >
                        No budget
                    </Text>
                )}
            </View>
            <View style={{ width: COLS.status }}>
                <StatusPill isOpen={isOpen} size="sm" />
            </View>
            <Text
                style={cellStyle(theme, COLS.created)}
                numberOfLines={1}
            >
                {formatDate(item.created)}
            </Text>
            <View
                style={{
                    width: COLS.actions,
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                }}
            >
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
    bold = false,
) {
    return {
        width,
        color: bold ? theme.text : theme.textDark,
        fontFamily: bold ? theme.font.bold : theme.font.medium,
        fontSize: 11,
        paddingRight: 8,
    };
}