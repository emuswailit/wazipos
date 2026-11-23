// components/wholesalers/newWholesaleOrder/OrderFormContainer.tsx

import { EntityAutocomplete } from '@/components/common';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import RecordPaymentModal from '@/components/common/RecordPaymentModal';
import { StaffDeliveryPlanner } from '@/components/deliveries/StaffDeliveryPlanner';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import { WHOLESALER_RETAILER_ORDER_PAYMENT_CONFIG } from '@/hooks/useRecordPayment';
import { OfflineNotice, PosCard, SectionTitle } from '@/components/ui/pos';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import OrderActionBar from './OrderActionBar';
import OrderFormBusinessLogic from './OrderFormBusinessLogic';
import OrderManifestFooter from './OrderManifestFooter';
import OrderManifestHeader from './OrderManifestHeader';
import ProductManifestTable from './ProductManifestTable';
import UnifiedBarcodeScanner from './UnifiedBarcodeScanner';

interface OrderFormContainerProps {
    theme: any;
    user: any;
    onSubmitFinished?: (
        retailerId: string,
        notes: string,
        items: any[]
    ) => void;
    onRowsCountChange?: (count: number) => void;
    onTableLayoutCapture?: (y: number) => void;
}

export default function OrderFormContainer(
    props: OrderFormContainerProps
) {
    const { applyServerOrder, forceManualRefresh } = useRetailerOrdersSync();
    const { width } = useWindowDimensions();
    const isWideLayout = width >= 1024;
    return (
        <OrderFormBusinessLogic
            user={props.user}
            onSubmitFinished={props.onSubmitFinished}
            onRowsCountChange={props.onRowsCountChange}
        >
            {(state) => {
                const handleManualFormWipeReset =
                    async () => {
                        await state.clearActiveDraftSession();
                        state.setMpesaNumber('');
                    };

                return (
                    <View className="w-full flex-col items-center">
                        <UnifiedBarcodeScanner
                            theme={props.theme}
                            isOpen={state.isScannerOpen}
                            productsCatalog={state.wholesalerReceipts ?? []}
                            onScanSuccess={state.processBarcodeScanResult}
                            onCloseScanner={() => state.setIsScanningOpen(false)}
                        />

                        <View className="w-full max-w-6xl">
                            {/* -------- Orders saved offline, not yet on the server -------- */}
                            <PendingSyncBanner kind="wholesale" />

                            <OrderManifestHeader
                                theme={props.theme}
                                user={props.user}
                                syncStatus={state.syncStatus}
                                isNetworkLoading={state.isSyncLoading || state.isSubmitting}
                                onResetWorkspaceTrigger={handleManualFormWipeReset}
                            />

                            {!state.isOnline ? (
                                <OfflineNotice message="The order is saved on this device as paid in cash (the retailer collects it) and sent to the server as soon as you're back online." />
                            ) : null}

                            <View className="w-full flex-col lg:flex-row items-start" style={{ gap: 16 }}>
                                {/* ======== Left: retailer + items ======== */}
                                <View className="w-full lg:flex-1" style={{ minWidth: 0 }}>
                                    <PosCard style={{ zIndex: 60 }}>
                                        <SectionTitle step={1} title="Retailer" hint="Search a verified retail shop to sell to" />
                                        <EntityAutocomplete
                                            entities={state.retailers}
                                            value={state.selectedRetailer}
                                            onSelect={state.setSelectedRetailer}
                                            entityTypes={['GeneralRetailer', 'PharmaceuticalRetailer']}
                                            label="Retailer"
                                            placeholder="Type the shop name…"
                                            required
                                        />
                                    </PosCard>

                                    <View
                                        onLayout={(e) => {
                                            if (props.onTableLayoutCapture) props.onTableLayoutCapture(e.nativeEvent.layout.y);
                                        }}
                                        className="w-full"
                                    >
                                        <ProductManifestTable
                                            theme={props.theme}
                                            formRows={state.formRows}
                                            onRemoveRow={state.removeFormRow}
                                            onUpdateRow={state.updateRowState}
                                            onTriggerScanner={() => state.setIsScanningOpen(true)}
                                        />
                                    </View>

                                    <OrderActionBar
                                        theme={props.theme}
                                        onScanTrigger={() => state.setIsScanningOpen(true)}
                                        onAddRowTrigger={state.addFormRow}
                                    />
                                </View>

                                {/* ======== Right: fulfilment + checkout (sticky on web) ======== */}
                                <PosCard
                                    style={[
                                        { width: '100%', padding: 18, borderRadius: 20 },
                                        isWideLayout ? { width: 380, ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 12 } as any) : null) } : null,
                                    ]}
                                >
                                    <SectionTitle step={3} title="Fulfilment" />
                                    <StaffDeliveryPlanner
                                        state={state.delivery}
                                        loadOptions={state.loadDeliveryOptions}
                                        optionsKey={state.deliveryOptionsKey}
                                        notReadyHint={state.deliveryNotReadyHint}
                                        pickupLabel="Retailer collects"
                                    />
                                    {state.isOnline ? (
                                        <Text style={{ color: props.theme.textMuted, fontFamily: props.theme.font?.regular, fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 6 }}>
                                            Payment is taken right after the order is created — mobile money prompts the retailer's phone; cash or credit is recorded.
                                        </Text>
                                    ) : null}

                                    <View style={{ height: 1, backgroundColor: props.theme.border, marginVertical: 14 }} />

                                    <OrderManifestFooter
                                        theme={props.theme}
                                        notes={state.notes}
                                        onNotesChange={state.setNotes}
                                        grandTotalCost={state.grandTotalCost}
                                        deliveryFee={state.delivery.fee}
                                        submitLabel={state.isOnline ? undefined : 'Save offline (cash sale)'}
                                        isButtonLoading={state.isSubmitting}
                                        onSubmit={state.handleSubmit}
                                    />
                                </PosCard>
                            </View>
                        </View>

                        {/* Payment for the order just created */}
                        <RecordPaymentModal
                            isOpen={!!state.createdOrder}
                            orderId={state.createdOrder?.id ?? ''}
                            orderRef={state.createdOrder?.reference ?? 'New order'}
                            config={WHOLESALER_RETAILER_ORDER_PAYMENT_CONFIG}
                            onClose={state.closeCreatedOrder}
                            onRefreshParentLedger={() => void forceManualRefresh()}
                            onOrderUpdated={applyServerOrder}
                        />
                    </View>
                );
            }}
        </OrderFormBusinessLogic>
    );
}
