// components/wholesalers/productsRequests/WholesalerProductRequestsWebView.tsx
//
// Web table view. Also exports shared filter primitives used by
// the mobile view.
//
// Every row now has two actions:
//   - "View"       — always available, opens the read-only details
//                    modal
//   - "Make Offer" — only for PUBLISHED requests

import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import type { ProductRequestSummary } from '@/databases/types';

import type { RespondPayload } from './MakeOfferModal';
import MakeOfferModal from './MakeOfferModal';
import ViewRequestDetailsModal from './ViewRequestDetailsModal';

/* =========================================================
 * Shared helpers
 * ======================================================= */

export function isPublishedStatus(
    status?: string | null
): boolean {
    return (
        String(status ?? '').trim().toUpperCase() === 'PUBLISHED'
    );
}

/* =========================================================
 * Shared filter primitives (exported for mobile view)
 * ======================================================= */

export interface StatusOption {
    value: string;
    label: string;
    bg: string;
    fg: string;
    dot: string;
}

export const STATUS_OPTIONS: StatusOption[] = [
    {
        value: 'ALL',
        label: 'All',
        bg: 'rgba(99,102,241,0.15)',
        fg: '#6366f1',
        dot: '#6366f1',
    },
    {
        value: 'PUBLISHED',
        label: 'Published',
        bg: 'rgba(16,185,129,0.15)',
        fg: '#10b981',
        dot: '#10b981',
    },
    {
        value: 'ACKNOWLEDGED',
        label: 'Acknowledged',
        bg: 'rgba(99,102,241,0.15)',
        fg: '#6366f1',
        dot: '#6366f1',
    },
    {
        value: 'PARTIALLY_FULFILLED',
        label: 'Partial',
        bg: 'rgba(251,191,36,0.15)',
        fg: '#f59e0b',
        dot: '#f59e0b',
    },
    {
        value: 'FULFILLED',
        label: 'Fulfilled',
        bg: 'rgba(59,130,246,0.15)',
        fg: '#3b82f6',
        dot: '#3b82f6',
    },
    {
        value: 'CANCELLED',
        label: 'Cancelled',
        bg: 'rgba(239,68,68,0.15)',
        fg: '#ef4444',
        dot: '#ef4444',
    },
    {
        value: 'EXPIRED',
        label: 'Expired',
        bg: 'rgba(148,163,184,0.15)',
        fg: '#94a3b8',
        dot: '#94a3b8',
    },
];

export function StatusPill({
    option,
    active,
    count,
    onPress,
}: {
    option: StatusOption;
    active: boolean;
    count: number;
    onPress: () => void;
}) {
    const { theme } = useAuth();
    const bg = active ? option.bg : 'transparent';
    const fg = active ? option.fg : theme.textDark;

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center px-2.5 py-1 mr-2 rounded-full border"
            style={{
                backgroundColor: bg,
                borderColor: active
                    ? option.fg + '55'
                    : theme.textDark + '33',
            }}
        >
            <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{
                    backgroundColor: active
                        ? option.fg
                        : option.dot,
                }}
            />
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: fg,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
                numberOfLines={1}
            >
                {option.label}
            </Text>
            <Text
                style={{
                    color: fg,
                    opacity: 0.7,
                    marginLeft: 6,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
            >
                {count}
            </Text>
        </Pressable>
    );
}

