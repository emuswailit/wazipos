// components/shoppers/AdjacentShopsScreen.tsx
//
// Adjacent Stores — one responsive screen for phones, tablets and the web.
//
//   - Opens by asking for the shopper's location (prompting them to turn it on).
//   - Lists shops and pharmacies near them, nearest first, each with how far
//     it is and how it can deliver at that distance:
//         under 5 km   walking delivery or rider
//         5 - 20 km    rider
//         over 20 km   rider or long-haul courier
//   - Second line: browse by county / sub-county (location off, or further afield).
//   - Tapping a shop opens its shop front with the shopper's location, so
//     delivery is priced straight away and the order is paid by M-Pesa.

import ApiResponseModal from '@/components/common/ApiResponseModal';
import LocationFilterBar from '@/components/common/LocationFilterBar';
import { FilterChips, SearchField, SegmentedControl, useListTokens } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { deliveryHint, formatKm, useNearbyShops, type NearbyShop } from '@/hooks/useNearbyShops';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { CustomMapView } from './CustomMapView';

type View_ = 'LIST' | 'MAP';

/** Smaller label text on narrow phones so button labels fit their buttons. */
function useLabelSize() {
    const { width } = useWindowDimensions();
    return width < 360 ? 11.5 : width < 400 ? 12.5 : 13.5;
}

function Btn({
    label,
    icon,
    onPress,
    variant = 'primary',
    grow,
    disabled,
}: {
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    variant?: 'primary' | 'secondary';
    grow?: boolean;
    disabled?: boolean;
}) {
    const { theme, border } = useListTokens();
    const size = useLabelSize();
    const primary = variant === 'primary';
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="flex-row items-center justify-center rounded-xl px-3"
            style={({ pressed }) => ({
                minHeight: 42,
                gap: 6,
                flexGrow: grow ? 1 : 0,
                flexShrink: 1,
                opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
                backgroundColor: primary ? theme.primary : 'transparent',
                borderWidth: primary ? 0 : 1,
                borderColor: border,
            })}
        >
            {icon ? <Ionicons name={icon} size={size + 3} color={primary ? '#fff' : theme.text} /> : null}
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ flexShrink: 1, color: primary ? '#fff' : theme.text, fontFamily: theme.font.bold, fontSize: size }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

function ShopCard({ shop, onOpen }: { shop: NearbyShop; onOpen: () => void }) {
    const { theme, border, chipBg } = useListTokens();
    const hint = deliveryHint(shop.distanceKm);
    const place = [shop.town, shop.subCountyTitle, shop.countyTitle].filter(Boolean).join(', ');
    return (
        <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`Open ${shop.name}`}
            className="rounded-2xl p-3"
            style={({ pressed }) => ({ gap: 10, backgroundColor: theme.panel, borderWidth: 1, borderColor: border, opacity: pressed ? 0.9 : 1 })}
        >
            <View className="flex-row" style={{ gap: 12 }}>
                {shop.image ? (
                    <Image source={{ uri: shop.image }} style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: chipBg }} accessibilityIgnoresInvertColors />
                ) : (
                    <View className="items-center justify-center" style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: shop.isPharmacy ? '#10b9811a' : `${theme.primary}14` }}>
                        <Ionicons name={shop.isPharmacy ? 'medkit' : 'storefront'} size={24} color={shop.isPharmacy ? '#10b981' : theme.primary} />
                    </View>
                )}
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }} numberOfLines={2}>
                        {shop.name}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                        {[shop.isPharmacy ? 'Pharmacy' : shop.primaryCategory, place].filter(Boolean).join(' · ')}
                    </Text>
                    {shop.rating > 0 ? (
                        <View className="flex-row items-center" style={{ gap: 3 }}>
                            <Ionicons name="star" size={12} color="#f59e0b" />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 12 }}>{shop.rating.toFixed(1)}</Text>
                        </View>
                    ) : null}
                </View>
                {shop.distanceKm !== null ? (
                    <View className="items-end" style={{ gap: 2 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>
                            {shop.distanceKm < 1 ? `${Math.round(shop.distanceKm * 1000)} m` : `${shop.distanceKm < 10 ? shop.distanceKm.toFixed(1) : Math.round(shop.distanceKm)} km`}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>away</Text>
                    </View>
                ) : null}
            </View>
            {hint ? (
                <View className="flex-row items-center self-start rounded-full px-2.5 py-1" style={{ gap: 5, backgroundColor: chipBg }}>
                    <Ionicons name={shop.distanceKm !== null && shop.distanceKm < 5 ? 'walk-outline' : shop.distanceKm !== null && shop.distanceKm > 20 ? 'airplane-outline' : 'bicycle-outline'} size={13} color={theme.textDark} />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{hint}</Text>
                </View>
            ) : null}
        </Pressable>
    );
}

