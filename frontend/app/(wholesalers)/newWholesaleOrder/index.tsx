// AuthContext is a TSX module; suppress legacy compiler diagnostics when JSX is not enabled.
// @ts-ignore
import { useAuth } from '@/context/AuthContext';
import { createElement, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import OrderFormContainer from '@/components/wholesalers/newWholesaleOrder/OrderFormContainer';
// UnifiedBarcodeScanner is a TSX module; suppress legacy compiler diagnostics when JSX is not enabled.
// @ts-ignore
import UnifiedBarcodeScanner from '@/components/wholesalers/newWholesaleOrder/UnifiedBarcodeScanner';
import { useWholesaleOrderForm } from '../../../components/wholesalers/newWholesaleOrder/useWholesaleOrderForm';

export interface WholesaleOrderProps {
    onSubmit?: (orderData: { retailerId: string; notes: string; items: any[] }) => void;
}

export default function NewWholesaleOrder({ onSubmit }: WholesaleOrderProps) {
    const { theme, user } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);

    // Track layout coordinates cleanly
    const scannerYRef = useRef<number>(0);
    const tableYRef = useRef<number>(0);
    const [rowsCount, setRowsCount] = useState(1);
    const previousRowsCount = useRef(1);

    const {
        isScannerOpen,
        setIsScanningOpen,
        processBarcodeScanResult,
        productsCatalog
    } = useWholesaleOrderForm();

    // Effect 1: Handle scanner focus without clashing
    useEffect(() => {
        if (isScannerOpen && scannerYRef.current > 0) {
            scrollViewRef.current?.scrollTo({
                x: 0,
                y: Math.max(0, scannerYRef.current - 20),
                animated: true,
            });
        }
    }, [isScannerOpen]);

    // Effect 2: Handle row additions strictly when table size expands
    useEffect(() => {
        if (rowsCount > previousRowsCount.current) {
            const estimatedRowHeight = 110; // Tightened estimation for common input fields
            const targetScrollY = tableYRef.current + ((rowsCount - 1) * estimatedRowHeight);

            // Delay slightly to allow layout tree updates to commit
            const timer = setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 60);

            return () => clearTimeout(timer);
        }
        previousRowsCount.current = rowsCount;
    }, [rowsCount]);

    return createElement(
        KeyboardAvoidingView,
        {
            behavior: Platform.OS === 'ios' ? 'padding' : 'height',
            style: { flex: 1, width: '100%' },
            keyboardVerticalOffset: Platform.OS === 'ios' ? 88 : 20,
        },
        createElement(
            ScrollView,
            {
                ref: scrollViewRef,
                contentContainerStyle: {
                    flexGrow: 1,
                    padding: 16,
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                },
                style: { backgroundColor: theme.background },
                keyboardShouldPersistTaps: 'handled',
                keyboardDismissMode: 'on-drag',
                showsVerticalScrollIndicator: true,
                bounces: true,
                overScrollMode: 'always',
            },
            createElement(
                View,
                {
                    onLayout: (e: any) => { scannerYRef.current = e.nativeEvent.layout.y; },
                    style: { width: '100%', backgroundColor: 'transparent' },
                },
                createElement(UnifiedBarcodeScanner, {
                    theme,
                    isOpen: isScannerOpen,
                    productsCatalog,
                    onScanSuccess: processBarcodeScanResult,
                    onCloseScanner: () => setIsScanningOpen(false),
                }),
            ),
            createElement(OrderFormContainer, {
                theme,
                user,
                isScannerOpen,
                setIsScanningOpen,
                processBarcodeScanResult,
                productsCatalog,
                onRowsCountChange: setRowsCount,
                onTableLayoutCapture: (y: number) => { tableYRef.current = y; },
                onSubmitFinished: (retailerId: string, notes: string, items: any[]) => {
                    if (onSubmit) onSubmit({ retailerId, notes, items });
                },
            }),
        ),
    );
}
