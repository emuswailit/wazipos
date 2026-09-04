import React from 'react';
import { Image, Text, View } from 'react-native';

interface TableViewProps { dataList: any[]; isDarkMode: boolean; theme: any; }

export default function TableView({ dataList, isDarkMode, theme }: TableViewProps) {
    return (
        <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} className="w-full border rounded-2xl overflow-hidden shadow-sm">
            {/* 🚀 FIXED PROPORTIONAL COLUMN HEADERS GRID */}
            <View className="flex-row items-center border-b border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 py-3.5 px-4">
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="flex-[3] text-xs font-bold uppercase tracking-wider">Product Details</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="flex-[2] text-xs font-bold uppercase tracking-wider pl-2">Barcode / SKU</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="flex-[1.5] text-xs font-bold uppercase tracking-wider text-right">Stock Qty</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="flex-[1.5] text-xs font-bold uppercase tracking-wider text-right">Price</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="flex-[2] text-xs font-bold uppercase tracking-wider text-center">Expiry Status</Text>
            </View>

            {/* 🚀 FIXED PROPORTIONAL DATA ROW LAYOUT */}
            {dataList.map((item, index) => {
                const isExpired = item.days_to_expiry <= 0;
                const hasImages = Array.isArray(item.images) && item.images.length > 0;
                const thumbnailUrl = hasImages ? (item.images[0]?.thumbnail || item.images[0]?.image) : null;

                return (
                    <View key={item.key || item.id} className={`flex-row items-center py-3.5 px-4 border-b border-gray-100 dark:border-slate-800 last:border-b-0 ${index % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/10' : ''}`}>

                        {/* Column 1 (flex-[3]): Thumbnail + Title Info Block */}
                        <View className="flex-[3] flex-row items-center gap-3 pr-2">
                            <View className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex-shrink-0">
                                {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} className="w-full h-full object-cover" /> : <View className="w-full h-full items-center justify-center bg-slate-200 dark:bg-slate-700"><Text style={{ color: theme.textDark }} className="text-[14px]">📦</Text></View>}
                            </View>
                            <View className="flex-1 min-w-0">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold }} className="text-sm font-bold truncate" numberOfLines={1}>{item.title || item.product_title || 'Unnamed Asset'}</Text>
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-semibold text-slate-400 mt-0.5 truncate" numberOfLines={1}>{item.manufacturer_title || 'Unknown Manufacturer'}</Text>
                            </View>
                        </View>

                        {/* Column 2 (flex-[2]): Barcode Segment */}
                        <Text style={{ color: theme.text, fontFamily: theme.font.medium }} className="flex-[2] text-xs text-slate-600 dark:text-slate-300 pl-2 truncate" numberOfLines={1}>
                            {item.bar_code || item.barcode || '---'}
                        </Text>

                        {/* Column 3 (flex-[1.5]): Stock Count Metric */}
                        <Text style={{ color: item.current_unit_quantity <= 5 ? '#f43f5e' : theme.text, fontFamily: theme.font.bold }} className="flex-[1.5] text-xs font-bold text-right truncate" numberOfLines={1}>
                            {item.current_unit_quantity ?? 0} {item.unit_of_receipt || 'Pcs'}
                        </Text>

                        {/* Column 4 (flex-[1.5]): Price Point Label */}
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold }} className="flex-[1.5] text-xs font-black text-right truncate" numberOfLines={1}>
                            KES {parseFloat(item.final_unit_selling_price || item.unit_selling_price || '0').toFixed(2)}
                        </Text>

                        {/* Column 5 (flex-[2]): Expiry Status Mode */}
                        <View className="flex-[2] items-center justify-center pl-2">
                            <Text
                                style={{ color: isExpired ? '#f43f5e' : '#10b981', fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}
                                className="font-bold text-center uppercase tracking-wide truncate w-full"
                                numberOfLines={1}
                            >
                                {item.expiry_status || (isExpired ? 'EXPIRED' : 'ACTIVE')}
                            </Text>
                        </View>

                    </View>
                );
            })}
        </View>
    );
}
