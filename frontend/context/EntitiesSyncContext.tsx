// context/EntitiesSyncContext.tsx

import entitiesApi from '@/api/entitiesApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import { EntityItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import * as SecureStore from 'expo-secure-store';
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

interface EntitiesContextType {
    entitiesList: EntityItem[];
    isEntitiesSyncing: boolean;
    isEntitiesRefreshing: boolean;
    triggerEntitiesFetch: () => Promise<void>;
    forceEntitiesRefresh: () => Promise<void>;
}

const EntitiesSyncContext =
    createContext<EntitiesContextType | undefined>(
        undefined
    );

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_ENTITIES_LAST_SYNC_KEY =
    'entities_last_sync_time';

const isWeb = Platform.OS === 'web';

/* ---------------------------------------------------------
 * Normalizer
 * ------------------------------------------------------- */

function normalizeEntity(item: any): EntityItem {
    return {
        id: String(item.id),

        title: String(item.title || ''),
        entity_type: String(item.entity_type || ''),

        ...(item.entity_code
            ? { entity_code: String(item.entity_code) }
            : {}),

        ...(item.phone
            ? { phone: String(item.phone) }
            : {}),

        ...(item.phone1
            ? { phone1: String(item.phone1) }
            : {}),

        ...(item.phone2
            ? { phone2: String(item.phone2) }
            : {}),

        ...(item.phone3
            ? { phone3: String(item.phone3) }
            : {}),

        ...(item.email
            ? { email: String(item.email) }
            : {}),

        ...(item.registration
            ? { registration: String(item.registration) }
            : {}),

        ...(item.entity_ownership
            ? {
                entity_ownership: String(
                    item.entity_ownership
                ),
            }
            : {}),

        ...(item.town ? { town: String(item.town) } : {}),

        ...(item.country
            ? { country: String(item.country) }
            : {}),

        ...(item.country_title
            ? { country_title: String(item.country_title) }
            : {}),

        ...(item.county
            ? { county: String(item.county) }
            : {}),

        ...(item.county_title
            ? { county_title: String(item.county_title) }
            : {}),

        ...(item.constituency
            ? {
                constituency: String(
                    item.constituency
                ),
            }
            : {}),

        ...(item.constituency_title
            ? {
                constituency_title: String(
                    item.constituency_title
                ),
            }
            : {}),

        ...(item.road ? { road: String(item.road) } : {}),

        ...(item.building
            ? { building: String(item.building) }
            : {}),

        ...(Array.isArray(item.images)
            ? { images: item.images }
            : {}),

        ...(Array.isArray(item.logos)
            ? { logos: item.logos }
            : {}),

        ...(typeof item.is_subscribed === 'boolean'
            ? { is_subscribed: item.is_subscribed }
            : {}),

        ...(item.is_verified !== null &&
            item.is_verified !== undefined
            ? { is_verified: item.is_verified }
            : {}),

        ...(item.created
            ? { created: String(item.created) }
            : {}),

        ...(item.updated
            ? { updated: String(item.updated) }
            : {}),

        ...(item.description
            ? { description: String(item.description) }
            : {}),

        cached_at: new Date().toISOString(),
    } as EntityItem;
}

/* ---------------------------------------------------------
 * Unwrap server response shapes
 * ------------------------------------------------------- */

function resolveEntityArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results))
            return raw.results;
        if (Array.isArray(raw.data))
            return raw.data;
        if (Array.isArray(raw.entities))
            return raw.entities;

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results))
                return raw.data.results;
            if (Array.isArray(raw.data.data))
                return raw.data.data;
        }
    }

    return [];
}

