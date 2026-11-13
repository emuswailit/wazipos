import BottomSheet from '@gorhom/bottom-sheet';
import { RefreshCw } from 'lucide-react-native';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CustomMapView } from './CustomMapView';
import DirectoryPanel, { ShopItem } from './DirectoryPanel';

interface MobileWorkspaceProps {
    theme: any;
    isCurrentlyDarkMode: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    categories: string[];
    selectedCategories: string[];
    onToggleCategory: (category: string) => void;
    onClearCategories: () => void;
    filteredShops: ShopItem[];
    userLocation: { latitude: number; longitude: number } | null;
    mapRef: React.RefObject<any>;
    bottomSheetRef: React.RefObject<BottomSheet>;
    snapPoints: string[];
    onShopFocus: (shop: ShopItem) => void;
    onRefresh: () => void;
}

export function MobileWorkspace({
    theme,
    isCurrentlyDarkMode,
    searchQuery,
    setSearchQuery,
    categories,
    selectedCategories,
    onToggleCategory,
    onClearCategories,
    filteredShops,
    userLocation,
    mapRef,
    bottomSheetRef,
    snapPoints,
    onShopFocus,
    onRefresh,
}: MobileWorkspaceProps) {

    const safeLocation = userLocation || { latitude: -1.2847502, longitude: 36.7464919 };

    return (
        <View className="flex-1 w-full h-full relative">
            <View className="absolute inset-0">
                <CustomMapView
                    ref={mapRef}
                    userLocation={safeLocation}
                    filteredShops={filteredShops}
                    theme={theme}
                    isCurrentlyDarkMode={isCurrentlyDarkMode}
                />
            </View>

            <BottomSheet
                ref={bottomSheetRef}
                index={1}
                snapPoints={snapPoints}
                enablePanDownToClose={false}
                backgroundStyle={{ backgroundColor: theme.colors.panel }}
                handleIndicatorStyle={{ backgroundColor: theme.colors.borderStrong || '#cbd5e1' }}
            >
                <View className="flex-1" style={{ backgroundColor: theme.colors.panel }}>

                    {/* Top Bar with Refresh */}
                    <View className="flex-row items-center justify-between px-4 py-2 border-b" style={{ borderBottomColor: theme.colors.border }}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 14, color: theme.colors.text }}>
                            Nearby Shops
                        </Text>
                        <TouchableOpacity
                            onPress={onRefresh}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                                backgroundColor: theme.colors.primary + '15',
                            }}
                        >
                            <RefreshCw size={14} color={theme.colors.primary} />
                            <Text style={{ marginLeft: 6, fontFamily: theme.font.bold, fontSize: 12, color: theme.colors.primary }}>
                                Refresh
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1">
                        <DirectoryPanel
                            theme={theme}
                            isCurrentlyDarkMode={isCurrentlyDarkMode}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            categories={categories}
                            selectedCategories={selectedCategories}
                            onToggleCategory={onToggleCategory}
                            onClearCategories={onClearCategories}
                            filteredShops={filteredShops}
                            onShopFocus={onShopFocus}
                            isMobileSheet={true}
                        />
                    </View>
                </View>
            </BottomSheet>
        </View>
    );
}