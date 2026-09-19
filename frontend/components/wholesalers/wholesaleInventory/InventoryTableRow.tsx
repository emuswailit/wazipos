// app/(wholesalers)/wholesaleInventory/InventoryTableRow.tsx
import { Image, Text, TouchableOpacity, View } from "react-native";
import { InventoryItem } from "./inventory";
interface InventoryTableRowProps {
    item: InventoryItem;
    theme: any;
    getExpiryBadgeClasses: (status: string) => string;
    handleItemPress: (item: InventoryItem) => void;
    handleEditPress: (item: InventoryItem) => void;
}
export default function InventoryTableRow({ item, theme, getExpiryBadgeClasses, handleItemPress, handleEditPress }: InventoryTableRowProps) {
    if (!item) return null;
    const hasAvatar = item.images && Array.isArray(item.images) && item.images.length > 0;
    const targetThumbnail = hasAvatar ? item.images[0].thumbnail || item.images[0].image : null;
    return (
        <View style={{ borderBottomColor: theme.background }} className="flex-row py-4 items-center border-b">
            <View className="flex-[2.2] px-2 flex-row items-center">
                {targetThumbnail ? (
                    <View className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 overflow-hidden mr-3 p-0.5 justify-center items-center">
                        <Image source={{ uri: targetThumbnail }} className="w-full h-full rounded-lg" resizeMode="contain" />
                    </View>
                ) : (
                    <View className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 mr-3 items-center justify-center"><Text className="text-sm">📦</Text></View>
                )}
                <View className="flex-1">
                    <Text style={{ color: theme.text }} className="font-semibold text-sm">{item.title}</Text>
                    <View className="flex-row items-center mt-0.5 space-x-1">
                        <Text className="text-[10px]">🌍</Text>
                        <Text style={{ color: theme.textDark }} className="text-xs ml-1">{item.origin_country || "KENYA"} • {item.unit_of_receipt}</Text>
                    </View>
                </View>
            </View>
            <Text style={{ color: theme.textDark }} className="flex-1 text-sm px-2">{item.batch || "N/A"}</Text>
            <Text style={{ color: theme.text }} className="flex-1 text-sm font-semibold px-2">{item.current_unit_quantity} / {item.received_unit_quantity} {item.unit_of_receipt}s</Text>
            <Text style={{ color: theme.textDark }} className="flex-1 text-sm px-2">{parseFloat(item.unit_buying_price || "0").toFixed(2)} KSh</Text>
            <Text style={{ color: theme.text }} className="flex-1 text-sm font-semibold px-2">{parseFloat(item.unit_selling_price || "0").toFixed(2)} KSh</Text>
            <View className="flex-[1.3] px-2 items-start">
                <View className={`px-2.5 py-1 rounded-full flex-row items-center ${getExpiryBadgeClasses(item.expiry_status)}`}>
                    <Text className="text-xs font-semibold">{item.expiry_status}</Text>
                </View>
            </View>
            <View className="w-28 flex-row items-center justify-center gap-x-2 px-2">
                <TouchableOpacity onPress={() => handleItemPress(item)} style={{ backgroundColor: theme.primary }} className="flex-1 py-2 rounded-xl items-center justify-center">
                    <Text className="text-white text-xs font-bold">👁️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleEditPress(item)} className="flex-1 py-2 rounded-xl items-center justify-center bg-amber-500/10 border border-amber-500/20">
                    <Text className="text-amber-500 text-xs font-bold">✏️</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
