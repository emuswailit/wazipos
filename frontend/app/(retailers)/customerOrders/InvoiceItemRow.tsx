import React from 'react';
import { Image, Text, View } from 'react-native';
export default function InvoiceItemRow({ item, theme }: any) {
    return (
        <View className="flex-row justify-between items-center py-1">
            <View className="flex-row items-center flex-1 pr-4">
                {item.receipt_details?.images?.thumbnail ? (
                    <Image source={{ uri: item.receipt_details.images.thumbnail }} className="w-8 h-8 rounded-lg mr-2 bg-neutral-100" resizeMode="contain" />
                ) : (
                    <View className="w-8 h-8 rounded-lg mr-2 bg-neutral-100 dark:bg-neutral-800 items-center justify-center">
                        <Text style={{ fontSize: theme?.fontSize?.sm || 12 }}>📦</Text>
                    </View>
                )}
                <View className="flex-col flex-1">
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.text || '#0f172a' }} numberOfLines={1}>{item.product_title || 'Line Item'}</Text>
                    <Text style={{ fontFamily: theme?.font?.regular || 'System', fontSize: theme?.fontSize?.xs || 10 }} className="text-slate-400 mt-0.5">Qty: {item.purchased_quantity} U</Text>
                </View>
            </View>
            <Text style={{ fontFamily: theme?.font?.mono || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.text || '#0f172a' }} className="font-bold">KES {Number(item.item_final_price || 0).toFixed(2)}</Text>
        </View>
    );
}
