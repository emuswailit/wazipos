import { FontAwesome } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetView } from '@gorhom/bottom-sheet';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
// 🌟 FIX 1: Import ScrollView from react-native-gesture-handler
import { ScrollView } from 'react-native-gesture-handler';

export interface ShopItem {
    id: string;
    name: string;
    category: string;
    latitude: number;
    longitude: number;
    distanceKm: number;
    address: string;
    rating: number;
    reviewCount: number;
}

interface DirectoryPanelProps {
    theme: any;
    isCurrentlyDarkMode: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    categories: string[];
    selectedCategories: string[];
    onToggleCategory: (category: string) => void;
    onClearCategories: () => void;
    filteredShops: ShopItem[];
    onShopFocus: (shop: ShopItem) => void;
    isMobileSheet?: boolean;
}

function StarRating({ rating, reviewCount, textColor }: { rating: number; reviewCount: number; textColor: string }) {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            stars.push(<FontAwesome key={i} name="star" size={12} color="#fbbf24" style={{ marginRight: 2 }} />);
        } else if (i - 0.5 <= rating) {
            stars.push(<FontAwesome key={i} name="star-half-full" size={12} color="#fbbf24" style={{ marginRight: 2 }} />);
        } else {
            stars.push(<FontAwesome key={i} name="star-o" size={12} color="#cbd5e1" style={{ marginRight: 2 }} />);
        }
    }
    return (
        <View className="flex-row items-center mt-1">
            <View className="flex-row mr-1.5">{stars}</View>
            <Text style={{ color: textColor }} className="text-[11px] font-bold mr-1">{rating.toFixed(1)}</Text>
            <Text className="text-[10px] text-slate-400">({reviewCount})</Text>
        </View>
    );
}

export default function DirectoryPanel({
    theme,
    isCurrentlyDarkMode,
    searchQuery,
    setSearchQuery,
    categories,
    selectedCategories,
    onToggleCategory,
    onClearCategories,
    filteredShops,
    onShopFocus,
    isMobileSheet = false,
}: DirectoryPanelProps) {

    const TargetContainer = isMobileSheet ? BottomSheetView : View;
    const TargetFlatList = isMobileSheet ? BottomSheetFlatList : FlatList;

    // Filter out "All" from the array if it exists, so we can render it as a fixed first chip
    const displayCategories = categories.filter(c => c.toLowerCase() !== 'all');

    const renderHeader = () => (
        <View className="w-full pt-2 mb-2">
            <View className="items-start mb-3">
                <Text style={{ color: theme.text }} className="text-xl font-black tracking-tight">
                    Adjacent Stores
                </Text>
            </View>

            {/* Search Bar Input */}
            <TextInput
                style={{
                    backgroundColor: theme.background,
                    borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#334155",
                    color: theme.text
                }}
                className="w-full rounded-xl px-4 h-[40px] border outline-none text-sm mb-3"
                placeholder="🔍 Search store name or category..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
            />

            {/* 
              🌟 FIX 2: Wrap the Gesture Handler ScrollView in a fixed-height View.
              If this View has no height, it collapses and prevents scrolling.
            */}
            <View style={{ height: 36, marginBottom: 8 }}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    contentContainerStyle={{ alignItems: 'center', paddingRight: 16 }}
                >
                    {/* "All" Chip */}
                    <TouchableOpacity
                        onPress={onClearCategories}
                        style={{
                            backgroundColor: selectedCategories.length === 0 ? theme.primary : theme.background
                        }}
                        className="px-3.5 h-[28px] rounded-full justify-center items-center mr-2"
                    >
                        <Text style={{ color: selectedCategories.length === 0 ? "#ffffff" : theme.text }} className="text-xs font-bold">
                            All
                        </Text>
                    </TouchableOpacity>

                    {/* Individual Category Chips */}
                    {displayCategories.map(cat => {
                        const isActive = selectedCategories.includes(cat);
                        return (
                            <TouchableOpacity
                                key={cat}
                                onPress={() => onToggleCategory(cat)}
                                style={{
                                    backgroundColor: isActive ? theme.primary : theme.background
                                }}
                                className="px-3.5 h-[28px] rounded-full justify-center items-center mr-2"
                            >
                                <Text style={{ color: isActive ? "#ffffff" : theme.text }} className="text-xs font-bold">
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );

    const renderShopCard = ({ item }: { item: ShopItem }) => (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onShopFocus(item)}
            style={{
                backgroundColor: theme.background === "#f8fafc" ? "#ffffff" : theme.panel,
                borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#334155"
            }}
            className="w-full p-4 rounded-2xl border flex-row justify-between items-center mb-3"
        >
            <View className="flex-1 pr-3 items-start">
                <View style={{ backgroundColor: theme.background }} className="px-2.5 py-0.5 rounded-full mb-1">
                    <Text style={{ color: theme.text }} className="text-[9px] font-extrabold uppercase tracking-wider">{item.category}</Text>
                </View>

                <Text style={{ color: theme.text }} className="font-bold text-base tracking-tight">{item.name}</Text>

                <StarRating rating={item.rating} reviewCount={item.reviewCount} textColor={theme.text} />

                <Text style={{ color: theme.textDark }} className="text-xs truncate w-full mt-1.5">{item.address}</Text>
            </View>
            <View style={{ backgroundColor: theme.primary + "15" }} className="px-3 py-2 rounded-xl items-center justify-center min-w-[70px]">
                <Text style={{ color: theme.primary }} className="font-black text-sm">{item.distanceKm}km</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <TargetContainer style={{ flex: 1 }}>
            <TargetFlatList
                data={filteredShops}
                keyExtractor={(item: any) => item.id}
                renderItem={renderShopCard}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true} // Crucial for Android
                ListEmptyComponent={
                    <View className="items-center justify-center py-8">
                        <Text style={{ color: theme.textDark }} className="text-xs font-bold">No suppliers matched your filter parameters.</Text>
                    </View>
                }
            />
        </TargetContainer>
    );
}

