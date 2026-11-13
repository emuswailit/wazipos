// components/retailers/stockOuts/RetailerOutOfStocksMobileView.tsx
//
// Small-screen view for the retailer's out-of-stocks (native apps and narrow web),
// styled like Inventory:
//   - Minimal header: one bar with search · filters · add, and one line of context.
//   - Filters (and sync status / refresh) live in a bottom sheet.
//   - No pagination: every request in one scrolling list; pull to refresh.
//   - Tapping a card opens the details; the offers chip opens the offers.
//
// Pills, formatters and filters are shared with the web view.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import { useAuth } from '@/context/AuthContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    formatDate,
    OffersChip,
    sourceDotColor,
    StateBadge,
    STOCKOUT_FILTER_COLORS,
    STOCKOUT_FILTER_ICONS,
    STOCKOUT_FILTER_LABELS,
    STOCKOUT_FILTERS,
    stockOutImageUrl,
    stockOutState,
    stockOutTitle,
    type SourceTone,
    type StockOutCounts,
    type StockOutFilter,
    type StockOutsViewProps,
} from './RetailerOutOfStocksWebView';

const isWeb = Platform.OS === 'web';

export function RetailerOutOfStocksMobileView({
    query,
    setQuery,
    activeFilter,
    setActiveFilter,
    onOpenCreate,
    onRefresh,
    refreshing,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    counts,
    items,
    emptyComponent,
    onViewOffers,
    onPressItem,
}: StockOutsViewProps) {
    const { theme, isDarkMode } = useAuth();
    const [filtersOpen, setFiltersOpen] = useState(false);
    const searchBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const filtered = activeFilter !== 'ALL';
    const filterColor = STOCKOUT_FILTER_COLORS[activeFilter] ?? theme.primary;
    const hasActiveFilter = filtered || query.trim() !== '';
    const clearFilters = () => {
        if (filtered) setActiveFilter('ALL');
        if (query.trim() !== '') setQuery('');
    };

    const header = (
        <View className="pb-3">
            {/* Search · filters · add */}
            <View className="flex-row items-center gap-2">
                <View className="flex-1 flex-row items-center h-11 rounded-2xl px-3.5" style={{ backgroundColor: searchBg }}>
                    <Ionicons name="search" size={17} color={theme.textDark} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search out of stock…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        className="flex-1 h-full ml-2"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: 13,
                            ...(isWeb ? ({ outlineStyle: 'none' } as any) : {}),
                        }}
                    />
                    {query ? (
                        <Pressable onPress={() => setQuery('')} hitSlop={10}>
                            <Ionicons name="close-circle" size={17} color={theme.textDark} />
                        </Pressable>
                    ) : null}
                </View>

                <Pressable
                    onPress={() => setFiltersOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={filtered ? `Filters, ${STOCKOUT_FILTER_LABELS[activeFilter]} applied` : 'Filters'}
                    className="w-11 h-11 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: filtered ? `${filterColor}18` : searchBg }}
                >
                    <Ionicons name="options-outline" size={19} color={filtered ? filterColor : theme.text} />
                    {filtered ? (
                        <View
                            style={{
                                position: 'absolute',
                                top: 7,
                                right: 7,
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: filterColor,
                                borderWidth: 1.5,
                                borderColor: theme.background,
                            }}
                        />
                    ) : null}
                </Pressable>

                <Pressable
                    onPress={onOpenCreate}
                    accessibilityRole="button"
                    accessibilityLabel="Add out-of-stock"
                    className="w-11 h-11 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Ionicons name="add" size={22} color="#fff" />
                </Pressable>
            </View>

            {/* One line of context: source · count · waiting · active filter (tap ✕ to clear) */}
            <View className="flex-row items-center mt-2.5 px-1 gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sourceDotColor(sourceTone) }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {counts.visible.toLocaleString()} {counts.visible === 1 ? 'request' : 'requests'}
                    {counts.pending > 0 ? ` · ${counts.pending} waiting` : ''}
                </Text>
                <View className="flex-1" />
                {filtered ? (
                    <Pressable
                        onPress={() => setActiveFilter('ALL')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear ${STOCKOUT_FILTER_LABELS[activeFilter]} filter`}
                        className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${filterColor}18` }}
                    >
                        <Text style={{ color: filterColor, fontFamily: theme.font.bold, fontSize: 11 }}>{STOCKOUT_FILTER_LABELS[activeFilter]}</Text>
                        <Ionicons name="close" size={12} color={filterColor} />
                    </Pressable>
                ) : null}
            </View>
        </View>
    );

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <FlatList
                data={items}
                keyExtractor={(item, idx) => `${item.remote_id || item.draft_id || 'oos'}-${idx}`}
                ListHeaderComponent={header}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                ListEmptyComponent={
                    !hasActiveFilter && emptyComponent ? (
                        <>{emptyComponent}</>
                    ) : (
                        <EmptyState hasActiveFilter={hasActiveFilter} onClearFilters={clearFilters} onAdd={onOpenCreate} />
                    )
                }
                renderItem={({ item }) => <StockOutCard item={item} onPress={onPressItem} onViewOffers={onViewOffers} />}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                windowSize={11}
            />

            <FiltersSheet
                visible={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                value={activeFilter}
                onChange={(f) => {
                    setActiveFilter(f);
                    setFiltersOpen(false);
                }}
                counts={counts}
                sourceLabel={sourceLabel}
                sourceTone={sourceTone}
                lastSyncedTime={lastSyncedTime}
                refreshing={refreshing}
                onRefresh={onRefresh}
            />
        </View>
    );
}

