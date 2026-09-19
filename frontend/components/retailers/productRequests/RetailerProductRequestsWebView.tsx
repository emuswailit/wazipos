// components/retailers/productRequests/RetailerProductRequestsWebView.tsx

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
import type { PageSize } from './RetailerProductRequestsList';
import { ProductRequestSummary } from './RetailerProductRequestsList';

const TABLE_MAX_WIDTH = 1600;

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'Request', flex: 2.4 },
    { label: 'Status', flex: 1.0 },
    { label: 'Urgency', flex: 0.9 },
    { label: 'Lines', flex: 0.7 },
    { label: 'Fulfilled', flex: 0.9 },
    { label: 'Expires', flex: 1.0 },
    { label: 'Created', flex: 1.0 },
    { label: 'Actions', flex: 1.0 },
];

interface StatusFilter {
    value: string;
    label: string;
}

interface Props {
    query: string;
    setQuery: (v: string) => void;
    statusFilter: string | null;
    setStatusFilter: (v: string | null) => void;
    statusFilters: readonly StatusFilter[];
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

/* Stable key regardless of sync state. */
function rowKey(item: ProductRequestSummary): string {
    return (
        item.remote_id ??
        item.draft_id ??
        item.request_number ??
        String(Math.random())
    );
}

export function RetailerProductRequestsWebView({
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    statusFilters,
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
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.xs,
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
                                    New request
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
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.xs,
                                        }}
                                    >
                                        Refresh
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </View>

                    {/* Filters */}
                    <View className="flex-row flex-wrap gap-2 mb-2">
                        {statusFilters.map((f) => (
                            <Pressable
                                key={f.value}
                                onPress={() =>
                                    setStatusFilter(
                                        statusFilter === f.value
                                            ? null
                                            : f.value
                                    )
                                }
                                className="px-3 py-1.5 rounded-full border"
                                style={{
                                    borderColor:
                                        statusFilter === f.value
                                            ? theme.primary
                                            : borderColor,
                                    backgroundColor:
                                        statusFilter === f.value
                                            ? `${theme.primary}15`
                                            : 'transparent',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color:
                                            statusFilter === f.value
                                                ? theme.primary
                                                : theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    {f.label}
                                </Text>
                            </Pressable>
                        ))}
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
                                    No requests match the filters.
                                </Text>
                            </View>
                        )
                    ) : (
                        items.map((item) => (
                            <TableRow
                                key={rowKey(item)}
                                item={item}
                                onPress={() => onPressRequest(item)}
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
 * Row label helpers
 * ======================================================= */

/**
 * Reference line. Always the request number so it's clear this
 * row represents a whole request, not a single item.
 */
function referenceLabel(item: ProductRequestSummary): string {
    return item.request_number || '—';
}

/**
 * Product summary line: first product title + "N more" if there
 * are additional lines on the request.
 */
function productsLabel(item: ProductRequestSummary): string {
    const preview = item.items_preview ?? [];
    if (preview.length === 0) return 'No products yet';

    const first = preview[0];
    const title = first.product_title?.trim() || first.product_id;
    const extra = preview.length - 1;
    return extra > 0 ? `${title} +${extra} more` : title;
}

function wholesalersLabel(item: ProductRequestSummary): string | null {
    const preview = item.items_preview ?? [];
    const all: string[] = [];
    for (const p of preview) {
        for (const t of p.wholesaler_titles ?? []) {
            if (t && !all.includes(t)) all.push(t);
        }
    }
    if (all.length === 0) return null;
    const shown = all.slice(0, 2).join(', ');
    const rest = all.length - 2;
    return rest > 0 ? `${shown} +${rest}` : shown;
}

/* =========================================================
 * Table row
 * ======================================================= */
function TableRow({
    item,
    onPress,
}: {
    item: ProductRequestSummary;
    onPress: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const reference = referenceLabel(item);
    const products = productsLabel(item);
    const wholesalers = wholesalersLabel(item);

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            {/* Reference — request number + products + wholesalers */}
            <View style={{ flex: 2.4, paddingRight: 8 }}>
                <Text
                    className="text-[13px]"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                    }}
                    numberOfLines={1}
                >
                    {reference}
                </Text>
                <Text
                    className="text-[12px] mt-0.5"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                    }}
                    numberOfLines={1}
                >
                    {products}
                </Text>
                {wholesalers ? (
                    <Text
                        className="text-[11px] mt-0.5"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.semibold,
                        }}
                        numberOfLines={1}
                    >
                        Sent to: {wholesalers}
                    </Text>
                ) : null}
            </View>

            <View style={{ flex: 1.0 }}>
                <StatusPill
                    label={item.status_display}
                    tone={statusTone(item.status)}
                />
            </View>

            <View style={{ flex: 0.9 }}>
                <StatusPill
                    label={item.urgency_display}
                    tone={urgencyTone(item.urgency)}
                />
            </View>

            <Text
                className="text-[13px]"
                style={{
                    flex: 0.7,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                }}
            >
                {item.total_line_count}
            </Text>

            <Text
                className="text-[13px]"
                style={{
                    flex: 0.9,
                    color:
                        item.fulfilled_line_count > 0
                            ? '#10b981'
                            : theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {item.fulfilled_line_count} / {item.total_line_count}
            </Text>

            <Text
                className="text-[12px]"
                style={{
                    flex: 1.0,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {item.expires_at ? formatDate(item.expires_at) : '—'}
            </Text>

            <Text
                className="text-[12px]"
                style={{
                    flex: 1.0,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {formatDate(item.created)}
            </Text>

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

function urgencyTone(
    urgency: string
): 'open' | 'closed' | 'special' | 'success' | 'warning' {
    if (urgency === 'high') return 'warning';
    if (urgency === 'medium') return 'special';
    return 'closed';
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