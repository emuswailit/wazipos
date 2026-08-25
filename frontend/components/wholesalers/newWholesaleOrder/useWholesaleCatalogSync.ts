import entitiesApi from '@/api/entitiesApi';
import paymentMethodsApi from '@/api/paymentMethodsApi';
import wholesalersApi from '@/api/wholesalersApi';
import { useApi } from '@/hooks/useApi';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ProductCatalogItem, RetailerOption } from '../../../app/(wholesalers)/newWholesaleOrder/types';

let SecureStore: any = null;
if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

export function useWholesaleCatalogSync() {
    const [retailersList, setRetailersList] = useState<RetailerOption[]>([]);
    const [currentCatalogState, setCurrentCatalogState] = useState<ProductCatalogItem[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

    const getWholesalerReceiptsApi = useApi<any[]>(wholesalersApi.wholesaleStaffAction);
    const getRetailersApi = useApi<any[]>(entitiesApi.entitiesAction);
    const paymentMethodsActionsApi = useApi<any>(paymentMethodsApi.getPaymentMethodsAction);

    const synchronizeLocalSandboxStorage = async (incomingItems: ProductCatalogItem[]) => {
        let localizedWriteCounter = 0;
        for (const item of incomingItems) {
            const storageKey = `product_${item.id}`;
            let existingItemString: string | null = null;
            try {
                if (Platform.OS === 'web') {
                    existingItemString = localStorage.getItem(storageKey);
                } else if (Platform.OS !== 'web' && SecureStore) {
                    existingItemString = await SecureStore.getItemAsync(storageKey);
                }
                const stringifiedIncoming = JSON.stringify(item);
                if (existingItemString !== stringifiedIncoming) {
                    localizedWriteCounter++;
                    if (Platform.OS === 'web') {
                        localStorage.setItem(storageKey, stringifiedIncoming);
                    } else if (Platform.OS !== 'web' && SecureStore) {
                        await SecureStore.setItemAsync(storageKey, stringifiedIncoming);
                    }
                }
            } catch (err) {
                console.error(`Failed to process synchronization row for key ${storageKey}:`, err);
            }
        }
        if (localizedWriteCounter > 0 || currentCatalogState.length === 0) {
            setCurrentCatalogState(incomingItems);
        }
    };

    useEffect(() => {
        if (getWholesalerReceiptsApi.data && getWholesalerReceiptsApi.data.length) {
            const formattedProducts: ProductCatalogItem[] = getWholesalerReceiptsApi.data.map((wholesaler_receipt) => ({
                id: wholesaler_receipt.id,
                title: wholesaler_receipt.title,
                bar_code: wholesaler_receipt.bar_code || wholesaler_receipt.barcode || '',
                item_price: parseFloat(Number(wholesaler_receipt.unit_selling_price || 0).toFixed(2)),
                available: String(wholesaler_receipt.current_pack_quantity || 0)
            }));
            synchronizeLocalSandboxStorage(formattedProducts);
        }
    }, [getWholesalerReceiptsApi.data]);

    useEffect(() => {
        if (getRetailersApi.data && getRetailersApi.data.length) {
            const formattedRetailers: RetailerOption[] = getRetailersApi.data.map((retail_entity) => ({
                key: retail_entity.id,
                title: retail_entity.title
            }));
            setRetailersList(formattedRetailers);
        }
    }, [getRetailersApi.data]);

    useEffect(() => {
        if (paymentMethodsActionsApi.data) {
            setPaymentMethods(paymentMethodsActionsApi.data);
        }
    }, [paymentMethodsActionsApi.data]);

    useEffect(() => {
        const triggerSyncCycle = async () => {
            await getWholesalerReceiptsApi.request({ action: "GetWholesalerReceipts" });
            await getRetailersApi.request({ action: "GetRetailEntities" });
            await paymentMethodsActionsApi.request({ action: "GetAllPaymentMethods" });
        };
        triggerSyncCycle();
        const pollerIntervalHandle = setInterval(triggerSyncCycle, 120000);
        return () => {
            clearInterval(pollerIntervalHandle);
        };
    }, [currentCatalogState]);

    return {
        retailersList,
        currentCatalogState,
        paymentMethods,
        isSyncLoading: getWholesalerReceiptsApi.loading || getRetailersApi.loading || paymentMethodsActionsApi.loading
    };
}
