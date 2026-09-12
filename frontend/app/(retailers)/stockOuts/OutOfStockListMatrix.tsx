import React from 'react';
import { FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface OutOfStockListMatrixProps {
    theme: any; isDarkMode: boolean; isLargeScreen: boolean; filteredItems: any[];
    refreshing: boolean; onRefresh: () => void; onOpenEdit: (item: any) => void;
}

export default function OutOfStockListMatrix({ theme, isDarkMode, isLargeScreen, filteredItems, refreshing, onRefresh, onOpenEdit }: OutOfStockListMatrixProps) {
    if (!filteredItems?.length) return (
        <View className="flex-1 justify-center items-center py-20">
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="text-center px-6">
                No out-of-stock records match your applied filter pipeline.
            </Text>
        </View>
    );

    if (isLargeScreen) return (
        <ScrollView className="flex-1 w-full" contentContainerStyle={{ padding: 20, alignItems: 'center', justifyContent: 'center' }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
            <View className="w-[90%] max-w-7xl border rounded-2xl overflow-hidden shadow-xs self-center" style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                <View className="flex-row border-b py-4 px-5 items-center" style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                    <Text className="flex-[2.5] uppercase tracking-wider" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Product Details</Text>
                    <Text className="flex- uppercase tracking-wider text-center" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Units/Pack</Text>
                    <Text className="flex- uppercase tracking-wider text-center" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Required Qty</Text>
                    <Text className="flex- uppercase tracking-wider" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Customer Request</Text>
                    <Text className="flex-[1.2] uppercase tracking-wider" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Ordered</Text>
                    <Text className="flex- uppercase tracking-wider text-right" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>Action</Text>
                </View>
                {filteredItems.map(item => (
                    <View key={item.id} className="flex-row border-b py-4 px-5 items-center last:border-b-0" style={{ borderColor: isDarkMode ? '#1e293b' : '#f1f5f9' }}>
                        <Text className="flex-[2.5] pr-2 font-medium" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} numberOfLines={2}>{item.product_title || 'Unnamed Asset Product'}</Text>
                        <Text className="flex- text-center" style={{ color: theme.textDark, fontFamily: theme.font.mono, fontSize: theme.fontSize.base }}>{item.units_per_pack || 1}</Text>
                        <Text className="flex- text-center" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }}>{item.required_quantity || 0}</Text>
                        <View className="flex- pr-2">
                            <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} numberOfLines={1}>{item.customer_name || 'Walk-in Client'}</Text>
                            {item.customer_phone && <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>{item.customer_phone}</Text>}
                        </View>
                        <View className="flex-[1.2]">
                            <View className={`px-2.5 py-1 rounded-full self-start ${String(item.is_ordered) === 'true' ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                                <Text className={String(item.is_ordered) === 'true' ? 'text-green-500' : 'text-amber-500'} style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>{String(item.is_ordered) === 'true' ? 'Ordered' : 'Pending'}</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => onOpenEdit(item)} className="flex- items-end py-1 active:opacity-70">
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }}>Edit</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        </ScrollView>
    );

    return (
        <FlatList
            data={filteredItems}
            keyExtractor={item => String(item.id || item.key)}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ padding: 16, gap: 12, width: '100%' }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
                <View className="w-full rounded-2xl p-4 border shadow-xs" style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                    <View className="flex-row justify-between items-start mb-2">
                        <View className="flex-1 pr-2">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }} numberOfLines={2}>{item.product_title || 'Unnamed Asset Product'}</Text>
                            <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>
                                Pack Volume: {item.units_per_pack || 1} Units
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row justify-between items-center py-3 border-b border-t my-1" style={{ borderColor: isDarkMode ? '#1e293b' : '#f1f5f9' }}>
                        <View className="flex-1">
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>SHORTAGE QUANTITY</Text>
                            <Text className="mt-0.5" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }}>
                                {item.required_quantity || 0} Packs
                            </Text>
                        </View>
                        <View className="flex-1 items-end pl-2">
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }}>CLIENT REF</Text>
                            <Text className="mt-0.5" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} numberOfLines={1}>
                                {item.customer_name || 'Walk-in Client'}
                            </Text>
                            {item.customer_phone && (
                                <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: 10 }}>
                                    {item.customer_phone}
                                </Text>
                            )}
                        </View>
                    </View>

                    <View className="flex-row justify-between items-center mt-3">
                        <View className={`px-3 py-1 rounded-full ${String(item.is_ordered) === 'true' ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                            <Text className={String(item.is_ordered) === 'true' ? 'text-green-500' : 'text-amber-500'} style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }}>
                                Status: {String(item.is_ordered) === 'true' ? 'Ordered' : 'Awaiting'}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => onOpenEdit(item)} className="px-3 py-1.5 rounded-xl border" style={{ backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}30` }}>
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }}>Adjust Log</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        />
    );
}