/* =========================================================
 * Filters bottom sheet
 * ======================================================= */

function FiltersSheet({
    visible,
    onClose,
    value,
    onChange,
    counts,
    sourceLabel,
    sourceTone,
    lastSyncedTime,
    refreshing,
    onRefresh,
}: {
    visible: boolean;
    onClose: () => void;
    value: StockOutFilter;
    onChange: (f: StockOutFilter) => void;
    counts: StockOutCounts;
    sourceLabel: string;
    sourceTone: SourceTone;
    lastSyncedTime: string;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const insets = useSafeAreaInsets();
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';
    const tileBg = isDarkMode ? '#0f172a' : '#f8fafc';

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close filters"
                    onPress={onClose}
                    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
                />
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        paddingBottom: insets.bottom + 16,
                        maxHeight: '85%',
                        width: '100%',
                        maxWidth: 640,
                        alignSelf: 'center',
                    }}
                >
                    <View className="items-center pt-2.5 pb-1">
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? '#334155' : '#cbd5e1' }} />
                    </View>

                    <View className="flex-row items-center px-5 pt-2 pb-3">
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>Filter out of stock</Text>
                        {value !== 'ALL' ? (
                            <Pressable onPress={() => onChange('ALL')} hitSlop={8} style={{ marginRight: 16 }}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Reset</Text>
                            </Pressable>
                        ) : null}
                        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                            <Ionicons name="close" size={22} color={theme.textDark} />
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingHorizontal: 12 }}>
                        {/* Overview */}
                        <View className="flex-row gap-2 px-1 mb-4">
                            <Tile label="Requests" value={counts.total.toLocaleString()} color={theme.text} bg={tileBg} />
                            <Tile label="Waiting" value={counts.pending.toLocaleString()} color="#f59e0b" bg={tileBg} />
                            <Tile label="With offers" value={counts.withOffers.toLocaleString()} color="#10b981" bg={tileBg} />
                        </View>

                        <Text
                            style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 8, marginBottom: 6 }}
                        >
                            Show
                        </Text>
                        {STOCKOUT_FILTERS.map((f) => {
                            const active = f === value;
                            const color = STOCKOUT_FILTER_COLORS[f] ?? theme.primary;
                            return (
                                <Pressable
                                    key={f}
                                    onPress={() => onChange(f)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: active }}
                                    className="flex-row items-center px-3 py-3 rounded-2xl mb-1"
                                    style={({ pressed }) => ({ backgroundColor: active ? `${color}14` : pressed ? divider : 'transparent' })}
                                >
                                    <View className="w-9 h-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${color}18` }}>
                                        <Ionicons name={STOCKOUT_FILTER_ICONS[f]} size={18} color={color} />
                                    </View>
                                    <Text style={{ flex: 1, color: active ? color : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{STOCKOUT_FILTER_LABELS[f]}</Text>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginRight: 10 }}>
                                        {(counts.byFilter?.[f] ?? 0).toLocaleString()}
                                    </Text>
                                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? color : theme.textDark} />
                                </Pressable>
                            );
                        })}

                        {/* Sync status + manual refresh (pull-to-refresh on the list works too) */}
                        <View className="flex-row items-center mx-2 mt-3 pt-4" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                            <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: sourceDotColor(sourceTone) }} />
                            <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                {sourceLabel}
                                {lastSyncedTime ? ` · synced ${lastSyncedTime}` : ''}
                            </Text>
                            <Pressable
                                onPress={onRefresh}
                                disabled={refreshing}
                                accessibilityRole="button"
                                accessibilityLabel="Refresh out-of-stocks"
                                className="flex-row items-center gap-1.5 px-3 h-9 rounded-full"
                                style={{ backgroundColor: `${theme.primary}14`, opacity: refreshing ? 0.5 : 1 }}
                            >
                                <Ionicons name="refresh" size={15} color={theme.primary} />
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
                            </Pressable>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function Tile({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
    const { theme } = useAuth();
    return (
        <View className="flex-1 rounded-2xl px-3.5 py-3" style={{ backgroundColor: bg }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                {label}
            </Text>
            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 16, marginTop: 2 }} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

const StockOutCard = memo(function StockOutCard({
    item,
    onPress,
    onViewOffers,
}: {
    item: RetailerOutOfStockNormalized;
    onPress: (item: RetailerOutOfStockNormalized) => void;
    onViewOffers: (item: RetailerOutOfStockNormalized) => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';
    const isDraft = stockOutState(item) === 'draft';
    const qty = Number(item.required_quantity ?? 0);
    const customer = [item.customer_name, item.customer_phone].filter(Boolean).join(' · ');

    return (
        <Pressable
            onPress={() => onPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`${stockOutTitle(item)}, ${qty} needed`}
            style={({ pressed }) => ({
                backgroundColor: theme.panel,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDarkMode ? '#1e293b' : '#eef2f7',
                transform: [{ scale: pressed ? 0.985 : 1 }],
                ...(isWeb
                    ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.05)', cursor: 'pointer' } as any)
                    : { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }),
            })}
        >
            <View className="p-4">
                {/* Product + quantity needed */}
                <View className="flex-row items-start gap-3">
                    <View className="w-12 h-12 rounded-2xl overflow-hidden items-center justify-center" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
                        <ImageWithFallback uri={stockOutImageUrl(item)} width={48} height={48} fallback="📦" fallbackSize={20} borderRadius={14} />
                    </View>
                    <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-1">
                            {/* Full title, wrapping as needed — never truncated */}
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15, lineHeight: 20, flexShrink: 1 }}>{stockOutTitle(item)}</Text>
                            {isDraft ? <Ionicons name="cloud-upload-outline" size={13} color="#3b82f6" /> : null}
                        </View>
                        <View className="flex-row items-center gap-1 mt-0.5">
                            <Ionicons name="person-outline" size={12} color={theme.textDark} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                                {customer || 'Walk-in customer'}
                            </Text>
                        </View>
                        {item.is_special_order ? (
                            <View className="flex-row items-center gap-1 mt-1">
                                <Ionicons name="star" size={11} color="#8b5cf6" />
                                <Text style={{ color: '#8b5cf6', fontFamily: theme.font.bold, fontSize: 11 }}>Special order</Text>
                            </View>
                        ) : null}
                    </View>
                    <View className="items-end">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }} numberOfLines={1}>
                            {qty.toLocaleString()}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>needed</Text>
                    </View>
                </View>

                {/* Meta row */}
                <View className="flex-row items-center flex-wrap mt-3 pt-3 gap-2" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <StateBadge item={item} size="sm" />
                    <OffersChip item={item} onPress={() => onViewOffers(item)} size="sm" />
                    <View className="flex-1" />
                    <View className="flex-row items-center gap-1">
                        <Ionicons name="calendar-outline" size={12} color={theme.textDark} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{formatDate(item.created)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textDark} />
                </View>
            </View>
        </Pressable>
    );
});

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({ hasActiveFilter, onClearFilters, onAdd }: { hasActiveFilter: boolean; onClearFilters: () => void; onAdd: () => void }) {
    const { theme } = useAuth();
    return (
        <View className="py-14 items-center px-6">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name={hasActiveFilter ? 'search' : 'alert-circle-outline'} size={24} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{hasActiveFilter ? 'No matching requests' : 'No out-of-stocks yet'}</Text>
            <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                {hasActiveFilter ? 'Try a different search or filter.' : 'Record products customers asked for that you don’t have.'}
            </Text>
            <Pressable onPress={hasActiveFilter ? onClearFilters : onAdd} className="mt-4 px-5 h-10 rounded-full items-center justify-center" style={{ backgroundColor: theme.primary }}>
                <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                    {hasActiveFilter ? 'Clear filters' : 'Add out-of-stock'}
                </Text>
            </Pressable>
        </View>
    );
}
