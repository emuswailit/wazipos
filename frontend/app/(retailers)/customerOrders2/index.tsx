import { useAuth } from '@/context/AuthContext';
import { dbInstance } from '@/databases/db';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderDesktopTableGrid } from './OrderDesktopTableGrid';
import { OrderInvoiceDetailsModal } from './OrderInvoiceDetailsModal';
import { OrderMobileCardList } from './OrderMobileCardList';
import { OrderPaginationControls } from './OrderPaginationControls';
import { OrderSearchBar } from './OrderSearchBar';
export default function OrdersListScreen() {
    const { theme } = useAuth();
    const router = useRouter();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const fetchLocalHistoricalOrders = async () => {
        try {
            let fetchedList: any[] = [];
            if (Platform.OS === 'web') { if (dbInstance?.customerOrders) fetchedList = await dbInstance.customerOrders.toArray(); }
            else { const raw = await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload'); fetchedList = raw ? JSON.parse(raw) : []; }
            if (Array.isArray(fetchedList)) { fetchedList.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()); setOrders(fetchedList); }
        } catch (e) { console.error(e); } finally { setLoading(false); setRefreshing(false); }
    };
    useEffect(() => { fetchLocalHistoricalOrders(); }, []);
    const getOrderTotal = (order: any) => { return (order.customerOrderItems || []).reduce((acc: number, item: any) => acc + (Number(item.purchased_quantity || 0) * Number(item.unit_selling_price || 0)) - Number(item.item_discount || 0), 0); };
    const filteredOrders = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return orders;
        return orders.filter((o: any) => (o.order_number || '').toLowerCase().includes(query) || (o.draft_id || '').toLowerCase().includes(query));
    }, [orders, searchQuery]);
    const paginatedOrders = useMemo(() => {
        if (Platform.OS !== 'web') return filteredOrders;
        const startIndex = (currentPage - 1) * rowsPerPage;
        return filteredOrders.slice(startIndex, startIndex + rowsPerPage);
    }, [filteredOrders, currentPage, rowsPerPage]);
    const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
    useEffect(() => { setCurrentPage(1); }, [searchQuery, rowsPerPage]);
    const triggerPlatformInvoicePdfPrint = async (order: any) => {
        try {
            const total = getOrderTotal(order).toFixed(2);
            const itemsHtml = (order.customerOrderItems || []).map((i: any) => `<tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-family: sans-serif; font-size: 13px;">${i.product_name}</td><td style="padding: 8px 0; text-align: center; font-family: monospace;">${i.purchased_quantity}</td><td style="padding: 8px 0; text-align: right; font-family: monospace;">${Number(i.unit_selling_price).toFixed(2)}</td><td style="padding: 8px 0; text-align: right; font-family: monospace;">${Number(i.item_discount).toFixed(2)}</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-weight: bold;">${(i.purchased_quantity * i.unit_selling_price - i.item_discount).toFixed(2)}</td></tr>`).join('');
            const invoiceHtmlDocumentString = `<html><body style="padding: 24px; font-family: sans-serif; color: #0f172a;"><h1>WAZIPOS RECEIPT</h1><p><strong>Order:</strong> ${order.order_number || 'DRAFT'}</p><p><strong>Status:</strong> ${String(order.status || 'OPEN').toUpperCase()} • <strong>Payment:</strong> ${order.is_paid ? 'PAID' : 'UNPAID'}</p><table style="width:100%; border-collapse:collapse; margin-top:20px;"><thead><tr style="border-bottom:2px solid #cbd5e1;"><th style="padding:8px 0; text-align:left;">Item</th><th style="padding:8px 0; text-align:center;">Qty</th><th style="padding:8px 0; text-align:right;">Rate</th><th style="padding:8px 0; text-align:right;">Disc</th><th style="padding:8px 0; text-align:right;">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table><h3 style="text-align:right; margin-top:20px;">Total: KES ${total}</h3></body></html>`;
            if (Platform.OS === 'web') {
                const iframe = document.createElement('iframe'); iframe.style.position = 'fixed'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; document.body.appendChild(iframe);
                iframe.contentWindow?.document.open(); iframe.contentWindow?.document.write(invoiceHtmlDocumentString); iframe.contentWindow?.document.close();
                setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); document.body.removeChild(iframe); }, 500);
            } else { try { const Print = require('expo-print'); await Print.printAsync({ html: invoiceHtmlDocumentString }); } catch { Alert.alert("Print Unavailable", "Expo-Print module failure."); } }
        } catch (err) { console.error(err); }
    };
    return (
        <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1 w-full" edges={['top', 'left', 'right']}>
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} className="w-full lg:max-w-[85vw] lg:mx-auto" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLocalHistoricalOrders(); }} tintColor={theme.primary} />}>
                <View className="w-full flex flex-col md:flex-row justify-between items-start md:items-center pb-4 mb-6 border-b border-slate-200 dark:border-slate-800 min-h-[56px]">
                    <View className="flex-col"><Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 26 }} className="tracking-tight font-black">Orders</Text><Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 14 }} className="mt-0.5">Historical log of locally cached ledger receipts</Text></View>
                    <TouchableOpacity onPress={() => router.back()} style={{ borderColor: theme.textDark + '30' }} className="border px-4 py-2 rounded-xl active:opacity-70"><Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 14 }}>← Back</Text></TouchableOpacity>
                </View>
                <OrderSearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} rowsPerPage={rowsPerPage} onRowsChange={setRowsPerPage} theme={theme} />
                {loading ? (<View className="flex-1 min-h-[300px] items-center justify-center"><ActivityIndicator size="large" color={theme.primary} /></View>
                ) : filteredOrders.length === 0 ? (<View style={{ borderColor: theme.textDark + '20' }} className="flex-1 min-h-[260px] items-center justify-center p-8 border-2 border-dashed rounded-2xl"><Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 15 }} className="text-center">No transactions match your current lookup parameters.</Text></View>
                ) : (
                    <View className="w-full">
                        <OrderDesktopTableGrid paginatedOrders={paginatedOrders} getOrderTotal={getOrderTotal} theme={theme} onSelect={setSelectedOrder} onPrint={triggerPlatformInvoicePdfPrint} />
                        <OrderMobileCardList filteredOrders={filteredOrders} getOrderTotal={getOrderTotal} theme={theme} onSelect={setSelectedOrder} onPrint={triggerPlatformInvoicePdfPrint} />
                        <OrderPaginationControls totalPages={totalPages} currentPage={currentPage} onPageChange={setCurrentPage} filteredCount={filteredOrders.length} theme={theme} />
                    </View>
                )}
            </ScrollView>
            <OrderInvoiceDetailsModal visible={!!selectedOrder} order={selectedOrder} theme={theme} totalAmount={selectedOrder ? getOrderTotal(selectedOrder) : 0} onClose={() => setSelectedOrder(null)} onPrint={() => triggerPlatformInvoicePdfPrint(selectedOrder)} />
        </SafeAreaView>
    );
}