export function EntityChip({
    label,
    active,
    onPress,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    const { theme } = useAuth();

    return (
        <Pressable
            onPress={onPress}
            className="px-2.5 py-1 mr-2 rounded-full border"
            style={{
                backgroundColor: active
                    ? theme.primary + '15'
                    : 'transparent',
                borderColor: active
                    ? theme.primary
                    : theme.textDark + '33',
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: active ? theme.primary : theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Column widths — Actions widened to hold two buttons
 * ======================================================= */

const COLS = {
    request: '10%',
    retailer: '16%',
    status: '13%',
    urgency: '9%',
    lines: '6%',
    fulfilled: '8%',
    expires: '10%',
    created: '10%',
    actions: '18%',
} as const;

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    entityQuery: string;
    setEntityQuery: (v: string) => void;
    statusFilter: string;
    setStatusFilter: (v: string) => void;
    hasActiveFilter: boolean;
    onClearFilters: () => void;

    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime: string;
    onRefresh: () => void;

    items: ProductRequestSummary[];
    statusCounts: Record<string, number>;
    entityOptions: string[];

    isSubmitting: boolean;
    onSubmitResponse: (payload: RespondPayload) => Promise<void>;

    emptyComponent?: React.ReactNode;
}

function rowKey(r: ProductRequestSummary): string {
    return (
        r.remote_id ??
        r.draft_id ??
        r.request_number ??
        `req-${Math.random().toString(36).slice(2)}`
    );
}

/* =========================================================
 * Component
 * ======================================================= */

export function WholesalerProductRequestsWebView({
    entityQuery,
    setEntityQuery,
    statusFilter,
    setStatusFilter,
    hasActiveFilter,
    onClearFilters,
    isSyncing,
    isManualRefreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    onRefresh,
    items,
    statusCounts,
    entityOptions,
    isSubmitting,
    onSubmitResponse,
    emptyComponent,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [offerRequest, setOfferRequest] =
        useState<ProductRequestSummary | null>(null);

    const [detailsRequest, setDetailsRequest] =
        useState<ProductRequestSummary | null>(null);

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
                            Product Requests
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
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Last synced {lastSyncedTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                        <Pressable
                            onPress={onRefresh}
                            disabled={isManualRefreshing}
                            hitSlop={8}
                            className="px-4 py-2.5 rounded-full items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: isManualRefreshing ? 0.6 : 1,
                                minHeight: 40,
                                minWidth: 40,
                            }}
                        >
                            {isManualRefreshing ? (
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
                    {STATUS_OPTIONS.map((s) => (
                        <StatusPill
                            key={s.value}
                            option={s}
                            active={statusFilter === s.value}
                            count={statusCounts[s.value] ?? 0}
                            onPress={() => setStatusFilter(s.value)}
                        />
                    ))}
                </View>

                {entityOptions.length > 0 && (
                    <View className="flex-row flex-wrap gap-1.5 mb-2">
                        <EntityChip
                            label="All retailers"
                            active={entityQuery.trim() === ''}
                            onPress={() => setEntityQuery('')}
                        />
                        {entityOptions.map((name) => {
                            const active =
                                entityQuery
                                    .trim()
                                    .toLowerCase() ===
                                name.toLowerCase();
                            return (
                                <EntityChip
                                    key={name}
                                    label={name}
                                    active={active}
                                    onPress={() =>
                                        setEntityQuery(
                                            active ? '' : name
                                        )
                                    }
                                />
                            );
                        })}
                    </View>
                )}

                <View className="flex-row items-center gap-3">
                    <TextInput
                        value={entityQuery}
                        onChangeText={setEntityQuery}
                        placeholder="Search by product, retailer, or reference…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-11 rounded-xl border px-3.5 max-w-[480px] flex-1"
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

                    {hasActiveFilter && (
                        <Pressable
                            onPress={onClearFilters}
                            className="px-3 py-2 rounded-lg border"
                            style={{ borderColor }}
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
                    )}
                </View>
            </View>

            {/* ============ Table ============ */}
            <View className="p-4 flex-1">
                <View
                    className="flex-row rounded-xl border px-3 py-2.5 mb-1"
                    style={{
                        backgroundColor: headerBg,
                        borderColor,
                    }}
                >
                    <Text style={headerStyle(theme, COLS.request)}>
                        Request
                    </Text>
                    <Text style={headerStyle(theme, COLS.retailer)}>
                        Retailer
                    </Text>
                    <Text style={headerStyle(theme, COLS.status)}>
                        Status
                    </Text>
                    <Text style={headerStyle(theme, COLS.urgency)}>
                        Urgency
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.lines),
                            textAlign: 'right',
                        }}
                    >
                        Lines
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.fulfilled),
                            textAlign: 'right',
                        }}
                    >
                        Fulfilled
                    </Text>
                    <Text style={headerStyle(theme, COLS.expires)}>
                        Expires
                    </Text>
                    <Text style={headerStyle(theme, COLS.created)}>
                        Created
                    </Text>
                    <Text
                        style={{
                            ...headerStyle(theme, COLS.actions),
                            textAlign: 'right',
                        }}
                    >
                        Actions
                    </Text>
                </View>

                <FlatList
                    data={items}
                    keyExtractor={rowKey}
                    refreshControl={
                        <RefreshControl
                            refreshing={isManualRefreshing}
                            onRefresh={onRefresh}
                            tintColor={theme.primary}
                        />
                    }
                    ListEmptyComponent={
                        emptyComponent ?? (
                            <View
                                className="rounded-xl border p-8 items-center"
                                style={{
                                    borderColor,
                                    backgroundColor: headerBg,
                                }}
                            >
                                {isSyncing ? (
                                    <ActivityIndicator
                                        color={theme.primary}
                                    />
                                ) : (
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        {hasActiveFilter
                                            ? 'No matches.'
                                            : 'No product requests.'}
                                    </Text>
                                )}
                            </View>
                        )
                    }
                    renderItem={({ item }) => (
                        <Row
                            request={item}
                            onView={() =>
                                setDetailsRequest(item)
                            }
                            onMakeOffer={() =>
                                setOfferRequest(item)
                            }
                        />
                    )}
                    showsVerticalScrollIndicator={false}
                />
            </View>

            {/* ============ Offer modal ============ */}
            <MakeOfferModal
                visible={!!offerRequest}
                request={offerRequest}
                isSubmitting={isSubmitting}
                onClose={() =>
                    !isSubmitting && setOfferRequest(null)
                }
                onSubmit={async (payload) => {
                    await onSubmitResponse(payload);
                    setOfferRequest(null);
                }}
            />

            {/* ============ Details modal ============ */}
            <ViewRequestDetailsModal
                visible={!!detailsRequest}
                request={detailsRequest}
                onClose={() => setDetailsRequest(null)}
            />
        </View>
    );
}

