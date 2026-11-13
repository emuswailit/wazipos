// context/PreparationsSyncContext.tsx

import preparationsApi from '@/api/drugs/preparationsApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { useApi } from '@/hooks/useApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// 🌟 Using the centralized type
import { PreparationItem } from '@/databases/types';

interface PreparationsContextType {
    preparationsList: PreparationItem[];
    isPreparationsSyncing: boolean;
    isPreparationsRefreshing: boolean;
    triggerPreparationsFetch: () => Promise<void>;
    forcePreparationsRefresh: () => Promise<void>;
}

const PreparationsSyncContext = createContext<PreparationsContextType | undefined>(undefined);

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_PREPARATIONS_LAST_SYNC_KEY = 'preparations_last_sync_time';
const PREPARATIONS_STORAGE_KEY = '@wazipos_preparations';
const isWeb = Platform.OS === 'web';

// Allowed entity types that need the preparations catalog
const ALLOWED_ENTITY_TYPES = ['PharmaceuticalRetailer', 'PharmaceuticalWholesaler'];

const log = (...args: any[]) => {
    if (__DEV__) console.log('[PreparationsSync]', ...args);
};

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

function normalizePreparation(i: any): PreparationItem {
    const remoteId = String(firstDefined(i.id, i.key, ''));

    return {
        cached_at: new Date().toISOString(),
        remote_id: remoteId,
        title: String(i.title ?? ''),
        long_title: String(i.long_title ?? ''),
        formulation_id: String(i.formulation ?? i.formulation_id ?? ''),
        formulation_title: String(i.formulation_title ?? ''),
        description: String(i.description ?? ''),
        generics: Array.isArray(i.generics) ? i.generics.map(String) : [],
        generics_string: String(i.generics_string ?? ''),
        gen_array: Array.isArray(i.gen_array) ? i.gen_array : [],
        active: i.active !== undefined ? !!i.active : true,
        created: String(i.created ?? ''),
        updated: String(i.updated ?? ''),
    };
}

function shallowEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!shallowEqual(a[i], b[i])) return false;
        }
        return true;
    }

    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

function mergePreparation(local: PreparationItem, incoming: PreparationItem): PreparationItem {
    const next: any = { ...local };
    let changed = false;

    for (const k of Object.keys(incoming) as (keyof PreparationItem)[]) {
        if (k === 'id') continue;

        const a = (local as any)[k];
        const b = (incoming as any)[k];

        if (!shallowEqual(a, b)) {
            next[k] = b;
            changed = true;
        }
    }

    if (!changed) return local;

    next.cached_at = new Date().toISOString();
    return next as PreparationItem;
}

function resolvePreparationArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.preparations)) return raw.preparations;

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results)) return raw.data.results;
            if (Array.isArray(raw.data.data)) return raw.data.data;
            if (Array.isArray(raw.data.preparations)) return raw.data.preparations;
        }
    }
    return [];
}

