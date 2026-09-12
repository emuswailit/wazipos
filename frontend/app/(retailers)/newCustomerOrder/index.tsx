import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FulfillmentControls } from './FulfillmentControls';
import { FulfillmentModal } from './FulfillmentModal';
import { MomoPollerModal } from './MomoPollerModal';
import { OrderMainSection } from './OrderMainSection';
import { UniversalScannerModal } from './UniversalScannerModal';
import { useCreateOrder } from './useCreateOrder';
export default function CreateOrderScreen() {
    const { theme } = useAuth();
    const router = useRouter();
    const scrollRef = useRef<ScrollView>(null);
    const rowCoordinatesRef = useRef<Record<string, number>>({});
    const submitOrderApi = useApi(retailersApi.retailStaffAction);
    const { retailerReceipts, isSyncing, triggerManualFetch, lastSyncedTime, paymentMethodsList, isPaymentSyncing, deliveryMethod, setDeliveryMethod, selectedPaymentMethodId, setSelectedPaymentMethodId, isBottomSheetVisible, setIsBottomSheetVisible, isScannerOpen, setIsScannerOpen, isMomoPolling, momoActiveDraftId, bannerState, paymentDetails, setPaymentDetails, lineItems, isBlankRowPresent, handleUpdateRow, handleSelectProduct, handleAddRow, handleDeleteRow, handleSaveOrder, handleBarcodeScannedContinuously, handleMomoVerificationFinished, totals, localStats } = useCreateOrder(submitOrderApi);
    const lastRowId = lineItems[lineItems.length - 1]?.id;
    useEffect(() => {
        if (lastRowId && rowCoordinatesRef.current[lastRowId] !== undefined) {
            setTimeout(() => { scrollRef.current?.scrollTo({ y: rowCoordinatesRef.current[lastRowId], animated: true }); }, 100);
        }
    }, [lineItems.length, lastRowId]);
    return (
        <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1 w-full relative" edges={['top', 'left', 'right']}>
            {bannerState.visible && (
                <View style={{ backgroundColor: theme.panel, borderColor: bannerState.type === 'success' ? '#10b981' : '#ef4444' }} className="absolute top-6 left-6 right-6 p-4 rounded-2xl border-2 shadow-2xl flex-row items-center space-x-4 z-50">
                    <View style={{ backgroundColor: bannerState.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }} className="w-10 h-10 rounded-full items-center justify-center"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: bannerState.type === 'success' ? '#10b981' : '#ef4444' }}>{bannerState.type === 'success' ? '✓' : '✕'}</Text></View>
                    <View className="flex-1 flex-col"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} className="tracking-tight font-black">{bannerState.title}</Text><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }} className="mt-0.5">{bannerState.subtitle}</Text></View>
                </View>
            )}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1" keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
                <View className="flex-1 relative">
                    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={true} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} className="w-full lg:max-w-[80vw] lg:mx-auto" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={triggerManualFetch} tintColor={theme.primary} />}>
                        <View className="w-full flex flex-col md:flex-row justify-between items-start md:items-center pb-4 mb-6 border-b border-slate-200 dark:border-slate-800 gap-y-4 md:gap-y-0 min-h-[64px] relative z-40">
                            <View className="flex-col flex-1 min-w-0 pr-6">
                                <View className="flex-row items-center flex-wrap gap-x-2.5 gap-y-1">
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xl, color: theme.text }} className="tracking-tight font-black">New Customer Order</Text>
                                    {isSyncing ? (
                                        <View className="flex-row items-center bg-blue-500/10 px-2 py-0.5 rounded-md space-x-1"><ActivityIndicator size="small" color={theme.primary} style={{ transform: [{ scale: 0.7 }] }} /><Text className="text-blue-500 font-custom-bold text-xs-size tracking-widest uppercase">Syncing</Text></View>
                                    ) : lastSyncedTime ? (
                                        <View className="bg-emerald-500/10 px-2 py-0.5 rounded-md"><Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="font-bold uppercase tracking-wider">🕒 Synced {lastSyncedTime}</Text></View>
                                    ) : null}
                                </View>
                                <View className="flex-row items-center space-x-3 mt-1.5 flex-wrap gap-y-1">
                                    <View className="bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md"><Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 11 }}>🟢 Synced: {localStats.syncedCount}</Text></View>
                                    <View style={{ backgroundColor: localStats.unsyncedCount > 0 ? 'rgba(244,63,94,0.1)' : 'rgba(148,163,184,0.1)', borderColor: localStats.unsyncedCount > 0 ? 'rgba(244,63,94,0.2)' : 'rgba(148,163,184,0.2)' }} className="border px-2.5 py-1 rounded-md"><Text style={{ color: localStats.unsyncedCount > 0 ? '#f43f5e' : '#94a3b8', fontFamily: theme.font.bold, fontSize: 11 }}>🟠 Pending: {localStats.unsyncedCount}</Text></View>
                                    <TouchableOpacity onPress={() => router.push('client/orders' as any)} style={{ backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }} className="border px-3 py-1 rounded-md lg:hidden active:scale-95"><Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11 }}>📋 View List</Text></TouchableOpacity>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setIsScannerOpen(true)} style={{ backgroundColor: theme.primary }} className="hidden lg:flex px-5 py-3 rounded-xl shadow-md active:scale-95 flex-row items-center"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white">📷 Scan Barcodes</Text></TouchableOpacity>
                        </View>
                        <View className="flex-col lg:flex-row gap-4 items-start relative z-10 w-full">
                            <OrderMainSection theme={theme} lineItems={lineItems} retailerReceipts={retailerReceipts} isBlankRowPresent={isBlankRowPresent} handleUpdateRow={handleUpdateRow} handleDeleteRow={handleDeleteRow} handleSelectProduct={handleSelectProduct} handleAddRow={handleAddRow} setIsScannerOpen={setIsScannerOpen} setIsBottomSheetVisible={setIsBottomSheetVisible} totals={totals} onRowLayout={(id: string, y: number) => { rowCoordinatesRef.current[id] = y; }} />
                            <View style={{ backgroundColor: theme.panel }} className="hidden lg:flex w-[360px] xl:w-[400px] z-20 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                                <FulfillmentControls deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod} paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId} setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing} paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails} totals={totals} />
                                <TouchableOpacity onPress={handleSaveOrder} style={{ backgroundColor: theme.primary }} className="mt-6 w-full py-3.5 rounded-xl items-center justify-center shadow-md active:opacity-90"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-white">Save Order</Text></TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                    <FulfillmentModal visible={isBottomSheetVisible} onClose={() => setIsBottomSheetVisible(false)} deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod} paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId} setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing} paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails} onSave={handleSaveOrder} totals={totals} theme={theme} />
                    <UniversalScannerModal visible={isScannerOpen} onClose={() => setIsScannerOpen(false)} onBarcodeScanned={handleBarcodeScannedContinuously} />
                    <MomoPollerModal visible={isMomoPolling} draftId={momoActiveDraftId} theme={theme} submitOrderApi={submitOrderApi} onVerificationComplete={handleMomoVerificationFinished} />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
