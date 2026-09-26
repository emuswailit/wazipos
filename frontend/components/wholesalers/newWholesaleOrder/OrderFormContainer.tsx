// components/wholesalers/newWholesaleOrder/OrderFormContainer.tsx

import {
    EntityAutocomplete,
    PaymentMethodSelector,
} from '@/components/common';
import { Text, View } from 'react-native';
import OrderActionBar from './OrderActionBar';
import OrderFormBusinessLogic from './OrderFormBusinessLogic';
import OrderManifestFooter from './OrderManifestFooter';
import OrderManifestHeader from './OrderManifestHeader';
import ProductManifestTable from './ProductManifestTable';

interface OrderFormContainerProps {
    theme: any;
    user: any;
    setIsScanningOpen: (open: boolean) => void;
    processBarcodeScanResult: (barcode: string) => void;
    productsCatalog: any[];
    isScannerOpen: boolean;
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
    return (
        <OrderFormBusinessLogic
            user={props.user}
            productsCatalog={props.productsCatalog}
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
                        <View
                            className="rounded-xl p-6 w-full max-w-5xl shadow-md relative"
                            style={{
                                backgroundColor:
                                    props.theme.panel,
                            }}
                        >
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
                                        props.setIsScanningOpen(
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
                                        props.setIsScanningOpen(
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
                                        props.setIsScanningOpen(
                                            true
                                        )
                                    }
                                    onAddRowTrigger={
                                        state.addFormRow
                                    }
                                />
                            )}

                            {/* -------- Payment -------- */}
                            <PaymentMethodSelector
                                value={
                                    state.selectedPaymentMethod
                                }
                                onChange={
                                    state.setSelectedPaymentMethod
                                }
                                mpesaNumber={
                                    state.mpesaNumber
                                }
                                onMpesaNumberChange={
                                    state.setMpesaNumber
                                }
                                label="2. Select Payment Settlement Method"
                                required
                            />

                            {/* -------- Footer -------- */}
                            <OrderManifestFooter
                                theme={props.theme}
                                notes={state.notes}
                                onNotesChange={state.setNotes}
                                grandTotalCost={
                                    state.grandTotalCost
                                }
                                isButtonLoading={
                                    state.isSubmitting
                                }
                                onSaveDraft={
                                    state.handleSaveDraftManual
                                }
                                onSubmit={state.handleSubmit}
                            />
                        </View>
                    </View>
                );
            }}
        </OrderFormBusinessLogic>
    );
}