export const EntitiesSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [entitiesList, setEntitiesList] = useState<
        EntityItem[]
    >([]);
    const [isEntitiesRefreshing, setIsEntitiesRefreshing] =
        useState(false);

    const getEntitiesApi = useApi(
        entitiesApi.entitiesAction
    );

    const lastProcessedDataRef = useRef<any>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(
        null
    );

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    /* ---------------------------------------------------------
     * Remote fetch
     * ------------------------------------------------------- */

    const runRemoteEntitiesSynchronizer = useCallback(
        async () => {
            if (!token) {
                console.log(
                    '[EntitiesSync] No token yet — skipping'
                );
                return;
            }
            if (!isOnlineRef.current) {
                console.log(
                    '[EntitiesSync] Offline — skipping'
                );
                return;
            }

            try {
                const res = await getEntitiesApi.request({
                    action: 'GetAllEntities',
                });

                if (!res?.ok) {
                    console.warn(
                        '[EntitiesSync] Fetch failed:',
                        res?.problem ||
                        res?.status ||
                        'unknown error'
                    );
                }
            } catch (e) {
                console.warn(
                    'Remote entity sync request failed:',
                    e
                );
            }
        },
        [token, getEntitiesApi]
    );

    /* ---------------------------------------------------------
     * Normalize + persist — guarded by identity check
     * ------------------------------------------------------- */

    useEffect(() => {
        const rawData = getEntitiesApi.data;

        const list = resolveEntityArray(rawData);

        if (
            list.length === 0 ||
            list === lastProcessedDataRef.current
        ) {
            return;
        }

        lastProcessedDataRef.current = list;

        const normalized: EntityItem[] = list
            .filter(
                (item: any) =>
                    item?.id && item?.entity_type
            )
            .map(normalizeEntity);

        if (!normalized.length) return;

        console.log(
            '[EntitiesSync] Normalized',
            normalized.length,
            'entities'
        );

        let cancelled = false;

        (async () => {
            try {
                if (isWeb && dbInstance?.entities) {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.entities,
                        async () => {
                            await dbInstance.entities.clear();
                            await dbInstance.entities.bulkPut(
                                normalized
                            );
                        }
                    );
                } else if (db?.saveEntities) {
                    await db.saveEntities(normalized);
                }

                if (cancelled) return;

                setEntitiesList((prev) => {
                    if (prev.length === normalized.length)
                        return prev;
                    return normalized;
                });

                const nowStr = String(Date.now());

                if (isWeb) {
                    localStorage.setItem(
                        EXPO_ENTITIES_LAST_SYNC_KEY,
                        nowStr
                    );
                } else {
                    await SecureStore.setItemAsync(
                        EXPO_ENTITIES_LAST_SYNC_KEY,
                        nowStr
                    );
                }
            } catch (error) {
                console.error(
                    'Critical entity database storage commit failure:',
                    error
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [getEntitiesApi.data]);

    /* ---------------------------------------------------------
     * Force refresh
     * ------------------------------------------------------- */

    const forceEntitiesRefresh = useCallback(async () => {
        setIsEntitiesRefreshing(true);

        try {
            if (isWeb && dbInstance?.entities) {
                await dbInstance.entities.clear();
            } else if (db?.saveEntities) {
                await db.saveEntities([]);
            }

            setEntitiesList([]);
            lastProcessedDataRef.current = null;

            await runRemoteEntitiesSynchronizer();
        } catch (error) {
            console.error(
                'Force entity refresh transaction error:',
                error
            );
        } finally {
            setIsEntitiesRefreshing(false);
        }
    }, [runRemoteEntitiesSynchronizer]);

    /* ---------------------------------------------------------
     * Stable-ref pattern
     * ------------------------------------------------------- */

    const actionsRef = useRef({
        runRemoteEntitiesSynchronizer,
    });

    useEffect(() => {
        actionsRef.current = {
            runRemoteEntitiesSynchronizer,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap — ONE run per session, plus hourly refresh
     *
     * Depends ONLY on `token`. Do not add callbacks here.
     * ------------------------------------------------------- */

    useEffect(() => {
        let cancelled = false;

        const initSync = async () => {
            /* 1. Load cache */
            try {
                let cached: EntityItem[] = [];

                if (isWeb && dbInstance?.entities) {
                    cached =
                        await dbInstance.entities.toArray();
                } else if (db?.getEntities) {
                    cached = await db.getEntities();
                }

                if (!cancelled && cached?.length) {
                    setEntitiesList(cached);
                    console.log(
                        '[EntitiesSync] Loaded',
                        cached.length,
                        'cached entities'
                    );
                }
            } catch (error) {
                console.error(
                    'Failed to load local cached entity registry:',
                    error
                );
            }

            if (cancelled) return;

            /* 2. Initial remote fetch */
            await actionsRef.current.runRemoteEntitiesSynchronizer();

            if (cancelled) return;

            /* 3. Hourly refresh */
            if (intervalRef.current)
                clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                actionsRef.current.runRemoteEntitiesSynchronizer();
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
    }, [token]);

    /* ---------------------------------------------------------
     * Online / offline transition
     * ------------------------------------------------------- */

    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            console.log(
                '[EntitiesSync] Back online — refetching'
            );
            actionsRef.current.runRemoteEntitiesSynchronizer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Memoized value
     * ------------------------------------------------------- */

    const value = useMemo<EntitiesContextType>(
        () => ({
            entitiesList,
            isEntitiesSyncing: getEntitiesApi.loading,
            isEntitiesRefreshing,
            triggerEntitiesFetch:
                runRemoteEntitiesSynchronizer,
            forceEntitiesRefresh,
        }),
        [
            entitiesList,
            getEntitiesApi.loading,
            isEntitiesRefreshing,
            runRemoteEntitiesSynchronizer,
            forceEntitiesRefresh,
        ]
    );

    return (
        <EntitiesSyncContext.Provider value={value}>
            {children}
        </EntitiesSyncContext.Provider>
    );
};

export const useEntitiesSync = () => {
    const context = useContext(EntitiesSyncContext);

    if (!context) {
        throw new Error(
            'useEntitiesSync must be used within an EntitiesSyncProvider'
        );
    }

    return context;
};