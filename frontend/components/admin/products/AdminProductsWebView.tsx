// components/admin/products/AdminProductsWebView.tsx

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import type {
    AdminProductsSharedProps,
    ProductItem,
} from './types';

const TABLE_MAX_WIDTH = 1600;
const FALLBACK_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'Pic', flex: 0.6 },
    { label: 'Brand Name', flex: 2.0 },
    { label: 'Scientific Strength Formula', flex: 2.4 },
    { label: 'Pack Units', flex: 1.0 },
    { label: 'Manufacturer', flex: 1.6 },
    { label: 'Created', flex: 1.2 },
    { label: 'Actions', flex: 1.4 },
];

type Props = AdminProductsSharedProps;

function rowKey(item: ProductItem): string {
    return item.id || String(Math.random());
}

export function AdminProductsWebView({
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
                                Products Catalog
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
                                <View
                                    className="px-2 py-0.5 rounded-md"
                                    style={{
                                        backgroundColor: `${theme.primary}15`,
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontFamily: theme.font.bold,
                                            fontSize: 9,
                                        }}
                                    >
                                        {totalItems}{' '}
                                        {totalItems === 1
                                            ? 'Item'
                                            : 'Items'}
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
                                    New product
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
                        placeholder="Search brand catalog..."
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
                                    No products match the filters.
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

function TableRow({
    item,
    onPress,
    onEdit,
    formatDateHandler,
}: {
    item: ProductItem;
    onPress: () => void;
    onEdit: () => void;
    formatDateHandler: (dateString: string) => string;
}) {
    const { theme } = useAuth();
    const imgUrl =
        item.images && item.images.length > 0
            ? item.images[0]
            : FALLBACK_IMAGE;

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <View style={{ flex: 0.6, paddingRight: 8 }}>
                <View
                    className="w-[40px] h-[40px] rounded-lg overflow-hidden border"
                    style={{ borderColor: theme.border }}
                >
                    <Image
                        source={{ uri: imgUrl }}
                        style={{ width: '100%', height: '100%' }}
                    />
                </View>
            </View>

            <Text
                style={{
                    flex: 2.0,
                    paddingRight: 8,
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
                numberOfLines={1}
            >
                {item.title || '—'}
            </Text>

            <View style={{ flex: 2.4, paddingRight: 8 }}>
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
                        {item.long_preparation_title ||
                            item.preparation_title ||
                            'GENERAL MERCHANDISE'}
                    </Text>
                </View>
            </View>

            <Text
                style={{
                    flex: 1.0,
                    paddingRight: 8,
                    color: theme.text,
                    fontFamily: theme.font.semibold,
                    fontSize: theme.fontSize.xs,
                }}
                numberOfLines={1}
            >
                {item.units_per_pack} Qty
            </Text>

            <Text
                style={{
                    flex: 1.6,
                    paddingRight: 8,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
                numberOfLines={1}
            >
                {item.manufacturer_title || '—'}
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
                style={{ flex: 1.4 }}
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

export default AdminProductsWebView;