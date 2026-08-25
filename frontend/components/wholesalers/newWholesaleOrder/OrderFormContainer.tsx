import { Text, View } from 'react-native';
import OrderActionBar from './OrderActionBar';
import OrderFormBusinessLogic from './OrderFormBusinessLogic';
import OrderManifestFooter from './OrderManifestFooter';
import OrderManifestHeader from './OrderManifestHeader';
import PaymentMethodSelector from './PaymentMethodSelector';
import ProductManifestTable from './ProductManifestTable';
import RetailerAutocomplete from './RetailerAutocomplete';

interface OrderFormContainerProps {
    theme: any;
    user: any;
    setIsScanningOpen: (open: boolean) => void;
    processBarcodeScanResult: (barcode: string) => void;
    productsCatalog: any[];
    isScannerOpen: boolean;
    onSubmitFinished?: (retailerId: string, notes: string, items: any[]) => void;
    onRowsCountChange?: (count: number) => void;
    onTableLayoutCapture?: (y: number) => void;
}

export default function OrderFormContainer(props: OrderFormContainerProps) {
    return (
        <OrderFormBusinessLogic
            user={props.user}
            productsCatalog={props.productsCatalog}
            onSubmitFinished={props.onSubmitFinished}
            onRowsCountChange={props.onRowsCountChange}
        >
            {(state) => {
                const handleManualFormWipeReset = async () => {
                    await state.clearActiveDraftSession();
                    state.setMpesaNumber('');
                };
                return (
                    <View className="w-full flex-col items-center">
                        <View className="rounded-xl p-6 w-full max-w-5xl shadow-md relative" style={{ backgroundColor: props.theme.panel }}>
                            {state.submitToast && (
                                <View style={{ backgroundColor: state.submitToast.includes('Success') ? '#10b981' : props.theme.primary, zIndex: 99999 }} className="absolute -top-4 left-6 right-6 p-3.5 rounded-xl shadow-xl border border-white/20 items-center justify-center animate-bounce">
                                    <Text className="text-white text-xs font-black tracking-wide uppercase text-center">{state.submitToast}</Text>
                                </View>
                            )}
                            <OrderManifestHeader theme={props.theme} user={props.user} syncStatus={state.syncStatus} isNetworkLoading={state.isSyncLoading || state.isSubmitting} onResetWorkspaceTrigger={handleManualFormWipeReset} />
                            <RetailerAutocomplete theme={props.theme} retailers={state.retailers} selectedRetailer={state.selectedRetailer} onSelect={state.setSelectedRetailer} />
                            {state.formRows.length === 1 && <OrderActionBar theme={props.theme} onScanTrigger={() => props.setIsScanningOpen(true)} onAddRowTrigger={state.addFormRow} />}
                            <View onLayout={(e) => { if (props.onTableLayoutCapture) props.onTableLayoutCapture(e.nativeEvent.layout.y); }} className="w-full">
                                <ProductManifestTable theme={props.theme} formRows={state.formRows} productsCatalog={props.productsCatalog} onAddRow={state.addFormRow} onRemoveRow={state.removeFormRow} onUpdateRow={state.updateRowState} onPopulateRow={state.populateProductIntoRow} onTriggerScanner={() => props.setIsScanningOpen(true)} />
                            </View>
                            {state.formRows.length > 1 && <OrderActionBar theme={props.theme} onScanTrigger={() => props.setIsScanningOpen(true)} onAddRowTrigger={state.addFormRow} />}
                            <PaymentMethodSelector theme={props.theme} paymentMethods={state.paymentMethods} selectedPaymentMethod={state.selectedPaymentMethod} onSelectPaymentMethod={state.setSelectedPaymentMethod} mpesaNumber={state.mpesaNumber} onMpesaNumberChange={state.setMpesaNumber} />
                            <OrderManifestFooter theme={props.theme} notes={state.notes} onNotesChange={state.setNotes} grandTotalCost={state.grandTotalCost} isButtonLoading={state.isSubmitting} onSaveDraft={state.handleSaveDraftManual} onSubmit={state.handleSubmit} />
                        </View>
                    </View>
                );
            }}
        </OrderFormBusinessLogic>
    );
}
