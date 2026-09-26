// app/(admin)/body-systems/AdminBodySystemsWebView.tsx
//
// Web table view for the admin body systems list.
//
// Visually mirrors the retailer product-requests web view so the
// admin and retailer tables share one layout language: same header
// block, same source pill, same New / Refresh buttons, same search
// input, same bordered column header row, same row shell.
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
import type { BodySystemItem } from './AdminBodySystemsList';

const TABLE_MAX_WIDTH = 1600;

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'System', flex: 2.4 },
    { label: 'State', flex: 1.0 },
    { label: 'Description', flex: 2.5 },
    { label: 'Created', flex: 1.0 },
    { label: 'Updated', flex: 1.0 },
    { label: 'Actions', flex: 1.0 },
];

interface Props {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    items: BodySystemItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: BodySystemItem) => void;
    onEditItem: (item: BodySystemItem) => void;
    formatDateHandler: (dateString: string) => string;
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: any) => void;
}

/* Stable key regardless of sync state. */
function rowKey(item: BodySystemItem): string {
    return item.id || String(Math.random());
}

export function AdminBodySystemsWebView({
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
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

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
            {/* Header */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View
                    className="w-full self-center"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
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
                                Body Systems
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
                                    New system
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
                        placeholder="Search body systems..."
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-10 rounded-xl border px-3.5"
                        style={{
                            borderColor,
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

            {/* Body */}
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
                            borderColor,
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
                                    No body systems match the filters.
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
                        onPageSizeChange={onPageSizeChange}
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
    item: BodySystemItem;
    onPress: () => void;
    onEdit: () => void;
    formatDateHandler: (dateString: string) => string;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const isModified =
        !!item.updated && item.updated !== item.created;

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            {/* System — title + short id (mirrors Request column) */}
            <View style={{ flex: 2.4, paddingRight: 8 }}>
                <Text
                    className="text-[13px]"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                    }}
                    numberOfLines={1}
                >
                    {item.title || '—'}
                </Text>
                <Text
                    className="text-[11px] mt-0.5"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.semibold,
                    }}
                    numberOfLines={1}
                >
                    ID {item.id.slice(0, 8) || '—'}
                </Text>
            </View>

            {/* State pill */}
            <View style={{ flex: 1.0 }}>
                <StatusPill
                    label={isModified ? 'Modified' : 'New'}
                    tone={isModified ? 'special' : 'open'}
                />
            </View>

            {/* Description */}
            <Text
                className="text-[12px]"
                style={{
                    flex: 2.5,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    paddingRight: 8,
                }}
                numberOfLines={2}
            >
                {item.description || '—'}
            </Text>

            {/* Created */}
            <Text
                className="text-[12px]"
                style={{
                    flex: 1.0,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {formatDateHandler(item.created)}
            </Text>

            {/* Updated */}
            <Text
                className="text-[12px]"
                style={{
                    flex: 1.0,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {formatDateHandler(item.updated)}
            </Text>

            {/* Actions */}
            <View style={{ flex: 1.0 }}>
                <Pressable
                    onPress={onPress}
                    className="px-3 py-1.5 rounded-lg border self-start"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Open
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