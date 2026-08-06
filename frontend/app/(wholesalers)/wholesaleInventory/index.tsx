import { useAuth } from "@/context/AuthContext";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { StatusBar, Text, TextInput, View, useWindowDimensions } from "react-native";
import WholesaleInventoryList, { InventoryItem } from "./WholesaleInventoryList";

export default function WholesaleInventoryScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const [searchQuery, setSearchQuery] = useState("");

    const mockInventory: InventoryItem[] = useMemo(() => [
        {
            id: "1",
            sku: "WHL-CCOOK-3L",
            title: "CAPTAIN COOK COOKING OIL 3 LITRES",
            category: "General Merchandise",
            stockQty: 45,
            packSize: "4 PCS/CS",
            wholesalePrice: 2450,
            reorderLevel: 50,
            imageUrl: "https://wazipos.co.ke"
        },
        {
            id: "2",
            sku: "WHL-AMPIX-500",
            title: "AMPIMOX 500MG CAPSULES",
            category: "Pharmaceuticals",
            stockQty: 340,
            packSize: "1000'S",
            wholesalePrice: 4200,
            reorderLevel: 100,
            imageUrl: "https://unsplash.com"
        },
        {
            id: "3",
            sku: "WHL-PANAD-EXT",
            title: "PANADOL EXTRA ADVANCE TABLETS",
            category: "Pharmaceuticals",
            stockQty: 12,
            packSize: "24x12'S",
            wholesalePrice: 1850,
            reorderLevel: 30,
            imageUrl: "https://unsplash.com"
        }
    ], []);

    const filteredInventory = useMemo(() => {
        return mockInventory.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [mockInventory, searchQuery]);

    const handleItemInspect = (item: InventoryItem) => {
        console.log("Inspecting inventory parameter card payload:", JSON.stringify(item));
    };

    const handleReorderDispatch = (item: InventoryItem) => {
        console.log("Reorder trigger dispatched for stock item:", item.sku);
    };

    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            <Stack.Screen options={{ headerShown: false }} />
            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6">
                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <View className="flex-row items-center gap-x-2">
                            <Text style={{ color: isDarkMode ? "#ffffff" : theme.primary }} className="text-2xl font-black tracking-tight">Wholesale Inventory</Text>
                            <View style={{ backgroundColor: theme.primary + "15" }} className="px-2 py-0.5 rounded-lg border border-slate-700/5">
                                <Text style={{ color: theme.primary }} className="text-xs font-black">{filteredInventory.length} {filteredInventory.length === 1 ? "Record" : "Records"}</Text>
                            </View>
                        </View>
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-0.5">Track real-time bulk physical assets, reorder points parameters, and SKU quantities.</Text>
                    </View>
                    <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                        <TextInput className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none" style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }} placeholder="Filter by title, SKU, category..." placeholderTextColor="#94A3B8" value={searchQuery} onChangeText={setSearchQuery} />
                    </View>
                </View>
                {filteredInventory.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No active inventory ledger allocations found.</Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <WholesaleInventoryList items={filteredInventory} isLargeScreen={width >= 768} theme={theme} cardBorderClass={cardBorderColor} onItemPress={handleItemInspect} onReorderTrigger={handleReorderDispatch} />
                    </View>
                )}
            </View>
        </View>
    );
}