export default function AdjacentShopsScreen() {
    const { theme, border, chipBg } = useListTokens();
    const { isDarkMode } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const cols = width >= 1200 ? 3 : width >= 720 ? 2 : 1;
    const nearby = useNearbyShops();
    const { categories } = useCategories();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('ALL');
    const [view, setView] = useState<View_>('LIST');
    const [errorOpen, setErrorOpen] = useState(true);
    const mapRef = useRef<any>(null);

    const located = nearby.locationState === 'granted' && !!nearby.coords;
    const asking = nearby.locationState === 'asking';

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return nearby.shops.filter((s) => !q || `${s.name} ${s.primaryCategory} ${s.categories.join(' ')} ${s.town}`.toLowerCase().includes(q));
    }, [nearby.shops, query]);

    const pickCategory = (key: string) => {
        setCategory(key);
        nearby.setCategoryIds(key === 'ALL' ? [] : [key]);
    };

    const open = (shop: NearbyShop) => {
        const place = [shop.town, shop.subCountyTitle, shop.countyTitle].filter(Boolean).join(', ');
        router.push({
            pathname: '/shopFront/[id]',
            params: {
                id: shop.id,
                name: shop.name,
                type: shop.entityType,
                location: [shop.distanceKm !== null ? formatKm(shop.distanceKm) : null, place].filter(Boolean).join(' · '),
                lat: String(shop.latitude || ''),
                lng: String(shop.longitude || ''),
                ...(shop.distanceKm !== null ? { distance: String(shop.distanceKm) } : {}),
                ...(nearby.coords ? { userLat: String(nearby.coords.latitude), userLng: String(nearby.coords.longitude) } : {}),
            },
        } as any);
    };

    /* ---------------- location prompt ---------------- */
    const locationCard = !located ? (
        <View className="rounded-2xl p-4" style={{ gap: 12, backgroundColor: asking ? theme.panel : 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: asking ? border : 'rgba(245,158,11,0.4)' }}>
            <View className="flex-row items-start" style={{ gap: 12 }}>
                <View className="items-center justify-center" style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: asking ? `${theme.primary}14` : 'rgba(245,158,11,0.15)' }}>
                    {asking ? <ActivityIndicator color={theme.primary} /> : <Ionicons name="location-outline" size={22} color="#d97706" />}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                        {asking ? 'Finding where you are…' : nearby.locationState === 'denied' ? 'Allow location to see shops near you' : 'Turn on location to see shops near you'}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {asking ? 'Allow location when asked. We use it to show the nearest shops and price delivery.' : nearby.locationMessage}
                    </Text>
                </View>
            </View>
            {!asking ? (
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    <Btn label="Turn on location" icon="navigate" onPress={() => void nearby.requestLocation()} grow />
                    {nearby.mode !== 'COUNTY' ? <Btn label="Browse by county" icon="map-outline" variant="secondary" onPress={() => nearby.setMode('COUNTY')} grow /> : null}
                </View>
            ) : null}
        </View>
    ) : null;

    const header = (
        <View style={{ gap: 12 }}>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: width < 380 ? 20 : 24 }} numberOfLines={1}>
                        {nearby.mode === 'NEARBY' ? 'Shops near you' : 'Shops by area'}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                        {located ? 'Shops and pharmacies, nearest first' : 'Shops and pharmacies'}
                    </Text>
                </View>
                {located ? (
                    <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ gap: 4, backgroundColor: 'rgba(16,185,129,0.12)' }}>
                        <Ionicons name="navigate" size={12} color="#10b981" />
                        <Text style={{ color: '#047857', fontFamily: theme.font.bold, fontSize: 11 }}>Location on</Text>
                    </View>
                ) : null}
            </View>
            {locationCard}
            <SegmentedControl<'NEARBY' | 'COUNTY'>
                variant="mobile"
                value={nearby.mode}
                onChange={(m) => {
                    if (m === 'NEARBY' && !located) void nearby.requestLocation();
                    else nearby.setMode(m);
                }}
                options={[
                    { key: 'NEARBY', label: 'Near me' },
                    { key: 'COUNTY', label: 'By county' },
                ]}
            />
            {nearby.mode === 'COUNTY' ? (
                <View style={{ zIndex: 50 }}>
                    <LocationFilterBar
                        county={nearby.county}
                        subCounty={nearby.subCounty}
                        onChangeCounty={nearby.setCounty}
                        onChangeSubCounty={nearby.setSubCounty}
                        theme={theme}
                        isDarkMode={isDarkMode}
                        countyLabel="County"
                        subCountyLabel="Sub-county"
                        gap={8}
                        horizontal={width >= 520}
                    />
                </View>
            ) : null}
            <View className="flex-row items-center" style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <SearchField value={query} onChangeText={setQuery} placeholder="Search shops, pharmacies…" variant="mobile" />
                </View>
                <SegmentedControl<View_>
                    value={view}
                    onChange={setView}
                    options={[
                        { key: 'LIST', label: 'List' },
                        { key: 'MAP', label: 'Map' },
                    ]}
                />
            </View>
            <FilterChips<string>
                value={category}
                onChange={pickCategory}
                options={[{ key: 'ALL', label: 'All' }, ...categories.map((c: any) => ({ key: String(c.id), label: c.title }))]}
            />
        </View>
    );

    const empty = nearby.loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
    ) : nearby.mode === 'COUNTY' && !nearby.county ? (
        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 24 }}>Pick a county to see its shops and pharmacies.</Text>
    ) : (nearby.mode === 'NEARBY' && located) || nearby.mode === 'COUNTY' ? (
        <View className="items-center" style={{ gap: 10, marginTop: 24 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center' }}>
                {query || category !== 'ALL' ? 'No shops match.' : nearby.mode === 'NEARBY' ? 'No shops within 30 km of you yet.' : 'No shops in this area yet.'}
            </Text>
            {nearby.mode === 'NEARBY' ? <Btn label="Browse by county" icon="map-outline" variant="secondary" onPress={() => nearby.setMode('COUNTY')} /> : null}
        </View>
    ) : null;

    const center = nearby.coords ?? (shown[0] ? { latitude: shown[0].latitude, longitude: shown[0].longitude } : { latitude: -1.2864, longitude: 36.8172 });

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {view === 'MAP' ? (
                <View style={{ flex: 1 }}>
                    <View style={{ padding: 12, paddingBottom: 8, maxWidth: 1200, width: '100%', alignSelf: 'center', zIndex: 10 }}>{header}</View>
                    <View style={{ flex: 1, minHeight: 300, marginHorizontal: 12, marginBottom: 12, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: chipBg }}>
                        <CustomMapView
                            ref={mapRef}
                            userLocation={center}
                            filteredShops={shown.map((s) => ({ ...s, category: s.primaryCategory, address: s.town, reviewCount: 0, distanceKm: s.distanceKm ?? 0 }))}
                            theme={theme}
                            isCurrentlyDarkMode={isDarkMode}
                        />
                    </View>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 12, maxWidth: 1200, width: '100%', alignSelf: 'center' }}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={<RefreshControl refreshing={nearby.loading && shown.length > 0} onRefresh={nearby.refresh} tintColor={theme.primary} />}
                >
                    {header}
                    {shown.length ? (
                        <>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                                {shown.length} {shown.length === 1 ? 'shop' : 'shops'}
                                {nearby.loading ? ' · updating…' : ''}
                            </Text>
                            <View className="flex-row flex-wrap" style={{ margin: -6 }}>
                                {shown.map((s) => (
                                    <View key={s.id} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                                        <ShopCard shop={s} onOpen={() => open(s)} />
                                    </View>
                                ))}
                            </View>
                        </>
                    ) : (
                        empty
                    )}
                </ScrollView>
            )}
            <ApiResponseModal
                isOpen={!!nearby.error && errorOpen}
                variant="error"
                title="Couldn’t load shops"
                envelope={null}
                fallbackMessage={nearby.error}
                onClose={() => setErrorOpen(false)}
                closeLabel="Dismiss"
                onRetry={() => {
                    setErrorOpen(true);
                    nearby.refresh();
                }}
            />
        </View>
    );
}
