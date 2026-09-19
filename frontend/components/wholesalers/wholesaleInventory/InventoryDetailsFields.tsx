// app/(wholesalers)/wholesaleInventory/InventoryDetailsFields.tsx
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { InventoryItem } from "./inventory";

interface InventoryDetailsFieldsProps {
    item: InventoryItem;
    theme: any;
    mainImage: string;
    setMainImage: (uri: string) => void;
    onClose: () => void;
    defaultPlaceholder: string;
}

export default function InventoryDetailsFields({ item, theme, mainImage, setMainImage, onClose, defaultPlaceholder }: InventoryDetailsFieldsProps) {
    return (
        <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }} className="flex-1 w-full">
            <View className="w-full flex-col gap-y-4 px-1">
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-4 rounded-2xl border shadow-sm items-center w-full flex-col gap-y-3">
                    <View className="w-full h-56 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-700/5">
                        <Image source={{ uri: mainImage }} className="w-full h-full" resizeMode="contain" />
                    </View>
                    {item.images && Array.isArray(item.images) && item.images.length > 1 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-0.5 w-full">
                            <View className="flex-row gap-x-2.5">
                                {item.images.map((imgObj: any, idx: number) => {
                                    const currentUri = imgObj?.image || imgObj?.thumbnail || defaultPlaceholder;
                                    const isSelected = mainImage === currentUri;
                                    return (
                                        <TouchableOpacity
                                            key={idx}
                                            activeOpacity={0.8}
                                            onPress={() => setMainImage(currentUri)}
                                            style={{ borderColor: isSelected ? theme.primary : theme.border }}
                                            className={`w-14 h-16 rounded-xl border-2 overflow-hidden bg-white p-0.5 ${isSelected ? "shadow-xs" : "opacity-60"}`}
                                        >
                                            <Image source={{ uri: imgObj?.thumbnail || currentUri }} className="w-full h-full rounded-lg" resizeMode="cover" />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    )}
                </View>

                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full flex-col gap-y-3">
                    <View className="w-full">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Product Title</Text>
                        <Text style={{ color: theme.primary }} className="text-lg font-black text-left leading-snug">{item.product_title || item.title}</Text>
                    </View>
                    <View style={{ borderTopColor: theme.border }} className="w-full flex-row justify-between items-center pt-2.5 border-t flex-wrap gap-2">
                        <View className="items-start">
                            <Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Initialized On</Text>
                            <Text style={{ color: theme.text }} className="text-[11px] font-semibold mt-0.5">{item.created || "N/A"}</Text>
                        </View>
                        <View className="items-end">
                            <Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Last Ledger Sync</Text>
                            <Text style={{ color: theme.text }} className="text-[11px] font-semibold mt-0.5">{item.updated || "N/A"}</Text>
                        </View>
                    </View>
                </View>

                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full flex-col">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Device Barcode Log Metrics (SKU / GTIN)</Text>
                    {item.bar_code ? (
                        <View className="flex-row items-center gap-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl w-full">
                            <Text className="text-emerald-500 text-xs font-black">🏷️</Text>
                            <Text style={{ color: theme.text }} className="text-sm font-mono font-bold tracking-widest">{item.bar_code}</Text>
                        </View>
                    ) : (
                        <View className="flex-row items-center gap-x-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl w-full">
                            <Text className="text-amber-500 text-xs font-black">⚠️</Text>
                            <Text className="text-amber-500 text-xs font-black uppercase tracking-wider">Not Scanned — Registry Empty</Text>
                        </View>
                    )}
                </View>

                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm w-full flex-row justify-between gap-3 flex-wrap">
                    <View className="items-start min-w-[140px] flex-1">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Batch Code</Text>
                        <Text style={{ color: theme.text }} className="text-[11px] font-bold bg-slate-500/10 px-2 py-0.5 rounded mt-1.5 self-start uppercase tracking-wide">{item.batch || "N/A"}</Text>
                    </View>
                    <View className="items-start min-w-[120px] flex-1">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Unit of Receipt Type</Text>
                        <Text style={{ color: theme.primary }} className="text-[11px] font-bold bg-blue-500/10 px-2 py-0.5 rounded mt-1.5 self-start uppercase tracking-wide">{item.unit_of_receipt || "N/A"}</Text>
                    </View>
                </View>

                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm w-full flex-row justify-between gap-3 flex-wrap">
                    <View className="items-start min-w-[140px] flex-1">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Manufacturer</Text>
                        <Text style={{ color: theme.text }} className="text-xs font-bold mt-1.5 self-start uppercase tracking-tight">{item.manufacturer_title || "N/A"}</Text>
                    </View>
                    <View className="items-start min-w-[100px]">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Stock Quantity Matrix</Text>
                        <Text style={{ color: theme.text }} className="text-xs font-black bg-slate-500/5 px-2.5 py-0.5 rounded mt-1.5 self-start">{item.current_unit_quantity} / {item.received_unit_quantity} items</Text>
                    </View>
                </View>

                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1.5">Shelf Life Health Status</Text>
                    <Text style={{ color: theme.text }} className="text-xs font-medium text-left leading-relaxed">Ledger Category Group Allocation: <Text className="font-black text-emerald-500 uppercase">{item.expiry_status}</Text> | Origin Country Hub Location: <Text className="font-black uppercase">{item.origin_country || "KENYA"}</Text></Text>
                </View>

                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm w-full flex-row justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                    <Text style={{ color: theme.text }} className="text-sm font-bold">Cost: {parseFloat(item.unit_buying_price || "0").toFixed(2)} KSh</Text>
                    <Text style={{ color: theme.primary }} className="text-base font-black">MSRP: {parseFloat(item.unit_selling_price || "0").toFixed(2)} KSh</Text>
                </View>
            </View>
        </ScrollView>
    );
}
