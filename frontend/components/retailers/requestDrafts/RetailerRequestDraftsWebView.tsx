// components/retailers/requestDrafts/RetailerRequestDraftsWebView.tsx
//
// Web table view for the retailer's request draft.
//
// Also exports shared primitives (URGENCY_OPTIONS, UrgencyPill,
// urgencyTint, SummaryBadge, wholesalerLabel, UrgencyFilterPill)
// reused by the mobile view.

import React, { useMemo, useState } from 'react';
import {
    FlatList,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth, type ThemeShape } from '@/context/AuthContext';
import type { RequestDraftItem } from '@/databases/types';

import type { RetailerRequestDraftsViewProps } from './types';

/* =========================================================
 * Shared primitives (exported for mobile view)
 * ======================================================= */

export type Urgency = 'low' | 'medium' | 'high';

export interface UrgencyOption {
    value: Urgency;
    label: string;
    bg: string;
    fg: string;
    dot: string;
}

export const URGENCY_OPTIONS: UrgencyOption[] = [
    {
        value: 'low',
        label: 'Low',
        bg: 'rgba(16,185,129,0.15)',
        fg: '#10b981',
        dot: '#10b981',
    },
    {
        value: 'medium',
        label: 'Medium',
        bg: 'rgba(251,191,36,0.15)',
        fg: '#f59e0b',
        dot: '#f59e0b',
    },
    {
        value: 'high',
        label: 'High',
        bg: 'rgba(239,68,68,0.15)',
        fg: '#ef4444',
        dot: '#ef4444',
    },
];

export function urgencyTint(urgency?: string | null): UrgencyOption {
    const key = String(urgency ?? '').trim().toLowerCase();
    return (
        URGENCY_OPTIONS.find((o) => o.value === key) ??
        URGENCY_OPTIONS[1]
    );
}

export function UrgencyPill({
    urgency,
    size = 'md',
}: {
    urgency?: string | null;
    size?: 'sm' | 'md';
}) {
    const { theme } = useAuth();
    const tint = urgencyTint(urgency);
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
                {tint.value}
            </Text>
        </View>
    );
}

