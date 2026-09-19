// app/(wholesalers)/wholesaleInventory/InventoryTableComponent.tsx
import { useAuth } from "@/context/AuthContext";
import React from "react";
import { FlatList, Image, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { InventoryItem } from "./inventory";
import InventoryTableRow from "./InventoryTableRow";
interface InventoryProps {
    data: InventoryItem[];
    onRowPress: (item: InventoryItem) => void;
    onEditPress: (item: InventoryItem) => void;
    refreshControl?: React.ReactElement;
}
export default function InventoryTableComponent({ data, onRowPress, onEditPress, refreshControl }: InventoryProps) {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const getExpiryBadgeClasses = (status: string) => {
        const lowerStatus = status?.toLowerCase() || "";
        if (lowerStatus.includes("expired")) return "bg-red-500/10 text-red-500 dark:text-red-400";
        if (lowerStatus.includes("expires in")) return "bg-amber-500/10 text-amber-500 dark:text-amber-400";
        return "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400";
    };
    const safeData = Array.isArray(data) ? data.filter(Boolean) : [];
    if (isLargeScreen) {
        return (
            <ScrollView refreshControl={refreshControl} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} className="p-6">
                <ScrollView vertical className="flex-1">
                    <View style={{ backgroundColor: theme.panel }} className="rounded-2xl p-5 min-w-[1150px] overflow-hidden shadow-sm h-fit">
                        <View style={{ borderBottomColor: theme.background }} className="flex-row pb-4 border-b-2">
                            <Text style={{ color: theme.text }} className="flex-[2.2] font-bold text-xs uppercase tracking-wider px-2">Product Title Details</Text>
                            <Text style={{ color: theme.text }} className="flex-1 font-bold text-xs uppercase tracking-wider px-2">Batch Code</Text>
                            <Text style={{ color: theme.text }} className="flex-1 font-bold text-xs uppercase tracking-wider px-2">Stock Level</Text>
                            <Text style={{ color: theme.text }} className="flex-1 font-bold text-xs uppercase tracking-wider px-2">Cost Price</Text>
                            <Text style={{ color: theme.text }} className="flex-1 font-bold text-xs uppercase tracking-wider px-2">Selling MSRP</Text>
                            <Text style={{ color: theme.text }} className="flex-[1.3] font-bold text-xs uppercase tracking-wider px-2">Shelf Life Health</Text>
                            <Text style={{ color: theme.text }} className="w-28 font-bold text-xs uppercase tracking-wider px-2 text-center">Action</Text>
                        </View>
                        {safeData.map((item) => (
                            <InventoryTableRow key={item.id} item={item} theme={theme} getExpiryBadgeClasses={getExpiryBadgeClasses} handleItemPress={onRowPress} handleEditPress={onEditPress} />
                        ))}
                    </View>
                </ScrollView>
            </ScrollView>
        );
    }
    return (
        <FlatList
            data={safeData}
            keyExtractor={(item) => item.id}
            refreshControl={refreshControl}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            showsVerticalScrollIndicator={true}
            renderItem={({ item }) => {
                if (!item) return null;
                const hasAvatar = item.images && Array.isArray(item.images) && item.images.length > 0;
                const targetThumbnail = hasAvatar ? item.images[0].thumbnail || item.images[0].image : null;
                return (
                    <View style={{ backgroundColor: theme.panel }} className="rounded-2xl p-5 mb-4 shadow-sm border border-slate-100 dark:border-slate-800 flex-col">
                        <View className="flex-row items-start mb-3">
                            {targetThumbnail ? (
                                <View className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 overflow-hidden mr-3 p-1 justify-center items-center shadow-xs">
                                    <Image source={{ uri: targetThumbnail }} className="w-full h-full rounded-lg" resizeMode="contain" />
                                </View>
                            ) : (
                                <View className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 mr-3 items-center justify-center">
                                    <Text className="text-lg">📦</Text>
                                </View>
                            )}
                            <View className="flex-1">
                                <Text style={{ color: theme.text }} className="text-base font-bold tracking-tight leading-snug" numberOfLines={2}>{item.title}</Text>
                                <View className="flex-row items-center mt-1">
                                    <Text className="text-xs">🌍</Text>
                                    <Text style={{ color: theme.textDark }} className="text-xs ml-1">{item.origin_country || "KENYA"} • {item.unit_of_receipt}</Text>
                                </View>
                            </View>
                        </View>
                        <View className="items-start mb-3">
                            <View className={`px-2.5 py-1 rounded-full flex-row items-center ${getExpiryBadgeClasses(item.expiry_status)}`}>
                                <Text className="text-xs font-semibold">📅 {item.expiry_status}</Text>
                            </View>
                        </View>
                        <View style={{ borderBottomColor: theme.background }} className="flex-row justify-between py-2 border-b mb-4">
                            <Text style={{ color: theme.textDark }} className="text-xs">Stock: <Text style={{ color: theme.text }} className="font-bold">{item.current_unit_quantity} Units</Text></Text>
                            <Text style={{ color: theme.textDark }} className="text-xs">MSRP: <Text style={{ color: theme.primary }} className="font-bold">{parseFloat(item.unit_selling_price || "0").toFixed(2)} KSh</Text></Text>
                        </View>
                        <View className="flex-row items-center gap-x-3 w-full mt-1">
                            <TouchableOpacity onPress={() => onRowPress(item)} className="flex-1 h-11 rounded-xl items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 active:opacity-75">
                                <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">View Details</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => onEditPress(item)} style={{ backgroundColor: theme.primary }} className="flex-1 h-11 rounded-xl items-center justify-center shadow-sm active:opacity-90">
                                <Text className="text-white text-xs font-black uppercase tracking-wider">Edit Item</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );
            }}
        />
    );
}
