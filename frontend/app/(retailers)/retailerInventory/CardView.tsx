import React from 'react';
import { Image, Text, View } from 'react-native';

interface CardViewProps { item: any; theme: any; isDarkMode: boolean; }

export default function CardView({ item, theme, isDarkMode }: CardViewProps) {
    const isExpired = item.days_to_expiry <= 0;
    const hasImages = Array.isArray(item.images) && item.images.length > 0;
    const thumbnailUrl = hasImages ? (item.images[0]?.thumbnail || item.images[0]?.image) : null;

    return (
        <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} className="w-full border rounded-2xl p-4 shadow-sm flex-col gap-3 relative overflow-hidden">
            <View className="w-full flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                    {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} className="w-full h-full object-cover" /> : <View className="w-full h-full items-center justify-center bg-slate-200 dark:bg-slate-700"><Text className="text-base">📦</Text></View>}
                </View>
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold }} className="text-base font-bold tracking-tight truncate" numberOfLines={1}>{item.title || item.product_title}</Text>
                    <Text style={{ color: theme.textDark }} className="text-xs font-medium text-slate-400 mt-0.5 truncate" numberOfLines={1}>{item.manufacturer_title || 'Unknown Manufacturer'}</Text>
                </View>
            </View>

            <View className="w-full h-[1px] bg-slate-100 dark:bg-slate-800/60 my-0.5" />

            <View className="w-full flex-row justify-between items-center flex-wrap gap-y-2">
                <View className="flex-col">
                    <Text style={{ color: theme.textDark }} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Barcode</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.medium }} className="text-xs font-semibold mt-0.5">{item.bar_code || '---'}</Text>
                </View>
                <View className="flex-col items-center">
                    <Text style={{ color: theme.textDark }} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Available</Text>
                    <Text style={{ color: item.current_unit_quantity <= 5 ? '#f43f5e' : theme.text, fontFamily: theme.font.bold }} className="text-xs font-bold mt-0.5">{item.current_unit_quantity} {item.unit_of_receipt || 'Pcs'}</Text>
                </View>
                <View className="flex-col items-end">
                    <Text style={{ color: theme.textDark }} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price Point</Text>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold }} className="text-xs font-black mt-0.5">KES {parseFloat(item.final_unit_selling_price || item.unit_selling_price || '0').toFixed(2)}</Text>
                </View>
            </View>

            {/* 🚀 EXPIRY STATUS DISPLAY STRATEGY: PURE COLORED TEXT WITHOUT PILLS */}
            <View className="w-full mt-1 flex-row items-center justify-between">
                <Text style={{ color: theme.textDark }} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking Status</Text>
                <Text style={{ color: isExpired ? '#f43f5e' : '#10b981', fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="font-bold uppercase tracking-wider text-right">
                    {item.expiry_status || (isExpired ? 'EXPIRED' : 'ACTIVE')}
                </Text>
            </View>
        </View>
    );
}
