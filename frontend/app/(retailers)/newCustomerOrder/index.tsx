import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import { DatabaseEngine } from '@/databases/db';
import React, { useMemo, useRef } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomerOrderBarcodeScannerTrigger from './CustomerOrdeScannerTrigger';
import OrderLineCard from './OrderLineCard';
import OrderSummaryPane from "./OrderSummaryPane";
import { useUniversalOrderCreator } from './useUniversalOrderCreator';
export default function UniversalOrderCreator({ onSubmitOrder }: any) {
    const { theme, user } = useAuth();
    const { isSyncing, triggerManualFetch, lastSyncedTime, retailerReceipts } = useInventorySync();
    const activeUserSession = user || { id: 'unknown_vendor' };
    const {
        lineItems, selectedPaymentMethodId, setSelectedPaymentMethodMethodId,
        customerName, setCustomerName, customerPhone, setCustomerPhone, dueDate, setDueDate,
        deliveryMethod, setDeliveryMethod, shippingCost, setShippingCost, paymentAccountNumber,
        setPaymentAccountNumber, paymentMethodsList, isCreditSelected, isMobileMoneySelected,
        computedTotals, handleAddNewItem, handleDeleteItem, updateLineItem, handleFormSubmission,
        isSubmitting, setLineItems
    } = useUniversalOrderCreator(activeUserSession, onSubmitOrder);
    const qtyInputRefs = useRef<{ [key: string]: any }>({});
    const hasActiveBlankRowExists = useMemo(() => lineItems.some(i => i.selectedProduct === null), [lineItems]);
    const handleBarcodeLookupSuccess = (scannedSku: string) => {
        const matchedProduct = retailerReceipts?.find((r: any) => r.sku === scannedSku || r.bar_code === scannedSku || r.barcode === scannedSku);
        if (matchedProduct) {
            setLineItems((prevItems: any[]) => {
                let next = [...prevItems];
                const matchIdx = prevItems.findIndex(i => {
                    if (typeof i.selectedProduct === 'string') {
                        try {
                            const parsed = JSON.parse(i.selectedProduct);
                            return parsed && (parsed.id === matchedProduct.id || parsed.key === matchedProduct.key);
                        } catch { return i.selectedProduct === matchedProduct.key; }
                    }
                    return false;
                });
                if (matchIdx > -1) {
                    next[matchIdx].quantity = (next[matchIdx].quantity || 1) + 1;
                } else if (prevItems.length === 1) {
                    const singleItem = prevItems[0];
                    if (singleItem.selectedProduct === null && !singleItem.selectedProductTitle) {
                        next = [{ id: singleItem.id || "1", selectedProduct: JSON.stringify(matchedProduct), selectedProductTitle: String(matchedProduct.title || ""), quantity: 1, price: Number(matchedProduct.price) || 0, discount: 0, searchQuery: String(matchedProduct.title || ""), isDropdownOpen: false }];
                    } else {
                        next = [...prevItems, { id: String((Number(singleItem.id) || 1) + 1), selectedProduct: JSON.stringify(matchedProduct), selectedProductTitle: String(matchedProduct.title || ""), quantity: 1, price: Number(matchedProduct.price) || 0, discount: 0, searchQuery: String(matchedProduct.title || ""), isDropdownOpen: false }];
                    }
                } else {
                    next = [...prevItems, { id: String(Math.max(0, ...prevItems.map(i => Number(i.id) || 0)) + 1), selectedProduct: JSON.stringify(matchedProduct), selectedProductTitle: String(matchedProduct.title || ""), quantity: 1, price: Number(matchedProduct.price) || 0, discount: 0, searchQuery: String(matchedProduct.title || ""), isDropdownOpen: false }];
                }
                try { DatabaseEngine.saveLineItems(next); } catch (e) { console.error(e); }
                return next;
            });
        }
    };
    return (
        <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1 w-full">
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }} className="w-full lg:max-w-[80vw] lg:mx-auto space-y-4" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={triggerManualFetch} colors={[theme.primary]} tintColor={theme.primary} />}>
                <View className="w-full flex flex-col md:flex-row justify-between items-start md:items-center pb-4 mb-6 border-b border-slate-200 dark:border-slate-800 gap-y-4 md:gap-y-0 min-h-[64px] relative z-40">
                    <View className="flex-col flex-1 min-w-0 pr-6">
                        <View className="flex-row items-center flex-wrap gap-x-2.5 gap-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xl, color: theme.text }} className="tracking-tight font-black">New Customer Order</Text>
                            {isSyncing ? (
                                <View className="flex-row items-center bg-blue-500/10 px-2 py-0.5 rounded-md gap-x-1"><ActivityIndicator size="small" color={theme.primary} style={{ transform: [{ scale: 0.7 }] }} /><Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="font-bold tracking-widest uppercase">Syncing</Text></View>
                            ) : lastSyncedTime ? (
                                <View className="bg-emerald-500/10 px-2 py-0.5 rounded-md"><Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="font-bold uppercase tracking-wider">🕒 Synced {lastSyncedTime}</Text></View>
                            ) : null}
                        </View>
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }} className="mt-1 font-medium text-slate-500 dark:text-slate-400">Generate checkout indents and register inventory lines</Text>
                    </View>
                    <View className="w-full md:w-auto min-w-0 md:min-w-[320px] lg:min-w-[420px] items-stretch md:items-end"><CustomerOrderBarcodeScannerTrigger theme={theme} onScanSuccess={handleBarcodeLookupSuccess} /></View>
                </View>
                <View className="flex-col lg:flex-row gap-4 items-start relative z-10 w-full">
                    <View className="flex-1 space-y-3 w-full z-30">
                        {lineItems.map((item) => (<OrderLineCard key={item.id} item={item} theme={theme} allLineItems={lineItems} qtyInputRefs={qtyInputRefs} inventoryPool={retailerReceipts || []} onUpdate={(u) => updateLineItem(item.id, u)} onDelete={() => handleDeleteItem(item.id)} />))}
                        <TouchableOpacity disabled={hasActiveBlankRowExists} onPress={handleAddNewItem} style={{ borderColor: hasActiveBlankRowExists ? '#cbd5e1' : theme.primary }} className={`w-full h-11 border border-dashed rounded-xl items-center justify-center transition-all ${hasActiveBlankRowExists ? 'opacity-40 bg-slate-100/50 dark:bg-slate-800/20' : 'bg-transparent active:bg-slate-50 dark:active:bg-slate-900'}`}>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: hasActiveBlankRowExists ? theme.textDark : theme.primary }}>+ Add Another Product Line</Text>
                        </TouchableOpacity>
                    </View>
                    <View className="w-full lg:w-[360px] xl:w-[400px] z-20">
                        <OrderSummaryPane
                            theme={theme} customerName={customerName} setCustomerName={setCustomerName} customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
                            dueDate={dueDate} setDueDate={setDueDate} deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod} shippingCost={shippingCost}
                            setShippingCost={setShippingCost} paymentAccountNumber={paymentAccountNumber} setPaymentAccountNumber={setPaymentAccountNumber}
                            selectedPaymentMethodId={selectedPaymentMethodId} setSelectedPaymentMethodMethodId={setSelectedPaymentMethodMethodId}
                            paymentMethodsList={paymentMethodsList} isCreditSelected={isCreditSelected} isMobileMoneySelected={isMobileMoneySelected}
                            computedTotals={computedTotals} onSubmitOrder={handleFormSubmission} isSubmitting={isSubmitting}
                        />
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
