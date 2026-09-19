// app/(retailers)/retailerIndents/RetailerIndentsList.tsx

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { RetailerIndent } from '@/databases/types';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { IndentDetailsModal } from './IndentDetailsModal';
import { IndentEditModal } from './IndentEditModal';

/* =========================================================
 * Helpers
 * ======================================================= */

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

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
    raw: string | number | null | undefined
): string => {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

const indentKey = (i: RetailerIndent): string =>
    i.remote_id || String(i.id ?? '');

const hasBudgetSet = (i: RetailerIndent): boolean => {
    if (
        i.budget_amount === null ||
        i.budget_amount === undefined
    ) {
        return false;
    }
    const s = String(i.budget_amount).trim();
    if (s === '') return false;
    const n = Number(s);
    return !isNaN(n) && n > 0;
};

const indentItemCount = (i: RetailerIndent): number => {
    if (typeof i.active_item_count === 'number' && i.active_item_count > 0) {
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

/* =========================================================
 * List
 * ======================================================= */

export default function RetailerIndentsList() {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const {
        retailerIndents,
        openIndents,
        isSyncing,
        isManualRefreshing,
        lastSyncedTime,
        forceManualRefresh,
        dataSource,
    } = useRetailerIndentsSync();

    const [query, setQuery] = useState('');
    const [onlyOpen, setOnlyOpen] = useState(false);
    const [selected, setSelected] =
        useState<RetailerIndent | null>(null);
    const [editing, setEditing] =
        useState<RetailerIndent | null>(null);

    const filtered = useMemo(() => {
        const base = onlyOpen ? openIndents : retailerIndents;
        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((i) => {
            const entity = String(
                i.entity_title || ''
            ).toLowerCase();
            if (entity.includes(q)) return true;

            const indentNo = String(
                i.indent_number || ''
            ).toLowerCase();
            if (indentNo.includes(q)) return true;

            return (i.retailer_indent_items || []).some(
                (it) => {
                    const t = String(
                        it.wholesale_receipt_title || ''
                    ).toLowerCase();
                    const w = String(
                        it.wholesaler_title || ''
                    ).toLowerCase();
                    return t.includes(q) || w.includes(q);
                }
            );
        });
    }, [retailerIndents, openIndents, onlyOpen, query]);

    const refreshing = isSyncing || isManualRefreshing;

    const handleRefresh = useCallback(() => {
        forceManualRefresh();
    }, [forceManualRefresh]);

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';

    const sourceColor =
        dataSource === 'server'
            ? '#10b981'
            : dataSource === 'cache'
                ? '#f59e0b'
                : theme.textDark;

    const sourceBg =
        dataSource === 'server'
            ? 'rgba(16,185,129,0.12)'
            : dataSource === 'cache'
                ? 'rgba(251,191,36,0.15)'
                : 'rgba(148,163,184,0.15)';

    const sourceLabel =
        dataSource === 'server'
            ? 'Server · live'
            : dataSource === 'cache'
                ? 'Local cache'
                : 'No data';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* -------------------- Header -------------------- */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-1">
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

                        <View className="flex-row items-center gap-2 mt-1">
                            <View
                                className="px-2 py-0.5 rounded-md"
                                style={{
                                    backgroundColor: sourceBg,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: sourceColor,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 9,
                                    }}
                                >
                                    {sourceLabel}
                                </Text>
                            </View>

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

                    <View className="flex-row items-center gap-2">
                        <Pressable
                            onPress={() =>
                                setOnlyOpen((v) => !v)
                            }
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                                borderColor: onlyOpen
                                    ? theme.primary
                                    : borderColor,
                                backgroundColor: onlyOpen
                                    ? `${theme.primary}15`
                                    : 'transparent',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: onlyOpen
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Open only
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={handleRefresh}
                            disabled={refreshing}
                            className="px-3 py-1.5 rounded-full"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: refreshing ? 0.6 : 1,
                            }}
                        >
                            {refreshing ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#ffffff"
                                />
                            ) : (
                                <Text
                                    className="uppercase tracking-widest text-white"
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Refresh
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search entity, indent no, product, wholesaler..."
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-10 rounded-xl border px-3.5"
                    style={{
                        borderColor,
                        backgroundColor: theme.isDarkMode
                            ? '#0f172a'
                            : '#f1f5f9',
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                />
            </View>

            {/* -------------------- Body -------------------- */}
            {isLarge ? (
                <ScrollView
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={theme.primary}
                        />
                    }
                    contentContainerStyle={{
                        padding: 16,
                        paddingBottom: 40,
                    }}
                >
                    <TableHeader />
                    {filtered.length === 0 ? (
                        <EmptyState theme={theme} />
                    ) : (
                        filtered.map((indent) => (
                            <IndentTableRow
                                key={indentKey(indent)}
                                indent={indent}
                                onView={() =>
                                    setSelected(indent)
                                }
                                onEdit={() =>
                                    setEditing(indent)
                                }
                            />
                        ))
                    )}
                </ScrollView>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={indentKey}
                    contentContainerStyle={{
                        padding: 16,
                        paddingBottom: 40,
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={theme.primary}
                        />
                    }
                    ListEmptyComponent={
                        <EmptyState theme={theme} />
                    }
                    renderItem={({ item }) => (
                        <IndentCard
                            indent={item}
                            onView={() => setSelected(item)}
                            onEdit={() => setEditing(item)}
                        />
                    )}
                />
            )}

            {/* -------------------- Details modal -------------------- */}
            <IndentDetailsModal
                indent={selected}
                onClose={() => setSelected(null)}
                onEdit={(indent) => {
                    setSelected(null);
                    setEditing(indent);
                }}
                onRefresh={() => {
                    forceManualRefresh();
                }}
            />

            {/* -------------------- Header edit modal -------------------- */}
            <IndentEditModal
                indent={editing}
                onClose={() => setEditing(null)}
                onSaved={() => {
                    setEditing(null);
                    forceManualRefresh();
                }}
            />
        </View>
    );
}

/* =========================================================
 * Table header
 * ======================================================= */

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'Entity', flex: 1.8 },
    { label: 'Lead', flex: 0.6 },
    { label: 'Cycle', flex: 0.6 },
    { label: 'Items', flex: 0.6 },
    { label: 'Total', flex: 1.1 },
    { label: 'Profit', flex: 1.1 },
    { label: 'Budget used', flex: 1.8 },
    { label: 'Status', flex: 0.9 },
    { label: 'Created', flex: 1.0 },
    { label: 'Actions', flex: 1.5 },
];

function TableHeader() {
    const { theme } = useAuth();
    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';

    return (
        <View
            className="flex-row rounded-xl border px-3 py-2.5"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            {COLUMNS.map((h) => (
                <Text
                    key={h.label}
                    className="uppercase tracking-widest"
                    style={{
                        flex: h.flex,
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    {h.label}
                </Text>
            ))}
        </View>
    );
}

function EmptyState({ theme }: { theme: any }) {
    return (
        <View className="p-8 items-center">
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            >
                No indents match the filters.
            </Text>
        </View>
    );
}

/* =========================================================
 * Table row
 * ======================================================= */

function IndentTableRow({
    indent,
    onView,
    onEdit,
}: {
    indent: RetailerIndent;
    onView: () => void;
    onEdit: () => void;
}) {
    const { theme } = useAuth();
    const isOpen = toBool(indent.is_open);
    const itemCount = indentItemCount(indent);
    const budgetSet = hasBudgetSet(indent);
    const pct = budgetPct(indent);

    const budgetNum = budgetSet
        ? Number(indent.budget_amount)
        : 0;
    const costNum = Number(indent.total_cost || 0);
    const overBudget =
        indent.over_budget ||
        (budgetSet && budgetNum > 0 && costNum > budgetNum);

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';

    return (
        <View
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <Text
                style={{
                    flex: 1.8,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 13,
                }}
                numberOfLines={1}
            >
                {indent.entity_title || '—'}
            </Text>

            <Text
                style={{
                    flex: 0.6,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: 13,
                }}
            >
                {indent.lead_time ?? 0}d
            </Text>

            <Text
                style={{
                    flex: 0.6,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: 13,
                }}
            >
                {indent.order_days ?? 0}d
            </Text>

            <Text
                style={{
                    flex: 0.6,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 13,
                }}
            >
                {itemCount}
            </Text>

            <Text
                style={{
                    flex: 1.1,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 12,
                }}
                numberOfLines={1}
            >
                KES {formatKES(indent.total_cost)}
            </Text>

            <Text
                style={{
                    flex: 1.1,
                    color:
                        Number(indent.total_profit) > 0
                            ? '#10b981'
                            : theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 12,
                }}
                numberOfLines={1}
            >
                KES {formatKES(indent.total_profit)}
            </Text>

            <View style={{ flex: 1.8 }}>
                {budgetSet ? (
                    <BudgetCell
                        cost={costNum}
                        budget={budgetNum}
                        pct={pct}
                        overBudget={overBudget}
                        budgetRaw={indent.budget_amount}
                    />
                ) : (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                            opacity: 0.6,
                        }}
                    >
                        No budget set
                    </Text>
                )}
            </View>

            <View style={{ flex: 0.9, alignItems: 'flex-start' }}>
                <StatusPill isOpen={isOpen} />
            </View>

            <Text
                style={{
                    flex: 1.0,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: 11,
                }}
                numberOfLines={1}
            >
                {formatDate(indent.created)}
            </Text>

            <View
                className="flex-row gap-1.5"
                style={{ flex: 1.5 }}
            >
                <ActionButton
                    label="View"
                    variant="filled"
                    onPress={onView}
                />
                <ActionButton
                    label="Edit"
                    variant="outline"
                    onPress={onEdit}
                />
            </View>
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

function IndentCard({
    indent,
    onView,
    onEdit,
}: {
    indent: RetailerIndent;
    onView: () => void;
    onEdit: () => void;
}) {
    const { theme } = useAuth();
    const isOpen = toBool(indent.is_open);
    const itemCount = indentItemCount(indent);
    const budgetSet = hasBudgetSet(indent);
    const pct = budgetPct(indent);

    const budgetNum = budgetSet
        ? Number(indent.budget_amount)
        : 0;
    const costNum = Number(indent.total_cost || 0);
    const overBudget =
        indent.over_budget ||
        (budgetSet && budgetNum > 0 && costNum > budgetNum);

    const overage =
        overBudget && budgetNum > 0
            ? costNum - budgetNum
            : 0;

    const previewItems = (
        indent.retailer_indent_items || []
    )
        .slice(0, 3)
        .map((i) => i.wholesale_receipt_title)
        .filter(Boolean);

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
            }}
        >
            <View className="flex-row items-center justify-between mb-2">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 15,
                        flex: 1,
                    }}
                    numberOfLines={1}
                >
                    {indent.entity_title || '—'}
                </Text>
                <StatusPill isOpen={isOpen} />
            </View>

            <View className="flex-row flex-wrap gap-1.5 mb-2">
                <Chip label={`Lead ${indent.lead_time ?? 0}d`} />
                <Chip label={`Order ${indent.order_days ?? 0}d`} />
                <Chip
                    label={`${itemCount} item${itemCount === 1 ? '' : 's'
                        }`}
                />
                <Chip label={formatDate(indent.created)} />
            </View>

            <View
                className="flex-row items-center justify-between py-2 mb-2 border-t border-b"
                style={{ borderColor }}
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
                        Total
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
                                Number(
                                    indent.total_profit
                                ) > 0
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
                <BudgetBar
                    cost={costNum}
                    budget={budgetNum}
                    pct={pct}
                    overBudget={overBudget}
                    overage={overage}
                    budgetRaw={indent.budget_amount}
                />
            ) : (
                <Text
                    className="uppercase tracking-widest mb-2"
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
                <View className="mb-2.5">
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
                    {itemCount > 3 ? (
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
                    ) : null}
                </View>
            ) : null}

            <View
                className="flex-row gap-2 pt-2.5 border-t"
                style={{ borderColor }}
            >
                <Pressable
                    onPress={onView}
                    className="flex-1 py-2.5 rounded-xl items-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-white"
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                        }}
                    >
                        View Details
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onEdit}
                    className="flex-1 py-2.5 rounded-xl border items-center"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Shared UI atoms
 * ======================================================= */

