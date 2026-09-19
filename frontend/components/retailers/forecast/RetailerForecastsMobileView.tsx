// components/retailers/forecast/RetailerForecastsMobileView.tsx

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { RetailerForecastNormalized } from '@/databases/types';
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
import type { PageSize } from './RetailerForecastsList';

interface Props {
    query: string;
    setQuery: (v: string) => void;
    minAvgDaily: number;
    setMinAvgDaily: (v: number) => void;
    onlyWithOffers: boolean;
    setOnlyWithOffers: (fn: (v: boolean) => boolean) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    isStale: boolean;
    isOnline: boolean;
    lastSyncedTime: string;
    items: RetailerForecastNormalized[];
    emptyComponent?: React.ReactNode;
    onViewOffers: (item: RetailerForecastNormalized) => void;
    onViewDetails: (item: RetailerForecastNormalized) => void;
    onRequestSupply: (item: RetailerForecastNormalized) => void;
    onPressItem: (item: RetailerForecastNormalized) => void;
    hasDraftItem: (item: RetailerForecastNormalized) => boolean;
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

export function RetailerForecastsMobileView({
    query,
    setQuery,
    minAvgDaily,
    setMinAvgDaily,
    onlyWithOffers,
    setOnlyWithOffers,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    isStale,
    isOnline,
    lastSyncedTime,
    items,
    emptyComponent,
    onViewOffers,
    onViewDetails,
    onRequestSupply,
    onPressItem,
    hasDraftItem,
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
        sourceTone === 'server' ? '#10b981'
            : sourceTone === 'cache' ? '#f59e0b'
                : theme.textDark;
    const sourceBg =
        sourceTone === 'server' ? 'rgba(16,185,129,0.12)'
            : sourceTone === 'cache' ? 'rgba(251,191,36,0.15)'
                : 'rgba(148,163,184,0.15)';

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            {/* ---------------- Header ---------------- */}
            <View
                className="p-4 border-b"
                style={{ backgroundColor: theme.panel, borderBottomColor: borderColor }}
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
                            Forecasts
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: sourceBg }}>
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{ color: sourceColor, fontFamily: theme.font.bold, fontSize: 9 }}
                                >
                                    {sourceLabel}
                                </Text>
                            </View>

                            {!isOnline ? (
                                <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(148,163,184,0.15)' }}>
                                    <Text
                                        className="uppercase tracking-widest"
                                        style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 9 }}
                                    >
                                        Offline
                                    </Text>
                                </View>
                            ) : null}

                            {isStale ? (
                                <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}>
                                    <Text
                                        className="uppercase tracking-widest"
                                        style={{ color: '#f59e0b', fontFamily: theme.font.bold, fontSize: 9 }}
                                    >
                                        Stale
                                    </Text>
                                </View>
                            ) : null}

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
                            onPress={() => setOnlyWithOffers((v) => !v)}
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                                borderColor: onlyWithOffers ? theme.primary : borderColor,
                                backgroundColor: onlyWithOffers ? `${theme.primary}15` : 'transparent',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: onlyWithOffers ? theme.primary : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Offers
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onRefresh}
                            disabled={refreshing}
                            className="px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: theme.primary, opacity: refreshing ? 0.6 : 1 }}
                        >
                            {refreshing ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Text
                                    className="uppercase tracking-widest text-white"
                                    style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}
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
                    placeholder="Search product or wholesaler..."
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-10 rounded-xl border px-3.5"
                    style={{
                        borderColor,
                        backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                />
            </View>

            {/* ---------------- Card list ---------------- */}
            <FlatList
                data={items}
                keyExtractor={(it) => it.remote_id}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
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
                                No forecasts match the filters.
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
                    <ForecastCard
                        item={item}
                        inDraft={hasDraftItem(item)}
                        onViewOffers={() => onViewOffers(item)}
                        onViewDetails={() => onViewDetails(item)}
                        onRequestSupply={() => onRequestSupply(item)}
                        onPressItem={() => onPressItem(item)}
                    />
                )}
            />
        </View>
    );
}

