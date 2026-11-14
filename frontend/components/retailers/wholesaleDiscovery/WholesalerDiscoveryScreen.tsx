// components/retailers/wholesaleDiscovery/WholesalerDiscoveryScreen.tsx
//
// Wholesale marketplace, step 1: find a wholesaler. Mobile first, universal
// (one column on phones, two or three on wider screens).
//
//   Near me    adjacent wholesalers (device location + radius), nearest first
//   All Kenya  every wholesaler you can buy from, filter by county/sub-county
//   Search     by wholesaler (name, town, code) or by product
//
// Pharmaceutical retailers see pharmaceutical + general wholesalers; general
// retailers see general wholesalers (decided by the server). Tapping a
// wholesaler opens its marketplace (products + indent cart).

import type { DiscoveredWholesaler } from '@/api/wholesaleDiscoveryApi';
import { EmptyState, SearchField, SegmentedControl, useListTokens, webPointer } from '@/components/common/listScreen';
import WholesalerMarketplaceModal from '@/app/(retailers)/wholesaleMarketplace/WholesalerMarketplaceModal';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacePickerSheet } from './PlacePickerSheet';
import { RADIUS_OPTIONS, useWholesalerDiscovery, type SearchBy } from './useWholesalerDiscovery';
import { formatDistance, WholesalerCard } from './WholesalerCard';

const MAX_WIDTH = 1200;

function columnsFor(width: number) {
    if (width >= 1100) return 3;
    if (width >= 720) return 2;
    return 1;
}

