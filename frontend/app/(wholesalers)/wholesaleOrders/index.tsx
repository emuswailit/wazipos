import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import WholesaleOrderInvoiceModal from './WholesaleOrderInvoiceModal';
import { useWholesaleOrdersList } from './useWholesaleOrdersList';

export default function WholesaleOrdersDashboard() {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
    const { ordersList, isLoading, errorMessage } = useWholesaleOrdersList();

    const handleLaunchInvoiceSheet = (orderPayload: any) => {
        setSelectedOrder(orderPayload);
        setIsInvoiceOpen(true);
    };

    const handleTriggerInvoicePrintMacro = (order: any) => {
        alert(`Initiating thermal print server dispatch routine for Reference Ledger: ${order.reference_number || 'N/A'}`);
    };

    if (isLoading && ordersList.length === 0) {
        return (
            <View className="flex-1 justify-center items-center p-8 w-full" style={{ backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-semibold mt-2 font-mono">Fetching ledger logs from backend...</Text>
            </View>
        );
    }

    if (errorMessage && ordersList.length === 0) {
        return (
            <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full p-6 border rounded-xl items-center justify-center">
                <Text className="text-red-500 text-sm font-bold">⚠️ Connection Error: {errorMessage}</Text>
            </View>
        );
    }

    if (!ordersList || ordersList.length === 0) {
        return (
            <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full p-8 rounded-xl border items-center justify-center">
                <Text style={{ color: theme.textDark }} className="text-sm font-semibold italic">No wholesale retailer ledger entries returned in remote server index pipelines.</Text>
            </View>
        );
    }

    const renderTableRowsLoop = () => (
        <>
            {ordersList.map((order: any) => {
                const isPaid = order.is_paid === 'true';
                return (
                    <View key={order.id} style={{ borderBottomColor: theme.border }} className="flex-row items-center px-4 py-2 border-b">
                        <Text style={{ color: theme.text }} className="flex-2 text-xs font-bold" numberOfLines={1}>{order.retailer_title || 'Unknown Retailer'}</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xxs font-mono truncate px-1">{order.reference_number || 'N/A'}</Text>
                        <Text style={{ color: theme.text }} className="flex-1 text-xs font-medium text-center">{order.order_items?.length || 0} Lines</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xxs font-bold text-center uppercase tracking-wide">{order.payment_method_title || order.order_terms || 'CASH'}</Text>
                        <View className="flex-1 items-center justify-center">
                            <View style={{ backgroundColor: isPaid ? '#22c55e15' : '#ef444415' }} className="px-2.5 py-0.5 rounded-md">
                                <Text style={{ color: isPaid ? '#22c55e' : '#ef4444' }} className="text-[10px] font-black uppercase tracking-widest">{isPaid ? 'PAID' : 'PENDING'}</Text>
                            </View>
                        </View>
                        <Text style={{ color: theme.primary }} className="flex-1 text-xs font-black text-right pr-4">KES {parseFloat(order.final_price_total || order.order_price_total || 0).toFixed(2)}</Text>
                        <View className="flex-1 flex-row items-center justify-end gap-x-2">
                            <TouchableOpacity onPress={() => handleLaunchInvoiceSheet(order)} style={{ backgroundColor: theme.background }} className="px-2.5 py-1.5 rounded-md">
                                <Text style={{ color: theme.text }} className="text-[10px] font-bold uppercase">🔎 View</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleTriggerInvoicePrintMacro(order)} style={{ backgroundColor: theme.primary }} className="px-2.5 py-1.5 rounded-md">
                                <Text className="text-white text-[10px] font-bold uppercase">🖨️ Print</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );
            })}
        </>
    );

    return (
        <ScrollView style={{ flex: 1, width: '100%', backgroundColor: theme.background }} className="flex-col gap-y-3 p-4">
            {isLoading && (
                <View className="flex-row items-center gap-x-2 px-1 justify-end">
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={{ color: theme.textDark }} className="text-[10px] font-bold font-mono uppercase tracking-wider">Syncing Ledger...</Text>
                </View>
            )}
            {!isLargeScreen ? (
                <View className="w-full gap-y-3 px-1">
                    {ordersList.map((order: any) => {
                        const isPaid = order.is_paid === 'true';
                        return (
                            <View key={order.id} style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-4 rounded-xl border shadow-sm flex-col gap-y-2.5">
                                <View className="flex-row justify-between items-center">
                                    <Text style={{ color: theme.text }} className="text-sm font-black w-2/3" numberOfLines={1}>{order.retailer_title || 'Unknown Retailer'}</Text>
                                    <View style={{ backgroundColor: isPaid ? '#22c55e15' : '#ef444415' }} className="px-2 py-0.5 rounded-md">
                                        <Text style={{ color: isPaid ? '#22c55e' : '#ef4444' }} className="text-[9px] font-black uppercase tracking-wider">{isPaid ? 'PAID' : 'PENDING'}</Text>
                                    </View>
                                </View>
                                <Text style={{ color: theme.textDark }} className="text-xxs font-mono opacity-60">REF: {order.reference_number || 'N/A'}</Text>
                                <View style={{ borderTopColor: theme.border }} className="flex-row justify-between items-center mt-1 pt-2 border-t border-dashed">
                                    <Text style={{ color: theme.textDark }} className="text-xs font-semibold">{order.order_items?.length || 0} products</Text>
                                    <Text style={{ color: theme.primary }} className="text-sm font-extrabold">KES {parseFloat(order.final_price_total || order.order_price_total || 0).toFixed(2)}</Text>
                                </View>
                                <View className="flex-row items-center gap-x-2 mt-2 pt-2 border-t" style={{ borderTopColor: theme.border }}>
                                    <TouchableOpacity onPress={() => handleLaunchInvoiceSheet(order)} style={{ backgroundColor: theme.background }} className="flex-1 py-2 items-center justify-center rounded-lg">
                                        <Text style={{ color: theme.text }} className="text-xxs font-bold uppercase">🔎 View Details</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleTriggerInvoicePrintMacro(order)} style={{ backgroundColor: theme.primary }} className="flex-1 py-2 items-center justify-center rounded-lg">
                                        <Text className="text-white text-xxs font-bold uppercase">🖨️ Print Invoice</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ) : (
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full rounded-xl border shadow-sm overflow-hidden">
                    <View style={{ backgroundColor: theme.background, borderBottomColor: theme.border }} className="flex-row px-4 py-3 border-b">
                        <Text style={{ color: theme.textDark }} className="flex-2 text-xs font-black uppercase tracking-wider">Retailer / Client</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider">Reference Ledger</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-center">Manifest Size</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-center">Settlement</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-center">Status</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-right pr-4">Billing Gross</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-right">Actions</Text>
                    </View>
                    {Platform.OS === 'web' ? (
                        <ScrollView className="w-full max-h-[520px]" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                            {renderTableRowsLoop()}
                        </ScrollView>
                    ) : (
                        <View className="w-full">
                            {renderTableRowsLoop()}
                        </View>
                    )}
                </View>
            )}
            <WholesaleOrderInvoiceModal theme={theme} isOpen={isInvoiceOpen} order={selectedOrder} onClose={() => { setIsInvoiceOpen(false); setSelectedOrder(null); }} />
        </ScrollView>
    );
}
