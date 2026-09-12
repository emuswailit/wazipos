import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import ProcurementCardDeck from './ProcurementCardDeck';
import ProcurementTable from './ProcurementTable';
export default function ProcurementListMatrix({
    theme, predictionsData, selectedOffers, searchQuery, setSearchQuery, onToggleOfferSelection, isAllItemsSelected, onSelectAllOffers, isLoading, onRefresh, currentPage, setCurrentPage, itemsPerPage
}: any) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 1024;
    const totalFiltered = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return predictionsData;
        return predictionsData.filter((i: any) => String(i?.title || "").toLowerCase().includes(query) || String(i?.bar_code || "").includes(query));
    }, [predictionsData, searchQuery]);
    const totalPages = Math.max(1, Math.ceil(totalFiltered.length / itemsPerPage));
    const paginatedItems = useMemo(() => {
        if (!isLarge) return totalFiltered;
        return totalFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [totalFiltered, currentPage, itemsPerPage, isLarge]);
    return (
        <View className="flex-1 w-full flex-col">
            <View className="px-4 py-2 flex-row items-center space-x-3 border-b border-slate-100 dark:border-slate-800" style={{ backgroundColor: theme.panel }}>
                <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search matrix rows..." placeholderTextColor="#94a3b8" style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text }} className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/60 outline-none" />
                {totalFiltered.length > 0 && (
                    <TouchableOpacity onPress={onSelectAllOffers} className="px-4 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-row items-center justify-center bg-slate-50 dark:bg-slate-900">
                        <View style={{ borderColor: isAllItemsSelected ? theme.primary : '#94a3b8', backgroundColor: isAllItemsSelected ? theme.primary : 'transparent' }} className="w-3.5 h-3.5 rounded border mr-2 flex items-center justify-center">{isAllItemsSelected && <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white">✓</Text>}</View>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.textDark }} className="text-xs font-bold">{isAllItemsSelected ? "Deselect" : "Select All"}</Text>
                    </TouchableOpacity>
                )}
            </View>
            <ScrollView className="flex-1 w-full" contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={theme.primary} />}>
                {paginatedItems.length === 0 ? (
                    <View className="p-12 items-center"><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="text-slate-400">No matching records found.</Text></View>
                ) : isLarge ? (
                    <ProcurementTable items={paginatedItems} selectedOffers={selectedOffers} onToggleOfferSelection={onToggleOfferSelection} theme={theme} />
                ) : (
                    <ProcurementCardDeck items={paginatedItems} selectedOffers={selectedOffers} onToggleOfferSelection={onToggleOfferSelection} theme={theme} />
                )}
                {isLarge && paginatedItems.length > 0 && (
                    <View className="flex flex-row items-center justify-between mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                        <TouchableOpacity disabled={currentPage === 1} onPress={() => setCurrentPage(currentPage - 1)} className="px-4 h-8 rounded-xl border flex items-center justify-center bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-500">◀ Prev</Text></TouchableOpacity>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>Page {currentPage} of {totalPages}</Text>
                        <TouchableOpacity disabled={currentPage === totalPages} onPress={() => setCurrentPage(currentPage + 1)} className="px-4 h-8 rounded-xl border flex items-center justify-center bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-500">Next ▶</Text></TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
