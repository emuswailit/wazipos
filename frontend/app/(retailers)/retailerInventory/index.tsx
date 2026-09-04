import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import CardView from './CardView';
import HeaderMetrics, { FilterTab } from './HeaderMetrics';
import InventoryAddModal from './InventoryAddModal';
import TableView from './TableView';
import { useRetailerInventory } from './useRetailerInventory';

export default function InventoryContainer() {
    const { isSyncing, retailerReceipts } = useInventorySync();
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const { isInventoryLoading, refetchInventory } = useRetailerInventory();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [limit, setLimit] = useState(10);

    const isLarge = width >= 768;
    const handleOnRefresh = async () => { setIsRefreshing(true); try { await refetchInventory(); } catch (e) { } finally { setIsRefreshing(false); } };

    const filtered = useMemo(() => {
        setCurrentPage(1);
        return retailerReceipts.filter(i => {
            if (activeTab === 'ACTIVE' && i.days_to_expiry <= 0) return false;
            if (activeTab === 'EXPIRED' && i.days_to_expiry > 0) return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (i.title?.toLowerCase().includes(q) || i.long_title?.toLowerCase().includes(q) || i.bar_code?.toLowerCase().includes(q));
        });
    }, [searchQuery, activeTab, retailerReceipts]);

    const totalPages = Math.ceil(filtered.length / limit) || 1;
    const paginated = useMemo(() => isLarge ? filtered.slice((currentPage - 1) * limit, currentPage * limit) : filtered, [filtered, currentPage, isLarge, limit]);

    if (isInventoryLoading && !isRefreshing) return (
        <View className="flex-1 justify-center items-center" style={{ backgroundColor: theme.background }}><ActivityIndicator size="large" color={theme.primary} /><Text className="mt-3 text-xs font-medium" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>Syncing stock entries...</Text></View>
    );

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <HeaderMetrics retailerReceipts={retailerReceipts} searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeTab={activeTab} setActiveTab={setActiveTab} isDarkMode={isDarkMode} setIsAddModalOpen={setIsAddModalOpen} theme={theme} />

            <ScrollView
                className="flex-1 w-full"
                contentContainerStyle={{ padding: 16, alignItems: 'center' }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleOnRefresh} tintColor={theme.primary} colors={[theme.primary]} progressBackgroundColor={theme.panel} />}
            >
                {/* 🚀 WEB 80% SCREEN WIDTH LAYOUT STRATEGY CONTROLS */}
                <View className={`w-full gap-4 self-center ${isLarge ? 'w-[80vw] max-w-[80vw]' : 'max-w-6xl'}`}>
                    <View className="w-full flex-row justify-between items-center mb-1 flex-wrap gap-y-2">
                        <Text className="text-sm font-extrabold" style={{ color: theme.text, fontFamily: theme.font.bold }}>Stock Master Listing</Text>
                        {isLarge && (
                            <View className="flex-row items-center gap-x-1 bg-slate-100/60 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
                                <Text style={{ color: theme.textDark, fontSize: 10, fontFamily: theme.font.medium }} className="px-2 uppercase font-bold tracking-wider">Rows:</Text>
                                {[10, 25, 50, 100].map(s => (
                                    <TouchableOpacity key={s} onPress={() => { setLimit(s); setCurrentPage(1); }} style={{ backgroundColor: limit === s ? theme.primary : 'transparent' }} className="px-2.5 py-1 rounded-lg">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: 11, color: limit === s ? '#fff' : theme.text }}>{s}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                    {!paginated.length ? (
                        <View className="py-20 justify-center items-center"><Text className="text-sm font-medium text-center px-6" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>No active records matched your applied tracking filters.</Text></View>
                    ) : isLarge ? (
                        <View className="gap-4 w-full">
                            <TableView dataList={paginated} isDarkMode={isDarkMode} theme={theme} />
                            <View className="w-full flex-row justify-between items-center py-2 mt-2 border-t border-gray-100 dark:border-slate-800">
                                <Text className="text-xs font-semibold" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, filtered.length)} of {filtered.length} entries</Text>
                                <View className="flex-row gap-2">
                                    <TouchableOpacity disabled={currentPage === 1} onPress={() => setCurrentPage(p => Math.max(p - 1, 1))} className={`px-3 py-1.5 rounded-lg border ${currentPage === 1 ? 'opacity-40' : ''}`} style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }}><Text className="text-xs font-bold" style={{ color: theme.text, fontFamily: theme.font.bold }}>Previous</Text></TouchableOpacity>
                                    <TouchableOpacity disabled={currentPage === totalPages} onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages))} className={`px-3 py-1.5 rounded-lg border ${currentPage === totalPages ? 'opacity-40' : ''}`} style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }}><Text className="text-xs font-bold" style={{ color: theme.text, fontFamily: theme.font.bold }}>Next</Text></TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <View className="gap-4 w-full flex-col">{paginated.map(i => <CardView key={i.key || i.id} item={i} theme={theme} isDarkMode={isDarkMode} />)}</View>
                    )}
                </View>
            </ScrollView>
            <InventoryAddModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={refetchInventory} theme={theme} isDarkMode={isDarkMode} />
        </View>
    );
}
