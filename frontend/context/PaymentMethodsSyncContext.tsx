import paymentMethodsApi from '@/api/paymentMethodsApi';
import { dbInstance } from '@/databases/db'; // ✅ Imported your authentic dbInstance variable
import { PaymentMethodItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Safe native fallback store
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface PaymentMethodsContextType {
    paymentMethodsList: PaymentMethodItem[];
    isPaymentSyncing: boolean;
    isPaymentRefreshing: boolean;
    triggerPaymentMethodsFetch: () => Promise<void>;
    forcePaymentMethodsRefresh: () => Promise<void>;
}

const PaymentMethodsSyncContext = createContext<PaymentMethodsContextType | undefined>(undefined);
const ONE_HOUR_MS = 60 * 60 * 1000;
const NATIVE_PAYMENT_METHODS_KEY = 'wazipos_native_payment_methods';

export const PaymentMethodsSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [paymentMethodsList, setPaymentMethodsList] = useState<PaymentMethodItem[]>([]);
    const [isPaymentRefreshing, setIsPaymentRefreshing] = useState(false);
    const getMethodsApi = useApi(paymentMethodsApi.getPaymentMethodsAction);

    // 1. Unified Normalizer and Local Cache Writer Loop
    useEffect(() => {
        const rawData = getMethodsApi.data?.results || getMethodsApi.data;
        if (Array.isArray(rawData) && rawData.length > 0) {
            const normalized: PaymentMethodItem[] = rawData.map(i => ({
                id: String(i.id),
                title: String(i.title || ''),
                description: i.description ? String(i.description) : undefined,
                active: !!i.active,
                updatedAt: new Date().toISOString()
            }));

            setPaymentMethodsList(normalized);

            // Async block to update local platform caches safely
            (async () => {
                try {
                    if (Platform.OS === 'web' && dbInstance?.paymentMethods) {
                        // ✅ Fix: Uses dbInstance to wipe and upsert rows to IndexedDB securely
                        await dbInstance.paymentMethods.clear();
                        for (const row of normalized) {
                            await dbInstance.paymentMethods.put(row);
                        }
                    } else {
                        // 📱 Mobile safe fallback serialization to preserve lines past runtime boundaries
                        await AsyncStorage.setItem(NATIVE_PAYMENT_METHODS_KEY, JSON.stringify(normalized));
                    }
                } catch (e) {
                    console.error("❌ [Payment Context Cache Write Fail]", e);
                }
            })();
        }
    }, [getMethodsApi?.data]);

    const runRemotePaymentMethodsSynchronizer = async () => {
        try {
            await getMethodsApi.request({ action: "GetAllPaymentMethods" });
        } catch (e) {
            console.error("❌ [Payment Remote Sync Network Exception]", e);
        }
    };

    const forcePaymentMethodsRefresh = async () => {
        setIsPaymentRefreshing(true);
        try {
            if (Platform.OS === 'web' && dbInstance?.paymentMethods) {
                await dbInstance.paymentMethods.clear();
            } else {
                await AsyncStorage.removeItem(NATIVE_PAYMENT_METHODS_KEY);
            }
            setPaymentMethodsList([]);
            await runRemotePaymentMethodsSynchronizer();
        } catch (e) {
            console.error(e);
        } finally {
            setIsPaymentRefreshing(false);
        }
    };

    // 2. Unified Multi-Platform Hydration Execution on Startup
    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        const initSync = async () => {
            try {
                let cached: PaymentMethodItem[] = [];

                // ✅ Corrected Web local hydration using dbInstance
                if (Platform.OS === 'web' && dbInstance?.paymentMethods) {
                    cached = await dbInstance.paymentMethods.toArray();
                }
                // ✅ Corrected Native mobile safe re-hydration lookup
                else {
                    const rawData = await AsyncStorage.getItem(NATIVE_PAYMENT_METHODS_KEY);
                    cached = rawData ? JSON.parse(rawData) : [];
                }

                if (cached && cached.length > 0) {
                    console.log(`💾 [Payment Context] Re-hydrated ${cached.length} settlement systems from database.`);
                    setPaymentMethodsList(cached);
                }

                // Run background refresh link over the socket/wire
                await runRemotePaymentMethodsSynchronizer();
                intervalId = setInterval(runRemotePaymentMethodsSynchronizer, ONE_HOUR_MS);
            } catch (err) {
                console.error("❌ [Payment Cold Boot Sync Failure]", err);
            }
        };

        initSync();
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, []);

    return (
        <PaymentMethodsSyncContext.Provider
            value={{
                paymentMethodsList,
                isPaymentSyncing: getMethodsApi.loading,
                isPaymentRefreshing,
                triggerPaymentMethodsFetch: runRemotePaymentMethodsSynchronizer,
                forcePaymentMethodsRefresh
            }}
        >
            {children}
        </PaymentMethodsSyncContext.Provider>
    );
};

export const usePaymentMethodsSync = () => {
    const context = useContext(PaymentMethodsSyncContext);
    if (!context) {
        throw new Error('usePaymentMethodsSync must be used within an explicit <PaymentMethodsSyncProvider /> tree wrapper.');
    }
    return context;
};
