import React, { useMemo } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type FilterTab = 'ALL' | 'ACTIVE' | 'EXPIRED';

interface HeaderMetricsProps {
    retailerReceipts: any[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    activeTab: FilterTab;
    setActiveTab: (tab: FilterTab) => void;
    isDarkMode: boolean;
    setIsAddModalOpen: (open: boolean) => void; // ✨ Added modal trigger state propagation
    theme: {
        panel: string;
        background: string;
        text: string;
        textDark: string;
        primary: string;
        font: {
            regular: string;
            medium: string;
            bold: string;
            mono: string;
        };
    };
}

export default function HeaderMetrics({
    retailerReceipts,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    isDarkMode,
    setIsAddModalOpen,
    theme,
}: HeaderMetricsProps) {

    const { totalItemsCount, totalCatalogValue } = useMemo(() => {
        let count = 0;
        let totalValue = 0;

        retailerReceipts.forEach((item) => {
            const qty = item.current_unit_quantity || 0;
            const price = parseFloat(item.final_unit_selling_price || item.price || '0');
            count += qty;
            totalValue += qty * price;
        });

        return { totalItemsCount: count, totalCatalogValue: totalValue };
    }, [retailerReceipts]);

    const renderTabButton = (type: FilterTab, label: string) => {
        const isSelected = activeTab === type;
        let tabTextColor = theme.textDark;
        if (isSelected) {
            tabTextColor = theme.primary;
        } else if (isDarkMode) {
            tabTextColor = '#94a3b8';
        }

        return (
            <TouchableOpacity
                onPress={() => setActiveTab(type)}
                activeOpacity={0.7}
                className="px-4 py-2 mr-2 rounded-xl border transition-all"
                style={{
                    backgroundColor: isSelected ? `${theme.primary}15` : theme.panel,
                    borderColor: isSelected ? theme.primary : (isDarkMode ? '#334155' : '#e2e8f0')
                }}
            >
                <Text className="text-xs font-bold" style={{ color: tabTextColor, fontFamily: theme.font.bold }}>
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View
            className="w-full p-4 border-b shadow-sm z-10 gap-3"
            style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#f1f5f9' }}
        >
            {/* Constrained layout grid to 80% matching the master container context alignment */}
            <View className="w-[80%] max-w-6xl mx-auto gap-3">
                <View className="flex-row justify-between items-center mb-1 flex-wrap gap-2">
                    <View>
                        <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                            Total Items Tracked
                        </Text>
                        <Text className="text-lg font-extrabold" style={{ color: theme.text, fontFamily: theme.font.bold }}>
                            {totalItemsCount.toLocaleString()} Units
                        </Text>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="items-end">
                            <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                                Net Valuation Asset Base
                            </Text>
                            <Text className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400" style={{ fontFamily: theme.font.bold }}>
                                KES {totalCatalogValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                        </View>

                        {/* ✨ Added Action Button straight into the Header layout layer */}
                        <TouchableOpacity
                            onPress={() => setIsAddModalOpen(true)}
                            className="px-4 py-2.5 rounded-xl flex-row items-center gap-1.5 shadow-xs"
                            style={{ backgroundColor: theme.primary }}
                            activeOpacity={0.8}
                        >
                            <Text className="text-xs font-bold text-white" style={{ fontFamily: theme.font.bold }}>+ Add New Item</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TextInput
                    className="w-full px-4 py-3 rounded-xl border text-sm font-medium"
                    style={{
                        backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                        borderColor: isDarkMode ? '#475569' : '#cbd5e1',
                        color: theme.text,
                        fontFamily: theme.font.medium
                    }}
                    placeholder="Search catalog by title, long name or barcode..."
                    placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    clearButtonMode="while-editing"
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    {renderTabButton('ALL', `All Line Items (${retailerReceipts.length})`)}
                    {renderTabButton('ACTIVE', 'Active Only')}
                    {renderTabButton('EXPIRED', 'Expired Batches')}
                </ScrollView>
            </View>
        </View>
    );
}
