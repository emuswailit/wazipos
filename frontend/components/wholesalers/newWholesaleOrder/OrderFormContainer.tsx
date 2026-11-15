// components/wholesalers/newWholesaleOrder/OrderFormContainer.tsx

import { EntityAutocomplete } from '@/components/common';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import RecordPaymentModal from '@/components/common/RecordPaymentModal';
import { StaffDeliveryPlanner } from '@/components/deliveries/StaffDeliveryPlanner';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import { WHOLESALER_RETAILER_ORDER_PAYMENT_CONFIG } from '@/hooks/useRecordPayment';
import { Text, View } from 'react-native';
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
                        <View
                            className="rounded-xl p-6 w-full max-w-5xl shadow-md relative"
                            style={{
                                backgroundColor:
                                    props.theme.panel,
                            }}
                        >
                            {/* -------- Orders saved offline, not yet on the server -------- */}
                            <PendingSyncBanner kind="wholesale" />

                            {/* -------- Toast -------- */}
                            {state.submitToast && (
                                <View
                                    style={{
                                        backgroundColor:
                                            state.submitToast.includes(
                                                'Success'
                                            )
                                                ? '#10b981'
                                                : props.theme
                                                    .primary,
                                        zIndex: 99999,
                                    }}
                                    className="absolute -top-4 left-6 right-6 p-3.5 rounded-xl shadow-xl border border-white/20 items-center justify-center animate-bounce"
                                >
                                    <Text className="text-white text-xs font-black tracking-wide uppercase text-center">
                                        {state.submitToast}
                                    </Text>
                                </View>
                            )}

                            {/* -------- Header -------- */}
                            <OrderManifestHeader
                                theme={props.theme}
                                user={props.user}
                                syncStatus={state.syncStatus}
                                isNetworkLoading={
                                    state.isSyncLoading ||
                                    state.isSubmitting
                                }
                                onResetWorkspaceTrigger={
                                    handleManualFormWipeReset
                                }
                            />

                            {/* -------- Retailer entity picker -------- */}
                            <EntityAutocomplete
                                entities={state.retailers}
                                value={state.selectedRetailer}
                                onSelect={
                                    state.setSelectedRetailer
                                }
                                entityTypes={[
                                    'GeneralRetailer',
                                    'PharmaceuticalRetailer',
                                ]}
                                label="1. Select Retailer / Customer Profile"
                                placeholder="Type retail shop name to search (e.g. Lael)..."
                                helperText="You must search and assign a verified retail shop outlet before building the product manifest ledger."
                                required
                            />

                            {/* -------- Top ActionBar (1 row only) -------- */}
                            {state.formRows.length === 1 && (
                                <OrderActionBar
                                    theme={props.theme}
                                    onScanTrigger={() =>
                                        state.setIsScanningOpen(
                                            true
                                        )
                                    }
                                    onAddRowTrigger={
                                        state.addFormRow
                                    }
                                />
                            )}

                            {/* -------- Manifest -------- */}
                            <View
                                onLayout={(e) => {
                                    if (
                                        props.onTableLayoutCapture
                                    )
                                        props.onTableLayoutCapture(
                                            e.nativeEvent
                                                .layout.y
                                        );
                                }}
                                className="w-full"
                            >
                                <ProductManifestTable
                                    theme={props.theme}
                                    formRows={state.formRows}
                                    onRemoveRow={
                                        state.removeFormRow
                                    }
                                    onUpdateRow={
                                        state.updateRowState
                                    }
                                    onTriggerScanner={() =>
                                        state.setIsScanningOpen(
                                            true
                                        )
                                    }
                                />
                            </View>

                            {/* -------- Bottom ActionBar (2+ rows) -------- */}
                            {state.formRows.length > 1 && (
                                <OrderActionBar
                                    theme={props.theme}
                                    onScanTrigger={() =>
                                        state.setIsScanningOpen(
                                            true
                                        )
                                    }
                                    onAddRowTrigger={
                                        state.addFormRow
                                    }
                                />
                            )}

                            {/* -------- Fulfilment: pickup, or delivery (person / company / courier) -------- */}
                            <View className="w-full my-3" style={{ gap: 6 }}>
                                <Text
                                    style={{ color: props.theme.text, fontFamily: props.theme.font?.bold, fontSize: 13 }}
                                >
                                    2. Fulfilment
                                </Text>
                                <StaffDeliveryPlanner
                                    state={state.delivery}
                                    loadOptions={state.loadDeliveryOptions}
                                    optionsKey={state.deliveryOptionsKey}
                                    notReadyHint={state.deliveryNotReadyHint}
                                    pickupLabel="Retailer collects"
                                />
                                {state.isOnline ? (
                                    <Text style={{ color: props.theme.textDark, fontFamily: props.theme.font?.medium, fontSize: 11.5 }}>
                                        3. Payment is taken right after the order is created — mobile money prompts the retailer's phone; cash or credit is recorded.
                                    </Text>
                                ) : (
                                    <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#d9770618', borderWidth: 1.5, borderColor: '#d97706' }}>
                                        <Text style={{ color: '#d97706', fontFamily: props.theme.font?.bold, fontSize: 13 }}>
                                            📴 Offline — CASH sales only
                                        </Text>
                                        <Text style={{ color: props.theme.text, fontFamily: props.theme.font?.medium, fontSize: 12 }}>
                                            The order is saved on this device as paid in cash (the retailer collects it) and sent to the server as soon as you're back online.
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* -------- Footer -------- */}
                            <OrderManifestFooter
                                theme={props.theme}
                                notes={state.notes}
                                onNotesChange={state.setNotes}
                                grandTotalCost={
                                    state.grandTotalCost
                                }
                                deliveryFee={state.delivery.fee}
                                submitLabel={state.isOnline ? undefined : 'Save offline (cash sale)'}
                                isButtonLoading={
                                    state.isSubmitting
                                }
                                onSubmit={state.handleSubmit}
                            />
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