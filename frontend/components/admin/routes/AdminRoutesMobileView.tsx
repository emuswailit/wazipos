// components/admin/routes/AdminRoutesMobileView.tsx
//
// Mobile card view for the admin routes list.

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';
import { StatusPill } from './AdminRoutesWebView';
import type {
    AdminRoutesSharedProps,
    DrugRouteItem,
} from './types';

type Props = AdminRoutesSharedProps;

function rowKey(item: DrugRouteItem): string {
    return item.id || String(Math.random());
}

export function AdminRoutesMobileView({
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
                            Administration Routes
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
                                New
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
                    placeholder="Search routes..."
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

            {/* ───── Card list ───── */}
            <FlatList
                data={items}
                keyExtractor={(it) => rowKey(it)}
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 40,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
                ListEmptyComponent={
                    emptyComponent ?? (
                        <View className="p-8 items-center">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                No routes match the filters.
                            </Text>
                        </View>
                    )
                }
                ListFooterComponent={
                    totalItems > 0 ? (
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
                    ) : null
                }
                renderItem={({ item }) => (
                    <RouteCard
                        item={item}
                        onPress={() => onPressItem(item)}
                        onEdit={() => onEditItem(item)}
                        formatDateHandler={formatDateHandler}
                    />
                )}
            />
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */
function RouteCard({
    item,
    onPress,
    onEdit,
    formatDateHandler,
}: {
    item: DrugRouteItem;
    onPress: () => void;
    onEdit: () => void;
    formatDateHandler: (dateString: string) => string;
}) {
    const { theme } = useAuth();

    const isModified =
        !!item.updated && item.updated !== item.created;

    return (
        <Pressable
            onPress={onPress}
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            {/* Title + status pill */}
            <View className="flex-row items-start justify-between mb-2">
                <Text
                    style={{
                        flex: 1,
                        paddingRight: 8,
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                    }}
                    numberOfLines={2}
                >
                    {item.title || '—'}
                </Text>
                <StatusPill
                    label={isModified ? 'Modified' : 'New'}
                    tone={isModified ? 'special' : 'open'}
                />
            </View>

            {/* Description */}
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                    marginBottom: 12,
                }}
                numberOfLines={3}
            >
                {item.description || '—'}
            </Text>

            {/* Timestamps */}
            <View
                className="flex-row items-center justify-between pt-3 border-t mb-3"
                style={{ borderColor: theme.border }}
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
                        Created
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.semibold,
                            fontSize: theme.fontSize.xs,
                            marginTop: 2,
                        }}
                    >
                        {formatDateHandler(item.created)}
                    </Text>
                </View>
                <View className="items-end">
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Updated
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.semibold,
                            fontSize: theme.fontSize.xs,
                            marginTop: 2,
                        }}
                    >
                        {formatDateHandler(item.updated)}
                    </Text>
                </View>
            </View>

            {/* Actions */}
            <View className="flex-row gap-x-2">
                <Pressable
                    onPress={onEdit}
                    className="flex-1 py-2.5 rounded-xl border items-center"
                    style={{ borderColor: theme.border }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onPress}
                    className="flex-1 py-2.5 rounded-xl items-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-white"
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        View Details
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

export default AdminRoutesMobileView;