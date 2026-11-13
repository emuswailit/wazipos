// context/RoutesSyncContext.tsx

import drugsApi from '@/api/drugsApi'; // Ensure drugsApi has a `routesAction`
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import { RouteItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface RoutesContextType {
    routesList: RouteItem[];
    isRoutesSyncing: boolean;
    isRoutesRefreshing: boolean;
    forceRoutesRefresh: () => Promise<void>;
}

const RoutesSyncContext = createContext<RoutesContextType | undefined>(undefined);

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_ROUTES_LAST_SYNC_KEY = 'routes_last_sync_time';
const isWeb = Platform.OS === 'web';

const log = (...args: any[]) => {
    if (__DEV__) console.log('[RoutesSync]', ...args);
};

function normalizeRoute(i: any): RouteItem {
    return {
        cached_at: new Date().toISOString(),
        remote_id: String(i.id || i.key || ''),
        title: String(i.title ?? ''),
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
        if (Array.isArray(raw.routes)) return raw.routes;
    }
    return [];
}

export const RoutesSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [routesList, setRoutesList] = useState<RouteItem[]>([]);
    const [isRoutesRefreshing, setIsRoutesRefreshing] = useState(false);

    const getRoutesApi = useApi(drugsApi.routesAction);

    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isOnlineRef = useRef(isOnline);
    const inFlightRef = useRef(false);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const loadCache = async (): Promise<RouteItem[]> => {
        try {
            if (isWeb && dbInstance?.routes) {
                return await dbInstance.routes.toArray();
            } else if (!isWeb && db?.getRoutes) {
                return await db.getRoutes();
            }
        } catch (e) {
            log('Load cache failed:', e);
        }
        return [];
    };

    const saveCache = async (mergedList: RouteItem[]) => {
        try {
            if (isWeb && dbInstance?.routes) {
                await dbInstance.transaction('rw', dbInstance.routes, async () => {
                    await dbInstance.routes.clear();
                    if (mergedList.length > 0) await dbInstance.routes.bulkPut(mergedList);
                });
            } else if (db?.saveRoutes) {
                await db.saveRoutes(mergedList);
            }

            const nowStr = String(Date.now());
            if (isWeb) {
                localStorage.setItem(EXPO_ROUTES_LAST_SYNC_KEY, nowStr);
            } else {
                await SecureStore.setItemAsync(EXPO_ROUTES_LAST_SYNC_KEY, nowStr);
            }
        } catch (e) {
            log('Save cache failed:', e);
        }
    };

    const runSynchronizer = useCallback(async () => {
        if (!token || !isOnlineRef.current || inFlightRef.current) return;
        inFlightRef.current = true;

        try {
            const res = await getRoutesApi.request({ action: 'GetRoutes' });
            if (!res?.ok) {
                log('Fetch failed:', res?.problem, res?.status);
                return;
            }
            const list = resolveArray(res?.data);
            if (list.length === 0) return;

            const normalized = list.map(normalizeRoute);
            await saveCache(normalized);
            setRoutesList(normalized);
        } catch (e) {
            log('Request threw:', e);
        } finally {
            inFlightRef.current = false;
        }
    }, [token, getRoutesApi]);

    const forceRoutesRefresh = useCallback(async () => {
        setIsRoutesRefreshing(true);
        try {
            await runSynchronizer();
        } finally {
            setIsRoutesRefreshing(false);
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
            if (!cancelled && cached?.length) setRoutesList(cached);
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
        routesList,
        isRoutesSyncing: getRoutesApi.loading,
        isRoutesRefreshing,
        forceRoutesRefresh,
    }), [routesList, getRoutesApi.loading, isRoutesRefreshing, forceRoutesRefresh]);

    return <RoutesSyncContext.Provider value={value}>{children}</RoutesSyncContext.Provider>;
};

export const useRoutesSync = () => {
    const context = useContext(RoutesSyncContext);
    if (!context) throw new Error('useRoutesSync must be used within a RoutesSyncProvider');
    return context;
};