// components/admin/drugSubClasses/AdminDrugSubClassesMobileView.tsx
//
// Mobile card view for the admin drug sub classes list.

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
import type {
    AdminDrugSubClassesSharedProps,
    DrugSubClassItem,
} from './types';

type Props = AdminDrugSubClassesSharedProps;

function rowKey(item: DrugSubClassItem): string {
    return item.id || String(Math.random());
}

export function AdminDrugSubClassesMobileView({
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
                            Drug Subclasses
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
                    placeholder="Search subclasses..."
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
                                No drug subclasses match the filters.
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
                    <SubClassCard
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
function SubClassCard({
    item,
    onPress,
    onEdit,
    formatDateHandler,
}: {
    item: DrugSubClassItem;
    onPress: () => void;
    onEdit: () => void;
    formatDateHandler: (dateString: string) => string;
}) {
    const { theme } = useAuth();

    return (
        <Pressable
            onPress={onPress}
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <View className="flex-row justify-between items-start mb-2">
                <Text
                    style={{
                        flex: 1,
                        paddingRight: 8,
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                    }}
                    numberOfLines={1}
                >
                    {item.title || '—'}
                </Text>
                <View
                    className="px-2 py-0.5 rounded"
                    style={{
                        backgroundColor: `${theme.primary}15`,
                        maxWidth: 120,
                    }}
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                        className="uppercase tracking-wider"
                        numberOfLines={1}
                    >
                        {item.drug_class_title || '—'}
                    </Text>
                </View>
            </View>

            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                    marginBottom: 12,
                }}
                numberOfLines={2}
            >
                {item.description || '—'}
            </Text>

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
                        Inspect
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

export default AdminDrugSubClassesMobileView;