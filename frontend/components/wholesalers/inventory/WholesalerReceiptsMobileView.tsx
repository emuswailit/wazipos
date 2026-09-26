// components/wholesalers/inventory/WholesalerReceiptsMobileView.tsx

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { WholesalerReceipt } from '@/databases/types';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    WholesalerReceiptDraft,
    WholesalerReceiptEditModal,
} from './WholesalerReceiptEditModal';
import type { PageSize } from './WholesalerReceiptsList';
import { ExpiryPill } from './WholesalerReceiptsWebView';

interface ExpiryFilter {
    value: string;
    label: string;
}

interface Props {
    query: string;
    setQuery: (v: string) => void;
    expiryFilter: string | null;
    setExpiryFilter: (v: string | null) => void;
    expiryFilters: readonly ExpiryFilter[];
    inStockOnly: boolean;
    setInStockOnly: (v: boolean) => void;
    onRefresh: () => void;
    refreshing: boolean;
    isLiveConnected: boolean;
    syncStatus: string;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    pendingCount: number;
    items: WholesalerReceipt[];
    emptyComponent?: React.ReactNode;
    onPressReceipt: (r: WholesalerReceipt) => void;
    /** Called when user taps + New. Optional — if omitted, the
     *  view opens its own edit modal in create mode. */
    onOpenCreate?: () => void;
    /** Passed through to the edit modal. */
    onSave: (
        draft: WholesalerReceiptDraft,
        mode: 'create' | 'edit'
    ) => Promise<void> | void;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

function rowKey(r: WholesalerReceipt): string {
    return r.remote_id ?? String(r.id);
}

export function WholesalerReceiptsMobileView({
    query,
    setQuery,
    expiryFilter,
    setExpiryFilter,
    expiryFilters,
    inStockOnly,
    setInStockOnly,
    onRefresh,
    refreshing,
    isLiveConnected,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    pendingCount,
    items,
    emptyComponent,
    onPressReceipt,
    onOpenCreate,
    onSave,
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

    /* -------- local edit-modal state -------- */
    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] =
        useState<WholesalerReceipt | null>(null);

    const openCreate = () => {
        // If the parent wants to handle it, defer to them.
        if (onOpenCreate) {
            onOpenCreate();
            return;
        }
        setEditing(null);
        setEditOpen(true);
    };

    const openEdit = (r: WholesalerReceipt) => {
        setEditing(r);
        setEditOpen(true);
    };

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
            {/* -------- Header -------- */}
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
                            Inventory
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
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
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Last synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    {/* Actions */}
                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={openCreate}
                            hitSlop={8}
                            className="px-4 py-2.5 rounded-full border flex-row items-center gap-1.5"
                            style={{
                                borderColor: theme.primary,
                                backgroundColor: `${theme.primary}15`,
                                minHeight: 40,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 16,
                                    lineHeight: 18,
                                }}
                            >
                                +
                            </Text>
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                New
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onRefresh}
                            disabled={refreshing}
                            hitSlop={8}
                            className="px-4 py-2.5 rounded-full items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: refreshing ? 0.6 : 1,
                                minHeight: 40,
                                minWidth: 40,
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
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    Sync
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <View className="flex-row flex-wrap gap-1.5 mb-2">
                    {expiryFilters.map((f) => (
                        <Pressable
                            key={f.value}
                            onPress={() =>
                                setExpiryFilter(
                                    expiryFilter === f.value
                                        ? null
                                        : f.value
                                )
                            }
                            className="px-2.5 py-1 rounded-full border"
                            style={{
                                borderColor:
                                    expiryFilter === f.value
                                        ? theme.primary
                                        : borderColor,
                                backgroundColor:
                                    expiryFilter === f.value
                                        ? `${theme.primary}15`
                                        : 'transparent',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color:
                                        expiryFilter === f.value
                                            ? theme.primary
                                            : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                {f.label}
                            </Text>
                        </Pressable>
                    ))}

                    <Pressable
                        onPress={() => setInStockOnly(!inStockOnly)}
                        className="px-2.5 py-1 rounded-full border"
                        style={{
                            borderColor: inStockOnly
                                ? theme.primary
                                : borderColor,
                            backgroundColor: inStockOnly
                                ? `${theme.primary}15`
                                : 'transparent',
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: inStockOnly
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            In stock
                        </Text>
                    </Pressable>
                </View>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by product, batch, or bar code..."
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-11 rounded-xl border px-3.5"
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

            {/* -------- Cards -------- */}
            <FlatList
                data={items}
                keyExtractor={rowKey}
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
                                No inventory matches the filters.
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
                            onPageSizeChange={onPageSizeChange}
                        />
                    ) : null
                }
                renderItem={({ item }) => (
                    <ReceiptCard
                        item={item}
                        onPress={() => {
                            // Parent can override (e.g. to show a
                            // details modal). If they don't, open
                            // the edit modal.
                            onPressReceipt(item);
                        }}
                        onEdit={() => openEdit(item)}
                    />
                )}
            />

            {/* -------- Edit modal (owned locally) -------- */}
            <WholesalerReceiptEditModal
                visible={editOpen}
                receipt={editing}
                onClose={() => setEditOpen(false)}
                onSave={async (draft, mode) => {
                    await onSave(draft, mode);
                    setEditOpen(false);
                }}
            />
        </View>
    );
}

/* =========================================================
 * Receipt card
 * ======================================================= */
function ReceiptCard({
    item,
    onPress,
    onEdit,
}: {
    item: WholesalerReceipt;
    onPress: () => void;
    onEdit: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    return (
        <Pressable
            onPress={onPress}
            className="rounded-2xl border p-3.5 mb-3"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            <View className="flex-row items-start justify-between mb-2">
                <View
                    className="flex-row items-center flex-1 min-w-0"
                    style={{ paddingRight: 8 }}
                >
                    <View
                        className="rounded-lg overflow-hidden mr-2.5"
                        style={{
                            width: 44,
                            height: 44,
                            backgroundColor: isDarkMode
                                ? '#1e293b'
                                : '#e2e8f0',
                        }}
                    >
                        {item.thumbnail_url ? (
                            <Image
                                source={{
                                    uri: item.thumbnail_url,
                                }}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                }}
                                resizeMode="cover"
                            />
                        ) : null}
                    </View>
                    <View className="flex-1 min-w-0">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 15,
                            }}
                            numberOfLines={2}
                        >
                            {item.title || '—'}
                        </Text>
                        {item.bar_code ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize: 11,
                                    marginTop: 2,
                                }}
                                numberOfLines={1}
                            >
                                {item.bar_code}
                            </Text>
                        ) : null}
                    </View>
                </View>

                <ExpiryPill item={item} />
            </View>

            <View className="flex-row flex-wrap gap-1.5 mb-2">
                {item.batch ? (
                    <Chip label={`Batch ${item.batch}`} />
                ) : null}
                <Chip
                    label={`${item.current_unit_quantity} in stock`}
                />
                <Chip label={item.unit_of_receipt || 'Unit'} />
                {item.in_placement ? (
                    <Chip label="Placement" />
                ) : null}
            </View>

            <View
                className="rounded-xl px-3 py-2 mb-2.5"
                style={{ backgroundColor: subBg }}
            >
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Selling
                        </Text>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 14,
                            }}
                        >
                            KES{' '}
                            {formatKES(
                                item.final_unit_selling_price
                            )}
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
                            Buying
                        </Text>
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 13,
                            }}
                        >
                            KES {formatKES(item.unit_buying_price)}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Actions: View details | Edit */}
            <View
                className="flex-row gap-2 pt-2.5 border-t"
                style={{ borderColor }}
            >
                <Pressable
                    onPress={onPress}
                    className="flex-1 py-2.5 rounded-xl items-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-white text-[12px]"
                        style={{ fontFamily: theme.font.bold }}
                    >
                        View details
                    </Text>
                </Pressable>

                <Pressable
                    onPress={(e) => {
                        e?.stopPropagation?.();
                        onEdit();
                    }}
                    hitSlop={6}
                    className="px-4 py-2.5 rounded-xl items-center border"
                    style={{
                        borderColor: theme.primary,
                        backgroundColor: `${theme.primary}15`,
                    }}
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
        </Pressable>
    );
}

/* =========================================================
 * Chip
 * ======================================================= */
function Chip({ label }: { label: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
                borderColor: isDarkMode ? '#334155' : '#e2e8f0',
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

/* =========================================================
 * Helpers
 * ======================================================= */
function formatKES(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '0';
    return Number(value).toLocaleString('en-KE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}