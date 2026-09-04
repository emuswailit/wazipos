import retailersApi from '@/api/retailersApi';
import { CachedReceipt, DatabaseEngine } from '@/databases/db';
import { useApi } from '@/hooks/useApi';
import * as BackgroundFetch from 'expo-background-fetch';
import Constants, { AppOwnership } from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

const BACKGROUND_INVENTORY_TASK = 'BACKGROUND_INVENTORY_SYNC_TASK';
const POLLING_INTERVAL_MS = 5 * 60 * 1000;

interface SyncContextType {
    retailerReceipts: CachedReceipt[];
    isSyncing: boolean;
    lastSyncedTime: string;
    isExpoGo: boolean;
    triggerManualFetch: () => Promise<void>;
}

const InventorySyncContext = createContext<SyncContextType | undefined>(undefined);
const checkIfRunningInExpoGo = (): boolean => Constants.appOwnership === AppOwnership.Expo || Constants.appOwnership === 'expo' || (__DEV__ && Platform.OS !== 'web');

export const processAndStoreReceiptsPayload = async (apiData: any[]): Promise<boolean> => {
    try {
        if (!Array.isArray(apiData) || apiData.length === 0) return false;
        const timestamp = new Date().toISOString();
        const mappedFromRemote: CachedReceipt[] = apiData.map((product: any) => {
            const price = Number(product.final_unit_selling_price || product.unit_selling_price) || 0;
            return {
                key: String(product.id), id: String(product.id),
                title: product.title || product.product_title || 'Unnamed Item',
                label: `${product.title || product.product_title} (KES ${price})`,
                price: String(price), unit_buying_price: product.unit_buying_price || '0',
                final_unit_selling_price: String(price), available: Number(product.current_unit_quantity) || 0,
                current_unit_quantity: Number(product.current_unit_quantity) || 0,
                barcode: product.bar_code || product.barcode || null, bar_code: product.bar_code || product.barcode || '',
                days_to_expiry: product.days_to_expiry || 0, expiry_status: product.expiry_status || 'SAFE',
                manufacturer_title: product.manufacturer_title || '', origin_country_title: product.origin_country_title || '',
                images: product.images || [], cached_at: timestamp
            };
        });

        const existingLocalItems = await DatabaseEngine.getRetailerReceipts();
        const localMap = new Map(existingLocalItems.map(item => [item.key, item]));
        let hasChanges = existingLocalItems.length !== mappedFromRemote.length;

        if (!hasChanges) {
            for (const item of mappedFromRemote) {
                const local = localMap.get(item.key);
                if (!local || local.price !== item.price || local.available !== item.available || local.title !== item.title) {
                    hasChanges = true;
                    break;
                }
            }
        }

        if (hasChanges || existingLocalItems.length === 0) {
            await DatabaseEngine.saveProducts(mappedFromRemote);
            console.log(`=== [SYNC ENGINE] Cache modified: ${mappedFromRemote.length} items verified ===`);
            return true;
        }
        return false;
    } catch (err) {
        console.error("❌ Storage write breakdown:", err);
        return false;
    }
};

if (Platform.OS !== 'web') {
    TaskManager.defineTask(BACKGROUND_INVENTORY_TASK, async () => {
        try {
            const response = await retailersApi.retailerReceiptsAction({ action: "GetRetailerReceipts" });
            if (response?.ok && Array.isArray(response?.data)) {
                const updated = await processAndStoreReceiptsPayload(response.data);
                return updated ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
            }
        } catch { }
        return BackgroundFetch.BackgroundFetchResult.Failed;
    });
}

export const InventorySyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [retailerReceipts, setRetailerReceipts] = useState<CachedReceipt[]>([]);
    const [lastSyncedTime, setLastSyncedTime] = useState<string>('');
    const [isExpoGo] = useState<boolean>(checkIfRunningInExpoGo());
    const isFirstHydration = useRef(true);
    const appState = useRef(AppState.currentState);
    const getRetailerReceiptsApi = useApi(retailersApi.retailerReceiptsAction);

    const hydrateFromLocalDB = async () => {
        const cached = await DatabaseEngine.getRetailerReceipts();
        if (cached && cached.length > 0) {
            setRetailerReceipts(cached);
            if (cached[0]?.cached_at) {
                setLastSyncedTime(new Date(cached[0].cached_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
            if (isFirstHydration.current) {
                console.log(`🎒 [SYNC CONTEXT] Hydrated ${cached.length} records. Mode: ${isExpoGo ? 'Expo Go' : 'Native Build'}`);
                isFirstHydration.current = false;
            }
        }
    };

    const runRemoteDatabaseSynchronizer = async (isBackground = false) => {
        try {
            console.log(`>>> [CONTEXT API REQUEST] [${isBackground ? 'BACKGROUND' : 'MANUAL'}] Dispatching server fetch via useApi...`);
            const response = await getRetailerReceiptsApi.request({ action: "GetRetailerReceipts" });
            const rawData = response?.data || getRetailerReceiptsApi.data;
            if (Array.isArray(rawData) && rawData.length > 0) {
                await processAndStoreReceiptsPayload(rawData);
                await hydrateFromLocalDB();
            }
        } catch (error) {
            console.warn("⚠️ Server unreachable. Falling back to local cache storage channels.", error);
            await hydrateFromLocalDB();
        }
    };

    useEffect(() => {
        hydrateFromLocalDB();
        runRemoteDatabaseSynchronizer(true);

        const foregroundPoller = setInterval(() => runRemoteDatabaseSynchronizer(true), POLLING_INTERVAL_MS);
        let appStateSubscription: any = null;

        if (isExpoGo) {
            const handleAppStateChange = async (nextAppState: AppStateStatus) => {
                if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                    console.log('☀️ [EXPO GO CATCHUP] App returning from background. Fetching updates...');
                    await runRemoteDatabaseSynchronizer(true);
                }
                appState.current = nextAppState;
            };
            appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
        } else if (Platform.OS !== 'web') {
            const registerNativeWorker = async () => {
                try {
                    const status = await BackgroundFetch.getStatusAsync();
                    if (status === BackgroundFetch.BackgroundFetchStatus.Available) {
                        await BackgroundFetch.registerTaskAsync(BACKGROUND_INVENTORY_TASK, { minimumInterval: 5 * 60, stopOnTerminate: false, startOnBoot: true });
                    }
                } catch (err) { console.warn("BackgroundFetch setup error:", err); }
            };
            registerNativeWorker();
        }

        return () => {
            clearInterval(foregroundPoller);
            if (appStateSubscription) appStateSubscription.remove();
        };
    }, [isExpoGo]);

    return (
        <InventorySyncContext.Provider value={{ retailerReceipts, isSyncing: getRetailerReceiptsApi.loading, lastSyncedTime, isExpoGo, triggerManualFetch: () => runRemoteDatabaseSynchronizer(false) }}>
            {children}
        </InventorySyncContext.Provider>
    );
};

export const useInventorySync = () => {
    const context = useContext(InventorySyncContext);
    if (!context) throw new Error('useInventorySync must be used within an InventorySyncProvider context.');
    return context;
};
