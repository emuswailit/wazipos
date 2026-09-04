// app/databases/useProductsDatabase.ts

import * as SecureStore from 'expo-secure-store';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { DatabaseEngine } from './db'; // 🚀 Relative path references matching db.ts proximity locks
import { ProductItem } from './types';

const SECURE_STORE_MOBILE_KEY = "wazipos_secure_products_catalog_payload";

export function useProductsDatabase() {
    const [dbLoading, setDbLoading] = useState<boolean>(false);

    /**
     * 👥 Retrieve the complete product catalog layout from active platform layer storage arrays.
     */
    const getAllProducts = useCallback(async (): Promise<ProductItem[]> => {
        setDbLoading(true);
        try {
            if (Platform.OS === 'web') {
                // 🚀 WEB: Direct high-performance array scan over Dexie database tables
                return await DatabaseEngine.products.toArray();
            } else {
                // 📱 NATIVE: Pull footprint values straight out of mobile hardware encryption slots
                const secureString = await SecureStore.getItemAsync(SECURE_STORE_MOBILE_KEY);
                return secureString ? JSON.parse(secureString) : [];
            }
        } catch (error) {
            console.error("📊 [Wazipos DB Engine] Critical fetch retrieval fault track failure:", error);
            return [];
        } finally {
            setDbLoading(false);
        }
    }, []);

    /**
     * 🚀 Write an entire batch payload array atomically into local storage layers.
     */
    const bulkPutProducts = useCallback(async (productsList: ProductItem[]): Promise<void> => {
        setDbLoading(true);
        try {
            if (Platform.OS === 'web') {
                // 🚀 WEB: Fast atomic bulk insertion execution inside the browser
                await DatabaseEngine.products.bulkPut(productsList);
            } else {
                // 📱 NATIVE: Encrypt, pack, and serialize the payload array under your hardware storage slot
                const serializedPayload = JSON.stringify(productsList);
                await SecureStore.setItemAsync(SECURE_STORE_MOBILE_KEY, serializedPayload);
            }
        } catch (error) {
            console.error("❌ [Wazipos DB Engine] Critical bulk entry serialization write breakdown:", error);
            throw error;
        } finally {
            setDbLoading(false);
        }
    }, []);

    /**
     * 🛑 Flush all local catalog data definitions permanently.
     */
    const clearAllProducts = useCallback(async (): Promise<void> => {
        setDbLoading(true);
        try {
            if (Platform.OS === 'web') {
                await DatabaseEngine.products.clear();
            } else {
                await SecureStore.deleteItemAsync(SECURE_STORE_MOBILE_KEY);
            }
        } catch (error) {
            console.error("⚠️ [Wazipos DB Engine] Wipe initialization loop anomaly tracking:", error);
        } finally {
            setDbLoading(false);
        }
    }, []);

    return {
        dbLoading,
        getAllProducts,
        bulkPutProducts,
        clearAllProducts
    };
}
