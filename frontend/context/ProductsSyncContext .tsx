import productsApi from '@/api/drugs/productsApi';
import { db } from '@/databases/db';
import { ProductItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface ProductsContextType { productsList: ProductItem[]; isProductsSyncing: boolean; triggerProductsFetch: () => Promise<void>; }
const ProductsSyncContext = createContext<ProductsContextType | undefined>(undefined);
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const EXPO_PRODUCTS_LAST_SYNC_KEY = 'products_last_sync_time';
const isWeb = Platform.OS === 'web';

export const ProductsSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [productsList, setProductsList] = useState<ProductItem[]>([]);
    const isFirstHydration = useRef(true);
    const getProductsApi = useApi(productsApi.productsAction);

    // Reactive State Pipeline Monitoring for useApi Data and Errors
    useEffect(() => {
        const rawData = getProductsApi.data;
        if (Array.isArray(rawData) && rawData.length > 0) {
            const normalized: ProductItem[] = rawData.map(i => ({
                id: String(i.id), title: String(i.title || ''), long_title: String(i.long_title || ''),
                product_name: String(i.product_name || ''), preparation: String(i.preparation || ''),
                preparation_title: String(i.preparation_title || ''), long_preparation_title: String(i.long_preparation_title || ''),
                formulation_title: String(i.formulation_title || ''), manufacturer_title: String(i.manufacturer_title || ''),
                country_of_origin: String(i.country_of_origin || ''), category_title: String(i.category_title || ''),
                units_per_pack: Number(i.units_per_pack) || 1, pack_tag: String(i.pack_tag || ''),
                bar_code: String(i.bar_code || ''), manufacturer: String(i.manufacturer || ''),
                category: String(i.category || ''), images: Array.isArray(i.images) ? i.images : [],
                active: !!i.active, created: String(i.created || ''), updated: String(i.updated || ''),
                cached_at: new Date().toISOString()
            }));
            setProductsList(normalized);
            (async () => {
                try {
                    // Directly utilizing standard db engine abstractions without hook footprint
                    await db.saveProducts(normalized);
                    const nowStr = String(Date.now());
                    isWeb ? localStorage.setItem(EXPO_PRODUCTS_LAST_SYNC_KEY, nowStr) : await SecureStore.setItemAsync(EXPO_PRODUCTS_LAST_SYNC_KEY, nowStr);
                } catch (e) { console.error("⚠️ Local save failed:", e); }
            })();
        }
        if (rawData?.errors) console.error("🚨 [PRODUCTS API TELEMETRY ERRORS]:", rawData.errors);
    }, [getProductsApi.data]);

    const runRemoteProductsSynchronizer = async () => {
        try {
            if (isFirstHydration.current) { console.log(">>> [PRODUCTS CONTEXT] Syncing remote catalog..."); isFirstHydration.current = false; }
            await getProductsApi.request({ action: "GetAllProducts" });
        } catch (e) { console.warn("⚠️ Remote product request failed:", e); }
    };

    // Cache Hydration and Background Polling Lifecycle Setup
    useEffect(() => {
        const initSync = async () => {
            const cached = await db.getProducts();
            console.log(">>> [PRODUCTS CONTEXT] Local cache hydration:", cached?.length, "items found.");
            if (cached?.length) setProductsList(cached);

            const lastSync = Number((isWeb ? localStorage.getItem(EXPO_PRODUCTS_LAST_SYNC_KEY) : await SecureStore.getItemAsync(EXPO_PRODUCTS_LAST_SYNC_KEY)) || 0);
            if (Date.now() - lastSync >= TWELVE_HOURS_MS || !cached?.length) await runRemoteProductsSynchronizer();

            const intervalId = setInterval(runRemoteProductsSynchronizer, TWELVE_HOURS_MS);
            return () => clearInterval(intervalId);
        };
        initSync();
        console.log(">>> [PRODUCTS CONTEXT] Initialized and ready for catalog hydration.");
    }, []);

    return (
        <ProductsSyncContext.Provider value={{ productsList, isProductsSyncing: getProductsApi.loading, triggerProductsFetch: runRemoteProductsSynchronizer }}>
            {children}
        </ProductsSyncContext.Provider>
    );
};

export const useProductsSync = () => {
    const context = useContext(ProductsSyncContext);
    if (!context) throw new Error('useProductsSync must be used within a ProductsSyncProvider');
    return context;
};