/* =========================================================
 * Row
 * ======================================================= */

function Row({
    request,
    onView,
    onMakeOffer,
}: {
    request: ProductRequestSummary;
    onView: () => void;
    onMakeOffer: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const urgency = urgencyTint(request.urgency);
    const status = statusTint(request.status);
    const canOffer = isPublishedStatus(request.status);

    return (
        <View
            className="flex-row rounded-xl border px-3 py-2.5 mb-1 items-center"
            style={{ borderColor }}
        >
            <Text
                style={cellStyle(theme, COLS.request, true)}
                numberOfLines={1}
            >
                {request.request_number || '—'}
            </Text>

            <Text
                style={cellStyle(theme, COLS.retailer, true)}
                numberOfLines={1}
            >
                {request.entity_title || '—'}
            </Text>

            <View style={{ width: COLS.status }}>
                <View
                    className="px-2 py-0.5 rounded-md self-start"
                    style={{ backgroundColor: status.bg }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: status.fg,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                        numberOfLines={1}
                    >
                        {request.status_display || request.status}
                    </Text>
                </View>
            </View>

            <View style={{ width: COLS.urgency }}>
                <View
                    className="px-2 py-0.5 rounded-md self-start"
                    style={{ backgroundColor: urgency.bg }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: urgency.fg,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        {(
                            request.urgency_display ||
                            request.urgency
                        ).toUpperCase()}
                    </Text>
                </View>
            </View>

            <Text
                style={{
                    ...cellStyle(theme, COLS.lines),
                    textAlign: 'right',
                    color: theme.text,
                    fontFamily: theme.font.bold,
                }}
            >
                {request.total_line_count}
            </Text>

            <Text
                style={{
                    ...cellStyle(theme, COLS.fulfilled),
                    textAlign: 'right',
                }}
            >
                {request.fulfilled_line_count} /{' '}
                {request.total_line_count}
            </Text>

            <Text
                style={cellStyle(theme, COLS.expires)}
                numberOfLines={1}
            >
                {formatDate(request.expires_at)}
            </Text>

            <Text
                style={cellStyle(theme, COLS.created)}
                numberOfLines={1}
            >
                {formatDate(request.created)}
            </Text>

            <View
                style={{
                    width: COLS.actions,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                }}
            >
                <Pressable
                    onPress={onView}
                    hitSlop={6}
                    className="px-2.5 py-1.5 rounded-lg border"
                    style={{
                        borderColor,
                        minHeight: 32,
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
                        View
                    </Text>
                </Pressable>

                {canOffer ? (
                    <Pressable
                        onPress={onMakeOffer}
                        hitSlop={6}
                        className="px-3 py-1.5 rounded-lg"
                        style={{
                            backgroundColor: theme.primary,
                            minHeight: 32,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Make Offer
                        </Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

/* =========================================================
 * Helpers
 * ======================================================= */

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

function cellStyle(
    theme: any,
    width: string,
    bold = false
) {
    return {
        width,
        color: bold ? theme.text : theme.textDark,
        fontFamily: bold ? theme.font.bold : theme.font.medium,
        fontSize: 11,
        paddingRight: 8,
    };
}

function urgencyTint(urgency?: string) {
    switch ((urgency ?? '').toLowerCase()) {
        case 'high':
        case 'critical':
            return { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' };
        case 'medium':
            return { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' };
        case 'low':
        default:
            return { bg: 'rgba(14,165,233,0.15)', fg: '#0ea5e9' };
    }
}

function statusTint(status?: string) {
    const key = String(status ?? '').trim().toUpperCase();
    switch (key) {
        case 'PUBLISHED':
            return { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' };
        case 'ACKNOWLEDGED':
            return { bg: 'rgba(99,102,241,0.15)', fg: '#6366f1' };
        case 'PARTIALLY_FULFILLED':
            return { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' };
        case 'FULFILLED':
            return { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' };
        case 'CANCELLED':
            return { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' };
        case 'EXPIRED':
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
        default:
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
    }
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value.replace(' ', 'T'));
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}