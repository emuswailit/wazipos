import { useCallback } from "react";
import { FlatList, Image, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";

export interface InventoryItem {
    id: string;
    sku: string;
    title: string;
    imageUrl?: string;
    category: string;
    stockQty: number;
    packSize: string;
    wholesalePrice: number;
    reorderLevel: number;
}

interface WholesaleInventoryListProps {
    items: InventoryItem[];
    isLargeScreen: boolean;
    theme: { primary: string; panel: string; background: string; text: string; textDark: string; border: string; };
    cardBorderClass: string;
    onItemPress?: (item: InventoryItem) => void;
    onReorderTrigger?: (item: InventoryItem) => void;
}

export default function WholesaleInventoryList({ items, isLargeScreen, theme, cardBorderClass, onItemPress, onReorderTrigger }: WholesaleInventoryListProps) {
    const defaultImg = "https://unsplash.com";

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);
    };

    const renderMobileCard = useCallback(({ item }: { item: InventoryItem }) => {
        const isLowStock = item.stockQty <= item.reorderLevel;
        return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => onItemPress?.(item)} style={{ backgroundColor: theme.panel, borderColor: theme.border }} className={`p-4 rounded-2xl border ${cardBorderClass} shadow-xs mb-3.5 mx-1 flex-col`}>
                <View className="flex-row gap-x-3 items-center mb-2">
                    <View className="w-12 h-14 rounded-xl overflow-hidden border border-slate-700/10 bg-white"><Image source={{ uri: item.imageUrl || defaultImg }} className="w-full h-full object-cover" /></View>
                    <View className="flex-1">
                        <Text style={{ color: theme.text }} className="font-black text-sm tracking-tight" numberOfLines={1}>{item.title}</Text>
                        <Text style={{ color: theme.textDark }} className="text-[10px] font-mono mt-0.5">SKU: {item.sku}</Text>
                    </View>
                    <View className="items-end">
                        <Text style={{ color: theme.primary }} className="font-black text-sm">{formatCurrency(item.wholesalePrice)}</Text>
                        <Text style={{ color: theme.textDark }} className="text-[10px] font-bold mt-0.5">{item.packSize}</Text>
                    </View>
                </View>
                <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-slate-700/5">
                    <View className="flex-row items-center gap-x-1.5">
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium">Stock:</Text>
                        <Text className={`text-xs font-black px-2 py-0.5 rounded-md ${isLowStock ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>{item.stockQty} units</Text>
                    </View>
                    {isLowStock && (
                        <TouchableOpacity onPress={() => onReorderTrigger?.(item)} style={{ backgroundColor: theme.primary }} className="px-3 py-1.5 rounded-lg active:opacity-90 shadow-xs"><Text className="text-white text-[10px] font-black uppercase tracking-wider">Reorder</Text></TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [theme, cardBorderClass, onItemPress, onReorderTrigger]);

    if (isLargeScreen) {
        return (
            <View className="flex-1 w-full">
                <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} className="w-full">
                    <View style={{ backgroundColor: theme.panel }} className="flex-col rounded-2xl min-w-[900px] overflow-hidden w-full">
                        <View style={{ backgroundColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#0f172a" }} className="flex-row items-center px-6 py-4">
                            <Text style={{ color: theme.textDark }} className="w-[50px] font-black text-xs uppercase tracking-wider">Image</Text>
                            <Text style={{ color: theme.textDark }} className="w-[120px] font-black text-xs uppercase tracking-wider px-2">SKU</Text>
                            <Text style={{ color: theme.textDark }} className="flex-1 font-black text-xs uppercase tracking-wider px-2">Product Description</Text>
                            <Text style={{ color: theme.textDark }} className="w-[100px] font-black text-xs uppercase tracking-wider text-center">Pack Size</Text>
                            <Text style={{ color: theme.textDark }} className="w-[100px] font-black text-xs uppercase tracking-wider text-right">Wholesale</Text>
                            <Text style={{ color: theme.textDark }} className="w-[120px] font-black text-xs uppercase tracking-wider text-center">Stock Level</Text>
                            <Text style={{ color: theme.textDark }} className="w-[100px] font-black text-xs uppercase tracking-wider text-right">Actions</Text>
                        </View>
                        <ScrollView horizontal={false} showsVerticalScrollIndicator={true} style={{ maxHeight: 600 }}>
                            {items.map((item) => {
                                const isLowStock = item.stockQty <= item.reorderLevel;
                                return (
                                    <View key={item.id} className="flex-row items-center px-6 py-4 border-b border-slate-700/5 web:hover:bg-slate-500/5">
                                        <View className="w-[36px] h-[36px] rounded-lg overflow-hidden border border-slate-700/10 bg-white"><Image source={{ uri: item.imageUrl || defaultImg }} className="w-full h-full object-cover" /></View>
                                        <Text style={{ color: theme.text }} className="w-[120px] text-xs font-mono font-bold px-2 truncate">{item.sku}</Text>
                                        <Text style={{ color: theme.primary }} className="flex-1 font-black text-sm px-2 truncate">{item.title}</Text>
                                        <Text style={{ color: theme.text }} className="w-[100px] text-xs font-semibold text-center">{item.packSize}</Text>
                                        <Text style={{ color: theme.text }} className="w-[100px] text-xs font-black text-right">{formatCurrency(item.wholesalePrice)}</Text>
                                        <View className="w-[120px] items-center justify-center">
                                            <Text className={`text-xs font-black px-2.5 py-0.5 rounded-md ${isLowStock ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>{item.stockQty} Qty</Text>
                                        </View>
                                        <View className="w-[100px] flex-row gap-x-2 justify-end items-center">
                                            {isLowStock ? (
                                                <TouchableOpacity onPress={() => onReorderTrigger?.(item)} style={{ backgroundColor: theme.primary }} className="py-1 px-2.5 rounded-lg active:opacity-90 shadow-xs"><Text className="text-white text-[10px] font-black uppercase">Reorder</Text></TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity onPress={() => onItemPress?.(item)} style={{ borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg"><Text style={{ color: theme.text }} className="text-[10px] font-bold">View</Text></TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                </ScrollView>
            </View>
        );
    }

    return (
        <FlatList data={items} renderItem={renderMobileCard} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={true} removeClippedSubviews={Platform.OS !== "web"} maxToRenderPerBatch={10} windowSize={5} />
    );
}
