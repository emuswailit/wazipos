import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';

export default function OutOfStockResponsiveMatrix({ theme, isDarkMode, isLargeScreen, filteredItems, refreshing, onRefresh, onOpenEdit }: any) {
    if (!filteredItems?.length) return (
        <View className="flex-1 justify-center items-center py-20"><Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="text-center px-6">No out-of-stock records match your applied filter pipeline.</Text></View>
    );
    const isOrd = (i: any) => String(i.is_ordered) === 'true';

    if (isLargeScreen) return (
        <View className="w-full border rounded-2xl overflow-hidden shadow-sm flex-1" style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
            {/* Table Header: Structured and Proportional */}
            <View className="flex-row py-3.5 px-5 items-center border-b bg-slate-50 dark:bg-slate-800/50" style={{ borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                <Text className="flex-[3] text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Product Details</Text>
                <Text className="flex-[1] text-xs font-bold uppercase tracking-wider text-center" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Units / Pack</Text>
                <Text className="flex-[1.2] text-xs font-bold uppercase tracking-wider text-center" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Required Qty</Text>
                <Text className="flex-[2.5] text-xs font-bold uppercase tracking-wider px-2" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Customer Reference</Text>
                <Text className="flex-[1.2] text-xs font-bold uppercase tracking-wider text-center" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Order Status</Text>
                <Text className="flex-[0.8] text-xs font-bold uppercase tracking-wider text-right" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Action</Text>
            </View>

            <FlatList data={filteredItems} keyExtractor={i => i.id} refreshing={refreshing} onRefresh={onRefresh} showsVerticalScrollIndicator={false} renderItem={({ item: i, index: idx }) => (
                <View className={`flex-row py-4 px-5 items-center border-b last:border-b-0 ${idx % 2 ? 'bg-slate-50/30 dark:bg-slate-800/10' : ''}`} style={{ borderColor: isDarkMode ? '#1e293b' : '#f1f5f9' }}>

                    {/* Column 1: Product Title */}
                    <Text className="flex-[3] pr-4 font-semibold text-sm" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} numberOfLines={2}>
                        {i.product_title || 'Unnamed Asset'}
                    </Text>

                    {/* Column 2: Units per pack volume */}
                    <Text className="flex-[1] text-center text-sm font-mono" style={{ color: theme.textDark, fontFamily: theme.font.mono, fontSize: theme.fontSize.base }}>
                        {i.units_per_pack || 1}
                    </Text>

                    {/* Column 3: Shortage Required Units Count */}
                    <Text className="flex-[1.2] text-center text-sm font-black" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }}>
                        {i.required_quantity || 0}
                    </Text>

                    {/* Column 4: Customer Meta Wrapper Panel (Isolates and prevents overlapping) */}
                    <View className="flex-[2.5] px-2 flex-col justify-center">
                        <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="text-sm font-medium truncate" numberOfLines={1}>
                            {i.customer_name || 'Walk-in Client'}
                        </Text>
                        {i.customer_phone ? (
                            <Text className="mt-0.5 text-xs text-slate-400 dark:text-slate-500" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>
                                {i.customer_phone}
                            </Text>
                        ) : null}
                    </View>

                    {/* Column 5: Status Badge Block */}
                    <View className="flex-[1.2] items-center">
                        <View className={`px-2.5 py-1 rounded-full border ${isOrd(i) ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                            <Text style={{ color: isOrd(i) ? '#10b981' : '#d97706', fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-[10px] font-bold uppercase tracking-wider">
                                {isOrd(i) ? 'Ordered' : 'Pending'}
                            </Text>
                        </View>
                    </View>

                    {/* Column 6: Modification Trigger Action Row */}
                    <TouchableOpacity onPress={() => onOpenEdit(i)} className="flex-[0.8] items-end justify-center py-1">
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-sm font-bold">
                            Edit
                        </Text>
                    </TouchableOpacity>
                </View>
            )} />
        </View>
    );

    // 📱 Mobile View Block Strategy
    return (
        <FlatList data={filteredItems} keyExtractor={i => i.id} refreshing={refreshing} onRefresh={onRefresh} className="w-full flex-1" contentContainerStyle={{ paddingVertical: 4, gap: 12 }} showsVerticalScrollIndicator={false} renderItem={({ item: i }) => (
            <View className="w-full rounded-2xl p-4 border shadow-sm flex-col bg-transparent" style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                <View className="flex-row justify-between items-start gap-x-3 mb-2">
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="font-bold tracking-tight" numberOfLines={2}>{i.product_title || 'Unnamed Asset'}</Text>
                        <Text className="mt-0.5 text-xs" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>Pack Size: {i.units_per_pack || 1} Units</Text>
                    </View>
                    <View className={`px-2.5 py-0.5 rounded-full border self-start ${isOrd(i) ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}><Text style={{ color: isOrd(i) ? '#10b981' : '#d97706', fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-[9px] font-extrabold uppercase tracking-widest">{isOrd(i) ? 'Ordered' : 'Pending'}</Text></View>
                </View>
                <View className="w-full h-[1px] bg-slate-100 dark:bg-slate-800/60 my-1" />
                <View className="flex-row justify-between items-center py-2">
                    <View className="flex-1 flex-col"><Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-[10px] font-bold uppercase tracking-wider">Shortage Qty</Text><Text className="mt-0.5 text-base font-black" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }}>{i.required_quantity || 0} Packs</Text></View>
                    <View className="flex-1 flex-col items-end pl-2"><Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-[10px] font-bold uppercase tracking-wider">Client Ref</Text><Text className="mt-0.5 text-sm font-semibold truncate text-right w-full" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} numberOfLines={1}>{i.customer_name || 'Walk-in Client'}</Text>{i.customer_phone ? <Text className="mt-0.5 text-[11px]" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>{i.customer_phone}</Text> : null}</View>
                </View>
                <View className="w-full flex-row justify-end items-center mt-2"><TouchableOpacity onPress={() => onOpenEdit(i)} className="px-4 h-8 items-center justify-center rounded-xl border bg-transparent" style={{ backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}20` }}><Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-xs font-bold uppercase tracking-wide">Adjust Log</Text></TouchableOpacity></View>
            </View>
        )} />
    );
}
