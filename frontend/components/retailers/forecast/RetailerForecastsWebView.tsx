// components/retailers/forecast/RetailerForecastsWebView.tsx

import { PaginationBar } from '@/components/retailers/stockOuts/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { RetailerForecastNormalized } from '@/databases/types';
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
import type { PageSize } from './RetailerForecastsList';

const TABLE_MAX_WIDTH = 1600;

const COLUMNS: { label: string; flex: number }[] = [
    { label: 'Product', flex: 2.8 },
    { label: 'Forecast', flex: 0.9 },
    { label: 'P10–P90', flex: 1.0 },
    { label: 'Best Offer', flex: 2.0 },
    { label: 'Campaigns', flex: 0.8 },
    { label: 'Expiry', flex: 0.8 },
    { label: 'Qty', flex: 0.5 },
    { label: 'Actions', flex: 1.6 },
];

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

export function RetailerForecastsWebView({
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
            {/* Header */}
            <View
                className="p-4 border-b"
                style={{ backgroundColor: theme.panel, borderBottomColor: borderColor }}
            >
                <View className="w-full self-center" style={{ maxWidth: TABLE_MAX_WIDTH }}>
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
                                    With offers
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

                    <View className="flex-row gap-2 mb-2">
                        <FilterInput label="Min / day" value={minAvgDaily} onChange={setMinAvgDaily} step={0.1} />
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
            </View>

            {/* Body */}
            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
                }
                contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: 'center' }}
            >
                <View className="w-full" style={{ maxWidth: TABLE_MAX_WIDTH }}>
                    <View
                        className="flex-row rounded-xl border px-3 py-2.5"
                        style={{ backgroundColor: theme.panel, borderColor }}
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
                                    No forecast rows match the filters.
                                </Text>
                            </View>
                        )
                    ) : (
                        items.map((item) => (
                            <TableRow
                                key={item.remote_id}
                                item={item}
                                inDraft={hasDraftItem(item)}
                                onViewOffers={() => onViewOffers(item)}
                                onViewDetails={() => onViewDetails(item)}
                                onRequestSupply={() => onRequestSupply(item)}
                                onPressItem={() => onPressItem(item)}
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
 * Table row
 * ======================================================= */
function TableRow({
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
    const bestOffer = item.wholesaler_offers[0];
    const hasOffersOrCampaigns = item.has_offers || item.has_campaigns;

    return (
        <View
            className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
            style={{ backgroundColor: theme.panel, borderColor }}
        >
            {/* Product */}
            <Pressable onPress={onViewDetails} style={{ flex: 2.8 }} className="min-w-0">
                <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text
                        className="text-[13px]"
                        style={{ color: theme.text, fontFamily: theme.font.bold, flexShrink: 1 }}
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

            {/* Forecast */}
            <Text className="text-[13px]" style={{ flex: 0.9, color: theme.text, fontFamily: theme.font.bold }}>
                {item.total_forecast.toFixed(0)}u
            </Text>

            {/* P10–P90 */}
            <Text className="text-[12px]" style={{ flex: 1.0, color: theme.textDark, fontFamily: theme.font.medium }}>
                {item.total_p10.toFixed(0)}–{item.total_p90.toFixed(0)}
            </Text>

            {/* Best offer */}
            <View style={{ flex: 2.0 }}>
                {bestOffer ? (
                    <View className="flex-row items-center gap-1.5 flex-wrap">
                        <Text
                            className="text-[12px]"
                            style={{ color: theme.text, fontFamily: theme.font.medium }}
                            numberOfLines={1}
                        >
                            {bestOffer.wholesaler_title || '—'}
                        </Text>
                        {bestOffer.in_placement ? (
                            <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}>
                                <Text className="uppercase tracking-wide" style={{ color: '#f59e0b', fontFamily: theme.font.bold, fontSize: 9 }}>
                                    Consignment
                                </Text>
                            </View>
                        ) : null}
                        {bestOffer.price_discount_percent > 0 ? (
                            <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
                                <Text className="uppercase tracking-wide" style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 9 }}>
                                    {bestOffer.price_discount_percent.toFixed(0)}% off
                                </Text>
                            </View>
                        ) : null}
                    </View>
                ) : (
                    <Text className="text-[12px]" style={{ color: theme.textDark, fontFamily: theme.font.medium, opacity: 0.6 }}>
                        No offers
                    </Text>
                )}
            </View>

            {/* Campaigns */}
            <Text
                className="text-[12px]"
                style={{
                    flex: 0.8,
                    color: item.has_campaigns ? '#f59e0b' : theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {item.wholesaler_campaigns.length}
            </Text>

            {/* Expiry */}
            <Text
                className="text-[12px]"
                style={{ flex: 0.8, color: theme.textDark, fontFamily: theme.font.medium }}
                numberOfLines={1}
            >
                {bestOffer?.days_to_expiry != null ? `${bestOffer.days_to_expiry}d` : '—'}
            </Text>

            {/* Qty */}
            <Text className="text-[13px]" style={{ flex: 0.5, color: theme.text, fontFamily: theme.font.bold }}>
                {item.required_quantity}
            </Text>

            {/* Actions */}
            <View className="flex-row gap-1.5" style={{ flex: 1.6 }}>
                {hasOffersOrCampaigns ? (
                    <Pressable
                        onPress={onViewOffers}
                        className="px-3 py-1.5 rounded-lg"
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
                        className="px-3 py-1.5 rounded-lg"
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
                    className="px-3 py-1.5 rounded-lg border"
                    style={{ borderColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{ color: theme.primary, fontFamily: theme.font.bold }}
                    >
                        Details
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Filter input
 * ======================================================= */
function FilterInput({
    label,
    value,
    onChange,
    step = 1,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    step?: number;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    return (
        <View
            className="flex-row items-center px-3 h-10 rounded-xl border gap-1.5"
            style={{ borderColor, backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 9 }}
            >
                {label}
            </Text>
            <Pressable onPress={() => onChange(Math.max(0, Number((value - step).toFixed(2))))} hitSlop={6}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 16, paddingHorizontal: 4 }}>
                    −
                </Text>
            </Pressable>
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                    minWidth: 26,
                    textAlign: 'center',
                }}
            >
                {step < 1 ? value.toFixed(1) : value}
            </Text>
            <Pressable onPress={() => onChange(Number((value + step).toFixed(2)))} hitSlop={6}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 16, paddingHorizontal: 4 }}>
                    +
                </Text>
            </Pressable>
        </View>
    );
}