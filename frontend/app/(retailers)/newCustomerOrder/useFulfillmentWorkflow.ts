import { dbInstance } from '@/databases/db';
import { useState } from 'react';
import { Platform } from 'react-native';
import { triggerLocalPushNotification } from './notificationHelper';
export function useFulfillmentWorkflow(deductLocalInventoryStock: any, clearStorageActiveLines: any, setLineItems: any) {
    const getTodayString = () => new Date().toISOString().split('T')[0];
    const [deliveryMethod, setDeliveryMethod] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
    const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
    const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isMomoPolling, setIsMomoPolling] = useState(false);
    const [momoActiveDraftId, setMomoActiveDraftId] = useState('');
    const [momoActiveOrderNumber, setMomoActiveOrderNumber] = useState('');
    const [momoActiveItems, setMomoActiveDraftItems] = useState<any[]>([]);
    const [paymentDetails, setPaymentDetails] = useState({ mobileMoneyNumber: '', customerName: '', customerPhone: '', dueDate: getTodayString() });
    const resetFulfillmentForm = () => {
        setPaymentDetails({ mobileMoneyNumber: '', customerName: '', customerPhone: '', dueDate: getTodayString() });
        setSelectedPaymentMethodId(null); setDeliveryMethod('PICKUP'); setIsBottomSheetVisible(false);
    };
    const handleMomoVerificationFinished = async (success: boolean, msg: string, triggerBanner: any, triggerManualFetch?: () => Promise<void>) => {
        setIsMomoPolling(false);
        if (success) {
            if (Platform.OS === 'web') { await dbInstance.customerOrders.update(momoActiveDraftId, { synced: true, is_paid: true }); }
            await deductLocalInventoryStock(momoActiveItems);
            triggerBanner('success', "Payment Confirmed", msg);
            await triggerLocalPushNotification("✅ M-Pesa Settlement Confirmed", `Payment for order #${momoActiveOrderNumber} was successfully reconciled and cleared.`);
            if (typeof triggerManualFetch === 'function') await triggerManualFetch();
            await clearStorageActiveLines();
            setLineItems([{ id: Date.now().toString(), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
            resetFulfillmentForm();
        } else { triggerBanner('danger', "Payment Verification Failed", msg); }
        setMomoActiveDraftId(''); setMomoActiveOrderNumber(''); setMomoActiveDraftItems([]);
    };
    return { deliveryMethod, setDeliveryMethod, selectedPaymentMethodId, setSelectedPaymentMethodId, isBottomSheetVisible, setIsBottomSheetVisible, isScannerOpen, setIsScannerOpen, isMomoPolling, setIsMomoPolling, momoActiveDraftId, setMomoActiveDraftId, momoActiveOrderNumber, setMomoActiveOrderNumber, momoActiveItems, setMomoActiveDraftItems, paymentDetails, setPaymentDetails, resetFulfillmentForm, getTodayString, handleMomoVerificationFinished };
}
