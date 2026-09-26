// context/PaymentMethodsSyncContext.tsx

import paymentMethodsApi from '@/api/paymentMethodsApi';
import { dbInstance } from '@/databases/db';
import { PaymentMethodItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Platform } from 'react-native';

interface PaymentMethodsContextType {
    paymentMethodsList: PaymentMethodItem[];
    isPaymentSyncing: boolean;
    isPaymentRefreshing: boolean;
    triggerPaymentMethodsFetch: () => Promise<void>;
    forcePaymentMethodsRefresh: () => Promise<void>;
}

const PaymentMethodsSyncContext = createContext<
    PaymentMethodsContextType | undefined
>(undefined);

const ONE_HOUR_MS = 60 * 60 * 1000;
const NATIVE_PAYMENT_METHODS_KEY =
    'wazipos_native_payment_methods';
const isWeb = Platform.OS === 'web';

/* ---------------------------------------------------------
 * Unwrap response shapes
 * ------------------------------------------------------- */

function resolvePaymentMethodsArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.payment_methods))
            return raw.payment_methods;

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results))
                return raw.data.results;
            if (Array.isArray(raw.data.data))
                return raw.data.data;
            if (Array.isArray(raw.data.payment_methods))
                return raw.data.payment_methods;
        }
    }

    return [];
}

/* ---------------------------------------------------------
 * Normalizer — wire payment method → PaymentMethodItem
 *
 * IMPORTANT: treat missing `active` as enabled. Only an
 * explicit `false` / `0` / `"false"` marks a method disabled.
 * ------------------------------------------------------- */

function normalizePaymentMethod(i: any): PaymentMethodItem {
    const rawActive = i?.active;

    const isActive =
        rawActive === undefined ||
        rawActive === null ||
        rawActive === true ||
        rawActive === 1 ||
        rawActive === '1' ||
        rawActive === 'true' ||
        rawActive === 'TRUE';

    return {
        id: String(i.id ?? i.key ?? ''),
        title: String(i.title || ''),
        description: i.description
            ? String(i.description)
            : undefined,
        active: isActive,
        updatedAt: new Date().toISOString(),
    };
}

/* ---------------------------------------------------------
 * Provider
 * ------------------------------------------------------- */

