// app/(retailers)/newCustomerOrder/index.tsx

import ApiErrorModal from '@/components/common/ApiErrorModal';
import PaymentStatusModal from '@/components/common/PaymentStatusModal';
import { UniversalScannerModal } from '@/components/common/UniversalScannerModal';
import { FulfillmentControls, FulfillmentModal } from '@/components/retailers/newCustomerOrder/FulfillmentModal';
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
    const scrollRef = useRef<ScrollView>(null);
    const rowCoordinatesRef = useRef<Record<string, number>>({});

    const {
        retailerReceipts, paymentMethodsList, isSyncing, triggerManualFetch,
        isPaymentSyncing, deliveryMethod, setDeliveryMethod, selectedPaymentMethodId,
        setSelectedPaymentMethodId, isBottomSheetVisible, setIsBottomSheetVisible,
        isScannerOpen, setIsScannerOpen, paymentDetails, setPaymentDetails,
        lineItems, isBlankRowPresent, handleUpdateRow, handleSelectProduct,
        handleAddRow, handleDeleteRow, handleSaveOrder, handleBarcodeScannedContinuously,
        handleSearchFocused, totals, errorMessage, successMessage, setErrorMessage,
        setSuccessMessage, isSaving, wsStatus, wsDescription, resetWsState,
        isRetryingPayment, handleRetryPayment, handlePaymentSuccess,
        isRetailerDelivery, setIsRetailerDelivery,
        selectedCourierId, setSelectedCourierId,
        selectedCollectionPoint, setSelectedCollectionPoint,
        couriers, couriersLoading,
        collectionPoints, pointsLoading,
        deliveryEmployees, deliveryEmployeesLoading, // 🟢 Destructure Employee state
        selectedDeliveryEmployeeId, setSelectedDeliveryEmployeeId,
        shippingLoading,
    } = useCreateOrder();

    const lastRowId = lineItems[lineItems.length - 1]?.id;

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

    const grandTotal = Number(totals?.total ?? 0).toFixed(2);

    return (
        <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1 w-full relative" edges={[]}>

            {/* !! so an empty string never renders as a bare text node inside the View */}
            {!!successMessage && !wsStatus && (
                <View style={{ backgroundColor: theme.panel, borderColor: '#10b981' }} className="absolute top-4 left-4 right-4 p-3 rounded-xl border-2 shadow-2xl flex-row items-center space-x-3 z-50">
                    <View style={{ backgroundColor: 'rgba(16,185,129,0.1)' }} className="w-8 h-8 rounded-full items-center justify-center">
                        <Text style={{ fontFamily: theme.font.bold, color: '#10b981' }}>✓</Text>
                    </View>
                    <View className="flex-1 flex-col">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>Success</Text>
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }}>{successMessage}</Text>
                    </View>
                </View>
            )}

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
                <View className="flex-1 relative">
                    <ScrollView
                        ref={scrollRef}
                        contentContainerStyle={{ padding: 12, paddingBottom: Platform.OS === 'web' ? 20 : 100 }}
                        className="w-full lg:max-w-[80vw] lg:mx-auto"
                        keyboardShouldPersistTaps="handled"
                        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={triggerManualFetch} tintColor={theme.primary} />}
                    >
                        <View className="w-full flex flex-col md:flex-row justify-between items-start md:items-center pb-3 mb-4 border-b border-slate-200 gap-y-2 relative z-40">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }}>
                                New Customer Order
                            </Text>
                            <TouchableOpacity onPress={() => setIsScannerOpen(true)} style={{ backgroundColor: theme.primary }} className="hidden lg:flex px-4 py-2 rounded-lg shadow-sm active:scale-95 flex-row items-center">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white">📷 Scan Barcodes</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-col lg:flex-row gap-3 items-start relative z-10 w-full">
                            <View className="w-full lg:flex-1">
                                <OrderMainSection
                                    theme={theme} lineItems={lineItems} retailerReceipts={retailerReceipts}
                                    isBlankRowPresent={isBlankRowPresent} handleUpdateRow={handleUpdateRow}
                                    handleDeleteRow={handleDeleteRow} handleSelectProduct={handleSelectProduct}
                                    handleAddRow={handleAddRow} setIsScannerOpen={setIsScannerOpen}
                                    onSearchFocused={handleSearchFocused}
                                    totals={totals} onRowLayout={handleRowLayout}
                                />
                            </View>

                            <View style={{ backgroundColor: theme.panel }} className="hidden lg:flex w-[340px] z-20 p-4 rounded-xl border border-slate-200 shadow-xs">
                                <FulfillmentControls
                                    deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod}
                                    paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId}
                                    setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing}
                                    paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails} totals={totals}

                                    isRetailerDelivery={isRetailerDelivery} onToggleRetailerDelivery={setIsRetailerDelivery}
                                    couriers={couriers} couriersLoading={couriersLoading}
                                    selectedCourierId={selectedCourierId} onSelectCourier={setSelectedCourierId}
                                    collectionPoints={collectionPoints} collectionPointsLoading={pointsLoading}
                                    selectedCollectionPoint={selectedCollectionPoint} onSelectCollectionPoint={setSelectedCollectionPoint}

                                    // 🟢 Pass Employee Props
                                    deliveryEmployees={deliveryEmployees}
                                    deliveryEmployeesLoading={deliveryEmployeesLoading}
                                    selectedDeliveryEmployeeId={selectedDeliveryEmployeeId}
                                    onSelectDeliveryEmployee={setSelectedDeliveryEmployeeId}

                                    shippingLoading={shippingLoading}
                                />
                                <TouchableOpacity onPress={handleSaveOrder} disabled={isSaving || !selectedPaymentMethodId} style={{ backgroundColor: theme.primary, opacity: (isSaving || !selectedPaymentMethodId) ? 0.5 : 1 }} className="mt-4 w-full py-2.5 rounded-lg flex-row items-center justify-center shadow-sm">
                                    {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-white">{isRetryingPayment ? 'Retry Payment' : 'Save Order'}</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>

                    <View className="lg:hidden absolute bottom-0 left-0 right-0 px-3 pt-2 pb-3 border-t border-slate-200" style={{ backgroundColor: theme.panel }}>
                        <View className="flex-row items-center justify-between">
                            <View className="flex-col flex-1 mr-3">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.textDark }} className="uppercase">Order Total</Text>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>KES {grandTotal}</Text>
                            </View>
                            <TouchableOpacity onPress={openFulfillmentSheet} style={{ backgroundColor: theme.primary, minWidth: 130 }} className="py-2.5 px-4 rounded-lg items-center justify-center shadow-sm">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white">Review & Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <FulfillmentModal
                        visible={isBottomSheetVisible} onClose={() => setIsBottomSheetVisible(false)}
                        deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod}
                        paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId}
                        setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing}
                        paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails}
                        onSave={handleSaveOrder} totals={totals} theme={theme} isSaving={isSaving}
                        isRetryingPayment={isRetryingPayment}

                        isRetailerDelivery={isRetailerDelivery} onToggleRetailerDelivery={setIsRetailerDelivery}
                        couriers={couriers} couriersLoading={couriersLoading}
                        selectedCourierId={selectedCourierId} onSelectCourier={setSelectedCourierId}
                        collectionPoints={collectionPoints} collectionPointsLoading={pointsLoading}
                        selectedCollectionPoint={selectedCollectionPoint} onSelectCollectionPoint={setSelectedCollectionPoint}

                        // 🟢 Pass Employee Props
                        deliveryEmployees={deliveryEmployees}
                        deliveryEmployeesLoading={deliveryEmployeesLoading}
                        selectedDeliveryEmployeeId={selectedDeliveryEmployeeId}
                        onSelectDeliveryEmployee={setSelectedDeliveryEmployeeId}

                        shippingLoading={shippingLoading}
                    />

                    <UniversalScannerModal visible={isScannerOpen} onClose={() => setIsScannerOpen(false)} onBarcodeScanned={handleBarcodeScannedContinuously} />
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