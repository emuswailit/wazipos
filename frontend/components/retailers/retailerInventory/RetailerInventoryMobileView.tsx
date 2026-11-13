// components/retailers/retailerInventory/RetailerInventoryMobileView.tsx
//
// Small-screen view for the retailer's inventory (native apps and narrow web).
//   - Minimal header: one bar with search · filters · add, and one line of context.
//   - Filters (and sync status / refresh) live in a bottom sheet.
//   - No pagination: every item in one scrolling list; pull to refresh.
//   - Tapping a card opens the details modal (which has Edit).
//
// Pills, formatters and filters are shared with the web view.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    expiryLabel,
    expiryRelative,
    formatDate,
    formatKES,
    healthColor,
    INVENTORY_FILTER_COLORS,
    INVENTORY_FILTER_ICONS,
    INVENTORY_FILTER_LABELS,
    INVENTORY_FILTERS,
    isExpired,
    isExpiringSoon,
    isLowStock,
    itemImageUrl,
    preparationTitle,
    productTitle,
    StatusPill,
    statusToneOf,
    StockBar,
    stockQty,
    stockValue,
    unitPrice,
    type InventoryCounts,
    type InventoryFilter,
    type InventoryViewProps,
} from './RetailerInventoryWebView';

const isWeb = Platform.OS === 'web';

export function RetailerInventoryMobileView({
    query,
    setQuery,
    activeFilter,
    setActiveFilter,
    onOpenCreate,
    onRefresh,
    refreshing,
    isLiveConnected,
    lastSyncedTime,
    counts,
    totalValue,
    items,
    onView,
}: InventoryViewProps) {
    const { theme, isDarkMode } = useAuth();
    const [filtersOpen, setFiltersOpen] = useState(false);
    const searchBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const filtered = activeFilter !== 'ALL';
    const filterColor = INVENTORY_FILTER_COLORS[activeFilter] ?? theme.primary;
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
                        placeholder="Search inventory…"
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
                    accessibilityLabel={filtered ? `Filters, ${INVENTORY_FILTER_LABELS[activeFilter]} applied` : 'Filters'}
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
                    accessibilityLabel="Add stock"
                    className="w-11 h-11 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Ionicons name="add" size={22} color="#fff" />
                </Pressable>
            </View>

            {/* One line of context: live · count · value · active filter (tap ✕ to clear) */}
            <View className="flex-row items-center mt-2.5 px-1 gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isLiveConnected ? '#10b981' : '#f59e0b' }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {counts.visible.toLocaleString()} {counts.visible === 1 ? 'item' : 'items'} · KES {formatKES(totalValue)}
                </Text>
                <View className="flex-1" />
                {filtered ? (
                    <Pressable
                        onPress={() => setActiveFilter('ALL')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear ${INVENTORY_FILTER_LABELS[activeFilter]} filter`}
                        className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${filterColor}18` }}
                    >
                        <Text style={{ color: filterColor, fontFamily: theme.font.bold, fontSize: 11 }}>{INVENTORY_FILTER_LABELS[activeFilter]}</Text>
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
                keyExtractor={(item, idx) => `${item?.remote_id ?? item?.key ?? item?.id ?? 'item'}-${idx}`}
                ListHeaderComponent={header}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                ListEmptyComponent={<EmptyState hasActiveFilter={hasActiveFilter} onClearFilters={clearFilters} onAdd={onOpenCreate} />}
                renderItem={({ item }) => <InventoryCard item={item} onPress={onView} />}
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
                totalValue={totalValue}
                isLiveConnected={isLiveConnected}
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
    totalValue,
    isLiveConnected,
    lastSyncedTime,
    refreshing,
    onRefresh,
}: {
    visible: boolean;
    onClose: () => void;
    value: InventoryFilter;
    onChange: (f: InventoryFilter) => void;
    counts: InventoryCounts;
    totalValue: number;
    isLiveConnected: boolean;
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
                    {/* Grabber */}
                    <View className="items-center pt-2.5 pb-1">
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? '#334155' : '#cbd5e1' }} />
                    </View>

                    {/* Title row */}
                    <View className="flex-row items-center px-5 pt-2 pb-3">
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>Filter inventory</Text>
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
                        {/* Overview (what used to sit in the header) */}
                        <View className="flex-row gap-2 px-1 mb-4">
                            <Tile label="Stock value" value={`KES ${formatKES(totalValue)}`} color={theme.primary} bg={tileBg} />
                            <Tile label="Items" value={counts.total.toLocaleString()} color={theme.text} bg={tileBg} />
                        </View>

                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 0.6,
                                textTransform: 'uppercase',
                                marginLeft: 8,
                                marginBottom: 6,
                            }}
                        >
                            Show
                        </Text>
                        {INVENTORY_FILTERS.map((f) => {
                            const active = f === value;
                            const color = INVENTORY_FILTER_COLORS[f] ?? theme.primary;
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
                                        <Ionicons name={INVENTORY_FILTER_ICONS[f]} size={18} color={color} />
                                    </View>
                                    <Text style={{ flex: 1, color: active ? color : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                                        {INVENTORY_FILTER_LABELS[f]}
                                    </Text>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginRight: 10 }}>
                                        {(counts.byFilter?.[f] ?? 0).toLocaleString()}
                                    </Text>
                                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? color : theme.textDark} />
                                </Pressable>
                            );
                        })}

                        {/* Sync status + manual refresh (pull-to-refresh on the list works too) */}
                        <View className="flex-row items-center mx-2 mt-3 pt-4" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                            <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: isLiveConnected ? '#10b981' : '#f59e0b' }} />
                            <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                {isLiveConnected ? 'Live' : 'Offline'}
                                {lastSyncedTime ? ` · synced ${lastSyncedTime}` : ''}
                            </Text>
                            <Pressable
                                onPress={onRefresh}
                                disabled={refreshing}
                                accessibilityRole="button"
                                accessibilityLabel="Refresh inventory"
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
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{label}</Text>
            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 16, marginTop: 2 }} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