/* =========================================================
 * Forecast card
 * ======================================================= */
function ForecastCard({
    item,
    inDraft,
    onViewOffers,
    onViewDetails,
    onRequestSupply,
    onPressItem,
}: {
    item: RetailerForecastNormalized;
    inDraft: boolean;
    onViewOffers: () => void;
    onViewDetails: () => void;
    onRequestSupply: () => void;
    onPressItem: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const bestOffer = item.wholesaler_offers[0];
    const hasOffersOrCampaigns = item.has_offers || item.has_campaigns;

    const previewOffers = (item.wholesaler_offers || [])
        .slice(0, 3)
        .map((o) => o.wholesaler_title)
        .filter(Boolean);

    return (
        <View
            className="rounded-2xl border p-3.5 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: inDraft ? '#f59e0b' : borderColor,
                borderWidth: inDraft ? 1.5 : 1,
            }}
        >
            {/* Title + In-basket badge */}
            <Pressable onPress={onViewDetails} className="mb-2">
                <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 15,
                        }}
                        numberOfLines={1}
                    >
                        {item.product_title || '—'}
                    </Text>
                    {inDraft ? (
                        <View
                            className="px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{ color: '#f59e0b', fontFamily: theme.font.bold, fontSize: 9 }}
                            >
                                In basket
                            </Text>
                        </View>
                    ) : null}
                </View>
            </Pressable>

            {/* Chips */}
            <View className="flex-row flex-wrap gap-1.5 mb-2">
                <Chip label={`${item.total_forecast.toFixed(0)} units`} />
                <Chip label={`P10–P90 ${item.total_p10.toFixed(0)}–${item.total_p90.toFixed(0)}`} />
                <Chip label={`~${item.avg_daily_forecast.toFixed(1)}/day`} />
            </View>

            {/* Offers / campaigns summary */}
            <View
                className="flex-row items-center justify-between py-2 mb-2 border-t border-b"
                style={{ borderColor }}
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
                        Wholesaler offers
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: item.has_offers ? '#10b981' : theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                    >
                        {item.wholesaler_offers.length}
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
                        Campaigns
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: item.has_campaigns ? '#f59e0b' : theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                    >
                        {item.wholesaler_campaigns.length}
                    </Text>
                </View>
            </View>

            {/* Offer preview */}
            {previewOffers.length > 0 ? (
                <View className="mb-2.5">
                    {previewOffers.map((t, i) => (
                        <Text
                            key={`${item.remote_id}-p-${i}`}
                            className="text-[12px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                            }}
                            numberOfLines={1}
                        >
                            • {t}
                        </Text>
                    ))}
                    {item.wholesaler_offers.length > 3 ? (
                        <Text
                            className="mt-0.5 text-[11px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                opacity: 0.7,
                            }}
                        >
                            +{item.wholesaler_offers.length - 3} more
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* Best offer hint */}
            {bestOffer ? (
                <View
                    className="rounded-xl px-3 py-2 mb-2.5"
                    style={{ backgroundColor: subBg }}
                >
                    <Text
                        className="text-[11px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                        }}
                        numberOfLines={1}
                    >
                        {bestOffer.rationale}
                    </Text>
                </View>
            ) : null}

            {/* Actions */}
            <View
                className="flex-row gap-2 pt-2.5 border-t"
                style={{ borderColor }}
            >
                {hasOffersOrCampaigns ? (
                    <Pressable
                        onPress={onViewOffers}
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white text-[11px]"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            Offers
                        </Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={onRequestSupply}
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{ backgroundColor: '#f59e0b' }}
                    >
                        <Text
                            className="uppercase tracking-wide text-white text-[11px]"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            Request
                        </Text>
                    </Pressable>
                )}

                <Pressable
                    onPress={onViewDetails}
                    className="flex-1 py-2.5 rounded-xl border items-center"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Details
                    </Text>
                </Pressable>
            </View>
        </View>
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