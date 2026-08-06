import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ProductItem } from "./index";
import ProductDetailsFields from "./ProductDetailsFields";
interface ProductDetailsModalProps {
    routeItem: ProductItem | null;
    onClose: () => void;
    theme: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: ProductItem) => void;
}
export default function ProductDetailsModal({ routeItem, onClose, theme, formatDateHandler, onOpenEditTrigger }: ProductDetailsModalProps) {
    const defaultPlaceholder = "https://unsplash.com";
    const [mainImage, setMainImage] = useState<string>(defaultPlaceholder);
    useEffect(() => {
        if (routeItem && routeItem.images && Array.isArray(routeItem.images) && routeItem.images.length > 0) {
            const firstImg = routeItem.images[0];
            setMainImage(typeof firstImg === "string" ? firstImg : defaultPlaceholder);
        } else if (routeItem && typeof routeItem.images === "string" && routeItem.images) {
            setMainImage(routeItem.images);
        } else {
            setMainImage(defaultPlaceholder);
        }
    }, [routeItem]);
    if (!routeItem) return null;
    const handleEditAction = () => { onClose(); onOpenEditTrigger(routeItem); };
    return (
        <ScrollView className="flex-1 w-full md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto h-full flex-col">
            <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-14 w-full border-b px-4 flex-row justify-between items-center rounded-xl shadow-xs mb-4">
                <View className="flex-row items-center">
                    <Text style={{ color: theme.text }} className="text-sm font-black truncate max-w-[240px]">{routeItem.title}</Text>
                </View>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="py-1 px-3 bg-red-500/10 active:bg-red-500/20 rounded-lg"><Text className="text-red-500 font-extrabold text-xs">✕ Close Specs</Text></TouchableOpacity>
            </View>
            <ProductDetailsFields routeItem={routeItem} theme={theme} mainImage={mainImage} setMainImage={setMainImage} formatDateHandler={formatDateHandler} handleEditAction={handleEditAction} onClose={onClose} />
        </ScrollView>
    );
}
