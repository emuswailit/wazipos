import React from 'react';
import { View } from 'react-native';
import { CustomMapView } from './CustomMapView';
// 🌟 FIX: Pull DirectoryPanel in as a default import (remove curly braces)
// while retaining the named interface ShopItem import contract
import DirectoryPanel, { ShopItem } from './DirectoryPanel';

interface DesktopWorkspaceProps {
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
    onShopFocus: (shop: ShopItem) => void;
}

export function DesktopWorkspace({
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
    onShopFocus,
}: DesktopWorkspaceProps) {
    return (
        <View className="flex-1 flex-row w-full h-full">
            {/* Left Sidebar Panel */}
            <View
                className="w-1/3 h-full p-6 flex flex-col border-r border-slate-200 dark:border-slate-800"
                style={{ backgroundColor: theme.background }}
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
                    isMobileSheet={false} // ✅ Keeps standard layouts active on desktop browser profiles
                />
            </View>

            {/* Main Map Panel */}
            <View className="w-2/3 h-full relative">
                <CustomMapView
                    ref={mapRef}
                    userLocation={userLocation}
                    filteredShops={filteredShops}
                    theme={theme}
                    isCurrentlyDarkMode={isCurrentlyDarkMode}
                />
            </View>
        </View>
    );
}
