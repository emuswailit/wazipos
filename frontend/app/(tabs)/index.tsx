import vendorsApi from "@/api/vendorsApi";
import { useAuth } from "@/context/AuthContext";
import BottomSheet from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ShopItem } from "@/components/DirectoryPanel";
import { MobileWorkspace } from "@/components/MobileWorkspace";
import useApi from "@/hooks/useApi";

export default function AdjacentShoppingScreen() {
    const { theme } = useAuth();
    const { height: screenHeight, width: screenWidth } = useWindowDimensions();

    const [shops, setShops] = useState<ShopItem[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isSheetReady, setIsSheetReady] = useState(false);
    const [isAppReady, setIsAppReady] = useState(Platform.OS === 'web');

    const mapRef = useRef<any>(null);
    const bottomSheetRef = useRef<BottomSheet>(null);

    const defaultLocation = useMemo(() => ({ latitude: -1.286389, longitude: 36.817223 }), []);
    const [userLocation, setUserLocation] = useState(defaultLocation);

    const isCurrentlyDarkMode = theme.surface !== "#f8fafc";
    const isLargeScreen = screenWidth >= 768;
    const snapPoints = useMemo(() => ['120', '50%', '85%'], []);

    const vendorLocationsApi = useApi<any>(async (payload: any) => {
        return await vendorsApi.vendorLocationsAction(payload);
    });

    useEffect(() => {
        if (Platform.OS === 'web') {
            // 🚀 WEB: Immediately load default fallback shops without calling any geolocation parameters
            loadAdjacentVendors(defaultLocation.latitude, defaultLocation.longitude);
        } else {
            initializeNativeScreen();
        }
    }, []);

    const initializeNativeScreen = async () => {
        let lat = defaultLocation.latitude;
        let lng = defaultLocation.longitude;
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const locationResult = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                lat = locationResult.coords.latitude;
                lng = locationResult.coords.longitude;
                setUserLocation({ latitude: lat, longitude: lng });
            }
        } catch (error) {
            console.warn("Native location tracking subsystem error: ", error);
        } finally {
            await loadAdjacentVendors(lat, lng);
            setIsAppReady(true);
        }
    };

    const loadAdjacentVendors = async (latitude: number, longitude: number) => {
        try {
            await vendorLocationsApi.request({
                "action": "GetLocationsWithDistances",
                "coords": { "latitude": latitude, "longitude": longitude }
            });
        } catch (e) {
            console.error("Failed to fetch vendors data:", e);
        }
    };

    useEffect(() => {
        if (vendorLocationsApi.data && Array.isArray(vendorLocationsApi.data)) {
            const mappedShops: ShopItem[] = vendorLocationsApi.data.map((x: any) => ({
                id: String(x.entity || x.id || Math.random().toString()),
                name: x.entity_title || x.name || "Unknown Supplier",
                latitude: x.point?.coordinates?.[1] ?? x.latitude ?? defaultLocation.latitude,
                longitude: x.point?.coordinates?.[0] ?? x.longitude ?? defaultLocation.longitude,
                category: x.entity_type || x.category || "General",
                distanceKm: parseFloat(x.distance_km || x.distanceKm || 0).toFixed(1) as any,
                rating: Number(x.rating || 0.0),
                reviewCount: Number(x.reviewCount || 0)
            }));

            const sortedShops = mappedShops.sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm));
            setShops(sortedShops);
            setIsSheetReady(true);
        }
    }, [vendorLocationsApi.data]);

    const categories = useMemo(() => ['All', ...Array.from(new Set(shops.map(s => s.category)))], [shops]);

    const filteredShops = useMemo(() => {
        return shops.filter(shop => {
            const matchesSearch = shop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                shop.category.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = !selectedCategory || selectedCategory === 'All' || shop.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [shops, searchQuery, selectedCategory]);

    const handleShopFocus = (shop: ShopItem) => {
        if (mapRef.current && Platform.OS !== 'web') {
            const region = { latitude: shop.latitude, longitude: shop.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 };
            if (typeof mapRef.current.animateToRegion === 'function') {
                mapRef.current.animateToRegion(region, 400);
            }
            bottomSheetRef.current?.collapse();
        }
    };

    const shouldShowLoader = !isAppReady || (vendorLocationsApi.loading && shops.length === 0);

    if (shouldShowLoader) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    // 🚀 FIXED: Return a clean, user-friendly fallback screen instead of rendering the dashboard on Web browsers
    if (Platform.OS === 'web') {
        return (
            <View style={[styles.center, { backgroundColor: isCurrentlyDarkMode ? '#0f172a' : '#f8fafc', padding: 24 }]}>
                <View style={[styles.card, { backgroundColor: isCurrentlyDarkMode ? '#1e293b' : '#ffffff', borderColor: isCurrentlyDarkMode ? '#334155' : '#e2e8f0' }]}>
                    <Text style={[styles.title, { color: isCurrentlyDarkMode ? '#f1f5f9' : '#0f172a' }]}>
                        Remote Shopping Feature
                    </Text>

                    <Text style={[styles.description, { color: isCurrentlyDarkMode ? '#94a3b8' : '#64748b' }]}>
                        Real-time adjacent market tracking and localized cluster maps are optimized exclusively for handheld devices.
                    </Text>

                    <View style={[styles.badge, { backgroundColor: isCurrentlyDarkMode ? '#334155' : '#f1f5f9' }]}>
                        <Text style={[styles.badgeText, { color: theme.primary || '#3b82f6' }]}>
                            📱 Please open this application on your mobile phone to experience full location-based shopping features.
                        </Text>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={styles.flexOne}>
            <View style={{ width: screenWidth, height: screenHeight }}>
                <MobileWorkspace
                    theme={theme}
                    isCurrentlyDarkMode={isCurrentlyDarkMode}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    categories={categories}
                    filteredShops={filteredShops}
                    onShopFocus={handleShopFocus}
                    mapRef={mapRef}
                    bottomSheetRef={bottomSheetRef}
                    snapPoints={snapPoints}
                    isSheetReady={isSheetReady}
                    userLocation={userLocation}
                />
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    flexOne: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    card: {
        width: '100%',
        maxWidth: 400,
        padding: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 12,
        textAlign: 'center',
    },
    description: {
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    badge: {
        padding: 16,
        borderRadius: 12,
        width: '100%',
    },
    badgeText: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 20,
    }
});
