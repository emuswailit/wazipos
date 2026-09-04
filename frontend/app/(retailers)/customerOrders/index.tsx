import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import OrderInvoiceModal from './OrderInvoiceModal';
import OrderListDesktopRow from './OrderListDesktopRow';
import OrderListMobileCard from './OrderListMobileCard';
import OrderListSearchBar from './OrderListSearchBar';
import { localCache } from './storage';
import { OrderRecord } from './types';

export default function OrderListConsole() {
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
    const [lastSynced, setLastSynced] = useState<string>('--:--');
    const [isRetryingPayment, setIsRetryingPayment] = useState<boolean>(false);
    const { theme, isDarkMode } = useAuth();
    const getCustomerOrdersApi = useApi(retailersApi.retailerOrdersAction);
    const isFetchingRef = useRef<boolean>(false);

    useEffect(() => {
        console.log("🎯 getCustomerOrdersApi.data updated:", getCustomerOrdersApi.data);
    }, [getCustomerOrdersApi.data]);

    useEffect(() => {
        const hydrateCachedData = async () => {
            const savedOrders = await localCache.load();
            if (savedOrders && Array.isArray(savedOrders)) {
                getCustomerOrdersApi.setData(savedOrders);
            }
        };
        hydrateCachedData();
    }, []);

    const getCustomerOrders = async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        try {
            const response = await getCustomerOrdersApi.request({ "action": "RetrieveOwnOrders" });
            if (response && response.ok && response.data) {
                const incomingOrders = ('results' in response.data) ? (response.data as any).results : response.data;
                if (incomingOrders && Array.isArray(incomingOrders)) {
                    await localCache.save(incomingOrders);
                }
                const now = new Date();
                setLastSynced(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            }
        } catch (error) {
            console.error("Local data cache persistence write failed:", error);
        } finally {
            isFetchingRef.current = false;
        }
    };

    useEffect(() => {
        getCustomerOrders();
        const pollingInterval = setInterval(() => getCustomerOrders(), 300000);
        return () => clearInterval(pollingInterval);
    }, []);

    const handleRetryPayment = async (order: OrderRecord) => {
        setIsRetryingPayment(true);
        try {
            console.log(`Initiating payment retry flow for Order Ref: ${order.order_number}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            alert(`Payment request dispatched for order ${order.order_number}`);
        } catch (err) {
            console.error("Retry flow fault:", err);
        } finally {
            setIsRetryingPayment(false);
        }
    };

    const ordersList: OrderRecord[] = (getCustomerOrdersApi.data as OrderRecord[]) || [];
    const filteredOrders = useMemo(() => {
        const cleanQuery = searchQuery.trim().toLowerCase();
        if (!cleanQuery) return ordersList;
        return ordersList.filter(order => order.order_number?.toLowerCase().includes(cleanQuery) || order.customer_name?.toLowerCase().includes(cleanQuery));
    }, [searchQuery, ordersList]);

    const getStatusStyle = (status: string) => {
        const s = String(status || '').toUpperCase();
        if (s === 'PROCESSING' || s === 'PENDING') return { bg: isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' };
        if (s === 'SUCCESS' || s === 'COMPLETED') return { bg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' };
        return { bg: isDarkMode ? 'bg-rose-500/10' : 'bg-rose-50', text: 'text-rose-600', dot: 'bg-rose-500' };
    };

    const getOrderItemsCount = (order: OrderRecord) => {
        return order.order_items?.reduce((acc, curr) => acc + (Number(curr.purchased_quantity) || 0), 0) || 0;
    };

    return (
        <View style={{ backgroundColor: theme?.background || '#f8fafc' }} className="w-full flex-col px-4 py-6 md:px-8">
            <View className="w-full flex-row justify-between items-end mb-6">
                <View className="flex-col">
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xl || 20, color: theme?.text || '#0f172a' }} className="tracking-tight">Orders</Text>
                    <Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="mt-0.5">Manage and track live shipments</Text>
                </View>
                <View className="flex-row items-center space-x-2">
                    {getCustomerOrdersApi.loading && <ActivityIndicator size="small" color={theme?.text || '#0f172a'} className="mr-2" />}
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="uppercase tracking-widest opacity-60">Synced {lastSynced}</Text>
                </View>
            </View>
            <OrderListSearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
            {filteredOrders.length === 0 ? (
                <View className="w-full py-16 items-center justify-center rounded-3xl border border-dashed" style={{ backgroundColor: theme?.panel || '#ffffff', borderColor: `${theme?.textDark || '#334155'}15` }}>
                    <Text style={{ fontSize: theme?.fontSize?.xl || 20 }} className="mb-2">📦</Text>
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.base || 14, color: theme?.text || '#0f172a' }} className="tracking-tight">No matching records found</Text>
                    <Text style={{ fontFamily: theme?.font?.regular || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="mt-1">Try refining your search keyword</Text>
                </View>
            ) : (
                <View className="w-full mt-4">
                    <View className="flex flex-col md:hidden space-y-4 w-full">
                        {filteredOrders.map((order) => (
                            <OrderListMobileCard key={order.id} order={order} onOpenInvoice={() => setSelectedOrder(order)} statusConfig={getStatusStyle(order.status)} totalItemsCount={getOrderItemsCount(order)} />
                        ))}
                    </View>
                    <View className="hidden md:flex w-full rounded-2xl border overflow-hidden shadow-sm border-neutral-100 dark:border-neutral-800" style={{ backgroundColor: theme?.panel || '#ffffff', borderColor: `${theme?.textDark || '#334155'}10` }}>
                        <View className="flex-row items-center px-6 h-12 border-b" style={{ backgroundColor: theme?.panel || '#ffffff', borderBottomColor: `${theme?.textDark || '#334155'}10` }}>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="flex-[1.2] uppercase tracking-widest">Reference</Text>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="flex-[1.5] uppercase tracking-widest">Customer Account</Text>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="flex-1 uppercase tracking-widest text-center">Items Scope</Text>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="flex-1 uppercase tracking-widest text-right">Value Total</Text>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="flex-1 uppercase tracking-widest text-center">Transit</Text>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="w-24 uppercase tracking-widest text-center">Action</Text>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {filteredOrders.map((order) => (
                                <OrderListDesktopRow key={order.id} order={order} onOpenInvoice={() => setSelectedOrder(order)} onRetryPayment={handleRetryPayment} statusConfig={getStatusStyle(order.status)} totalItemsCount={getOrderItemsCount(order)} isRetryingPayment={isRetryingPayment} />
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}
            <OrderInvoiceModal order={selectedOrder} onClose={() => setSelectedOrder(null)} isDarkMode={isDarkMode} isRetryingPayment={isRetryingPayment} onRetryPayment={handleRetryPayment} theme={theme} />
        </View>
    );
}