/* =========================================================
 * Card
 * ======================================================= */

const InventoryCard = memo(function InventoryCard({ item, onPress }: { item: any; onPress?: (item: any) => void }) {
    const { theme, isDarkMode } = useAuth();
    const qty = stockQty(item);
    const health = healthColor(item);
    const low = isLowStock(item);
    const notUploaded = item?.synced === false || !!item?.sync_error;
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';
    const sub = [item?.batch ? `Batch ${item.batch}` : null, item?.manufacturer_title].filter(Boolean).join(' · ');
    const rel = expiryRelative(item);
    const expiryWarn = isExpired(item) || isExpiringSoon(item);
    const showLow = low && !isExpired(item);
    const prep = preparationTitle(item);

    return (
        <Pressable
            onPress={() => onPress?.(item)}
            accessibilityRole="button"
            accessibilityLabel={`${productTitle(item)}, ${qty} in stock, ${expiryLabel(item).toLowerCase()}`}
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
                {/* Product + stock */}
                <View className="flex-row items-start gap-3">
                    <View className="w-12 h-12 rounded-2xl overflow-hidden items-center justify-center" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
                        <ImageWithFallback uri={itemImageUrl(item)} width={48} height={48} fallback="📦" fallbackSize={20} borderRadius={14} />
                    </View>
                    <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-1">
                            {/* Full title, wrapping as needed — never truncated */}
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15, lineHeight: 20, flexShrink: 1 }}>
                                {productTitle(item)}
                            </Text>
                            {notUploaded ? <Ionicons name="cloud-upload-outline" size={13} color={item?.sync_error ? '#ef4444' : '#f59e0b'} /> : null}
                        </View>
                        {prep ? (
                            <Text style={{ color: theme.primary, fontFamily: theme.font.semibold, fontSize: 13, lineHeight: 18, marginTop: 1 }}>
                                {prep}
                            </Text>
                        ) : null}
                        {sub ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                {sub}
                            </Text>
                        ) : null}
                    </View>
                    <View className="items-end">
                        <Text style={{ color: low ? health : theme.text, fontFamily: theme.font.bold, fontSize: 18 }} numberOfLines={1}>
                            {qty.toLocaleString()}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>in stock</Text>
                    </View>
                </View>

                <View className="mt-3">
                    <StockBar item={item} />
                </View>

                {/* Meta row */}
                <View className="flex-row items-center mt-3 pt-3 gap-3" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <StatusPill label={showLow ? 'LOW STOCK' : expiryLabel(item)} tone={showLow ? 'warning' : statusToneOf(item)} size="sm" />
                    <Meta icon="calendar-outline" text={rel && expiryWarn ? rel : formatDate(item?.expiry_date)} color={expiryWarn ? health : undefined} />
                    <View className="flex-1" />
                    <View className="items-end">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                            KES {formatKES(stockValue(item))}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 10 }} numberOfLines={1}>
                            @ {formatKES(unitPrice(item))}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={health} />
                </View>
            </View>
        </Pressable>
    );
});

function Meta({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
    const { theme } = useAuth();
    const c = color ?? theme.textDark;
    return (
        <View className="flex-row items-center gap-1 shrink">
            <Ionicons name={icon} size={13} color={c} />
            <Text style={{ color: c, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                {text}
            </Text>
        </View>
    );
}

/* =========================================================
 * Empty state
 * ======================================================= */

function EmptyState({ hasActiveFilter, onClearFilters, onAdd }: { hasActiveFilter: boolean; onClearFilters: () => void; onAdd: () => void }) {
    const { theme } = useAuth();
    return (
        <View className="py-14 items-center px-6">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name={hasActiveFilter ? 'search' : 'cube-outline'} size={24} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{hasActiveFilter ? 'No matching items' : 'No inventory yet'}</Text>
            <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                {hasActiveFilter ? 'Try a different search or filter.' : 'Add stock to start selling.'}
            </Text>
            <Pressable onPress={hasActiveFilter ? onClearFilters : onAdd} className="mt-4 px-5 h-10 rounded-full items-center justify-center" style={{ backgroundColor: theme.primary }}>
                <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                    {hasActiveFilter ? 'Clear filters' : 'Add stock'}
                </Text>
            </Pressable>
        </View>
    );
}