export const PreparationsSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, user } = useAuth();
    const { isOnline } = useNetworkStatus();

    // 🌟 Determine if the current user's entity can access preparations
    const entityType = user?.entity_type || user?.roles?.find((r: any) => r.entity_type)?.entity_type || '';

    // 🌟 Admin Bypass: Allow access if user is staff, superuser, or has an Admin role
    const isAdmin = user?.is_staff || user?.is_superuser || user?.roles?.some((r: any) =>
        ['Admin', 'SuperAdmin', 'admin', 'superadmin'].includes(r.name || r.title || r.role_name)
    );

    const isAllowedEntity = ALLOWED_ENTITY_TYPES.includes(entityType) || isAdmin;

    const [preparationsList, setPreparationsList] = useState<PreparationItem[]>([]);
    const [isPreparationsRefreshing, setIsPreparationsRefreshing] = useState(false);

    const getPreparationsApi = useApi(preparationsApi.getPreparations);

    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isOnlineRef = useRef(isOnline);
    const inFlightRef = useRef(false);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const loadCache = async (): Promise<PreparationItem[]> => {
        try {
            if (isWeb) {
                if (dbInstance?.preparations) {
                    return await dbInstance.preparations.toArray();
                }
            } else {
                const stored = await AsyncStorage.getItem(PREPARATIONS_STORAGE_KEY);
                if (stored) {
                    return JSON.parse(stored) as PreparationItem[];
                }
            }
        } catch (e) {
            log('Failed to load cache:', e);
        }
        return [];
    };

    // 🌟 Returns the final list so we can update the state with correct local IDs
    const saveCache = async (mergedList: PreparationItem[]): Promise<PreparationItem[]> => {
        let finalList = mergedList;
        try {
            if (isWeb) {
                if (dbInstance?.preparations) {
                    await dbInstance.transaction('rw', dbInstance.preparations, async () => {
                        await dbInstance.preparations.clear();
                        if (mergedList.length > 0) {
                            await dbInstance.preparations.bulkPut(mergedList);
                        }
                    });

                    // 🔥 Re-fetch from Dexie to get the auto-incremented local IDs
                    finalList = await dbInstance.preparations.toArray();
                }
            } else {
                await AsyncStorage.setItem(PREPARATIONS_STORAGE_KEY, JSON.stringify(mergedList));
            }

            const nowStr = String(Date.now());
            if (isWeb) {
                localStorage.setItem(EXPO_PREPARATIONS_LAST_SYNC_KEY, nowStr);
            } else {
                await SecureStore.setItemAsync(EXPO_PREPARATIONS_LAST_SYNC_KEY, nowStr);
            }
        } catch (e) {
            log('Failed to save cache:', e);
        }
        return finalList;
    };

    const persistPreparations = useCallback(async (incoming: PreparationItem[]) => {
        try {
            const existing = await loadCache();

            const byRemoteId = new Map<string, PreparationItem>();
            const orphans: PreparationItem[] = [];

            for (const row of existing) {
                const key = row.remote_id;
                if (!key) {
                    orphans.push(row);
                    continue;
                }

                const kept = byRemoteId.get(key);
                if (!kept) {
                    byRemoteId.set(key, row);
                } else if (kept.id === undefined && row.id !== undefined) {
                    byRemoteId.set(key, row);
                }
            }

            for (const inc of incoming) {
                if (!inc.remote_id) continue;
                const local = byRemoteId.get(inc.remote_id);

                if (local) {
                    const merged = mergePreparation(local, inc);
                    byRemoteId.set(inc.remote_id, merged);
                } else {
                    byRemoteId.set(inc.remote_id, inc);
                }
            }

            const mergedList: PreparationItem[] = [...byRemoteId.values(), ...orphans];

            // 🌟 Save to cache and get back the list WITH local IDs
            const savedListWithIds = await saveCache(mergedList);

            setPreparationsList((prev) => {
                if (prev.length === savedListWithIds.length) {
                    const same = prev.every((p, idx) => p === savedListWithIds[idx]);
                    if (same) return prev;
                }
                return savedListWithIds;
            });
        } catch (e) {
            log('Persist failed:', e);
        }
    }, []);

    const runRemotePreparationsSynchronizer = useCallback(async () => {
        if (!token || !isOnlineRef.current || inFlightRef.current || !isAllowedEntity) return;

        inFlightRef.current = true;
        try {
            const res = await getPreparationsApi.request({ action: 'GetPreparations' });

            if (!res?.ok) {
                log('Fetch failed:', res?.problem, res?.status);
                return;
            }

            const list = resolvePreparationArray(res?.data);
            if (list.length === 0) return;

            const normalized: PreparationItem[] = list.map(normalizePreparation);
            await persistPreparations(normalized);
        } catch (e) {
            log('Request threw:', e);
        } finally {
            inFlightRef.current = false;
        }
    }, [token, getPreparationsApi, persistPreparations, isAllowedEntity]);

    const forcePreparationsRefresh = useCallback(async () => {
        if (!isAllowedEntity) return;
        setIsPreparationsRefreshing(true);
        try {
            await runRemotePreparationsSynchronizer();
        } finally {
            setIsPreparationsRefreshing(false);
        }
    }, [runRemotePreparationsSynchronizer, isAllowedEntity]);

    const actionsRef = useRef({ runRemotePreparationsSynchronizer });

    useEffect(() => {
        actionsRef.current = { runRemotePreparationsSynchronizer };
    });

    useEffect(() => {
        let cancelled = false;

        // 🌟 If the entity type is not allowed, do not load or sync
        if (!isAllowedEntity) {
            setPreparationsList([]);
            return;
        }

        const initSync = async () => {
            const cached = await loadCache();
            if (!cancelled && cached?.length) {
                setPreparationsList(cached);
            }

            if (cancelled) return;
            await actionsRef.current.runRemotePreparationsSynchronizer();

            if (cancelled) return;
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                actionsRef.current.runRemotePreparationsSynchronizer();
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
    }, [token, isAllowedEntity]);

    useEffect(() => {
        if (!token || !isAllowedEntity) return;
        if (isOnline) {
            actionsRef.current.runRemotePreparationsSynchronizer();
        }
    }, [isOnline, token, isAllowedEntity]);

    const value = useMemo<PreparationsContextType>(
        () => ({
            preparationsList,
            isPreparationsSyncing: getPreparationsApi.loading,
            isPreparationsRefreshing,
            triggerPreparationsFetch: runRemotePreparationsSynchronizer,
            forcePreparationsRefresh,
        }),
        [
            preparationsList,
            getPreparationsApi.loading,
            isPreparationsRefreshing,
            runRemotePreparationsSynchronizer,
            forcePreparationsRefresh,
        ]
    );

    return (
        <PreparationsSyncContext.Provider value={value}>
            {children}
        </PreparationsSyncContext.Provider>
    );
};

export const usePreparationsSync = () => {
    const context = useContext(PreparationsSyncContext);
    if (!context) {
        throw new Error('usePreparationsSync must be used within a PreparationsSyncProvider');
    }
    return context;
};