import { useCallback } from "react";
import { FlatList, Image, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ProductItem } from "./index";

interface ProductsListSectionProps {
    products: ProductItem[];
    isLargeScreen: boolean;
    theme: any;
    cardBorderClass: string;
    formatDateHandler: (dateString: string) => string;
    onOpenDetailsTrigger: (item: ProductItem) => void;
    onOpenEditTrigger: (item: ProductItem) => void;
}

export default function ProductsListSection({
    products,
    isLargeScreen,
    theme,
    cardBorderClass,
    formatDateHandler,
    onOpenDetailsTrigger,
    onOpenEditTrigger
}: ProductsListSectionProps) {
    const defaultPlaceholder = "https://unsplash.com";

    const renderMobileCard = useCallback(({ item }: { item: ProductItem }) => {
        const imgUrl = item.images && item.images.length > 0 ? item.images[0] : defaultPlaceholder;
        return (
            <View style={{ backgroundColor: theme.panel }} className={`p-5 rounded-2xl border ${cardBorderClass} shadow-sm flex-col mb-3.5 mx-1`}>
                <View className="flex-row gap-x-4 items-center mb-3">
                    <View className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700/10 bg-white shadow-xs">
                        <Image source={{ uri: imgUrl }} className="w-full h-full object-cover" />
                    </View>
                    <View className="flex-1 flex-col">
                        <View className="flex-row justify-between items-start flex-wrap gap-1">
                            <Text style={{ color: theme.primary }} className="font-black text-base tracking-wide flex-1" numberOfLines={1}>{item.title}</Text>
                            {item.formulation_title ? (
                                <Text style={{ color: theme.text, backgroundColor: "rgba(59,130,246,0.12)" }} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded max-w-[100px] truncate">{item.formulation_title}</Text>
                            ) : null}
                        </View>
                        <Text style={{ color: theme.text }} className="text-xs font-semibold mt-0.5 truncate">{item.long_preparation_title || item.preparation_title || "GENERAL MERCHANDISE"}</Text>
                    </View>
                </View>
                <Text style={{ color: theme.textDark }} className="text-[11px] font-medium mb-4" numberOfLines={1}>Mfg: {item.manufacturer_title}</Text>
                <View className="flex-row items-center gap-x-3 w-full">
                    <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-70">
                        <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: theme.border }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-80">
                        <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Inspect</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }, [theme, cardBorderClass, onOpenEditTrigger, onOpenDetailsTrigger]);

    if (isLargeScreen) {
        return (
            <View className="flex-1 w-full">
                <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} className="w-full">
                    <View style={{ backgroundColor: theme.panel }} className="flex-col rounded-2xl min-w-[1000px] overflow-hidden">
                        <View style={{ backgroundColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#0f172a" }} className="flex-row items-center px-6 py-4">
                            <Text style={{ color: theme.textDark }} className="w-[50px] font-black text-xs uppercase tracking-wider">Pic</Text>
                            <Text style={{ color: theme.textDark }} className="w-[150px] font-black text-xs uppercase tracking-wider px-2">Brand Name</Text>
                            <Text style={{ color: theme.textDark }} className="w-[240px] font-black text-xs uppercase tracking-wider px-2">Scientific Strength Formula</Text>
                            <Text style={{ color: theme.textDark }} className="w-[100px] font-black text-xs uppercase tracking-wider text-center">Pack Units</Text>
                            <Text style={{ color: theme.textDark }} className="flex-1 font-black text-xs uppercase tracking-wider px-2">Manufacturer</Text>
                            <Text style={{ color: theme.textDark }} className="w-[120px] text-xs font-semibold text-center text-slate-400">Created On</Text>
                            <Text style={{ color: theme.textDark }} className="w-[140px] font-black text-xs uppercase tracking-wider text-right">Actions</Text>
                        </View>
                        <ScrollView horizontal={false} showsVerticalScrollIndicator={true} style={{ maxHeight: 600 }}>
                            {products.map((item) => {
                                const imgUrl = item.images && item.images.length > 0 ? item.images[0] : defaultPlaceholder;
                                return (
                                    <View key={item.id} className="flex-row items-center px-6 py-4 web:hover:bg-slate-500/5 border-b border-slate-700/5">
                                        <View className="w-[42px] h-[42px] rounded-xl overflow-hidden border border-slate-700/10 bg-white">
                                            <Image source={{ uri: imgUrl }} className="w-full h-full object-cover" />
                                        </View>
                                        <Text style={{ color: theme.primary }} className="w-[150px] font-black text-sm tracking-wide px-2 truncate">{item.title}</Text>
                                        <View className="w-[240px] px-2">
                                            <Text style={{ color: theme.text }} className="bg-slate-500/10 px-2 py-0.5 rounded text-xs font-bold truncate max-w-full">{item.long_preparation_title || item.preparation_title || "GENERAL MERCHANDISE"}</Text>
                                        </View>
                                        <Text style={{ color: theme.text }} className="w-[100px] text-xs font-semibold text-center">{item.units_per_pack} Qty</Text>
                                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-medium px-2 truncate" numberOfLines={1}>{item.manufacturer_title}</Text>
                                        <Text style={{ color: theme.textDark }} className="w-[120px] text-xs font-semibold text-center">{formatDateHandler(item.created)}</Text>
                                        <View className="w-[140px] flex-row gap-x-2 justify-end items-center">
                                            <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg active:bg-slate-100 dark:active:bg-slate-800 transition-all"><Text style={{ color: theme.text }} className="text-xs font-semibold">Edit</Text></TouchableOpacity>
                                            <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg transition-all"><Text style={{ color: theme.primary }} className="text-xs font-bold">Details</Text></TouchableOpacity>
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
        <FlatList
            data={products}
            renderItem={renderMobileCard}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingBottom: 32 }}
            removeClippedSubviews={Platform.OS !== "web"}
            maxToRenderPerBatch={10}
            windowSize={5}
        />
    );
}