/** Small pill button (radius, county, sub-county, search-by). */
function Pill({ label, active, icon, onPress, onClear, disabled }: { label: string; active?: boolean; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; onClear?: () => void; disabled?: boolean }) {
    const { theme, border } = useListTokens();
    return (
        <View
            className="flex-row items-center rounded-full border"
            style={{ borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}12` : 'transparent', opacity: disabled ? 0.45 : 1 }}
        >
            <Pressable
                onPress={onPress}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: !!active, disabled: !!disabled }}
                className="flex-row items-center gap-1.5 pl-3 h-9"
                style={{ paddingRight: onClear ? 4 : 12, ...webPointer }}
            >
                {icon ? <Ionicons name={icon} size={14} color={active ? theme.primary : theme.textDark} /> : null}
                <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }} numberOfLines={1}>
                    {label}
                </Text>
            </Pressable>
            {onClear ? (
                <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} className="pr-2.5 pl-1 h-9 justify-center" style={webPointer}>
                    <Ionicons name="close-circle" size={16} color={theme.primary} />
                </Pressable>
            ) : null}
        </View>
    );
}

export default function WholesalerDiscoveryScreen() {
    const { theme, divider } = useListTokens();
    const { user } = useAuth() as { user?: any };
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const d = useWholesalerDiscovery();

    const [picker, setPicker] = useState<'county' | 'subCounty' | null>(null);
    const [open, setOpen] = useState<DiscoveredWholesaler | null>(null);

    const columns = columnsFor(Math.min(width, MAX_WIDTH));
    const gutter = width >= 720 ? 24 : 16;
    const isPharmacy = user?.entity_type === 'PharmaceuticalRetailer';
    const productSearch = d.searchBy === 'product' && !!d.query.trim();

    const locationBlocked = d.mode === 'adjacent' && !d.coords && d.locationState !== 'locating' && d.locationState !== 'idle';
    const locating = d.mode === 'adjacent' && !d.coords && (d.locationState === 'locating' || d.locationState === 'idle');

    const summary = (() => {
        if (d.loading || locating) return null;
        const n = d.count;
        const what = `${n.toLocaleString()} wholesaler${n === 1 ? '' : 's'}`;
        if (d.mode === 'adjacent') return `${what} within ${d.radiusKm} km`;
        const where = d.subCounty?.title || d.county?.title;
        return where ? `${what} in ${where}` : `${what} across Kenya`;
    })();

    const renderItem = useCallback(
        ({ item }: { item: DiscoveredWholesaler }) => (
            <View style={{ flex: 1 / columns, padding: 6 }}>
                <WholesalerCard item={item} highlightProducts={productSearch} onOpen={() => setOpen(item)} />
            </View>
        ),
        [columns, productSearch]
    );

    const header = (
        <View style={{ paddingHorizontal: 6, paddingTop: 4, gap: 12 }}>
            {/* Title */}
            <View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: width >= 720 ? 24 : 20 }}>Wholesale marketplace</Text>
                <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    {isPharmacy ? 'Pharmaceutical and general wholesalers you can order from' : 'General wholesalers you can order from'}
                </Text>
            </View>

            {/* Near me / All Kenya */}
            <View style={{ maxWidth: 420, width: '100%' }}>
                <SegmentedControl
                    variant="mobile"
                    value={d.mode}
                    onChange={d.setMode}
                    options={[
                        { key: 'adjacent', label: 'Near me' },
                        { key: 'kenya', label: 'All Kenya' },
                    ]}
                />
            </View>

            {/* Search: by wholesaler or by product */}
            <View style={{ gap: 8 }}>
                <View className="flex-row gap-2">
                    {(
                        [
                            { key: 'wholesaler', label: 'Wholesaler', icon: 'business-outline' },
                            { key: 'product', label: 'Product', icon: 'cube-outline' },
                        ] as { key: SearchBy; label: string; icon: keyof typeof Ionicons.glyphMap }[]
                    ).map((o) => (
                        <Pill key={o.key} label={o.label} icon={o.icon} active={d.searchBy === o.key} onPress={() => d.setSearchBy(o.key)} />
                    ))}
                </View>
                <SearchField
                    value={d.query}
                    onChangeText={d.setQuery}
                    variant="mobile"
                    placeholder={d.searchBy === 'product' ? 'Search a product or scan code, e.g. Amoxicillin 500mg' : 'Search wholesalers by name, town or code'}
                />
            </View>

            {/* Mode filters */}
            {d.mode === 'adjacent' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
                    <Ionicons name="radio-outline" size={16} color={theme.textDark} />
                    {RADIUS_OPTIONS.map((km) => (
                        <Pill key={km} label={`${km} km`} active={d.radiusKm === km} onPress={() => d.setRadiusKm(km)} disabled={!d.coords} />
                    ))}
                </ScrollView>
            ) : (
                <View className="flex-row flex-wrap gap-2">
                    <Pill
                        label={d.county?.title ?? 'All counties'}
                        icon="map-outline"
                        active={!!d.county}
                        onPress={() => setPicker('county')}
                        onClear={d.county ? () => d.setCounty(null) : undefined}
                    />
                    <Pill
                        label={d.subCounty?.title ?? (d.county ? 'All sub-counties' : 'Sub-county')}
                        icon="location-outline"
                        active={!!d.subCounty}
                        disabled={!d.county}
                        onPress={() => setPicker('subCounty')}
                        onClear={d.subCounty ? () => d.setSubCounty(null) : undefined}
                    />
                </View>
            )}

            {/* Status line */}
            <View className="flex-row items-center pb-1" style={{ borderBottomWidth: 1, borderBottomColor: divider, minHeight: 28 }}>
                {locating ? (
                    <>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text className="ml-2" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                            Finding your location…
                        </Text>
                    </>
                ) : (
                    <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {summary ?? ' '}
                        {productSearch && summary ? ` stocking “${d.query.trim()}”` : ''}
                    </Text>
                )}
                {d.loading && !locating ? <ActivityIndicator size="small" color={theme.primary} /> : null}
            </View>

            {/* Near me with results: point out wholesalers that can't appear here */}
            {d.mode === 'adjacent' && !d.loading && d.results.length > 0 && d.unlocatedCount > 0 ? (
                <Pressable onPress={() => d.setMode('kenya')} className="flex-row items-center gap-1.5" style={webPointer}>
                    <Ionicons name="information-circle-outline" size={14} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>
                        +{d.unlocatedCount} without a map location · see All Kenya
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );

    const empty = (() => {
        if (locating || d.loading) return null;
        if (locationBlocked) {
            const message =
                d.locationState === 'denied'
                    ? 'Allow location access to see wholesalers near you.'
                    : d.locationState === 'off'
                        ? 'Turn on location on your device to see wholesalers near you.'
                        : "We couldn't read your location.";
            return (
                <View>
                    <EmptyState icon="navigate-outline" title="Location needed" message={message} actionLabel="Try again" onAction={() => void d.locate()} />
                    <Pressable onPress={() => d.setMode('kenya')} className="self-center -mt-10 px-4 py-2" style={webPointer}>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Browse all of Kenya instead</Text>
                    </Pressable>
                </View>
            );
        }
        if (d.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't load wholesalers" message={d.error} actionLabel="Retry" onAction={() => void d.retry()} />;
        if (productSearch) {
            return <EmptyState icon="cube-outline" title="No wholesaler stocks that" message={`Nobody ${d.mode === 'adjacent' ? `within ${d.radiusKm} km ` : ''}has “${d.query.trim()}” in stock. Try another name${d.mode === 'adjacent' ? ', a wider radius or All Kenya' : ''}.`} />;
        }
        if (d.mode === 'adjacent') {
            // The server says why: how far the nearest located wholesaler is, and
            // how many have no saved map location (those only show under All Kenya).
            const reach = d.nearestKm != null ? RADIUS_OPTIONS.find((km) => km >= d.nearestKm!) : undefined;
            const parts: string[] = [];
            if (d.nearestKm != null) parts.push(`The nearest wholesaler is ${formatDistance(d.nearestKm)} away.`);
            if (d.unlocatedCount > 0) {
                parts.push(`${d.unlocatedCount} wholesaler${d.unlocatedCount === 1 ? ' has' : 's have'} no map location yet, so ${d.unlocatedCount === 1 ? 'it only shows' : 'they only show'} under All Kenya.`);
            }
            if (d.nearestKm == null && d.unlocatedCount === 0) parts.push('No wholesalers you can order from are registered yet.');
            if (d.coords) parts.push(`Your location: ${d.coords.latitude.toFixed(4)}, ${d.coords.longitude.toFixed(4)}.`);
            return (
                <EmptyState
                    icon="business-outline"
                    title={`No wholesalers within ${d.radiusKm} km`}
                    message={parts.join(' ')}
                    actionLabel={reach ? `Search ${reach} km` : 'Browse all Kenya'}
                    onAction={() => (reach ? d.setRadiusKm(reach) : d.setMode('kenya'))}
                />
            );
        }
        return <EmptyState icon="business-outline" title="No wholesalers found" message="Try another county or clear your search." actionLabel="Clear filters" onAction={d.clearFilters} />;
    })();

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background ?? theme.surface }}>
            <FlatList
                key={`cols-${columns}`}
                data={locationBlocked ? [] : d.results}
                keyExtractor={(w) => w.id}
                renderItem={renderItem}
                numColumns={columns}
                ListHeaderComponent={header}
                ListEmptyComponent={empty}
                ListFooterComponent={
                    d.loadingMore ? (
                        <ActivityIndicator color={theme.primary} style={{ paddingVertical: 20 }} />
                    ) : d.results.length && !d.hasMore && d.results.length > 6 ? (
                        <Text className="text-center py-6" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            That’s everyone.
                        </Text>
                    ) : null
                }
                onEndReached={() => void d.loadMore()}
                onEndReachedThreshold={0.4}
                refreshControl={<RefreshControl refreshing={d.refreshing} onRefresh={() => void d.refresh()} tintColor={theme.primary} colors={[theme.primary]} />}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                style={{ flex: 1 }}
                contentContainerStyle={{
                    width: '100%',
                    maxWidth: MAX_WIDTH,
                    alignSelf: 'center',
                    paddingHorizontal: gutter - 6,
                    paddingTop: 12,
                    paddingBottom: 24 + insets.bottom,
                }}
            />

            <PlacePickerSheet
                visible={picker === 'county'}
                title="County"
                allLabel="All counties"
                options={d.counties}
                selectedId={d.county?.id}
                loading={d.placesLoading}
                onPick={(c) => {
                    d.setCounty(c);
                    setPicker(null);
                }}
                onClose={() => setPicker(null)}
            />
            <PlacePickerSheet
                visible={picker === 'subCounty'}
                title="Sub-county"
                allLabel={`All of ${d.county?.title ?? 'the county'}`}
                options={d.subCounties}
                selectedId={d.subCounty?.id}
                onPick={(s) => {
                    d.setSubCounty(s);
                    setPicker(null);
                }}
                onClose={() => setPicker(null)}
            />

            <WholesalerMarketplaceModal visible={!!open} onClose={() => setOpen(null)} wholesalerId={open?.id ?? ''} wholesalerTitle={open?.title} />
        </View>
    );
}
