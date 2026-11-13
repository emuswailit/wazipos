// context/FrequenciesSyncContext.tsx

import drugsApi from '@/api/drugsApi'; // Ensure drugsApi has a `frequenciesAction`
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import { FrequencyItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface FrequenciesContextType {
    frequenciesList: FrequencyItem[];
    isFrequenciesSyncing: boolean;
    isFrequenciesRefreshing: boolean;
    forceFrequenciesRefresh: () => Promise<void>;
}

const FrequenciesSyncContext = createContext<FrequenciesContextType | undefined>(undefined);

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_FREQUENCIES_LAST_SYNC_KEY = 'frequencies_last_sync_time';
const isWeb = Platform.OS === 'web';

const log = (...args: any[]) => {
    if (__DEV__) console.log('[FrequenciesSync]', ...args);
};

function normalizeFrequency(i: any): FrequencyItem {
    return {
        cached_at: new Date().toISOString(),
        remote_id: String(i.id || i.key || ''),
        title: String(i.title ?? ''),
        numerical: Number(i.numerical ?? 0),
        description: String(i.description ?? ''),
        active: i.active !== undefined ? !!i.active : true,
        created: String(i.created ?? ''),
        updated: String(i.updated ?? ''),
    };
}

function resolveArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.frequencies)) return raw.frequencies;
    }
    return [];
}

export const FrequenciesSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [frequenciesList, setFrequenciesList] = useState<FrequencyItem[]>([]);
    const [isFrequenciesRefreshing, setIsFrequenciesRefreshing] = useState(false);

    const getFrequenciesApi = useApi(drugsApi.frequenciesAction);

    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isOnlineRef = useRef(isOnline);
    const inFlightRef = useRef(false);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const loadCache = async (): Promise<FrequencyItem[]> => {
        try {
            if (isWeb && dbInstance?.frequencies) {
                return await dbInstance.frequencies.toArray();
            } else if (!isWeb && db?.getFrequencies) {
                return await db.getFrequencies();
            }
        } catch (e) {
            log('Load cache failed:', e);
        }
        return [];
    };

    const saveCache = async (mergedList: FrequencyItem[]) => {
        try {
            if (isWeb && dbInstance?.frequencies) {
                await dbInstance.transaction('rw', dbInstance.frequencies, async () => {
                    await dbInstance.frequencies.clear();
                    if (mergedList.length > 0) await dbInstance.frequencies.bulkPut(mergedList);
                });
            } else if (db?.saveFrequencies) {
                await db.saveFrequencies(mergedList);
            }

            const nowStr = String(Date.now());
            if (isWeb) {
                localStorage.setItem(EXPO_FREQUENCIES_LAST_SYNC_KEY, nowStr);
            } else {
                await SecureStore.setItemAsync(EXPO_FREQUENCIES_LAST_SYNC_KEY, nowStr);
            }
        } catch (e) {
            log('Save cache failed:', e);
        }
    };

    const runSynchronizer = useCallback(async () => {
        if (!token || !isOnlineRef.current || inFlightRef.current) return;
        inFlightRef.current = true;

        try {
            const res = await getFrequenciesApi.request({ action: 'GetFrequencies' });
            if (!res?.ok) {
                log('Fetch failed:', res?.problem, res?.status);
                return;
            }
            const list = resolveArray(res?.data);
            if (list.length === 0) return;

            const normalized = list.map(normalizeFrequency);
            await saveCache(normalized);
            setFrequenciesList(normalized);
        } catch (e) {
            log('Request threw:', e);
        } finally {
            inFlightRef.current = false;
        }
    }, [token, getFrequenciesApi]);

    const forceFrequenciesRefresh = useCallback(async () => {
        setIsFrequenciesRefreshing(true);
        try {
            await runSynchronizer();
        } finally {
            setIsFrequenciesRefreshing(false);
        }
    }, [runSynchronizer]);

    const actionsRef = useRef({ runSynchronizer });
    useEffect(() => {
        actionsRef.current = { runSynchronizer };
    });

    useEffect(() => {
        let cancelled = false;
        const initSync = async () => {
            const cached = await loadCache();
            if (!cancelled && cached?.length) setFrequenciesList(cached);
            if (cancelled) return;

            await actionsRef.current.runSynchronizer();
            if (cancelled) return;

            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                actionsRef.current.runSynchronizer();
            }, ONE_HOUR_MS);
        };

        initSync();

        return () => {
            cancelled = true;
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [token]);

    useEffect(() => {
        if (token && isOnline) {
            actionsRef.current.runSynchronizer();
        }
    }, [isOnline, token]);

    const value = useMemo(() => ({
        frequenciesList,
        isFrequenciesSyncing: getFrequenciesApi.loading,
        isFrequenciesRefreshing,
        forceFrequenciesRefresh,
    }), [frequenciesList, getFrequenciesApi.loading, isFrequenciesRefreshing, forceFrequenciesRefresh]);

    return <FrequenciesSyncContext.Provider value={value}>{children}</FrequenciesSyncContext.Provider>;
};

export const useFrequenciesSync = () => {
    const context = useContext(FrequenciesSyncContext);
    if (!context) throw new Error('useFrequenciesSync must be used within a FrequenciesSyncProvider');
    return context;
};