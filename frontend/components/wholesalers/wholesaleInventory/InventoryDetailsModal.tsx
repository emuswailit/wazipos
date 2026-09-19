// app/(wholesalers)/wholesaleInventory/InventoryDetailsModal.tsx
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { InventoryItem } from "./inventory";
import InventoryDetailsFields from "./InventoryDetailsFields";
interface DetailsProps {
    isVisible: boolean;
    item: InventoryItem | null;
    onClose: () => void;
}
export default function InventoryDetailsModal({ isVisible, item, onClose }: DetailsProps) {
    const { theme } = useAuth();
    const { height: screenHeight } = useWindowDimensions();
    const defaultPlaceholder = "https://unsplash.com";
    const [mainImage, setMainImage] = useState<string>(defaultPlaceholder);
    useEffect(() => {
        if (item && item.images && Array.isArray(item.images) && item.images.length > 0) {
            const firstImgObj = item.images[0];
            setMainImage(firstImgObj?.image || firstImgObj?.thumbnail || defaultPlaceholder);
        } else {
            setMainImage(defaultPlaceholder);
        }
    }, [item, isVisible]);
    if (!isVisible || !item) return null;
    return (
        <View style={{ height: screenHeight }} className="absolute inset-0 z-50 flex-col w-full bg-black/40">
            <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm z-50">
                <View className="flex-row items-center">
                    <Text style={{ color: theme.text }} className="text-base font-black truncate max-w-[240px]">{item.title}</Text>
                </View>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="py-2 px-4 bg-red-500/10 active:bg-red-500/20 rounded-xl">
                    <Text className="text-red-500 font-extrabold text-xs">✕ Close Specs</Text>
                </TouchableOpacity>
            </View>
            <View className="flex-1 w-full px-6 py-6">
                <View className="w-full max-w-2xl mx-auto flex-1">
                    <InventoryDetailsFields
                        item={item}
                        theme={theme}
                        mainImage={mainImage}
                        setMainImage={setMainImage}
                        onClose={onClose}
                        defaultPlaceholder={defaultPlaceholder}
                    />
                </View>
            </View>
        </View>
    );
}
