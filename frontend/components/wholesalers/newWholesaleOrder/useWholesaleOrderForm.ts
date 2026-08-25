import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ProductCatalogItem, RetailerOption, WholesaleItemRow } from '../../../app/(wholesalers)/newWholesaleOrder/types';
import { useWholesaleCatalogSync } from './useWholesaleCatalogSync';

let SecureStore: any = null;
if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

const DRAFT_STORAGE_KEY = 'wholesale_order_draft_v1';

export function useWholesaleOrderForm() {
    const [selectedRetailer, setSelectedRetailer] = useState<RetailerOption | null>(null);
    const [notes, setNotes] = useState('');
    const [isScannerOpen, setIsScanningOpen] = useState(false);
    const [scanToast, setScanToast] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<'DRAFT' | 'SYNCED'>('DRAFT');
    const lastScanTimestampRef = useRef<number>(0);
    const isHydratedRef = useRef<boolean>(false);

    const [formRows, setFormRows] = useState<WholesaleItemRow[]>([
        { id: Math.random().toString(36).substring(7), wholesaler_receipt: '', purchased_quantity: '', bar_code: '', item_price_discount: '0.00', item_price: 0, item_price_total: 0, available: '', showProductSuggestions: false, productSearchQuery: '' }
    ]);

    const { retailersList, currentCatalogState, paymentMethods, isSyncLoading } = useWholesaleCatalogSync();

    useEffect(() => {
        async function hydrateDraftFromStorage() {
            try {
                let serializedDraft: string | null = null;
                if (Platform.OS === 'web') {
                    serializedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
                } else if (SecureStore) {
                    serializedDraft = await SecureStore.getItemAsync(DRAFT_STORAGE_KEY);
                }
                if (serializedDraft) {
                    const parsed = JSON.parse(serializedDraft);
                    if (parsed.selectedRetailer) setSelectedRetailer(parsed.selectedRetailer);
                    if (parsed.notes !== undefined) setNotes(parsed.notes);
                    if (parsed.formRows && parsed.formRows.length > 0) setFormRows(parsed.formRows);
                    if (parsed.syncStatus) setSyncStatus(parsed.syncStatus);
                }
            } catch (err) {
                console.error('Failed to load active draft pipeline:', err);
            } finally {
                isHydratedRef.current = true;
            }
        }
        hydrateDraftFromStorage();
    }, []);

    useEffect(() => {
        if (!isHydratedRef.current) return;
        async function persistDraftToStorage() {
            try {
                const draftPayload = {
                    selectedRetailer,
                    notes,
                    formRows,
                    syncStatus
                };
                const serialized = JSON.stringify(draftPayload);
                if (Platform.OS === 'web') {
                    localStorage.setItem(DRAFT_STORAGE_KEY, serialized);
                } else if (SecureStore) {
                    await SecureStore.setItemAsync(DRAFT_STORAGE_KEY, serialized);
                }
            } catch (err) {
                console.error('Failed to save active session state metrics:', err);
            }
        }
        persistDraftToStorage();
    }, [selectedRetailer, notes, formRows, syncStatus]);

    const clearActiveDraftSession = async () => {
        try {
            if (Platform.OS === 'web') {
                localStorage.removeItem(DRAFT_STORAGE_KEY);
            } else if (SecureStore) {
                await SecureStore.deleteItemAsync(DRAFT_STORAGE_KEY);
            }
            setSelectedRetailer(null);
            setNotes('');
            setFormRows([{ id: Math.random().toString(36).substring(7), wholesaler_receipt: '', purchased_quantity: '', bar_code: '', item_price_discount: '0.00', item_price: 0, item_price_total: 0, available: '', showProductSuggestions: false, productSearchQuery: '' }]);
            setSyncStatus('DRAFT');
        } catch (err) {
            console.error('Failed to flush active sandbox configuration matrices:', err);
        }
    };

    const triggerBannerToast = (msg: string) => {
        setScanToast(msg);
        setTimeout(() => setScanToast(null), 2500);
    };

    const addFormRow = () => {
        setSyncStatus('DRAFT');
        setFormRows(prev => [...prev, { id: Math.random().toString(36).substring(7), wholesaler_receipt: '', purchased_quantity: '', bar_code: '', item_price_discount: '0.00', item_price: 0, item_price_total: 0, available: '', showProductSuggestions: false, productSearchQuery: '' }]);
    };

    const processBarcodeScanResult = (scannedBarcode: string) => {
        if (!scannedBarcode || scannedBarcode.trim() === '') return;
        const currentTimeStamp = Date.now();
        if (currentTimeStamp - lastScanTimestampRef.current < 800) {
            return;
        }
        lastScanTimestampRef.current = currentTimeStamp;
        setSyncStatus('DRAFT');
        setFormRows(currentRows => {
            const matchedProduct = currentCatalogState.find(p => p.bar_code === scannedBarcode);
            if (!matchedProduct) {
                triggerBannerToast(`⚠️ Unknown item bar_code tag: "${scannedBarcode}"`);
                return currentRows;
            }
            const matchIndex = currentRows.findIndex(row => row.productSearchQuery === matchedProduct.title);
            if (matchIndex !== -1) {
                const existingQty = parseFloat(currentRows[matchIndex].purchased_quantity) || 0;
                const nextQty = existingQty + 1;
                triggerBannerToast(`✨ ${matchedProduct.title} (Scan Count: ${nextQty})`);
                return currentRows.map((row, idx) => {
                    if (idx !== matchIndex) return row;
                    const discount = parseFloat(row.item_price_discount) || 0;
                    return {
                        ...row,
                        purchased_quantity: String(nextQty),
                        item_price_total: parseFloat(Math.max(0, (nextQty * row.item_price) - discount).toFixed(2))
                    };
                });
            }
            const cleanRows = currentRows.filter(row => row.wholesaler_receipt !== '' || row.bar_code !== '');
            triggerBannerToast(`🛒 Added item row: ${matchedProduct.title} (Scan Count: 1)`);
            return [...cleanRows, { id: Math.random().toString(36).substring(7), wholesaler_receipt: matchedProduct.title, purchased_quantity: '1', bar_code: matchedProduct.bar_code, item_price_discount: '0.00', item_price: matchedProduct.item_price, item_price_total: matchedProduct.item_price, available: matchedProduct.available, showProductSuggestions: false, productSearchQuery: matchedProduct.title }];
        });
    };

    const removeFormRow = (id: string) => {
        setSyncStatus('DRAFT');
        if (formRows.length === 1) {
            triggerBannerToast('⚠️ Order must contain at least one item grouping line.');
            return;
        }
        setFormRows(formRows.filter(row => row.id !== id));
    };

    const updateRowState = (id: string, updatedFields: Partial<WholesaleItemRow>) => {
        setSyncStatus('DRAFT');
        setFormRows(prevRows => prevRows.map(row => {
            if (row.id !== id) return row;
            const combined = { ...row, ...updatedFields };
            const qty = parseFloat(combined.purchased_quantity) || 0;
            const discount = parseFloat(combined.item_price_discount) || 0;
            combined.item_price_total = parseFloat(Math.max(0, (qty * combined.item_price) - discount).toFixed(2));
            return combined;
        }));
    };

    const populateProductIntoRow = (rowId: string, product: ProductCatalogItem, overrideQty?: string) => {
        const qty = overrideQty !== undefined ? overrideQty : '1';
        const itemAlreadyExists = formRows.find(row => row.productSearchQuery === product.title && row.id !== rowId);
        setSyncStatus('DRAFT');
        if (itemAlreadyExists) {
            triggerBannerToast(`⚠️ Notice: "${product.title}" is already in the order. Please adjust its quantity directly.`);
            setFormRows(prev => prev.filter(r => r.id !== rowId));
            return;
        }
        const discount = 0;
        const subtotal = (parseFloat(qty) || 0) * product.item_price;
        setFormRows(prevRows => prevRows.map(row => {
            if (row.id !== rowId) return row;
            return { ...row, wholesaler_receipt: product.title, bar_code: product.bar_code, item_price: product.item_price, purchased_quantity: qty, available: product.available, item_price_total: parseFloat(Math.max(0, subtotal - discount).toFixed(2)), productSearchQuery: product.title, showProductSuggestions: false };
        }));
    };

    const grandTotalCost = parseFloat(formRows.reduce((sum, row) => sum + row.item_price_total, 0).toFixed(2));

    return {
        selectedRetailer,
        setSelectedRetailer,
        notes,
        setNotes,
        isScannerOpen,
        setIsScanningOpen,
        formRows,
        setFormRows, // Fixed: Added direct state dispatcher variable return token here
        addFormRow,
        processBarcodeScanResult,
        removeFormRow,
        updateRowState,
        populateProductIntoRow,
        grandTotalCost,
        retailers: retailersList,
        productsCatalog: currentCatalogState,
        paymentMethods,
        isSyncLoading,
        scanToast,
        syncStatus,
        setSyncStatus,
        clearActiveDraftSession
    };
}
