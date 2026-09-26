// components/retailers/requestDrafts/RetailerRequestDraftsMobileView.tsx
//
// Small-screen view for the retailer's request draft.
//
// Reuses filter primitives exported from the WebView so pills,
// tints, and formatting stay identical across breakpoints.

import React, { useMemo, useState } from 'react';
import {
    FlatList,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth, type ThemeShape } from '@/context/AuthContext';
import type { RequestDraftItem } from '@/databases/types';

import {
    SummaryBadge,
    URGENCY_OPTIONS,
    UrgencyFilterPill,
    UrgencyPill,
    wholesalerLabel,
    type Urgency,
} from './RetailerRequestDraftsWebView';
import type { RetailerRequestDraftsViewProps } from './types';

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerRequestDraftsMobileView({
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
                            {draftTotalQuantity > 0 && (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {draftTotalQuantity} unit
                                    {draftTotalQuantity === 1
                                        ? ''
                                        : 's'}
                                </Text>
                            )}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                        <Pressable
                            onPress={onClearAll}
                            disabled={
                                draftCount === 0 ||
                                isSubmittingRequest
                            }
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled:
                                    draftCount === 0 ||
                                    !!isSubmittingRequest,
                            }}
                            className="px-3 py-2 rounded-full border"
                            style={{
                                borderColor,
                                opacity:
                                    draftCount === 0 ||
                                        isSubmittingRequest
                                        ? 0.5
                                        : 1,
                                minHeight: 40,
                                justifyContent: 'center',
                            }}
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

                        <Pressable
                            onPress={onContinue}
                            disabled={continueDisabled}
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: continueDisabled,
                            }}
                            className="px-4 rounded-full items-center justify-center"
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
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2 -mx-1"
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
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
                </ScrollView>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by product…"
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    editable={!isSubmittingRequest}
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
                data={filtered}
                keyExtractor={(item, idx) =>
                    `${item.product_id ?? 'item'}-${idx}`
                }
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 112,
                }}
                ListEmptyComponent={
                    <EmptyState
                        theme={theme}
                        hasActiveFilter={hasActiveFilter}
                        onAddNew={onAddNew}
                    />
                }
                renderItem={({ item }) => (
                    <DraftCard
                        item={item}
                        disabled={!!isSubmittingRequest}
                        onEdit={() => onEditItem(item)}
                        onRemove={() => onRemoveItem(item)}
                    />
                )}
                showsVerticalScrollIndicator={false}
            />

            {/* ============ FAB ============ */}
            {!isSubmittingRequest && (
                <Pressable
                    onPress={onAddNew}
                    accessibilityRole="button"
                    accessibilityLabel="Add product"
                    className="absolute rounded-full items-center justify-center"
                    style={{
                        right: 20,
                        bottom: 24,
                        minHeight: 56,
                        paddingHorizontal: 20,
                        backgroundColor: theme.primary,
                        shadowColor: '#000',
                        shadowOpacity: 0.25,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 6,
                    }}
                >
                    <Text
                        className="text-white"
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.base,
                            letterSpacing: 0.3,
                        }}
                    >
                        + Add product
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

function DraftCard({
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
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const note = item.note?.trim() ?? '';
    const wholesalerText = wholesalerLabel(item);

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor,
                opacity: disabled ? 0.6 : 1,
            }}
        >
            {/* Top row: label + urgency */}
            <View className="flex-row items-center mb-2">
                <Text
                    className="flex-1 uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    Draft item
                </Text>
                <UrgencyPill urgency={item.urgency} />
            </View>

            {/* Title */}
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 15,
                }}
                numberOfLines={2}
            >
                {item.product_title || '—'}
            </Text>

            {/* Meta chips */}
            <View className="flex-row items-center flex-wrap gap-1.5 mt-2.5">
                <View
                    className="px-2 py-0.5 rounded-md border"
                    style={{
                        backgroundColor: isDarkMode
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
                    >
                        {item.quantity}{' '}
                        {item.quantity === 1 ? 'unit' : 'units'}
                    </Text>
                </View>

                <View
                    className="px-2 py-0.5 rounded-md border"
                    style={{
                        backgroundColor: isDarkMode
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
                        {wholesalerText}
                    </Text>
                </View>
            </View>

            {/* Note block */}
            {!!note && (
                <View
                    className="rounded-xl px-3 py-2 mt-2.5"
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
                        Note
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: 12,
                            marginTop: 2,
                        }}
                        numberOfLines={3}
                    >
                        {note}
                    </Text>
                </View>
            )}

            {/* Actions */}
            <View
                className="flex-row justify-end gap-4 mt-3 pt-2.5 border-t"
                style={{ borderTopColor: `${theme.textDark}20` }}
            >
                <Pressable
                    onPress={onEdit}
                    disabled={disabled}
                    hitSlop={8}
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
                            fontSize: 11,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onRemove}
                    disabled={disabled}
                    hitSlop={8}
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
                            fontSize: 11,
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
 * Empty state
 * ======================================================= */

function EmptyState({
    theme,
    hasActiveFilter,
    onAddNew,
}: {
    theme: ThemeShape;
    hasActiveFilter: boolean;
    onAddNew: () => void;
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
                    : 'No items in your draft'}
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
                    : 'Add products to compose a request for your wholesalers.'}
            </Text>
            {!hasActiveFilter && (
                <Pressable
                    onPress={onAddNew}
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
                        Add product
                    </Text>
                </Pressable>
            )}
        </View>
    );
}