import paymentMethodsApi from '@/api/paymentMethodsApi';
import { db } from '@/databases/db';
import { PaymentMethodItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

interface PaymentMethodsContextType { paymentMethodsList: PaymentMethodItem[]; isPaymentSyncing: boolean; triggerPaymentMethodsFetch: () => Promise<void>; }
const PaymentMethodsSyncContext = createContext<PaymentMethodsContextType | undefined>(undefined);
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export const PaymentMethodsSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [paymentMethodsList, setPaymentMethodsList] = useState<PaymentMethodItem[]>([]);
    const isFirstHydration = useRef(true);
    const getPaymentMethodsApi = useApi(paymentMethodsApi.getPaymentMethodsAction);

    // Reactive State Monitoring for useApi Data & Errors Pipeline
    useEffect(() => {
        const rawData = getPaymentMethodsApi.data;

        // 1. Monitor payload updates reactively
        if (Array.isArray(rawData) && rawData.length > 0) {
            const normalized: PaymentMethodItem[] = rawData.map(i => ({
                id: String(i.id), title: String(i.title), description: i.description ? String(i.description) : '',
                active: !!i.active, updatedAt: new Date().toISOString()
            }));

            setPaymentMethodsList(normalized);

            // Safe async wrapper prevents cross-platform promise execution crashes
            const persistToLocalStorage = async () => {
                try {
                    await db.paymentMethods.saveAll(normalized);
                    await db.paymentMethods.setLastSync(Date.now());
                } catch (e) {
                    console.error("⚠️ Local storage layout persistence failed:", e);
                }
            };
            persistToLocalStorage();
        }

        // 2. Monitor error objects inside the custom hook data payload
        if (rawData?.errors) {
            console.error("🚨 [PAYMENT API TELEMETRY ERRORS]:", rawData.errors);
        }
    }, [getPaymentMethodsApi.data]);

    const runRemotePaymentMethodsSynchronizer = async () => {
        try {
            if (isFirstHydration.current) { console.log(">>> [PAYMENT CONTEXT] Syncing remote channels..."); isFirstHydration.current = false; }
            await getPaymentMethodsApi.request({ action: "GetAllPaymentMethods" });
        } catch (e) { console.warn("⚠️ Remote request invocation failed:", e); }
    };

    useEffect(() => {
        const initSync = async () => {
            const cached = await db.paymentMethods.getAll();
            if (cached?.length) setPaymentMethodsList(cached);

            const timePassed = Date.now() - (await db.paymentMethods.getLastSync());
            if (timePassed >= TWELVE_HOURS_MS || !cached?.length) await runRemotePaymentMethodsSynchronizer();

            const intervalId = setInterval(runRemotePaymentMethodsSynchronizer, TWELVE_HOURS_MS);
            return () => clearInterval(intervalId);
        };
        initSync();
    }, []);

    return (
        <PaymentMethodsSyncContext.Provider value={{ paymentMethodsList, isPaymentSyncing: getPaymentMethodsApi.loading, triggerPaymentMethodsFetch: runRemotePaymentMethodsSynchronizer }}>
            {children}
        </PaymentMethodsSyncContext.Provider>
    );
};

export const usePaymentMethodsSync = () => {
    const context = useContext(PaymentMethodsSyncContext);
    if (!context) throw new Error('usePaymentMethodsSync must be used within a PaymentMethodsSyncProvider');
    return context;
};
