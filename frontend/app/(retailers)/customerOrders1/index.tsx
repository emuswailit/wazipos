import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { dbInstance } from '@/databases/db';
import { useApi } from '@/hooks/useApi';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import OrderInvoiceModal from './OrderInvoiceModal';
import OrderListDesktopRow from './OrderListDesktopRow';
import OrderListMobileCard from './OrderListMobileCard';
import OrderListSearchBar from './OrderListSearchBar';
import OrderPaginationFooter from './OrderPaginationFooter';
export default function OrderListConsole() {
    const [searchQuery, setSearchQuery] = useState(''), [selectedOrder, setSelectedOrder] = useState<any>(null), [lastSynced, setLastSynced] = useState('--:--'), [localOrders, setLocalOrders] = useState<any[]>([]), isFetchingRef = useRef(false), { theme, isDarkMode } = useAuth(), getOrdersApi = useApi(retailersApi.retailerOrdersAction), isWeb = Platform.OS === 'web';
    const [currentPage, setCurrentPage] = useState(1), [itemsPerPage, setItemsPerPage] = useState(10);
    const hydrate = async () => { try { setLocalOrders(isWeb ? await dbInstance.customerOrders.toArray() : JSON.parse(await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload') || '[]')); } catch { } };



    useEffect(() => {
        dbInstance.customerOrders.bulkDelete
    }, [])


    const getOrders = async () => {
        if (isFetchingRef.current) return; isFetchingRef.current = true;
        try {
            const res = await getOrdersApi.request({ "action": "RetrieveOwnOrders" });
            const inc = res?.data && ('results' in res.data ? (res.data as any).results : res.data);
            if (res?.ok && Array.isArray(inc)) {
                for (const o of inc) {
                    console.log("odaitems", o.order_items)
                    const mapped = { draftId: o.draft_id || o.id || `r-${Date.now()}`, order_number: String(o.order_number || ''), status: o.status || 'CLOSED', is_paid: !!o.is_paid, synced: true, customerName: o.customer_name || 'Walk-in Retail Customer', customerPhone: o.customer_phone || '', deliveryMethod: o.delivery_method || 'PICKUP', shippingCost: parseFloat(o.shipping_amount) || 0, selectedPaymentMethodId: o.payment_method || '', paymentAccountNumber: o.payment_account_number || '', dueDate: o.credit_due_date || null, vendor_session_id: o.vendor_session_id || '', updatedAt: o.updated || new Date().toISOString(), customerOrderItems: Array.isArray(o.order_items) ? o.order_items.map((i: any) => ({ customer_order_draft_id: o.draft_id || o.id, retailer_receipt: i.retailer_receipt || '', product_name: i.product_name || 'Unnamed Asset Product', purchased_quantity: Number(i.purchased_quantity) || 1, final_unit_selling_price: String(i.final_unit_selling_price || i.unit_selling_price || i.item_final_price || i.price || '0.00'), item_discount: String(i.item_discount || '0.00'), unit_of_issue: i.unit_of_issue || 'PIECE', status: i.status || 'CLOSED' })) : [] };
                    if (isWeb) { await dbInstance.customerOrders.put(mapped); } else { let l = JSON.parse(await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload') || '[]'); l = l.filter((x: any) => x.draftId !== mapped.draftId); l.push(mapped); await SecureStore.setItemAsync('wazipos_secure_customer_orders_payload', JSON.stringify(l)); }
                }
                await hydrate(); const now = new Date(); setLastSynced(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            }
        } catch { } finally { isFetchingRef.current = false; }
    };
    useEffect(() => {
        hydrate(); getOrders(); const pid = setInterval(() => getOrders(), 300000); return () => clearInterval(pid);

    }, []);
    useEffect(() => { setCurrentPage(1); }, [searchQuery, itemsPerPage]);
    const filtered = useMemo(() => { const q = searchQuery.trim().toLowerCase(); return q ? localOrders.filter(o => o.order_number?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q) || o.draftId?.toLowerCase().includes(q)) : localOrders; }, [searchQuery, localOrders]);
    const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / itemsPerPage)), [filtered, itemsPerPage]);
    const paginatedOrders = useMemo(() => { const s = (currentPage - 1) * itemsPerPage; return filtered.slice(s, s + itemsPerPage); }, [filtered, currentPage, itemsPerPage]);
    const getStl = (s: string) => { const x = String(s || '').toUpperCase(); return (x === 'PROCESSING' || x === 'PENDING' || x === 'OPEN') ? { bg: isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' } : (x === 'SUCCESS' || x === 'COMPLETED' || x === 'CLOSED') ? { bg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' } : { bg: isDarkMode ? 'bg-rose-500/10' : 'bg-rose-50', text: 'text-rose-600', dot: 'bg-rose-500' }; };
    const getCnt = (o: any) => o.customerOrderItems?.reduce((a: number, c: any) => a + (Number(c.purchased_quantity) || 0), 0) || o.order_items?.reduce((a: number, c: any) => a + (Number(c.purchased_quantity) || 0), 0) || 0;

    useEffect(() => {
        console.log("localOrders", localOrders);
    }, [localOrders]);
    return (
        <View style={{ backgroundColor: theme?.background || '#f8fafc' }} className="w-full flex-col px-4 py-6 md:px-8 flex-1 relative">
            <View className="w-full flex-row justify-between items-end mb-6"><View className="flex-col"><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xl, color: theme?.text }} className="tracking-tight font-black">Local Orders Ledger</Text><Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="mt-0.5">Manage and track offline storage records and live shipments</Text></View><View className="flex-row items-center space-x-2">{getOrdersApi.loading && <ActivityIndicator size="small" color={theme?.text} className="mr-2" />}<Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="uppercase tracking-widest opacity-60">Synced {lastSynced}</Text></View></View>
            <OrderListSearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
            {!filtered.length ? (
                <View className="w-full py-16 items-center justify-center rounded-3xl border border-dashed mt-4" style={{ backgroundColor: theme?.panel, borderColor: `${theme?.textDark}20` }}><Text style={{ fontSize: theme?.fontSize?.xl }} className="mb-2">📦</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.base, color: theme?.text }} className="tracking-tight font-bold">No matching records found</Text><Text style={{ fontFamily: theme?.font?.regular, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="mt-1">Try refining search keywords</Text></View>
            ) : (
                <View className="w-full mt-4 flex-1">
                    <View className="flex flex-col md:hidden space-y-4 w-full">{paginatedOrders.map(o => <OrderListMobileCard key={o.draftId} order={o} onOpenInvoice={() => setSelectedOrder(o)} statusConfig={getStl(o.status)} totalItemsCount={getCnt(o)} />)}</View>
                    <View className="hidden md:flex w-full rounded-2xl border overflow-hidden shadow-sm" style={{ backgroundColor: theme?.panel, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }}>
                        <View className="flex-row items-center px-6 h-12 border-b bg-slate-50 dark:bg-slate-800/50" style={{ borderBottomColor: isDarkMode ? '#334155' : '#e2e8f0' }}><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex-[2.5] uppercase tracking-widest font-bold">Reference / Code</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex- uppercase tracking-widest font-bold">Customer Account</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex-[1.2] uppercase tracking-widest text-center font-bold">Items Scope</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex-[1.5] uppercase tracking-widest text-center font-bold">Payment Channel</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex-[1.5] uppercase tracking-widest text-right font-bold pr-4">Order Total</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex-[1.5] uppercase tracking-widest text-center font-bold">Sync Gateway</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="flex-[1.2] uppercase tracking-widest text-right font-bold">Action</Text></View>
                        <ScrollView showsVerticalScrollIndicator={false}>{paginatedOrders.map(o => <OrderListDesktopRow key={o.draftId} order={o} onOpenInvoice={() => setSelectedOrder(o)} statusConfig={getStl(o.status)} totalItemsCount={getCnt(o)} theme={theme} />)}</ScrollView>
                    </View>
                    {/* 🚀 INCORPORATED MODULAR SEPARATE FOOTER MODULE COMPONENT */}
                    <OrderPaginationFooter currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={filtered.length} onPageChange={setCurrentPage} onLimitChange={setItemsPerPage} theme={theme} isDarkMode={isDarkMode} />
                </View>
            )}
            {selectedOrder && <OrderInvoiceModal visible={!!selectedOrder} order={selectedOrder} onClose={() => setSelectedOrder(null)} theme={theme} isDarkMode={isDarkMode} />}
        </View>
    );
}
