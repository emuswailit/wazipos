// app/(wholesalers)/wholesaleInventory/InventoryFilters.tsx

import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";

interface FilterProps {
    onSearchChange: (text: string) => void;
    onStockFilterChange: (status: string) => void;
    onSortChange: (criterion: string) => void;
}

export default function InventoryFilters({ onSearchChange, onStockFilterChange, onSortChange }: FilterProps) {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [showFilters, setShowFilters] = useState(false);
    const [activeStock, setActiveStock] = useState("all");
    const [activeSort, setActiveSort] = useState("name");

    const handleStockSelect = (status: string) => {
        setActiveStock(status);
        onStockFilterChange(status);
    };

    const handleSortSelect = (criterion: string) => {
        setActiveSort(criterion);
        onSortChange(criterion);
    };

    return (
        <View className="mx-4 md:mx-6 mt-4">
            <View className="flex-row space-x-2 items-center justify-between">

                {/* Search Field Block Input */}
                <View style={{ backgroundColor: theme.panel }} className="flex-1 flex-row items-center px-3.5 py-3 md:py-2.5 rounded-2xl md:rounded-xl space-x-2 shadow-sm border border-slate-100 dark:border-slate-800">
                    <Text className="text-sm">🔍</Text>
                    <TextInput
                        placeholder="Search items..."
                        placeholderTextColor={theme.textDark}
                        style={{ color: theme.text }}
                        className="flex-1 font-medium text-sm p-0 outline-none"
                        onChangeText={onSearchChange}
                    />
                </View>

                {/* Mobile Accordion Drawer Toggle */}
                {!isLargeScreen && (
                    <TouchableOpacity
                        onPress={() => setShowFilters(!showFilters)}
                        style={{ backgroundColor: showFilters ? theme.primary : theme.panel }}
                        className="p-3.5 rounded-2xl items-center justify-center border border-slate-100 dark:border-slate-800 shadow-sm"
                    >
                        <Text style={{ color: showFilters ? "#ffffff" : theme.text }} className="text-sm">⚙️</Text>
                    </TouchableOpacity>
                )}

                {/* Desktop View Segmentation Elements */}
                {isLargeScreen && (
                    <View className="flex-row items-center space-x-2 mx-2">
                        {["all", "in-stock", "low-stock"].map((status) => (
                            <TouchableOpacity
                                key={status}
                                onPress={() => handleStockSelect(status)}
                                style={{ backgroundColor: activeStock === status ? theme.primary : "transparent" }}
                                className={`px-3 py-1.5 rounded-xl border ${activeStock === status ? "border-transparent" : "border-slate-200 dark:border-slate-800"}`}
                            >
                                <Text style={{ color: activeStock === status ? "#ffffff" : theme.textDark }} className="text-xs font-semibold capitalize">{status.replace("-", " ")}</Text>
                            </TouchableOpacity>
                        ))}

                        <select
                            value={activeSort}
                            onChange={(e) => handleSortSelect(e.target.value)}
                            style={{ color: theme.text, backgroundColor: theme.panel }}
                            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 outline-none cursor-pointer"
                        >
                            <option value="name">Sort: Name</option>
                            <option value="price-asc">Price: Low-High</option>
                            <option value="price-desc">Price: High-Low</option>
                        </select>
                    </View>
                )}
            </View>

            {/* Mobile Expanding segment drawer */}
            {!isLargeScreen && showFilters && (
                <View style={{ backgroundColor: theme.panel }} className="p-4 rounded-2xl mt-3 shadow-md border border-slate-100 dark:border-slate-800 space-y-3">
                    <View className="flex-row flex-wrap gap-1.5">
                        {["all", "in-stock", "low-stock"].map((status) => (
                            <TouchableOpacity
                                key={status}
                                onPress={() => handleStockSelect(status)}
                                style={{ backgroundColor: activeStock === status ? theme.primary + "15" : theme.background }}
                                className="px-3 py-2 rounded-xl flex-row items-center space-x-1"
                            >
                                <Text style={{ color: activeStock === status ? theme.primary : theme.textDark }} className="text-xs font-semibold capitalize">{status}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
}