export const PaymentMethodsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const [paymentMethodsList, setPaymentMethodsList] = useState<
        PaymentMethodItem[]
    >([]);
    const [isPaymentRefreshing, setIsPaymentRefreshing] =
        useState(false);

    const getMethodsApi = useApi(
        paymentMethodsApi.getPaymentMethodsAction
    );

    /* Guards */
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastProcessedDataRef = useRef<any>(null);

    /* ---------------------------------------------------------
     * Remote fetch
     * ------------------------------------------------------- */

    const runRemotePaymentMethodsSynchronizer = useCallback(
        async () => {
            try {
                await getMethodsApi.request({
                    action: 'GetAllPaymentMethods',
                });
            } catch (e) {
                console.error(
                    '❌ [Payment Remote Sync Network Exception]',
                    e
                );
            }
        },
        [getMethodsApi]
    );

    /* ---------------------------------------------------------
     * Normalize + persist — guarded by identity check
     * ------------------------------------------------------- */

    useEffect(() => {
        const rawData = getMethodsApi.data;

        const list = resolvePaymentMethodsArray(rawData);

        if (
            list.length === 0 ||
            list === lastProcessedDataRef.current
        ) {
            return;
        }

        lastProcessedDataRef.current = list;

        const normalized: PaymentMethodItem[] = list.map(
            normalizePaymentMethod
        );

        console.log(
            '[Payment Context] normalized methods:',
            normalized.length,
            normalized
        );

        /* Only update state if content actually changed */
        setPaymentMethodsList((prev) => {
            if (prev.length === normalized.length) {
                const same = prev.every(
                    (p, idx) =>
                        p.id === normalized[idx].id &&
                        p.title === normalized[idx].title &&
                        p.active === normalized[idx].active
                );
                if (same) return prev;
            }
            return normalized;
        });

        let cancelled = false;

        (async () => {
            try {
                if (isWeb && dbInstance?.paymentMethods) {
                    await dbInstance.paymentMethods.clear();
                    await dbInstance.paymentMethods.bulkPut(
                        normalized
                    );
                } else {
                    await AsyncStorage.setItem(
                        NATIVE_PAYMENT_METHODS_KEY,
                        JSON.stringify(normalized)
                    );
                }

                if (cancelled) return;
            } catch (e) {
                console.error(
                    '❌ [Payment Context Cache Write Fail]',
                    e
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [getMethodsApi.data]);

    /* ---------------------------------------------------------
     * Force refresh
     * ------------------------------------------------------- */

    const forcePaymentMethodsRefresh = useCallback(
        async () => {
            setIsPaymentRefreshing(true);
            try {
                if (isWeb && dbInstance?.paymentMethods) {
                    await dbInstance.paymentMethods.clear();
                } else {
                    await AsyncStorage.removeItem(
                        NATIVE_PAYMENT_METHODS_KEY
                    );
                }
                setPaymentMethodsList([]);
                lastProcessedDataRef.current = null;
                await runRemotePaymentMethodsSynchronizer();
            } catch (e) {
                console.error(e);
            } finally {
                setIsPaymentRefreshing(false);
            }
        },
        [runRemotePaymentMethodsSynchronizer]
    );

    /* ---------------------------------------------------------
     * Stable-ref pattern
     * ------------------------------------------------------- */

    const actionsRef = useRef({
        runRemotePaymentMethodsSynchronizer,
    });

    useEffect(() => {
        actionsRef.current = {
            runRemotePaymentMethodsSynchronizer,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap — one-shot hydrate + fetch, then hourly refresh
     * ------------------------------------------------------- */

    useEffect(() => {
        let cancelled = false;

        const initSync = async () => {
            try {
                let cached: PaymentMethodItem[] = [];

                if (isWeb && dbInstance?.paymentMethods) {
                    cached =
                        await dbInstance.paymentMethods.toArray();
                } else {
                    const rawData = await AsyncStorage.getItem(
                        NATIVE_PAYMENT_METHODS_KEY
                    );
                    cached = rawData
                        ? JSON.parse(rawData)
                        : [];
                }

                if (!cancelled && cached?.length) {
                    setPaymentMethodsList(cached);
                    if (__DEV__)
                        console.log(
                            `💾 [Payment Context] Re-hydrated ${cached.length} payment methods.`
                        );
                }
            } catch (err) {
                console.error(
                    '❌ [Payment Cold Boot Sync Failure]',
                    err
                );
            }

            if (cancelled) return;

            await actionsRef.current.runRemotePaymentMethodsSynchronizer();

            if (cancelled) return;

            if (intervalRef.current)
                clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                actionsRef.current.runRemotePaymentMethodsSynchronizer();
            }, ONE_HOUR_MS);
        };

        initSync();

        return () => {
            cancelled = true;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------------------------------------------------------
     * Memoized context value
     * ------------------------------------------------------- */

    const value = useMemo<PaymentMethodsContextType>(
        () => ({
            paymentMethodsList,
            isPaymentSyncing: getMethodsApi.loading,
            isPaymentRefreshing,
            triggerPaymentMethodsFetch:
                runRemotePaymentMethodsSynchronizer,
            forcePaymentMethodsRefresh,
        }),
        [
            paymentMethodsList,
            getMethodsApi.loading,
            isPaymentRefreshing,
            runRemotePaymentMethodsSynchronizer,
            forcePaymentMethodsRefresh,
        ]
    );

    return (
        <PaymentMethodsSyncContext.Provider value={value}>
            {children}
        </PaymentMethodsSyncContext.Provider>
    );
};

export const usePaymentMethodsSync = () => {
    const context = useContext(PaymentMethodsSyncContext);
    if (!context) {
        throw new Error(
            'usePaymentMethodsSync must be used within an explicit <PaymentMethodsSyncProvider /> tree wrapper.'
        );
    }
    return context;
};