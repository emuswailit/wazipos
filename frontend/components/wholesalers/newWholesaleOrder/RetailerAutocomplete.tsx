import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RetailerOption } from '../../../app/(wholesalers)/newWholesaleOrder/types';

interface RetailerAutocompleteProps {
    theme: any;
    retailers: RetailerOption[];
    onSelect: (retailer: RetailerOption | null) => void;
    selectedRetailer: RetailerOption | null;
}
export default function RetailerAutocomplete({ theme, retailers, onSelect, selectedRetailer }: RetailerAutocompleteProps) {
    const [searchQuery, setSearchQuery] = useState(selectedRetailer ? selectedRetailer.title : '');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const filteredRetailers = searchQuery.trim() === ''
        ? retailers
        : retailers.filter((shop) => shop.title.toLowerCase().includes(searchQuery.toLowerCase()));
    const handleSelectRetailer = (shop: RetailerOption) => {
        setSearchQuery(shop.title);
        setShowSuggestions(false);
        onSelect(shop);
    };
    const handleClear = () => {
        setSearchQuery('');
        setShowSuggestions(false);
        onSelect(null);
    };
    return (
        <View className="mb-8 p-5 rounded-2xl border-2 z-40 bg-slate-50/50 dark:bg-slate-900/30" style={{ borderColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }}>
            <Text className="text-lg font-black tracking-tight mb-1" style={{ color: theme.text }}>1. Select Retailer / Customer Profile <Text className="text-red-500 font-bold">*</Text></Text>
            <Text className="text-xs mb-3 font-medium opacity-70" style={{ color: theme.textDark }}>You must search and assign a verified retail shop outlet before building the product manifest ledger.</Text>
            <View className="relative">
                <TextInput
                    className="border-2 rounded-xl p-4 text-base font-semibold pr-12 shadow-sm"
                    style={{ borderColor: selectedRetailer ? '#22c55e' : '#007aff', color: theme.text, backgroundColor: theme.panel }}
                    placeholder="Type retail shop name to search (e.g. Lael)..."
                    placeholderTextColor="#a1a1aa"
                    value={searchQuery}
                    onChangeText={(text) => { setSearchQuery(text); if (selectedRetailer) onSelect(null); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity className="absolute right-4 top-4.5 p-1" onPress={handleClear}>
                        <Text style={{ color: theme.textDark }} className="font-extrabold text-sm">✕</Text>
                    </TouchableOpacity>
                )}
                {showSuggestions && (
                    <View className="absolute left-0 right-0 top-16 rounded-xl shadow-2xl border-2 max-h-56 overflow-hidden z-50 mt-1" style={{ backgroundColor: theme.panel, borderColor: '#007aff' }}>
                        {filteredRetailers.length === 0 ? (
                            <View className="p-4 items-center justify-center">
                                <Text style={{ color: theme.textDark }} className="text-sm italic font-medium">No matching retail shops found in database records</Text>
                            </View>
                        ) : (
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                {filteredRetailers.map((shop) => (
                                    <TouchableOpacity key={shop.key} className="p-3.5 border-b border-gray-100 hover:bg-slate-100 dark:hover:bg-slate-800" style={{ borderColor: theme.background }} onPress={() => handleSelectRetailer(shop)}>
                                        <Text style={{ color: theme.text }} className="text-base font-bold">{shop.title}</Text>
                                        <Text style={{ color: theme.textDark }} className="text-xs opacity-60 font-mono mt-0.5">UUID: {shop.key}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                )}
            </View>
            {selectedRetailer ? (
                <View className="mt-3 flex-row items-center bg-green-50 dark:bg-green-950/30 p-2.5 rounded-lg border border-green-300">
                    <Text className="text-xs text-green-700 dark:text-green-400 font-bold">✓ CUSTOMER PROFILE LOCKED: <Text className="font-black underline">{selectedRetailer.title}</Text></Text>
                </View>
            ) : (
                <View className="mt-3 flex-row items-center bg-blue-50 dark:bg-blue-950/20 p-2.5 rounded-lg border border-blue-200">
                    <Text className="text-xs text-blue-700 dark:text-blue-400 font-semibold animate-pulse">⚠️ Awaiting retailer lock verification link above...</Text>
                </View>
            )}
        </View>
    );
}
