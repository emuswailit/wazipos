import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import useApi from '@/hooks/useApi';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OrderInvoiceModal from './OrderInvoiceModal';
import { OrderCardDeck, OrderTable } from './OrderViews';

export default function OrderTrackingDashboard() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= 1024;
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

    const getOrdersApi = useApi<any>(async () => await retailersApi.retailStaffAction({ action: "RetrieveRetailerOrders" }));
    const handleFetchRegistryLedger = () => { getOrdersApi.request(); };
    useEffect(() => { handleFetchRegistryLedger(); }, []);

    const rawOrders = useMemo(() => getOrdersApi.data?.orders || getOrdersApi.data || [], [getOrdersApi.data]);
    const processedOrders = useMemo(() => {
        let items = [...rawOrders];
        const query = searchQuery.toLowerCase().trim();
        if (query) items = items.filter(o => String(o.document_number || "").toLowerCase().includes(query) || String(o.wholesaler_title || "").toLowerCase().includes(query));
        if (statusFilter !== 'ALL') items = items.filter(o => String(o.status).toUpperCase() === statusFilter);
        return items;
    }, [rawOrders, searchQuery, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(processedOrders.length / itemsPerPage));
    const paginatedOrders = useMemo(() => processedOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [processedOrders, currentPage, itemsPerPage]);

    const getStatusStyle = (s: string) => {
        if (s === 'COMPLETED' || s === 'RECEIVED') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
        if (s === 'SUBMITTED' || s === 'PROCESSING') return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
        if (s === 'CANCELLED') return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    };

    if (getOrdersApi.loading && !getOrdersApi.data) {
        return (
            <View className="flex-1 items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
                <ActivityIndicator size="large" className="text-blue-600" />
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mt-4 text-center text-slate-500 dark:text-slate-400">Loading Freight Registry Logs...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 w-full bg-slate-50 dark:bg-slate-950">
            <View className="px-6 py-2.5 border-b flex-col md:flex-row justify-between items-start md:items-center gap-3 border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900">
                <View>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase tracking-wider opacity-60 text-slate-500 dark:text-slate-400">Procurement Logistics</Text>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }} className="text-base font-bold">Supply Chain Orders</Text>
                </View>
                <View className="flex-row flex-wrap items-center gap-2 w-full md:w-auto">
                    <TextInput value={searchQuery} onChangeText={(q) => { setSearchQuery(q); setCurrentPage(1); }} placeholder="Search ref or wholesaler..." placeholderTextColor="#94a3b8" style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, backgroundColor: theme.background, color: theme.text, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} className="h-8 px-3 rounded-lg border w-full sm:w-48 outline-none" />
                    {Platform.OS === 'web' && (
                        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={{ height: 32, paddingLeft: 8, paddingRight: 8, fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, borderRadius: 8, borderColor: isDarkMode ? '#334155' : '#e2e8f0', backgroundColor: theme.panel, color: theme.text, borderStyle: 'solid', borderWidth: 1 }}>
                            <option value="ALL">All Statuses</option><option value="SUBMITTED">Submitted</option><option value="PROCESSING">Processing</option><option value="DISPATCHED">Dispatched</option><option value="RECEIVED">Received</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
                        </select>
                    )}
                    {isLarge && Platform.OS === 'web' && (
                        <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} style={{ height: 32, paddingLeft: 8, paddingRight: 8, fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, borderRadius: 8, borderColor: isDarkMode ? '#334155' : '#e2e8f0', backgroundColor: theme.panel, color: theme.text, borderStyle: 'solid', borderWidth: 1 }}>
                            <option value={10}>10 Rows</option><option value={20}>20 Rows</option><option value={50}>50 Rows</option><option value={100}>100 Rows</option>
                        </select>
                    )}
                </View>
            </View>
            <ScrollView className="flex-1 w-full" contentContainerStyle={{ padding: isLarge ? 24 : 16 }} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} refreshControl={<RefreshControl refreshing={getOrdersApi.loading} onRefresh={handleFetchRegistryLedger} className="text-blue-600" />}>
                {paginatedOrders.length === 0 ? (
                    <View className="p-12 items-center justify-center"><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="text-slate-400 text-center">No active transit logs discovered.</Text></View>
                ) : isLarge ? (
                    <OrderTable orders={paginatedOrders} onSelect={setSelectedOrder} getStatusStyle={getStatusStyle} />
                ) : (
                    <OrderCardDeck orders={paginatedOrders} onSelect={setSelectedOrder} getStatusStyle={getStatusStyle} />
                )}
                <View className="mt-2 mb-6 pt-4 border-t border-slate-200/60 dark:border-slate-800/80 flex-row items-center justify-between">
                    <TouchableOpacity disabled={currentPage === 1} onPress={() => setCurrentPage(currentPage - 1)} style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} className={`px-4 h-8 rounded-xl border flex items-center justify-center ${currentPage === 1 ? 'opacity-30' : 'active:scale-95'}`}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-500 dark:text-slate-400">◀ Prev</Text></TouchableOpacity>
                    <View className="items-center flex-1 px-2">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>Page {currentPage} of {totalPages}</Text>
                        <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5 font-medium">Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, processedOrders.length)} of {processedOrders.length}</Text>
                    </View>
                    <TouchableOpacity disabled={currentPage === totalPages} onPress={() => setCurrentPage(currentPage + 1)} style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} className={`px-4 h-8 rounded-xl border flex items-center justify-center ${currentPage === totalPages ? 'opacity-30' : 'active:scale-95'}`}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-500 dark:text-slate-400">Next ▶</Text></TouchableOpacity>
                </View>
            </ScrollView>
            <OrderInvoiceModal order={selectedOrder} visible={selectedOrder !== null} onClose={() => setSelectedOrder(null)} onRefreshParentLedger={handleFetchRegistryLedger} />
        </SafeAreaView>
    );
}
