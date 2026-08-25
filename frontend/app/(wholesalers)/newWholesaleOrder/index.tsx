import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import OrderFormContainer from '../../../components/wholesalers/newWholesaleOrder/OrderFormContainer';
import UnifiedBarcodeScanner from '../../../components/wholesalers/newWholesaleOrder/UnifiedBarcodeScanner';
import { useWholesaleOrderForm } from '../../../components/wholesalers/newWholesaleOrder/useWholesaleOrderForm';

export interface WholesaleOrderProps {
    onSubmit?: (orderData: { retailerId: string; notes: string; items: any[] }) => void;
}

export default function NewWholesaleOrder({ onSubmit }: WholesaleOrderProps) {
    const { theme, user } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);
    const scannerYCoordinateRef = useRef<number>(0);
    const tableYCoordinateRef = useRef<number>(0);
    const [rowsCount, setRowsCount] = useState(1);
    const {
        isScannerOpen,
        setIsScanningOpen,
        processBarcodeScanResult,
        productsCatalog
    } = useWholesaleOrderForm();

    useEffect(() => {
        if (isScannerOpen && scannerYCoordinateRef.current > 0) {
            scrollViewRef.current?.scrollTo({ x: 0, y: Math.max(0, scannerYCoordinateRef.current - 20), animated: true });
        }
    }, [isScannerOpen]);

    useEffect(() => {
        if (rowsCount > 1) {
            setTimeout(() => {
                const estimatedRowHeight = 160;
                const targetScrollY = tableYCoordinateRef.current + ((rowsCount - 1) * estimatedRowHeight);
                scrollViewRef.current?.scrollTo({ x: 0, y: Math.max(0, targetScrollY), animated: true });
            }, 100);
        }
    }, [rowsCount]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, width: '100%' }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 20}
        >
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={{ flexGrow: 1, padding: 16, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}
                style={{ backgroundColor: theme.background }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={true}
                bounces={true}
                overScrollMode="always"
            >
                <View onLayout={(event) => { scannerYCoordinateRef.current = event.nativeEvent.layout.y; }} style={{ width: '100%', backgroundColor: 'transparent' }}>
                    <UnifiedBarcodeScanner theme={theme} isOpen={isScannerOpen} productsCatalog={productsCatalog} onScanSuccess={processBarcodeScanResult} onCloseScanner={() => setIsScanningOpen(false)} />
                </View>
                <OrderFormContainer
                    theme={theme}
                    user={user}
                    isScannerOpen={isScannerOpen}
                    setIsScanningOpen={setIsScanningOpen}
                    processBarcodeScanResult={processBarcodeScanResult}
                    productsCatalog={productsCatalog}
                    onRowsCountChange={setRowsCount}
                    onTableLayoutCapture={(y) => { tableYCoordinateRef.current = y; }}
                    onSubmitFinished={(retailerId, notes, items) => {
                        if (onSubmit) onSubmit({ retailerId, notes, items });
                    }}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
