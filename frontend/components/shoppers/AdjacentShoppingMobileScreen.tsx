// components/AdjacentShoppingMobileScreen.tsx
import { useAuth } from "@/context/AuthContext";
import { useAdjacentRetailShops } from "@/hooks/useAdjacentRetailShops";
import BottomSheet from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ShopItem } from "./DirectoryPanel";
import { MobileWorkspace } from "./MobileWorkspace";

// 🌟 Import the Error Modal
import ApiResponseModal, { extractEnvelope } from "@/components/common/ApiResponseModal";

export default function AdjacentShoppingMobileScreen() {
    const { theme, isDarkMode } = useAuth();

    const {
        filteredShops,
        categories,
        searchQuery,
        setSearchQuery,
        selectedCategories,
        toggleCategory,
        clearCategories,
        userLocation,
        isLoading,
        retryLocation,
        error, // 🌟 Assume your hook exposes the error envelope or message
    } = useAdjacentRetailShops();

    const mapRef = useRef<any>(null);
    const bottomSheetRef = useRef<BottomSheet>(null!);
    const snapPoints = useMemo(() => ["120", "50%", "85%"], []);

    // 🌟 State to control the error modal
    const [apiError, setApiError] = useState<{
        isOpen: boolean;
        title: string;
        envelope: any | null;
        fallbackMessage: string | null;
    }>({ isOpen: false, title: "", envelope: null, fallbackMessage: null });

    // 🌟 Listen for errors from the hook and show the modal
    useEffect(() => {
        if (error) {
            // If your hook returns a full API response object (e.g., res.data.errors)
            const envelope = extractEnvelope(error);

            setApiError({
                isOpen: true,
                title: "Subscription Required", // Or "Something went wrong"
                envelope: envelope.response_code ? envelope : null,
                fallbackMessage: !envelope.response_code ? (error.message || "Failed to load shops") : null,
            });
        }
    }, [error]);

    const handleShopFocus = useCallback((shop: ShopItem) => {
        const map = mapRef.current;
        if (map && typeof map.animateToRegion === "function") {
            map.animateToRegion(
                {
                    latitude: shop.latitude,
                    longitude: shop.longitude,
                    latitudeDelta: 0.012,
                    longitudeDelta: 0.012,
                },
                400
            );
        }
        bottomSheetRef.current?.collapse();
    }, []);

    const handleCategoryToggle = (category: string) => {
        if (!userLocation) {
            Alert.alert(
                "Location Required",
                "Please ensure your device location is enabled before filtering by category."
            );
            return;
        }
        toggleCategory(category);
    };

    const mappedShops: ShopItem[] = useMemo(() => {
        return (filteredShops || []).map((shop) => ({
            id: shop.id,
            name: shop.name,
            category: shop.primaryCategory,
            latitude: shop.latitude,
            longitude: shop.longitude,
            distanceKm: shop.distanceKm,
            address: shop.entityType,
            rating: shop.rating,
            reviewCount: 0,
        }));
    }, [filteredShops]);

    if (isLoading) {
        return (
            <View
                className="flex-1 items-center justify-center"
                style={{ backgroundColor: theme.colors.background }}
            >
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <GestureHandlerRootView className="flex-1">
            <View className="flex-1">
                <MobileWorkspace
                    theme={theme}
                    isCurrentlyDarkMode={isDarkMode}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategories={selectedCategories}
                    onToggleCategory={handleCategoryToggle}
                    onClearCategories={clearCategories}
                    categories={categories}
                    filteredShops={mappedShops}
                    onShopFocus={handleShopFocus}
                    mapRef={mapRef}
                    bottomSheetRef={bottomSheetRef}
                    snapPoints={snapPoints}
                    userLocation={userLocation}
                    onRefresh={retryLocation}
                />
            </View>

            {/* 🌟 Render the Error Modal */}
            <ApiResponseModal
                isOpen={apiError.isOpen}
                variant="error"
                title={apiError.title}
                envelope={apiError.envelope}
                fallbackMessage={apiError.fallbackMessage}
                onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                closeLabel="Dismiss"
                onRetry={() => {
                    setApiError((prev) => ({ ...prev, isOpen: false }));
                    retryLocation(); // Or refetch logic
                }}
            />
        </GestureHandlerRootView>
    );
}