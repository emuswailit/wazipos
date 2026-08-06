import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ProductItem } from "./index";
interface ProductDetailsFieldsProps {
    routeItem: ProductItem;
    theme: any;
    mainImage: string;
    setMainImage: (uri: string) => void;
    formatDateHandler: (dateString: string) => string;
    handleEditAction: () => void;
    onClose: () => void;
}
export default function ProductDetailsFields({ routeItem, theme, mainImage, setMainImage, formatDateHandler, handleEditAction, onClose }: ProductDetailsFieldsProps) {
    return (
        <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full">
            <View className="w-full flex-col gap-y-4 px-1">
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-4 rounded-2xl border shadow-sm items-center w-full flex-col gap-y-3">
                    <View className="w-full h-56 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-700/5"><Image source={{ uri: mainImage }} className="w-full h-full object-contain" /></View>
                    {routeItem.images && Array.isArray(routeItem.images) && routeItem.images.length > 1 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-x-2.5" className="flex-row py-0.5 w-full">
                            {routeItem.images.map((imgUri, idx) => {
                                const isSelected = mainImage === imgUri;
                                return (
                                    <TouchableOpacity key={idx} activeOpacity={0.8} onPress={() => setMainImage(imgUri)} style={{ borderColor: isSelected ? theme.primary : theme.border }} className={`w-14 h-16 rounded-xl border-2 overflow-hidden bg-white p-0.5 ${isSelected ? "shadow-xs" : "opacity-60"}`}><Image source={{ uri: imgUri }} className="w-full h-full object-cover rounded-lg" /></TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full flex-col gap-y-3">
                    <View className="w-full"><Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Full Product Name</Text><Text style={{ color: theme.primary }} className="text-lg font-black text-left leading-snug">{routeItem.product_name || routeItem.title}</Text></View>
                    <View style={{ borderTopColor: theme.border }} className="w-full flex-row justify-between items-center pt-2.5 border-t flex-wrap gap-2">
                        <View className="items-start"><Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Initialized On</Text><Text style={{ color: theme.text }} className="text-[11px] font-semibold mt-0.5">{formatDateHandler(routeItem.created)}</Text></View>
                        <View className="items-end web:items-start"><Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Last Ledger Sync</Text><Text style={{ color: theme.text }} className="text-[11px] font-semibold mt-0.5">{formatDateHandler(routeItem.updated)}</Text></View>
                    </View>
                </View>
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full flex-col">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Device Barcode Log Metrics (SKU / GTIN)</Text>
                    {routeItem.bar_code ? (
                        <View className="flex-row items-center gap-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl w-full"><Text className="text-emerald-500 text-xs font-black">🏷️</Text><Text style={{ color: theme.text }} className="text-sm font-mono font-bold tracking-widest">{routeItem.bar_code}</Text></View>
                    ) : (
                        <View className="flex-row items-center gap-x-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl w-full"><Text className="text-amber-500 text-xs font-black">⚠️</Text><Text className="text-amber-500 text-xs font-black uppercase tracking-wider">Not Scanned — Registry Empty</Text></View>
                    )}
                </View>
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm w-full flex-row justify-between gap-3 flex-wrap">
                    <View className="items-start min-w-[140px] flex-1">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Formula Composition</Text>
                        <Text style={{ color: theme.text }} className="text-[11px] font-bold bg-slate-500/10 px-2 py-0.5 rounded mt-1.5 self-start uppercase tracking-wide">{routeItem.long_preparation_title || routeItem.preparation_title || "GENERAL MERCHANDISE"}</Text>
                    </View>
                    <View className="items-start min-w-[120px] flex-1">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Form Formulation</Text>
                        <Text style={{ color: theme.primary }} className="text-[11px] font-bold bg-blue-500/10 px-2 py-0.5 rounded mt-1.5 self-start uppercase tracking-wide">{routeItem.formulation_title || "N/A"}</Text>
                    </View>
                </View>
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm w-full flex-row justify-between gap-3 flex-wrap">
                    <View className="items-start min-w-[140px] flex-1">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Manufacturer</Text>
                        <Text style={{ color: theme.text }} className="text-xs font-bold mt-1.5 self-start uppercase tracking-tight">{routeItem.manufacturer_title}</Text>
                    </View>
                    <View className="items-start min-w-[100px]">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Pack Quantity Matrix</Text>
                        <Text style={{ color: theme.text }} className="text-xs font-black bg-slate-500/5 px-2.5 py-0.5 rounded mt-1.5 self-start">{routeItem.units_per_pack} items / unit pack ({routeItem.pack_tag || "N/A"})</Text>
                    </View>
                </View>
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1.5">Category Parameter Ledger Status</Text>
                    <Text style={{ color: theme.text }} className="text-xs font-medium text-left leading-relaxed">Ledger Category Group Allocation: <Text className="font-black text-emerald-500 uppercase">{routeItem.category_title}</Text> | Origin Country Hub Location: <Text className="font-black uppercase">{routeItem.country_of_origin}</Text></Text>
                </View>
                <View className="flex-row items-center gap-x-3 mt-2 w-full">
                    <TouchableOpacity onPress={handleEditAction} style={{ borderColor: theme.border }} className="flex-1 h-11 rounded-xl border items-center justify-center bg-slate-50 dark:bg-slate-800 active:opacity-70"><Text style={{ color: theme.text }} className="font-black text-xs uppercase tracking-wider">Modify Record</Text></TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={{ backgroundColor: theme.primary }} className="flex-1 h-11 rounded-xl items-center justify-center shadow-sm active:opacity-90"><Text className="text-white font-black text-xs uppercase tracking-wider">Return To List</Text></TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}
