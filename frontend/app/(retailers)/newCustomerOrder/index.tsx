// app/(retailers)/newCustomerOrder/index.tsx

import ApiErrorModal from '@/components/common/ApiErrorModal';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import PaymentStatusModal from '@/components/common/PaymentStatusModal';
import { UniversalScannerModal } from '@/components/common/UniversalScannerModal';
import { FulfillmentControls, FulfillmentModal, saveButtonStyle } from '@/components/retailers/newCustomerOrder/FulfillmentModal';
import { ChevronRight, ScanLine, ShoppingBag } from 'lucide-react-native';
import { OfflineNotice } from '@/components/ui/pos';
import { toast } from '@/components/common/Toast';
import { OrderMainSection } from '@/components/retailers/newCustomerOrder/OrderMainSection';
import { useAuth } from '@/context/AuthContext';
import { useCreateOrder } from '@/hooks/useCreateOrder';
import React, { useCallback, useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateOrderScreen() {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const scrollRef = useRef<ScrollView>(null);
    const rowCoordinatesRef = useRef<Record<string, number>>({});

    const {
        retailerReceipts, paymentMethodsList, isSyncing, triggerManualFetch,
        isPaymentSyncing, selectedPaymentMethodId,
        setSelectedPaymentMethodId, isBottomSheetVisible, setIsBottomSheetVisible,
        isScannerOpen, setIsScannerOpen, paymentDetails, setPaymentDetails,
        lineItems, isBlankRowPresent, handleUpdateRow, handleSelectProduct, handleSetSaleUnit,
        handleAddRow, handleDeleteRow, handleSaveOrder, handleBarcodeScannedContinuously,
        handleSearchFocused, totals, errorMessage, successMessage, setErrorMessage,
        setSuccessMessage, isSaving, wsStatus, wsDescription, resetWsState,
        isRetryingPayment, handleRetryPayment, handlePaymentSuccess,
        delivery, destination, setDestination, shopCenter,
        loadDeliveryOptions, deliveryOptionsKey, deliveryNotReadyHint,
    } = useCreateOrder();
    const fulfilmentProps = { delivery, destination, setDestination, shopCenter, loadDeliveryOptions, deliveryOptionsKey, deliveryNotReadyHint };

    const lastRowId = lineItems[lineItems.length - 1]?.id;

    // Success notices slide in as a toast (payment progress has its own dialog).
    useEffect(() => {
        if (successMessage && !wsStatus) toast.success('Done', successMessage);
    }, [successMessage, wsStatus]);

    useEffect(() => {
        if (successMessage && !wsStatus) {
            const timer = setTimeout(() => setSuccessMessage(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, wsStatus, setSuccessMessage]);

    useEffect(() => {
        if (!lastRowId) return;
        const y = rowCoordinatesRef.current[lastRowId];
        if (y === undefined) return;
        const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 100);
        return () => clearTimeout(t);
    }, [lineItems.length, lastRowId]);

    const handleRowLayout = useCallback((id: string, y: number) => {
        rowCoordinatesRef.current[id] = y;
    }, []);

    const openFulfillmentSheet = useCallback(() => {
        setIsBottomSheetVisible(true);
    }, [setIsBottomSheetVisible]);

    const grandTotalLabel = Number(totals?.total ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const itemCount = lineItems.filter((l: any) => !!l.selectedProduct).length;

    return (
        <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1 w-full relative" edges={[]}>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
                <View className="flex-1 relative">
                    <ScrollView
                        ref={scrollRef}
                        contentContainerStyle={{ padding: 12, paddingBottom: Platform.OS === 'web' ? 20 : 100 }}
                        className="w-full lg:max-w-[80vw] lg:mx-auto"
                        keyboardShouldPersistTaps="handled"
                        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={triggerManualFetch} tintColor={theme.primary} />}
                    >
                        {/* Cash sales saved offline and not yet on the server */}
                        <PendingSyncBanner kind="customer" />
                        {!isOnline ? (
                            <OfflineNotice message="Sales are saved on this device (stock is taken off locally) and sent to the server as soon as the connection is back." />
                        ) : null}
                        <View className="w-full flex-row justify-between items-center mb-4 relative z-40" style={{ gap: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <ShoppingBag size={20} color={theme.primary} strokeWidth={2.2} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text, letterSpacing: -0.2 }}>
                                        New sale
                                    </Text>
                                    <Text numberOfLines={1} style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textMuted }}>
                                        {itemCount} {itemCount === 1 ? 'item' : 'items'} · KES {grandTotalLabel}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setIsScannerOpen(true)} style={{ backgroundColor: theme.navy, gap: 8 }} className="hidden lg:flex px-4 h-11 rounded-xl active:opacity-90 flex-row items-center">
                                <ScanLine size={16} color="#fff" strokeWidth={2.4} />
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: '#fff' }}>Scan barcodes</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-col lg:flex-row gap-3 items-start relative z-10 w-full">
                            <View className="w-full lg:flex-1">
                                <OrderMainSection
                                    theme={theme} lineItems={lineItems} retailerReceipts={retailerReceipts}
                                    isBlankRowPresent={isBlankRowPresent} handleUpdateRow={handleUpdateRow}
                                    handleDeleteRow={handleDeleteRow} handleSelectProduct={handleSelectProduct} handleSetSaleUnit={handleSetSaleUnit}
                                    handleAddRow={handleAddRow} setIsScannerOpen={setIsScannerOpen}
                                    onSearchFocused={handleSearchFocused}
                                    totals={totals} onRowLayout={handleRowLayout}
                                />
                            </View>

                            <View
                                style={{
                                    backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1, borderRadius: 20,
                                    shadowColor: '#0b1733', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 3,
                                    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 12 } as any) : null),
                                }}
                                className="hidden lg:flex w-[360px] z-20 p-5"
                            >
                                <FulfillmentControls
                                    {...fulfilmentProps}
                                    paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId}
                                    setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing}
                                    paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails} totals={totals}
                                />
                                <TouchableOpacity onPress={handleSaveOrder} disabled={isSaving || !selectedPaymentMethodId} style={[saveButtonStyle(theme), { opacity: (isSaving || !selectedPaymentMethodId) ? 0.5 : 1 }]} className="mt-5 w-full h-[52px] rounded-2xl flex-row items-center justify-center">
                                    {isSaving ? <ActivityIndicator size="small" color="#fff" /> : (
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: '#fff' }}>
                                            {isRetryingPayment ? 'Retry payment' : `Save order · KES ${grandTotalLabel}`}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                                {!selectedPaymentMethodId ? (
                                    <Text style={{ fontFamily: theme.font.medium, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>
                                        Pick a payment method to continue
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    </ScrollView>

                    <View
                        className="lg:hidden absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4"
                        style={{
                            backgroundColor: theme.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22,
                            borderTopWidth: 1, borderColor: theme.border,
                            shadowColor: '#0b1733', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 12,
                        }}
                    >
                        <View className="flex-row items-center justify-between">
                            <View className="flex-col flex-1 mr-3">
                                <Text style={{ fontFamily: theme.font.semibold, fontSize: 11, color: theme.textMuted }}>
                                    {itemCount} {itemCount === 1 ? 'item' : 'items'} · Total
                                </Text>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: 20, color: theme.text, letterSpacing: -0.3 }}>
                                    <Text style={{ fontSize: 12, color: theme.textMuted }}>KES </Text>{grandTotalLabel}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={openFulfillmentSheet} style={[saveButtonStyle(theme), { minWidth: 150, gap: 6 }]} className="h-12 px-5 rounded-2xl flex-row items-center justify-center">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: '#fff' }}>Review & pay</Text>
                                <ChevronRight size={16} color="#fff" strokeWidth={2.6} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <FulfillmentModal
                        visible={isBottomSheetVisible} onClose={() => setIsBottomSheetVisible(false)}
                        {...fulfilmentProps}
                        paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId}
                        setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing}
                        paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails}
                        onSave={handleSaveOrder} totals={totals} theme={theme} isSaving={isSaving}
                        isRetryingPayment={isRetryingPayment}
                    />

                    <UniversalScannerModal
                        visible={isScannerOpen}
                        onClose={() => setIsScannerOpen(false)}
                        onBarcodeScanned={handleBarcodeScannedContinuously}
                        lookup={(code) => {
                            const hit = retailerReceipts.find((r: any) => r.bar_code === code);
                            return hit ? { title: String(hit.title || code) } : null;
                        }}
                    />
                    <ApiErrorModal visible={!!errorMessage} message={errorMessage} errors={[]} onClose={() => setErrorMessage(null)} />

                    <PaymentStatusModal
                        visible={!!wsStatus}
                        status={wsStatus}
                        description={wsDescription}
                        onClose={resetWsState}
                        onSuccess={handlePaymentSuccess}
                        onRetry={handleRetryPayment}
                    />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}