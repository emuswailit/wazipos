// components/admin/frequencies/AdminFrequenciesWebView.tsx
//
// Web table view for the admin frequencies list.
//
// Also exports the local `StatusPill` used by both this view and
// the mobile view.

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import type {
    AdminFrequenciesSharedProps,
    FrequencyItem,
} from './types';

const TABLE_MAX_WIDTH = 1600;

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'Interval Title', flex: 2.0 },
    { label: 'SIG Code', flex: 1.0 },
    { label: 'Latin Term', flex: 1.6 },
    { label: 'Daily', flex: 0.8 },
    { label: 'Description', flex: 3.0 },
    { label: 'Created', flex: 1.2 },
    { label: 'Actions', flex: 1.2 },
];

type Props = AdminFrequenciesSharedProps;

function rowKey(item: FrequencyItem): string {
    return item.id || String(Math.random());
}

export function AdminFrequenciesWebView({
    query,
    setQuery,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    items,
    emptyComponent,
    onOpenCreate,
    onPressItem,
    onEditItem,
    formatDateHandler,
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

    const sourceColor =
        sourceTone === 'server'
            ? '#10b981'
            : sourceTone === 'cache'
                ? '#f59e0b'
                : theme.textDark;
    const sourceBg =
        sourceTone === 'server'
            ? 'rgba(16,185,129,0.12)'
            : sourceTone === 'cache'
                ? 'rgba(251,191,36,0.15)'
                : 'rgba(148,163,184,0.15)';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ───── Header ───── */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: theme.border,
                }}
            >
                <View
                    className="w-full self-center"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
                >
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                    letterSpacing: -0.2,
                                }}
                            >
                                Intake Frequencies
                            </Text>
                            <View className="flex-row items-center gap-2 mt-1">
                                <View
                                    className="px-2 py-0.5 rounded-md"
                                    style={{ backgroundColor: sourceBg }}
                                >
                                    <Text
                                        className="uppercase tracking-widest"
                                        style={{
                                            color: sourceColor,
                                            fontFamily: theme.font.bold,
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
                                            fontFamily: theme.font.medium,
                                            fontSize: theme.fontSize.xs,
                                        }}
                                    >
                                        Synced {lastSyncedTime}
                                    </Text>
                                ) : null}
                            </View>
                        </View>

                        <View className="flex-row items-center gap-2">
                            <Pressable
                                onPress={onOpenCreate}
                                className="px-3 py-1.5 rounded-full border flex-row items-center gap-1.5"
                                style={{
                                    borderColor: theme.primary,
                                    backgroundColor: `${theme.primary}15`,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    +
                                </Text>
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    New frequency
                                </Text>
                            </Pressable>

                            <Pressable
                                onPress={onRefresh}
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
                                            fontFamily: theme.font.bold,
                                            fontSize: theme.fontSize.xs,
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
                        placeholder="Search frequencies..."
                        placeholderTextColor={theme.textDark}
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-10 rounded-xl border px-3.5"
                        style={{
                            borderColor: theme.border,
                            backgroundColor: isDarkMode
                                ? '#0f172a'
                                : '#f1f5f9',
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    />
                </View>
            </View>

            {/* ───── Body ───── */}
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
                    alignItems: 'center',
                }}
            >
                <View
                    className="w-full"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
                >
                    <View
                        className="flex-row rounded-xl border px-3 py-2.5"
                        style={{
                            backgroundColor: theme.panel,
                            borderColor: theme.border,
                        }}
                    >
                        {COLUMNS.map((h, i) => (
                            <Text
                                key={`${h.label}-${i}`}
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

                    {items.length === 0 ? (
                        emptyComponent ?? (
                            <View className="p-8 items-center">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    No frequencies match the filters.
                                </Text>
                            </View>
                        )
                    ) : (
                        items.map((item) => (
                            <TableRow
                                key={rowKey(item)}
                                item={item}
                                onPress={() => onPressItem(item)}
                                onEdit={() => onEditItem(item)}
                                formatDateHandler={formatDateHandler}
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
                        onPageSizeChange={
                            onPageSizeChange as (s: any) => void
                        }
                    />
                </View>
            </ScrollView>
        </View>
    );
}

/* =========================================================
 * Table row
 * ======================================================= */
function TableRow({
    item,
    onPress,
    onEdit,
    formatDateHandler,
}: {
    item: FrequencyItem;
    onPress: () => void;
    onEdit: () => void;
    formatDateHandler: (dateString: string) => string;
}) {
    const { theme } = useAuth();

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <Text
                style={{
                    flex: 2.0,
                    paddingRight: 8,
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.base,
                }}
                numberOfLines={2}
            >
                {item.title || '—'}
            </Text>

            <View style={{ flex: 1.0, paddingRight: 8 }}>
                <View
                    className="px-2 py-0.5 rounded-md self-start"
                    style={{
                        backgroundColor: 'rgba(148,163,184,0.15)',
                    }}
                >
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                        numberOfLines={1}
                    >
                        {item.abbreviation || '—'}
                    </Text>
                </View>
            </View>

            <Text
                style={{
                    flex: 1.6,
                    paddingRight: 8,
                    color: theme.text,
                    fontFamily: theme.font.semibold,
                    fontSize: theme.fontSize.sm,
                    fontStyle: 'italic',
                }}
                numberOfLines={1}
            >
                {item.latin || '—'}
            </Text>

            <Text
                style={{
                    flex: 0.8,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
                numberOfLines={1}
            >
                {item.numerical}
            </Text>

            <Text
                style={{
                    flex: 3.0,
                    paddingRight: 8,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
                numberOfLines={2}
            >
                {item.description || '—'}
            </Text>

            <Text
                style={{
                    flex: 1.2,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
                numberOfLines={1}
            >
                {formatDateHandler(item.created)}
            </Text>

            <View
                style={{ flex: 1.2 }}
                className="flex-row gap-x-2 justify-end items-center"
            >
                <Pressable
                    onPress={onEdit}
                    className="py-1 px-2.5 border rounded-lg active:bg-slate-100 dark:active:bg-slate-800 transition-all"
                    style={{ borderColor: theme.border }}
                >
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.semibold,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onPress}
                    className="py-1 px-2.5 border rounded-lg transition-all"
                    style={{
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                    }}
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        Details
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

/* =========================================================
 * Status pill — shared with the mobile view
 * ======================================================= */
export function StatusPill({
    label,
    tone,
}: {
    label: string;
    tone: 'open' | 'closed' | 'special' | 'success' | 'warning';
}) {
    const { theme } = useAuth();
    const bg =
        tone === 'open'
            ? 'rgba(16,185,129,0.12)'
            : tone === 'success'
                ? 'rgba(16,185,129,0.15)'
                : tone === 'special'
                    ? 'rgba(251,191,36,0.15)'
                    : tone === 'warning'
                        ? 'rgba(251,191,36,0.15)'
                        : 'rgba(148,163,184,0.15)';
    const color =
        tone === 'open'
            ? '#10b981'
            : tone === 'success'
                ? '#10b981'
                : tone === 'special'
                    ? '#f59e0b'
                    : tone === 'warning'
                        ? '#f59e0b'
                        : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-full self-start"
            style={{ backgroundColor: bg }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

export default AdminFrequenciesWebView;