export function SummaryBadge({
    label,
    tone = 'neutral',
}: {
    label: string;
    tone?: 'neutral' | 'primary';
}) {
    const { theme, isDarkMode } = useAuth();
    const bg =
        tone === 'primary'
            ? `${theme.primary}20`
            : isDarkMode
                ? 'rgba(148,163,184,0.15)'
                : 'rgba(148,163,184,0.22)';
    const fg = tone === 'primary' ? theme.primary : theme.textDark;
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

export function wholesalerLabel(item: RequestDraftItem): string {
    const names =
        item.wholesalers?.map((w) => w.title) ??
        item.target_wholesaler_titles ??
        [];
    if (names.length === 0) return '—';
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/* =========================================================
 * Column widths
 * ======================================================= */

const COLS = {
    product: '26%',
    wholesalers: '24%',
    urgency: '9%',
    qty: '7%',
    note: '22%',
    actions: '12%',
} as const;

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerRequestDraftsWebView({
    drafts,
    draftCount,
    draftTotalQuantity,
    isSubmittingRequest,
    onAddNew,
    onEditItem,
    onRemoveItem,
    onClearAll,
    onContinue,
}: RetailerRequestDraftsViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const [query, setQuery] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState<
        'ALL' | Urgency
    >('ALL');

    const urgencyCounts = useMemo(() => {
        const m: Record<string, number> = { ALL: drafts.length };
        drafts.forEach((d) => {
            const k = String(d.urgency ?? 'medium')
                .trim()
                .toLowerCase();
            m[k] = (m[k] ?? 0) + 1;
        });
        return m;
    }, [drafts]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return drafts.filter((d) => {
            if (urgencyFilter !== 'ALL') {
                const k = String(d.urgency ?? 'medium')
                    .trim()
                    .toLowerCase();
                if (k !== urgencyFilter) return false;
            }
            if (
                q &&
                !(d.product_title ?? '').toLowerCase().includes(q)
            )
                return false;
            return true;
        });
    }, [drafts, query, urgencyFilter]);

    const hasActiveFilter =
        urgencyFilter !== 'ALL' || query.trim() !== '';

    const clearFilters = () => {
        setQuery('');
        setUrgencyFilter('ALL');
    };

    const continueDisabled =
        draftCount === 0 || !!isSubmittingRequest;

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
                            Request draft
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <SummaryBadge label="Local" />
                            <SummaryBadge
                                label={`${draftCount} item${draftCount === 1 ? '' : 's'
                                    }`}
                                tone="primary"
                            />
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {draftTotalQuantity} unit
                                {draftTotalQuantity === 1 ? '' : 's'}{' '}
                                total
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onClearAll}
                            disabled={
                                draftCount === 0 ||
                                isSubmittingRequest
                            }
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled:
                                    draftCount === 0 ||
                                    !!isSubmittingRequest,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center border"
                            style={{
                                borderColor,
                                opacity:
                                    draftCount === 0 ||
                                        isSubmittingRequest
                                        ? 0.5
                                        : 1,
                                minHeight: 40,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Clear all
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onAddNew}
                            disabled={isSubmittingRequest}
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: !!isSubmittingRequest,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center border"
                            style={{
                                borderColor,
                                opacity: isSubmittingRequest ? 0.5 : 1,
                                minHeight: 40,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Add product
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onContinue}
                            disabled={continueDisabled}
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: continueDisabled,
                            }}
                            className="px-4 py-2.5 rounded-full items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: continueDisabled ? 0.5 : 1,
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
                                {isSubmittingRequest
                                    ? 'Submitting…'
                                    : 'Continue'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* Urgency pills */}
                <View className="flex-row flex-wrap gap-1.5 mb-2">
                    <UrgencyFilterPill
                        label="All"
                        active={urgencyFilter === 'ALL'}
                        count={urgencyCounts.ALL ?? 0}
                        tint={{
                            fg: theme.primary,
                            dot: theme.primary,
                            bg: `${theme.primary}15`,
                        }}
                        onPress={() => setUrgencyFilter('ALL')}
                    />
                    {URGENCY_OPTIONS.map((u) => (
                        <UrgencyFilterPill
                            key={u.value}
                            label={u.label}
                            active={urgencyFilter === u.value}
                            count={urgencyCounts[u.value] ?? 0}
                            tint={u}
                            onPress={() => setUrgencyFilter(u.value)}
                        />
                    ))}
                </View>

                {/* Search */}
                <View className="flex-row items-center gap-3">
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search by product…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        editable={!isSubmittingRequest}
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
                    <Text style={headerStyle(theme, COLS.product)}>
                        Product
                    </Text>
                    <Text style={headerStyle(theme, COLS.wholesalers)}>
                        Wholesalers
                    </Text>
                    <Text style={headerStyle(theme, COLS.urgency)}>
                        Urgency
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.qty),
                            textAlign: 'right',
                        }}
                    >
                        Qty
                    </Text>
                    <Text style={headerStyle(theme, COLS.note)}>
                        Note
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
                    data={filtered}
                    keyExtractor={(item, idx) =>
                        `${item.product_id ?? 'item'}-${idx}`
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
                                    ? 'No matches.'
                                    : 'No items in your draft yet.'}
                            </Text>
                            {!hasActiveFilter && (
                                <Pressable
                                    onPress={onAddNew}
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
                                        Add product
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    }
                    renderItem={({ item }) => (
                        <Row
                            item={item}
                            disabled={!!isSubmittingRequest}
                            onEdit={() => onEditItem(item)}
                            onRemove={() => onRemoveItem(item)}
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
    disabled,
    onEdit,
    onRemove,
}: {
    item: RequestDraftItem;
    disabled?: boolean;
    onEdit: () => void;
    onRemove: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    return (
        <View
            className="flex-row rounded-xl border px-3 py-2.5 mb-1 items-center"
            style={{ borderColor, opacity: disabled ? 0.6 : 1 }}
        >
            <Text
                style={cellStyle(theme, COLS.product, true)}
                numberOfLines={1}
            >
                {item.product_title || '—'}
            </Text>
            <Text
                style={cellStyle(theme, COLS.wholesalers)}
                numberOfLines={1}
            >
                {wholesalerLabel(item)}
            </Text>
            <View style={{ width: COLS.urgency }}>
                <UrgencyPill urgency={item.urgency} />
            </View>
            <Text
                style={{
                    ...cellStyle(theme, COLS.qty),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {item.quantity}
            </Text>
            <Text
                style={{
                    ...cellStyle(theme, COLS.note),
                    color: item.note?.trim()
                        ? theme.textDark
                        : `${theme.textDark}80`,
                    fontStyle: item.note?.trim() ? 'normal' : 'italic',
                }}
                numberOfLines={1}
            >
                {item.note?.trim() || '—'}
            </Text>
            <View
                style={{
                    width: COLS.actions,
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: 12,
                }}
            >
                <Pressable
                    onPress={onEdit}
                    disabled={disabled}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Edit item"
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: disabled
                                ? `${theme.primary}80`
                                : theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onRemove}
                    disabled={disabled}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Remove item"
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: disabled
                                ? 'rgba(239,68,68,0.5)'
                                : '#ef4444',
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        Remove
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Filter pill — exported for the mobile view
 * ======================================================= */

export function UrgencyFilterPill({
    label,
    active,
    count,
    tint,
    onPress,
}: {
    label: string;
    active: boolean;
    count: number;
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