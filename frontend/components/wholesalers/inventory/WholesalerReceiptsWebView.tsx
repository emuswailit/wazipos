// components/wholesalers/inventory/WholesalerReceiptsWebView.tsx

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { WholesalerReceipt } from '@/databases/types';
import React, { useMemo, useState } from 'react';
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
import {
    WholesalerReceiptDraft,
    WholesalerReceiptEditModal,
} from './WholesalerReceiptEditModal';
import type { PageSize } from './WholesalerReceiptsList';

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
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    items: WholesalerReceipt[];
    emptyComponent?: React.ReactNode;
    onPressReceipt: (r: WholesalerReceipt) => void;
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

export function WholesalerReceiptsWebView({
    query,
    setQuery,
    expiryFilter,
    setExpiryFilter,
    expiryFilters,
    inStockOnly,
    setInStockOnly,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    items,
    emptyComponent,
    onPressReceipt,
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
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const rowHover = isDarkMode ? '#1e293b' : '#f8fafc';

    const [editOpen, setEditOpen] = useState(false);
    const [editing, setEditing] =
        useState<WholesalerReceipt | null>(null);

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

    const cols = useMemo(
        () => ({
            product: '30%',
            batch: '10%',
            stock: '10%',
            buying: '10%',
            selling: '10%',
            expiry: '14%',
            flags: '10%',
            actions: '6%',
        }),
        []
    );

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

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={() => {
                                setEditing(null);
                                setEditOpen(true);
                            }}
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
                                    Sync now
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
                    className="h-11 rounded-xl border px-3.5 max-w-[480px]"
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

            {/* -------- Table -------- */}
            <ScrollView
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
            >
                <View className="p-4">
                    {/* Header row */}
                    <View
                        className="flex-row rounded-xl border px-3 py-2.5 mb-1"
                        style={{
                            backgroundColor: headerBg,
                            borderColor,
                        }}
                    >
                        <Text style={headerStyle(theme, cols.product)}>
                            Product
                        </Text>
                        <Text style={headerStyle(theme, cols.batch)}>
                            Batch
                        </Text>
                        <Text style={headerStyle(theme, cols.stock)}>
                            Stock
                        </Text>
                        <Text style={headerStyle(theme, cols.buying)}>
                            Buying
                        </Text>
                        <Text style={headerStyle(theme, cols.selling)}>
                            Selling
                        </Text>
                        <Text style={headerStyle(theme, cols.expiry)}>
                            Expiry
                        </Text>
                        <Text style={headerStyle(theme, cols.flags)}>
                            Flags
                        </Text>
                        <Text
                            style={{
                                ...headerStyle(
                                    theme,
                                    cols.actions
                                ),
                                textAlign: 'right',
                            }}
                        >
                            Edit
                        </Text>
                    </View>

                    {/* Rows */}
                    {items.length === 0 ? (
                        emptyComponent ?? (
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
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    No inventory matches the
                                    filters.
                                </Text>
                            </View>
                        )
                    ) : (
                        items.map((r) => (
                            <Row
                                key={rowKey(r)}
                                receipt={r}
                                rowHover={rowHover}
                                onPress={() => onPressReceipt(r)}
                                onEdit={() => {
                                    setEditing(r);
                                    setEditOpen(true);
                                }}
                            />
                        ))
                    )}

                    {/* Pagination */}
                    {totalItems > 0 ? (
                        <View className="mt-3">
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
                                    onPageSizeChange
                                }
                            />
                        </View>
                    ) : null}
                </View>
            </ScrollView>

            {/* -------- Edit modal -------- */}
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
 * Row
 * ======================================================= */
function Row({
    receipt,
    rowHover,
    onPress,
    onEdit,
}: {
    receipt: WholesalerReceipt;
    rowHover: string;
    onPress: () => void;
    onEdit: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const cols = {
        product: '30%',
        batch: '10%',
        stock: '10%',
        buying: '10%',
        selling: '10%',
        expiry: '14%',
        flags: '10%',
        actions: '6%',
    } as const;

    return (
        <Pressable
            onPress={onPress}
            className="flex-row rounded-xl border px-3 py-2.5 mb-1 items-center"
            style={{ borderColor }}
        >
            <View
                style={{
                    width: cols.product,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingRight: 8,
                }}
            >
                <View
                    className="rounded-lg overflow-hidden mr-2"
                    style={{
                        width: 32,
                        height: 32,
                        backgroundColor: isDarkMode
                            ? '#1e293b'
                            : '#e2e8f0',
                    }}
                >
                    {receipt.thumbnail_url ? (
                        <Image
                            source={{
                                uri: receipt.thumbnail_url,
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
                            fontSize: 12,
                        }}
                        numberOfLines={1}
                    >
                        {receipt.title || '—'}
                    </Text>
                    {receipt.bar_code ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 10,
                                marginTop: 1,
                            }}
                            numberOfLines={1}
                        >
                            {receipt.bar_code}
                        </Text>
                    ) : null}
                </View>
            </View>

            <Text
                style={cellStyle(theme, cols.batch)}
                numberOfLines={1}
            >
                {receipt.batch ?? '—'}
            </Text>

            <Text
                style={{
                    ...cellStyle(theme, cols.stock),
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {receipt.current_unit_quantity}{' '}
                {receipt.unit_of_receipt || 'u'}
            </Text>

            <Text style={cellStyle(theme, cols.buying)}>
                {formatKES(receipt.unit_buying_price)}
            </Text>

            <Text
                style={{
                    ...cellStyle(theme, cols.selling),
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {formatKES(receipt.final_unit_selling_price)}
            </Text>

            <View style={{ width: cols.expiry }}>
                <ExpiryPill item={receipt} />
            </View>

            <View
                style={{
                    width: cols.flags,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                }}
            >
                {receipt.in_placement ? (
                    <MiniBadge label="Placement" tone="success" />
                ) : null}
            </View>

            <View
                style={{
                    width: cols.actions,
                    alignItems: 'flex-end',
                }}
            >
                <Pressable
                    onPress={(e) => {
                        e?.stopPropagation?.();
                        onEdit();
                    }}
                    hitSlop={6}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                        borderColor: theme.primary,
                        backgroundColor: `${theme.primary}15`,
                        minHeight: 32,
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
                        Edit
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

/* =========================================================
 * ExpiryPill (exported — used by mobile view)
 * ======================================================= */
export function ExpiryPill({
    item,
}: {
    item: WholesalerReceipt;
}) {
    const { theme } = useAuth();

    const expiry = item.expiry_date;
    if (!expiry) {
        return (
            <View
                className="px-2 py-0.5 rounded-md border self-start"
                style={{
                    borderColor: 'rgba(148,163,184,0.35)',
                    backgroundColor: 'rgba(148,163,184,0.12)',
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
                    No expiry
                </Text>
            </View>
        );
    }

    const d = new Date(expiry.replace(' ', 'T'));
    const days = isNaN(d.getTime())
        ? null
        : Math.floor(
            (d.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        );

    let label = '—';
    let tone: 'success' | 'warning' | 'danger' | 'default' =
        'default';

    if (days == null) {
        label = expiry;
    } else if (days < 0) {
        label = `Expired ${Math.abs(days)}d ago`;
        tone = 'danger';
    } else if (days === 0) {
        label = 'Expires today';
        tone = 'danger';
    } else if (days <= 30) {
        label = `${days}d left`;
        tone = 'danger';
    } else if (days <= 90) {
        label = `${days}d left`;
        tone = 'warning';
    } else {
        label = `${days}d left`;
        tone = 'success';
    }

    const bg =
        tone === 'success'
            ? 'rgba(16,185,129,0.15)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.15)'
                : tone === 'danger'
                    ? 'rgba(239,68,68,0.15)'
                    : 'rgba(148,163,184,0.12)';
    const border =
        tone === 'success'
            ? 'rgba(16,185,129,0.35)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.35)'
                : tone === 'danger'
                    ? 'rgba(239,68,68,0.35)'
                    : 'rgba(148,163,184,0.35)';
    const color =
        tone === 'success'
            ? '#10b981'
            : tone === 'warning'
                ? '#f59e0b'
                : tone === 'danger'
                    ? '#ef4444'
                    : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-md border self-start"
            style={{ backgroundColor: bg, borderColor: border }}
        >
            <Text
                className="uppercase tracking-wide"
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

/* =========================================================
 * MiniBadge
 * ======================================================= */
function MiniBadge({
    label,
    tone = 'default',
}: {
    label: string;
    tone?: 'default' | 'success' | 'warning';
}) {
    const { theme, isDarkMode } = useAuth();
    const bg =
        tone === 'success'
            ? 'rgba(16,185,129,0.15)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.15)'
                : isDarkMode
                    ? '#0f172a'
                    : '#f8fafc';
    const border =
        tone === 'success'
            ? 'rgba(16,185,129,0.3)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.3)'
                : isDarkMode
                    ? '#334155'
                    : '#e2e8f0';
    const color =
        tone === 'success'
            ? '#10b981'
            : tone === 'warning'
                ? '#f59e0b'
                : theme.textDark;
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{ backgroundColor: bg, borderColor: border }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
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

function headerStyle(theme: any, width: string) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
    };
}

function cellStyle(theme: any, width: string) {
    return {
        width,
        color: theme.textDark,
        fontFamily: theme.font.medium,
        fontSize: 11,
        paddingRight: 8,
    };
}