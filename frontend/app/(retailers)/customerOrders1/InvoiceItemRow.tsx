import React from 'react';
import { Image, Text, View } from 'react-native';
export default function InvoiceItemRow({ item, theme }: any) {
    const hasImages = Array.isArray(item.receipt_details?.images) && item.receipt_details.images.length > 0;
    const thumbnailUrl = hasImages ? (item.receipt_details?.images?.thumbnail || item.receipt_details?.images?.image) : null;
    // 🚀 FIXED: Robust price calculation reads every possible key matching our unified schemas
    const unitPrice = Number(item.final_unit_selling_price || item.item_final_price || item.unit_selling_price || item.price || 0);
    const calculatedLinePrice = Number(item.purchased_quantity || 1) * unitPrice - Number(item.item_discount || 0);
    // 🚀 FIXED: Fallback name chain intercepts "Unnamed Asset Product" errors by matching both remote and local batch schemas
    const itemDisplayName = item.product_name || item.product_title || item.title || 'Line Asset Product';
    return (
        <View className="flex-row justify-between items-center py-1">
            <View className="flex-row items-center flex-1 pr-4">
                {thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} className="w-8 h-8 rounded-lg mr-2 bg-neutral-100" resizeMode="contain" />
                ) : (
                    <View className="w-8 h-8 rounded-lg mr-2 bg-neutral-100 dark:bg-neutral-800 items-center justify-center">
                        <Text style={{ fontSize: theme?.fontSize?.sm || 12 }}>📦</Text>
                    </View>
                )}
                <View className="flex-col flex-1">
                    <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: theme?.text }} numberOfLines={1}>
                        {itemDisplayName}
                    </Text>
                    <Text style={{ fontFamily: theme?.font?.regular, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="mt-0.5">
                        Qty: {item.purchased_quantity} {item.unit_of_issue || 'PIECE'}
                    </Text>
                </View>
            </View>
            <Text style={{ fontFamily: theme?.font?.mono, fontSize: theme?.fontSize?.sm, color: theme?.text }} className="font-bold">
                KES {calculatedLinePrice.toFixed(2)}
            </Text>
        </View>
    );
}
