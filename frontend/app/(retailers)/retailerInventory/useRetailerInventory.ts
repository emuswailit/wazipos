// frontend/hooks/useRetailerInventory.ts

import retailerReceiptsApi from '@/api/retailersApi';
import useApi from '@/hooks/useApi';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// 🚀 FIXED: Point directly to the central global Dexie IndexedDB manager
import { db } from '@/databases/db';

const POLLING_INTERVAL_MS = 5 * 60 * 1000;
const NATIVE_SECURE_STORE_KEY = 'wazipos_cached_inventory_receipts';

export const useRetailerInventory = () => {
    const [retailerReceipts, setRetailerReceipts] = useState<any[]>([]);
    const getRetailerReceiptsApi = useApi(retailerReceiptsApi.retailerReceiptsAdminAction);
    const isFirstLoadRef = useRef(true);

    const loadFromLocalStorage = async () => {
        try {
            if (Platform.OS === 'web') {
                const cachedItems = await db.getRetailerReceipts();
                if (cachedItems.length > 0) {
                    setRetailerReceipts(cachedItems);
                    logFirstBootstrap(cachedItems.length, 'INDEXEDDB');
                    return true;
                }
            } else {
                const rawJsonString = await SecureStore.getItemAsync(NATIVE_SECURE_STORE_KEY);
                if (rawJsonString) {
                    const parsedArray = JSON.parse(rawJsonString);
                    if (Array.isArray(parsedArray) && parsedArray.length > 0) {
                        setRetailerReceipts(parsedArray);
                        logFirstBootstrap(parsedArray.length, 'SECURE_STORE');
                        return true;
                    }
                }
            }
            return false;
        } catch (err) {
            console.error('Failed to read config from cache:', err);
            return false;
        }
    };

    const logFirstBootstrap = (count: number, engine: string) => {
        if (isFirstLoadRef.current) {
            console.log(`=== [${engine}] Instant Bootstrap: Loaded ${count} records. ===`);
            isFirstLoadRef.current = false;
        }
    };

    const getEntityRetailerReceipts = async (isBackgroundPoll = false) => {
        try {
            const response = await getRetailerReceiptsApi.request({ action: 'GetRetailerReceipts' });
            const rawData = response || getRetailerReceiptsApi.data;
            if (Array.isArray(rawData) && rawData.length > 0) {
                await processAndPersistReceipts(rawData);
            }
        } catch (error) {
            console.warn('Network unreachable. Keeping local cached data states.');
            if (!isBackgroundPoll) {
                await loadFromLocalStorage();
            }
        }
    };

    const processAndPersistReceipts = async (apiData: any[]) => {
        try {
            const timestamp = new Date().toISOString();

            const mappedReceipts = apiData.map((product: any) => ({
                key: product.id,
                id: product.id,
                title: product.title,
                long_title: product.long_title || product.title,
                label: `${product.title} (KES ${product.unit_selling_price})`,
                price: product.unit_selling_price,
                unit_buying_price: product.unit_buying_price || '0.00',
                final_unit_selling_price: product.final_unit_selling_price || product.unit_selling_price || '0.00',
                available: product.current_unit_quantity,
                current_unit_quantity: product.current_unit_quantity || 0,
                barcode: product.bar_code || product.barcode || null,
                bar_code: product.bar_code || product.barcode || '',
                days_to_expiry: product.days_to_expiry ?? 0,
                expiry_status: product.expiry_status || 'UNKNOWN',
                manufacturer_title: product.manufacturer_title || '',
                origin_country_title: product.origin_country_title || '',
                images: product.images || [],
                cached_at: timestamp,
            }));

            if (Platform.OS === 'web') {
                await db.saveRetailerReceipts(mappedReceipts);
            } else {
                await SecureStore.setItemAsync(NATIVE_SECURE_STORE_KEY, JSON.stringify(mappedReceipts));
            }

            setRetailerReceipts(mappedReceipts);
        } catch (dbErr) {
            console.error('Failed to commit operational background records onto storage:', dbErr);
        }
    };



    useEffect(() => {
        const initializeInventoryPipeline = async () => {
            await loadFromLocalStorage();
            await getEntityRetailerReceipts(true);
        };

        initializeInventoryPipeline();

        const pollingWorkerInterval = setInterval(() => {
            getEntityRetailerReceipts(true);
        }, POLLING_INTERVAL_MS);

        return () => clearInterval(pollingWorkerInterval);
    }, []);

    return {
        retailerReceipts,
        isInventoryLoading: getRetailerReceiptsApi.loading && retailerReceipts.length === 0,
        refetchInventory: () => getEntityRetailerReceipts(true),
    };
};
