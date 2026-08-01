import BottomSheet from '@gorhom/bottom-sheet';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CustomMapView } from './CustomMapView';
// 🌟 FIX: Pull DirectoryPanel in as a default import (remove from curly braces)
// to perfectly match the default export structure defined in DirectoryPanel.tsx
import DirectoryPanel, { ShopItem } from './DirectoryPanel';

interface MobileWorkspaceProps {
    theme: any;
    isCurrentlyDarkMode: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    categories: string[];
    selectedCategory: string | null;
    setSelectedCategory: (category: string | null) => void;
    filteredShops: ShopItem[];
    userLocation: { latitude: number; longitude: number };
    mapRef: React.RefObject<any>;
    bottomSheetRef: React.RefObject<BottomSheet>;
    snapPoints: string[];
    isSheetReady: boolean;
    onShopFocus: (shop: ShopItem) => void;
}

export function MobileWorkspace({
    theme,
    isCurrentlyDarkMode,
    searchQuery,
    setSearchQuery,
    categories,
    selectedCategory,
    setSelectedCategory,
    filteredShops,
    userLocation,
    mapRef,
    bottomSheetRef,
    snapPoints,
    isSheetReady,
    onShopFocus,
}: MobileWorkspaceProps) {
    return (
        <View style={styles.mobileContainer}>
            {/* Background Interactive Map Layer */}
            <View style={StyleSheet.absoluteFillObject}>
                <CustomMapView
                    ref={mapRef}
                    userLocation={userLocation}
                    filteredShops={filteredShops}
                    theme={theme}
                    isCurrentlyDarkMode={isCurrentlyDarkMode}
                />
            </View>

            {/* Floating Bottom Sheet Tray Interface */}
            {isSheetReady && (
                <BottomSheet
                    ref={bottomSheetRef}
                    index={1}
                    snapPoints={snapPoints}
                    enablePanDownToClose={false}
                    backgroundStyle={{ backgroundColor: isCurrentlyDarkMode ? "#0f172a" : "#ffffff" }}
                    handleIndicatorStyle={{ backgroundColor: isCurrentlyDarkMode ? "#334155" : "#cbd5e1" }}
                >
                    <DirectoryPanel
                        theme={theme}
                        isCurrentlyDarkMode={isCurrentlyDarkMode}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        categories={categories}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        filteredShops={filteredShops}
                        onShopFocus={onShopFocus}
                        isMobileSheet={true} // 🌟 Active gesture sheet layers enabled natively
                    />
                </BottomSheet>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    mobileContainer: {
        flex: 1,
        width: '100%',
        height: '100%',
        position: 'relative',
    }
});