function StatusPill({ isOpen }: { isOpen: boolean }) {
    const { theme } = useAuth();
    return (
        <View
            className="px-2 py-0.5 rounded-full"
            style={{
                backgroundColor: isOpen
                    ? 'rgba(16,185,129,0.12)'
                    : 'rgba(148,163,184,0.15)',
                alignSelf: 'flex-start',
            }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: isOpen
                        ? '#10b981'
                        : theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {isOpen ? 'Open' : 'Closed'}
            </Text>
        </View>
    );
}

function Chip({ label }: { label: string }) {
    const { theme } = useAuth();
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: theme.isDarkMode
                    ? '#0f172a'
                    : '#f1f5f9',
                borderColor: theme.isDarkMode
                    ? '#334155'
                    : '#e2e8f0',
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function ActionButton({
    label,
    variant,
    onPress,
}: {
    label: string;
    variant: 'filled' | 'outline';
    onPress: () => void;
}) {
    const { theme } = useAuth();

    if (variant === 'filled') {
        return (
            <Pressable
                onPress={onPress}
                className="px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: theme.primary }}
            >
                <Text
                    className="uppercase tracking-wide text-white"
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 11,
                    }}
                >
                    {label}
                </Text>
            </Pressable>
        );
    }

    return (
        <Pressable
            onPress={onPress}
            className="px-3 py-1.5 rounded-lg border"
            style={{ borderColor: theme.primary }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                    fontSize: 11,
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Budget — table variant
 * ======================================================= */

function BudgetCell({
    cost,
    budget,
    pct,
    overBudget,
    budgetRaw,
}: {
    cost: number;
    budget: number;
    pct: number | null;
    overBudget: boolean;
    budgetRaw: string | null;
}) {
    const { theme } = useAuth();
    const clamped = Math.min(
        100,
        Math.max(0, pct ?? 0)
    );

    return (
        <View>
            <Text
                style={{
                    color: overBudget
                        ? '#f43f5e'
                        : theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 11,
                }}
                numberOfLines={1}
            >
                KES {formatKES(cost)}{' '}
                <Text
                    style={{
                        color: overBudget
                            ? '#f43f5e'
                            : theme.textDark,
                        fontFamily: theme.font.medium,
                    }}
                >
                    / {formatKES(budgetRaw)}
                </Text>
            </Text>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 3,
                }}
            >
                <View
                    style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: theme.isDarkMode
                            ? '#0f172a'
                            : '#f1f5f9',
                        overflow: 'hidden',
                    }}
                >
                    <View
                        style={{
                            width: `${clamped}%`,
                            height: '100%',
                            backgroundColor: overBudget
                                ? '#f43f5e'
                                : theme.primary,
                        }}
                    />
                </View>
                {pct !== null ? (
                    <Text
                        style={{
                            color: overBudget
                                ? '#f43f5e'
                                : theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                            minWidth: 32,
                            textAlign: 'right',
                        }}
                    >
                        {pct.toFixed(0)}%
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

/* =========================================================
 * Budget — card variant
 * ======================================================= */

function BudgetBar({
    cost,
    budget,
    pct,
    overBudget,
    overage,
    budgetRaw,
}: {
    cost: number;
    budget: number;
    pct: number | null;
    overBudget: boolean;
    overage: number;
    budgetRaw: string | null;
}) {
    const { theme } = useAuth();
    const clamped = Math.min(
        100,
        Math.max(0, pct ?? 0)
    );

    return (
        <View className="mb-2">
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
                    {formatKES(cost)} / {formatKES(budgetRaw)}
                    {pct !== null
                        ? ` · ${pct.toFixed(0)}%`
                        : ''}
                </Text>
            </View>

            <View
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{
                    backgroundColor: theme.isDarkMode
                        ? '#0f172a'
                        : '#f1f5f9',
                }}
            >
                <View
                    className="h-full"
                    style={{
                        width: `${clamped}%`,
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
                        ⚠ Over budget by KES{' '}
                        {formatKES(overage)}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}