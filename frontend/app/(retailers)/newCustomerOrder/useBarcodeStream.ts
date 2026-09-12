import { dbInstance } from '@/databases/db';
import { Platform } from 'react-native';
import { OrderLineItem } from './types';
export function useBarcodeStream(retailerReceipts: any[], setLineItems: React.Dispatch<React.SetStateAction<OrderLineItem[]>>, saveLinesToStorage: (lines: OrderLineItem[]) => Promise<void>) {
    const handleBarcodeScannedContinuously = async (barcode: string) => {
        try {
            const cleanBarcode = barcode.trim();
            let matchedProduct = null;
            if (Platform.OS === 'web') { matchedProduct = await dbInstance.retailerReceipts.where('bar_code').equals(cleanBarcode).first() || await dbInstance.retailerReceipts.where('barcode').equals(cleanBarcode).first(); }
            else { matchedProduct = retailerReceipts.find(p => p.bar_code === cleanBarcode || (p as any).barcode === cleanBarcode); }
            if (!matchedProduct) return;
            const targetId = String(matchedProduct.id || matchedProduct.key);
            const productSellingPrice = Number(matchedProduct.unit_selling_price || matchedProduct.price || 0);
            setLineItems(prev => {
                const existingIndex = prev.findIndex(item => item.selectedProduct === targetId);
                let next = [...prev];
                if (existingIndex !== -1) { next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + 1 }; }
                else {
                    const isOnlyInitialBlankRow = next.length === 1 && next.selectedProduct === null;
                    const newRow: OrderLineItem = { id: Date.now().toString(), selectedProduct: targetId, selectedProductTitle: matchedProduct.title || '', quantity: 1, price: productSellingPrice, discount: 0, searchQuery: matchedProduct.title || '', isDropdownOpen: false, calculatedLineAmount: productSellingPrice };
                    if (isOnlyInitialBlankRow) { next = [newRow]; } else { next.push(newRow); }
                }
                saveLinesToStorage(next); return next;
            });
        } catch (e) { console.error(e); }
    };
    return { handleBarcodeScannedContinuously };
}
