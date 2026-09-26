// components/retailers/productRequests/RetailerProductRequestsMobileView.tsx
//
// Mobile card view for the retailer's product requests list.
//
// Filter strip uses the shared StatusFilterPill from
// statusPrimitives so the mobile strip and the web table header
// render the same set of status pills with the same counts.

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
    PageSize,
    ProductRequestSummary,
} from './RetailerProductRequestsList';
import { StatusPill } from './RetailerProductRequestsWebView';
import {
    StatusFilterPill,
    type RequestStatusOption,
} from './statusPrimitives';

interface Props {
    query: string;
    setQuery: (v: string) => void;
    statusFilter: string | null;
    setStatusFilter: (v: string | null) => void;
    statusOptions: RequestStatusOption[];
    statusCounts: Record<string, number>;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    items: ProductRequestSummary[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressRequest: (item: ProductRequestSummary) => void;
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

function rowKey(item: ProductRequestSummary): string {
    return (
        item.remote_id ??
        item.draft_id ??
        item.request_number ??
        String(Math.random())
    );
}

export function RetailerProductRequestsMobileView({
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    statusOptions,
    statusCounts,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    items,
    emptyComponent,
    onOpenCreate,
    onPressRequest,
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
                            Product Requests
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

                {/* Filter strip — shared StatusFilterPill */}
                <View className="flex-row flex-wrap gap-1.5 mb-2">
                    {statusOptions.map((s) => {
                        const isActive =
                            s.value === 'ALL'
                                ? statusFilter === null
                                : statusFilter === s.value;
                        return (
                            <StatusFilterPill
                                key={s.value}
                                option={s}
                                active={isActive}
                                count={statusCounts[s.value] ?? 0}
                                onPress={() =>
                                    setStatusFilter(
                                        s.value === 'ALL'
                                            ? null
                                            : s.value
                                    )
                                }
                            />
                        );
                    })}
                </View>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by product, reference, or wholesaler..."
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

            {/* Card list */}
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
                                No requests match the filters.
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
                    <RequestCard
                        item={item}
                        onPress={() => onPressRequest(item)}
                    />
                )}
            />
        </View>
    );
}

/* =========================================================
 * Row label helpers
 * ======================================================= */

function referenceLabel(item: ProductRequestSummary): string {
    return item.request_number || '—';
}

function productsLabel(item: ProductRequestSummary): string {
    const preview = item.items ?? [];
    if (preview.length === 0) return 'No products yet';

    const first = preview[0];
    const title = first.product_title?.trim() || first.product_id;
    const extra = preview.length - 1;
    return extra > 0 ? `${title} +${extra} more` : title;
}

function wholesalersLabel(
    item: ProductRequestSummary
): string | null {
    const preview = item.items ?? [];
    const all: string[] = [];
    for (const p of preview) {
        const targets = p.target_wholesalers ?? [];
        for (const w of targets) {
            const t = w?.title;
            if (t && !all.includes(t)) all.push(t);
        }
    }
    if (all.length === 0) return null;
    const shown = all.slice(0, 2).join(', ');
    const rest = all.length - 2;
    return rest > 0 ? `${shown} +${rest}` : shown;
}

/* =========================================================
 * Request card
 * ======================================================= */
function RequestCard({
    item,
    onPress,
}: {
    item: ProductRequestSummary;
    onPress: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const filledRatio =
        item.total_line_count > 0
            ? item.fulfilled_line_count / item.total_line_count
            : 0;

    const reference = referenceLabel(item);
    const products = productsLabel(item);
    const wholesalers = wholesalersLabel(item);

    return (
        <Pressable
            onPress={onPress}
            className="rounded-2xl border p-3.5 mb-3"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            {/* Reference + status */}
            <View className="flex-row items-start justify-between mb-2">
                <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 15,
                        }}
                        numberOfLines={1}
                    >
                        {reference}
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: 12,
                            marginTop: 2,
                        }}
                        numberOfLines={2}
                    >
                        {products}
                    </Text>
                    {wholesalers ? (
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.semibold,
                                fontSize: 11,
                                marginTop: 2,
                            }}
                            numberOfLines={2}
                        >
                            Sent to: {wholesalers}
                        </Text>
                    ) : null}
                </View>
                <StatusPill
                    label={item.status_display}
                    tone={statusTone(item.status)}
                />
            </View>

            {/* Chips */}
            <View className="flex-row flex-wrap gap-1.5 mb-2">
                <Chip label={`${item.total_line_count} lines`} />
                <Chip label={`Urgency: ${item.urgency_display}`} />
                {item.expires_at ? (
                    <Chip
                        label={`Expires ${formatDate(item.expires_at)}`}
                    />
                ) : null}
                <Chip label={formatDate(item.created)} />
            </View>

            {/* Fulfillment progress */}
            <View
                className="rounded-xl px-3 py-2 mb-2.5"
                style={{ backgroundColor: subBg }}
            >
                <View className="flex-row items-center justify-between mb-1">
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Fulfilled
                    </Text>
                    <Text
                        style={{
                            color:
                                filledRatio >= 1
                                    ? '#10b981'
                                    : theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 13,
                        }}
                    >
                        {item.fulfilled_line_count} /{' '}
                        {item.total_line_count}
                    </Text>
                </View>
                <View
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{
                        backgroundColor: isDarkMode
                            ? '#1e293b'
                            : '#e2e8f0',
                    }}
                >
                    <View
                        className="h-full rounded-full"
                        style={{
                            width: `${Math.round(filledRatio * 100)}%`,
                            backgroundColor:
                                filledRatio >= 1
                                    ? '#10b981'
                                    : theme.primary,
                        }}
                    />
                </View>
            </View>

            {/* Actions */}
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
function statusTone(
    status: string
): 'open' | 'closed' | 'special' | 'success' | 'warning' {
    if (status === 'FULFILLED') return 'success';
    if (status === 'PARTIALLY_FULFILLED') return 'warning';
    if (status === 'CANCELLED' || status === 'EXPIRED')
        return 'closed';
    if (status === 'PUBLISHED') return 'open';
    if (status === 'ACKNOWLEDGED') return 'open';
    return 'special';
}

function formatDate(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}