// components/wholesalers/newWholesaleOrder/useWholesaleCatalogSync.ts

import entitiesApi from '@/api/entitiesApi';
import paymentMethodsApi from '@/api/paymentMethodsApi';
import wholesalersApi from '@/api/wholesalersApi';
import type {
    EntityItem,
    ProductItem
} from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

let SecureStore: any = null;
if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

/* =========================================================
 * Legacy-friendly shapes
 * Keep these names so existing consumers still compile.
 * ======================================================= */
export interface RetailerOption {
    key: string;
    title: string;
}

export interface ProductCatalogItem {
    id: string;
    title: string;
    bar_code: string;
    item_price: number;
    available: string;
}

/* =========================================================
 * Hook
 * ======================================================= */
export function useWholesaleCatalogSync() {
    const [retailersList, setRetailersList] = useState<
        EntityItem[]
    >([]);
    const [currentCatalogState, setCurrentCatalogState] =
        useState<ProductItem[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<
        any[]
    >([]);

    const getWholesalerReceiptsApi = useApi<any[]>(
        wholesalersApi.wholesaleStaffAction
    );
    const getRetailersApi = useApi<any[]>(
        entitiesApi.entitiesAction
    );
    const paymentMethodsActionsApi = useApi<any>(
        paymentMethodsApi.getPaymentMethodsAction
    );

    /* ---------------------------------------------------------
     * Local sandbox storage (per-item keys)
     * ------------------------------------------------------- */
    const synchronizeLocalSandboxStorage = async (
        incomingItems: ProductItem[]
    ) => {
        let localizedWriteCounter = 0;

        for (const item of incomingItems) {
            const storageKey = `product_${item.remote_id}`;
            let existingItemString: string | null = null;

            try {
                if (Platform.OS === 'web') {
                    existingItemString =
                        localStorage.getItem(storageKey);
                } else if (
                    Platform.OS !== 'web' &&
                    SecureStore
                ) {
                    existingItemString =
                        await SecureStore.getItemAsync(
                            storageKey
                        );
                }

                const stringifiedIncoming =
                    JSON.stringify(item);

                if (
                    existingItemString !==
                    stringifiedIncoming
                ) {
                    localizedWriteCounter++;
                    if (Platform.OS === 'web') {
                        localStorage.setItem(
                            storageKey,
                            stringifiedIncoming
                        );
                    } else if (
                        Platform.OS !== 'web' &&
                        SecureStore
                    ) {
                        await SecureStore.setItemAsync(
                            storageKey,
                            stringifiedIncoming
                        );
                    }
                }
            } catch (err) {
                console.error(
                    `Failed to process synchronization row for key ${storageKey}:`,
                    err
                );
            }
        }

        if (
            localizedWriteCounter > 0 ||
            currentCatalogState.length === 0
        ) {
            setCurrentCatalogState(incomingItems);
        }
    };

    /* ---------------------------------------------------------
     * Wholesaler receipts → catalog
     * ------------------------------------------------------- */
    useEffect(() => {
        if (
            getWholesalerReceiptsApi.data &&
            getWholesalerReceiptsApi.data.length
        ) {
            const formattedProducts: ProductItem[] =
                getWholesalerReceiptsApi.data.map(
                    (wholesaler_receipt: any) => ({
                        remote_id: String(
                            wholesaler_receipt.id ?? ''
                        ),
                        title:
                            wholesaler_receipt.title ?? '',
                        bar_code:
                            wholesaler_receipt.bar_code ??
                            wholesaler_receipt.barcode ??
                            '',
                        final_unit_selling_price: String(
                            wholesaler_receipt.unit_selling_price ??
                            '0'
                        ),
                        unit_selling_price: String(
                            wholesaler_receipt.unit_selling_price ??
                            '0'
                        ),
                        current_unit_quantity: Number(
                            wholesaler_receipt.current_pack_quantity ??
                            0
                        ),
                        cached_at: new Date().toISOString(),
                    } as any)
                );

            synchronizeLocalSandboxStorage(
                formattedProducts
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getWholesalerReceiptsApi.data]);

    /* ---------------------------------------------------------
     * Retailers → EntityItem[]
     * ------------------------------------------------------- */
    useEffect(() => {
        if (
            getRetailersApi.data &&
            getRetailersApi.data.length
        ) {
            const formattedRetailers: EntityItem[] =
                getRetailersApi.data.map(
                    (retail_entity: any) => ({
                        remote_id: String(
                            retail_entity.id ?? ''
                        ),
                        title: retail_entity.title ?? '',
                        entity_type:
                            retail_entity.entity_type ?? '',
                        town: retail_entity.town ?? '',
                        phone: retail_entity.phone ?? '',
                        county_title:
                            retail_entity.county_title ?? '',
                        entity_code:
                            retail_entity.entity_code ?? null,
                    } as Partial<EntityItem> as EntityItem)
                );

            setRetailersList(formattedRetailers);
        }
    }, [getRetailersApi.data]);

    /* ---------------------------------------------------------
     * Payment methods
     * ------------------------------------------------------- */
    useEffect(() => {
        if (paymentMethodsActionsApi.data) {
            setPaymentMethods(
                paymentMethodsActionsApi.data
            );
        }
    }, [paymentMethodsActionsApi.data]);

    /* ---------------------------------------------------------
     * Sync cycle (2-minute poll)
     * ------------------------------------------------------- */
    useEffect(() => {
        const triggerSyncCycle = async () => {
            await getWholesalerReceiptsApi.request({
                action: 'GetWholesalerReceipts',
            });
            await getRetailersApi.request({
                action: 'GetRetailEntities',
            });
            await paymentMethodsActionsApi.request({
                action: 'GetAllPaymentMethods',
            });
        };

        triggerSyncCycle();

        const pollerIntervalHandle = setInterval(
            triggerSyncCycle,
            120000
        );

        return () => {
            clearInterval(pollerIntervalHandle);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        retailersList,
        currentCatalogState,
        paymentMethods,
        isSyncLoading:
            getWholesalerReceiptsApi.loading ||
            getRetailersApi.loading ||
            paymentMethodsActionsApi.loading,
    };
}