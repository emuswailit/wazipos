import retailersApi from "@/api/retailersApi";
import { useAuth } from "@/context/AuthContext";
import { useProductsSync } from "@/context/ProductsSyncContext ";
import useApi from "@/hooks/useApi";
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OutOfStockFormModal from './OutOfStockFormModal';
import OutOfStockResponsiveMatrix from './OutOfStockResponsiveMatrix';
import { useOutOfStockDashboard } from './useOutOfStockDashboard';

export default function OutOfStockPipelineDashboard() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 800;
    const { theme, isDarkMode } = useAuth();
    const { productsList } = useProductsSync()

    useEffect(() => {
        console.log('Products list updated:', productsList);
    }, [productsList]);


    const outOfStockApi = useApi<any>(async (d: any) => await retailersApi.outOfStockAction(d));
    const ui = useOutOfStockDashboard(outOfStockApi);

    if (outOfStockApi.loading && ui.productOptions.length === 0) return (
        <View className="flex-1 justify-center items-center" style={{ backgroundColor: theme.background }}>
            <ActivityIndicator size="large" color={theme.primary} />
        </View>
    );

    return (
        <SafeAreaView className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            {/* Unified Control Toolbar & Metrics Header */}
            <View className="p-4 md:p-6 border-b shadow-sm border-slate-200 dark:border-slate-800" style={{ backgroundColor: theme.panel }}>
                <View className="w-full max-w-7xl self-center flex-col md:flex-row justify-between items-start md:items-center gap-y-4 mb-4">
                    <View className="flex-col">
                        <Text
                            style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }}
                            className="font-black tracking-tight"
                        >
                            Out of Stock Log Register
                        </Text>
                        <View className="bg-amber-500/10 px-2 py-0.5 rounded-md self-start mt-1.5">
                            <Text
                                style={{ color: '#d97706', fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }}
                                className="font-bold tracking-wider uppercase"
                            >
                                📊 {ui.stats.totalLines} lines missing ({ui.stats.totalUnits} Units)
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={() => { ui.setSelectedEditItem(null); ui.setModalVisible(true); }}
                        style={{ backgroundColor: theme.primary }}
                        className="w-full md:w-auto px-5 h-11 items-center justify-center rounded-xl shadow-md active:opacity-90 transition-all"
                    >
                        <Text
                            style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: '#ffffff' }}
                            className="font-bold uppercase tracking-wider"
                        >
                            ➕ Log Shortage Anomaly
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Clean, Full-Width Search Panel Field */}
                <View className="w-full max-w-7xl self-center">
                    <TextInput
                        style={{
                            backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
                            color: theme.text,
                            borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.base
                        }}
                        className="w-full h-11 px-4 rounded-xl border shadow-inner"
                        placeholder="Search missing stocks by product name..."
                        value={ui.searchQuery}
                        onChangeText={ui.setSearchQuery}
                        placeholderTextColor={isDarkMode ? '#475569' : '#94a3b8'}
                        keyboardShouldPersistTaps="handled"
                    />
                </View>
            </View>

            {/* Responsive Inventory Shortage Listing Block Layout */}
            <View className="flex-1 w-full max-w-7xl self-center p-4">
                <OutOfStockResponsiveMatrix
                    theme={theme}
                    isDarkMode={isDarkMode}
                    isLargeScreen={isLarge}
                    filteredItems={ui.filteredItems}
                    refreshing={outOfStockApi.loading}
                    onRefresh={ui.syncShortagesLedgerData}
                    onOpenEdit={(item) => { ui.setSelectedEditItem(item); ui.setModalVisible(true); }}
                />
            </View>

            {/* Persistent Modal Data Form Overlay Context */}
            {ui.modalVisible && (
                <OutOfStockFormModal
                    theme={theme}
                    isDarkMode={isDarkMode}
                    visible={ui.modalVisible}
                    productOptions={productsList}
                    editItem={ui.selectedEditItem}
                    submitting={outOfStockApi.loading || ui.localDbLoading || ui.oosDbLoading}
                    onClose={() => ui.setModalVisible(false)}
                    onSubmit={ui.handleFormSubmit}
                />
            )}
        </SafeAreaView>
    );
}
