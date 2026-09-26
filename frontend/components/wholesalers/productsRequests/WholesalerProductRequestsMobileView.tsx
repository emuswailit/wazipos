// components/wholesalers/productsRequests/WholesalerProductRequestsMobileView.tsx
//
// Small-screen view. Cards instead of a table.
//
// Every card shows a "View Details" button. PUBLISHED requests
// additionally show "Make Offer".

import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import type { ProductRequestSummary } from '@/databases/types';

import type { RespondPayload } from './MakeOfferModal';
import MakeOfferModal from './MakeOfferModal';
import ViewRequestDetailsModal from './ViewRequestDetailsModal';
import {
    EntityChip,
    STATUS_OPTIONS,
    StatusPill,
    isPublishedStatus,
} from './WholesalerProductRequestsWebView';

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

export function WholesalerProductRequestsMobileView({
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
                                    Sync
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2 -mx-1"
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                    {STATUS_OPTIONS.map((s) => (
                        <StatusPill
                            key={s.value}
                            option={s}
                            active={statusFilter === s.value}
                            count={statusCounts[s.value] ?? 0}
                            onPress={() => setStatusFilter(s.value)}
                        />
                    ))}
                </ScrollView>

                {entityOptions.length > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="mb-2 -mx-1"
                        contentContainerStyle={{ paddingHorizontal: 4 }}
                    >
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
                    </ScrollView>
                )}

                <TextInput
                    value={entityQuery}
                    onChangeText={setEntityQuery}
                    placeholder="Filter by retailer…"
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

                {hasActiveFilter && (
                    <Pressable
                        onPress={onClearFilters}
                        className="mt-2 self-start"
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Clear filters
                        </Text>
                    </Pressable>
                )}
            </View>

            {/* ============ List ============ */}
            <FlatList
                data={items}
                keyExtractor={rowKey}
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 40,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={isManualRefreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                    />
                }
                ListEmptyComponent={
                    emptyComponent ?? (
                        <View className="p-8 items-center">
                            {isSyncing ? (
                                <>
                                    <ActivityIndicator
                                        color={theme.primary}
                                    />
                                    <Text
                                        className="mt-2"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        Loading requests from cache…
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.semibold,
                                            fontSize:
                                                theme.fontSize.base,
                                        }}
                                    >
                                        {hasActiveFilter
                                            ? 'No matches'
                                            : 'No product requests'}
                                    </Text>
                                    <Text
                                        className="mt-1 text-center"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.regular,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        {hasActiveFilter
                                            ? 'Try adjusting your filters.'
                                            : 'Requests from retailers will appear here.'}
                                    </Text>
                                </>
                            )}
                        </View>
                    )
                }
                renderItem={({ item }) => (
                    <RequestCard
                        request={item}
                        onView={() => setDetailsRequest(item)}
                        onMakeOffer={() => setOfferRequest(item)}
                    />
                )}
            />

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
 * Card
 * ======================================================= */

function RequestCard({
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
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const urgency = urgencyTint(request.urgency);
    const status = statusTint(request.status);
    const canOffer = isPublishedStatus(request.status);

    const unitCount = (request.items ?? []).reduce(
        (s, it) => s + (Number(it.requested_quantity) || 0),
        0
    );

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            <View className="flex-row items-center mb-2">
                <Text
                    className="flex-1 uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    {request.request_number || '—'}
                </Text>
                <View
                    className="px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: urgency.bg }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: urgency.fg,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
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
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 15,
                }}
                numberOfLines={2}
            >
                {request.entity_title || 'Unknown retailer'}
            </Text>

            <View className="flex-row items-center flex-wrap gap-1.5 mt-2.5">
                <View
                    className="px-2 py-0.5 rounded-md border"
                    style={{
                        backgroundColor: isDarkMode
                            ? '#0f172a'
                            : '#f1f5f9',
                        borderColor,
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
                        {request.total_line_count}{' '}
                        {request.total_line_count === 1
                            ? 'product'
                            : 'products'}
                    </Text>
                </View>

                <View
                    className="px-2 py-0.5 rounded-md border"
                    style={{
                        backgroundColor: isDarkMode
                            ? '#0f172a'
                            : '#f1f5f9',
                        borderColor,
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
                        {unitCount}{' '}
                        {unitCount === 1 ? 'unit' : 'units'}
                    </Text>
                </View>

                <View
                    className="px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: status.bg }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: status.fg,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        {request.status_display || request.status}
                    </Text>
                </View>
            </View>

            <View
                className="rounded-xl px-3 py-2 mt-2.5"
                style={{ backgroundColor: subBg }}
            >
                <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Expires
                        </Text>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: 12,
                                marginTop: 2,
                            }}
                        >
                            {formatDate(request.expires_at)}
                        </Text>
                    </View>
                    <View className="flex-1 items-center">
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
                                fontFamily: theme.font.medium,
                                fontSize: 12,
                                marginTop: 2,
                            }}
                        >
                            {formatDate(request.created)}
                        </Text>
                    </View>
                    <View className="flex-1 items-end">
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
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: 12,
                                marginTop: 2,
                            }}
                        >
                            {request.fulfilled_line_count} /{' '}
                            {request.total_line_count}
                        </Text>
                    </View>
                </View>
            </View>

            <View className="flex-row gap-2 mt-3">
                <Pressable
                    onPress={onView}
                    className="flex-1 py-2.5 rounded-xl items-center border"
                    style={{ borderColor }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                        }}
                    >
                        View Details
                    </Text>
                </Pressable>

                {canOffer ? (
                    <Pressable
                        onPress={onMakeOffer}
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 12,
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