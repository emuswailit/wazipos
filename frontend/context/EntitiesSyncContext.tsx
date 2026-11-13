// context/EntitiesSyncContext.tsx

import countiesApi from '@/api/countiesApi';
import countriesApi from '@/api/countriesApi';
import entitiesApi from '@/api/entitiesApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance, withDb } from '@/databases/db';
import {
    Country,
    County,
    EntityItem,
    LocationOption,
    SubCounty,
} from '@/databases/types';
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

/* =========================================================
 * Types
 * ======================================================= */

type LocationLevel = 'country' | 'county' | 'subCounty';

interface EntitiesContextType {
    entitiesList: EntityItem[];
    isEntitiesSyncing: boolean;
    isEntitiesRefreshing: boolean;
    triggerEntitiesFetch: () => Promise<void>;
    forceEntitiesRefresh: () => Promise<void>;

    /* Derived selectors — entities */
    generalWholesalers: EntityItem[];
    pharmaceuticalWholesalers: EntityItem[];
    allWholesalers: EntityItem[];
    getEntitiesByType: (entityType: string) => EntityItem[];

    /* ── Locations (in-memory) ───────────────────────────── */
    countriesRaw: Country[];
    countiesRaw: County[];

    countries: LocationOption[];
    counties: LocationOption[];
    subCounties: LocationOption[];

    isLocationsSyncing: boolean;
    isLocationsRefreshing: boolean;
    triggerLocationsFetch: () => Promise<void>;
    forceLocationsRefresh: () => Promise<void>;

    /* ── Location selectors ──────────────────────────────── */
    getCountiesByCountry: (countryValue: string) => LocationOption[];
    getSubCountiesByCounty: (countyValue: string) => LocationOption[];
    getLocationOptions: (
        level: LocationLevel,
        parentValue?: string
    ) => LocationOption[];

    getCountryById: (id: string) => Country | undefined;
    getCountyById: (id: string) => County | undefined;
    getSubCountyById: (id: string) => SubCounty | undefined;

    /* ── Location storage helpers ────────────────────────── */
    getCountriesFromStorage: () => Promise<Country[]>;
    getCountiesFromStorage: () => Promise<County[]>;
    getCountryFromStorage: (id: string) => Promise<Country | null>;
    getCountyFromStorage: (id: string) => Promise<County | null>;
    getSubCountiesFromStorage: (
        countyId: string
    ) => Promise<SubCounty[]>;
    reloadLocationsFromStorage: () => Promise<void>;
}

const EntitiesSyncContext =
    createContext<EntitiesContextType | undefined>(undefined);

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_ENTITIES_LAST_SYNC_KEY = 'entities_last_sync_time';
const EXPO_LOCATIONS_LAST_SYNC_KEY = 'locations_last_sync_time';

const isWeb = Platform.OS === 'web';

/* =========================================================
 * Normalizer — entities
 * ======================================================= */

function normalizeEntity(item: any): EntityItem {
    return {
        id: String(item.id),
        remote_id: String(item.id),
        title: String(item.title || ''),
        entity_type: String(item.entity_type || ''),
        entity_ownership: String(item.entity_ownership || ''),
        entity_code: item.entity_code ? String(item.entity_code) : null,
        bank_code: item.bank_code ? String(item.bank_code) : null,

        // Contact info
        ...(item.phone ? { phone: String(item.phone) } : {}),
        ...(item.phone1 ? { phone1: String(item.phone1) } : {}),
        ...(item.phone2 ? { phone2: String(item.phone2) } : {}),
        ...(item.phone3 ? { phone3: String(item.phone3) } : {}),
        ...(item.email ? { email: String(item.email) } : {}),
        ...(item.registration ? { registration: String(item.registration) } : {}),

        // Ownership & Details
        owner: item.owner ? String(item.owner) : null,
        owner_details: item.owner_details ? String(item.owner_details) : "",
        administrator: item.administrator ? String(item.administrator) : null,
        rating: Number(item.rating) || 0,
        description: item.description ? String(item.description) : null,

        // Location
        town: item.town ? String(item.town) : '',
        country: item.country ? String(item.country) : '',
        country_title: item.country_title ? String(item.country_title) : '',
        county: item.county ? String(item.county) : null,
        county_title: item.county_title ? String(item.county_title) : '',
        sub_county: item.sub_county ? String(item.sub_county) : null,
        sub_county_title: item.sub_county_title ? String(item.sub_county_title) : '',
        constituency: item.constituency ? String(item.constituency) : null,
        constituency_title: item.constituency_title ? String(item.constituency_title) : '',
        road: item.road ? String(item.road) : null,
        building: item.building ? String(item.building) : null,
        postal_address: item.postal_address ? String(item.postal_address) : null,
        postal_code: item.postal_code ? String(item.postal_code) : null,
        postal_town: item.postal_town ? String(item.postal_town) : null,

        // Subscriptions & Plans
        is_subscribed: Boolean(item.is_subscribed),
        is_verified: String(item.is_verified || 'false'),
        trial_from: item.trial_from ? String(item.trial_from) : null,
        trial_to: item.trial_to ? String(item.trial_to) : null,
        registration_fee: String(item.registration_fee || '0.00'),
        commission_percentage: String(item.commission_percentage || '0.00'),
        registration_fee_paid: String(item.registration_fee_paid || 'false'),
        monthly_subscription: String(item.monthly_subscription || '0.00'),
        offer_trial: String(item.offer_trial || 'false'),
        plan: item.plan || null,
        plan_title: item.plan_title ? String(item.plan_title) : '',

        // Categories
        categories: Array.isArray(item.categories) ? item.categories : [],
        categories_array: Array.isArray(item.categories_array) ? item.categories_array : [],

        // Media
        images: Array.isArray(item.images) ? item.images : [],
        logos: Array.isArray(item.logos) ? item.logos : [],
        licences: Array.isArray(item.licences) ? item.licences : [],
        departments: item.departments || null,

        // Timestamps
        ...(item.created ? { created: String(item.created) } : {}),
        ...(item.updated ? { updated: String(item.updated) } : {}),
        cached_at: new Date().toISOString(),
    } as EntityItem;
}

/* =========================================================
 * Response unwrap
 * ======================================================= */

function resolveEntityArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.entities)) return raw.entities;

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results)) return raw.data.results;
            if (Array.isArray(raw.data.data)) return raw.data.data;
        }
    }

    return [];
}

function unwrapList<T>(raw: any): T[] {
    if (Array.isArray(raw)) return raw as T[];

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results as T[];
        if (Array.isArray(raw.data)) return raw.data as T[];

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results)) return raw.data.results as T[];
            if (Array.isArray(raw.data.data)) return raw.data.data as T[];
        }
    }

    return [];
}

/* =========================================================
 * Location index builder
 * ======================================================= */

function buildLocationOptions<
    T extends { id: string; title: string | null }
>(
    rows: T[],
    countFn?: (row: T) => number
): LocationOption[] {
    return rows
        .map((r) => ({
            value: r.id,
            label: r.title || r.id,
            count: countFn ? countFn(r) : 1,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/* =========================================================
 * Provider
 * ======================================================= */

export const EntitiesSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    /* ── Entity state ─────────────────────────────────────── */
    const [entitiesList, setEntitiesList] = useState<EntityItem[]>([]);
    const [isEntitiesRefreshing, setIsEntitiesRefreshing] = useState(false);

    /* ── Location state ───────────────────────────────────── */
    const [countriesRaw, setCountriesRaw] = useState<Country[]>([]);
    const [countiesRaw, setCountiesRaw] = useState<County[]>([]);
    const [isLocationsSyncing, setIsLocationsSyncing] = useState(false);
    const [isLocationsRefreshing, setIsLocationsRefreshing] = useState(false);

    const getEntitiesApi = useApi(entitiesApi.entitiesAction);

    const lastProcessedDataRef = useRef<any>(null);
    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    /* ---------------------------------------------------------
     * Remote fetch — entities
     * ------------------------------------------------------- */

    const runRemoteEntitiesSynchronizer = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;

        try {
            const res = await getEntitiesApi.request({
                action: 'GetAllEntities',
            });

            if (!res?.ok) {
                console.warn('[EntitiesSync] Fetch failed:', res?.problem, res?.status);
            }
        } catch (e) {
            console.warn('Remote entity sync request failed:', e);
        }
    }, [token, getEntitiesApi]);

    /* ---------------------------------------------------------
     * Remote fetch — locations (countries + counties)
     * ------------------------------------------------------- */

    const runRemoteLocationsSynchronizer = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;

        setIsLocationsSyncing(true);

        try {
            const [countriesRes, countiesRes] = await Promise.all([
                countriesApi.getCountries().catch(() => null),
                countiesApi.getCounties().catch(() => null),
            ]);

            const countriesList = unwrapList<Country>(countriesRes);
            const countiesList = unwrapList<County>(countiesRes);

            if (countriesList.length > 0) {
                await db.saveCountries(countriesList);
                setCountriesRaw(countriesList);
            }

            if (countiesList.length > 0) {
                await db.saveCounties(countiesList);
                setCountiesRaw(countiesList);
            }

            const nowStr = String(Date.now());
            if (isWeb) {
                localStorage.setItem(EXPO_LOCATIONS_LAST_SYNC_KEY, nowStr);
            } else {
                await SecureStore.setItemAsync(EXPO_LOCATIONS_LAST_SYNC_KEY, nowStr);
            }
        } catch (e) {
            console.warn('[LocationsSync] sync failed:', e);
        } finally {
            setIsLocationsSyncing(false);
        }
    }, [token]);

    /* ---------------------------------------------------------
     * Normalize + persist — entities
     * ------------------------------------------------------- */

    useEffect(() => {
        const rawData = getEntitiesApi.data;
        const list = resolveEntityArray(rawData);

        if (list.length === 0 || list === lastProcessedDataRef.current) return;

        lastProcessedDataRef.current = list;

        const normalized: EntityItem[] = list
            .filter((item: any) => item?.id && item?.entity_type)
            .map(normalizeEntity);

        if (!normalized.length) return;

        let cancelled = false;

        (async () => {
            try {
                if (isWeb && dbInstance?.entities) {
                    await dbInstance.transaction('rw', dbInstance.entities, async () => {
                        await dbInstance.entities.clear();
                        await dbInstance.entities.bulkPut(normalized);
                    });
                } else if (db?.saveEntities) {
                    await db.saveEntities(normalized);
                }

                if (cancelled) return;

                setEntitiesList((prev) => {
                    if (prev.length === normalized.length) return prev;
                    return normalized;
                });

                const nowStr = String(Date.now());
                if (isWeb) {
                    localStorage.setItem(EXPO_ENTITIES_LAST_SYNC_KEY, nowStr);
                } else {
                    await SecureStore.setItemAsync(EXPO_ENTITIES_LAST_SYNC_KEY, nowStr);
                }
            } catch (error) {
                console.error('Critical entity database storage commit failure:', error);
            }
        })();

        return () => { cancelled = true; };
    }, [getEntitiesApi.data]);

    /* ---------------------------------------------------------
     * Force refresh — entities & locations
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
            console.error('Force entity refresh error:', error);
        } finally {
            setIsEntitiesRefreshing(false);
        }
    }, [runRemoteEntitiesSynchronizer]);

    const forceLocationsRefresh = useCallback(async () => {
        setIsLocationsRefreshing(true);
        try {
            await db.saveCountries([]);
            await db.saveCounties([]);
            setCountriesRaw([]);
            setCountiesRaw([]);
            await runRemoteLocationsSynchronizer();
        } catch (error) {
            console.error('Force locations refresh error:', error);
        } finally {
            setIsLocationsRefreshing(false);
        }
    }, [runRemoteLocationsSynchronizer]);

    /* ---------------------------------------------------------
     * Location storage helpers
     * ------------------------------------------------------- */

    const getCountriesFromStorage = useCallback(async (): Promise<Country[]> => {
        try { return await db.getCountries(); } catch { return []; }
    }, []);

    const getCountiesFromStorage = useCallback(async (): Promise<County[]> => {
        try { return await db.getCounties(); } catch { return []; }
    }, []);

    const getCountryFromStorage = useCallback(async (id: string): Promise<Country | null> => {
        if (!id) return null;
        try {
            const all = await db.getCountries();
            return all.find((c) => c.id === id) ?? null;
        } catch { return null; }
    }, []);

    const getCountyFromStorage = useCallback(async (id: string): Promise<County | null> => {
        if (!id) return null;
        try {
            const all = await db.getCounties();
            return all.find((c) => c.id === id) ?? null;
        } catch { return null; }
    }, []);

    const getSubCountiesFromStorage = useCallback(async (countyId: string): Promise<SubCounty[]> => {
        if (!countyId) return [];
        try {
            const all = await db.getCounties();
            const county = all.find((c) => c.id === countyId);
            return county?.sub_counties ?? [];
        } catch { return []; }
    }, []);

    const reloadLocationsFromStorage = useCallback(async () => {
        try {
            const [countries, counties] = await Promise.all([
                db.getCountries().catch(() => [] as Country[]),
                db.getCounties().catch(() => [] as County[]),
            ]);
            setCountriesRaw(countries);
            setCountiesRaw(counties);
        } catch (err) {
            console.warn('[LocationsSync] reloadLocationsFromStorage failed:', err);
        }
    }, []);

    /* ---------------------------------------------------------
     * Stable-ref pattern & Bootstrap
     * ------------------------------------------------------- */

    const actionsRef = useRef({
        runRemoteEntitiesSynchronizer,
        runRemoteLocationsSynchronizer,
    });

    useEffect(() => {
        actionsRef.current = {
            runRemoteEntitiesSynchronizer,
            runRemoteLocationsSynchronizer,
        };
    });

    useEffect(() => {
        let cancelled = false;

        const initSync = async () => {
            // 1. Load entity cache
            try {
                let cached: EntityItem[] = [];
                if (isWeb && dbInstance?.entities) {
                    cached = await withDb(() => dbInstance.entities.toArray());
                } else if (db?.getEntities) {
                    cached = await db.getEntities();
                }
                if (!cancelled && cached?.length) {
                    setEntitiesList(cached);
                }
            } catch (error) {
                console.error('Failed to load cached entities:', error);
            }

            // 2. Load location cache
            try {
                const [cachedCountries, cachedCounties] = await Promise.all([
                    db.getCountries().catch(() => [] as Country[]),
                    db.getCounties().catch(() => [] as County[]),
                ]);
                if (!cancelled) {
                    if (cachedCountries?.length) setCountriesRaw(cachedCountries);
                    if (cachedCounties?.length) setCountiesRaw(cachedCounties);
                }
            } catch (error) {
                console.error('Failed to load cached locations:', error);
            }

            if (cancelled) return;

            // 3. Initial remote fetches
            await Promise.all([
                actionsRef.current.runRemoteEntitiesSynchronizer(),
                actionsRef.current.runRemoteLocationsSynchronizer(),
            ]);

            if (cancelled) return;

            // 4. Hourly refresh
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                actionsRef.current.runRemoteEntitiesSynchronizer();
                actionsRef.current.runRemoteLocationsSynchronizer();
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
    }, [token]);

    useEffect(() => {
        if (!token) return;
        if (isOnline) {
            actionsRef.current.runRemoteEntitiesSynchronizer();
            actionsRef.current.runRemoteLocationsSynchronizer();
        }
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Derived selectors — entities & locations
     * ------------------------------------------------------- */

    const generalWholesalers = useMemo(() => entitiesList.filter((e) => e.entity_type === 'GeneralWholesaler'), [entitiesList]);
    const pharmaceuticalWholesalers = useMemo(() => entitiesList.filter((e) => e.entity_type === 'PharmaceuticalWholesaler'), [entitiesList]);
    const allWholesalers = useMemo(() => [...generalWholesalers, ...pharmaceuticalWholesalers], [generalWholesalers, pharmaceuticalWholesalers]);
    const getEntitiesByType = useCallback((entityType: string) => entitiesList.filter((e) => e.entity_type === entityType), [entitiesList]);

    const countries = useMemo<LocationOption[]>(() => {
        return buildLocationOptions(countriesRaw, (c) => countiesRaw.filter((ct) => ct.country === c.id).length);
    }, [countriesRaw, countiesRaw]);

    const counties = useMemo<LocationOption[]>(() => {
        return buildLocationOptions(countiesRaw, (c) => c.sub_counties?.length ?? 0);
    }, [countiesRaw]);

    const subCounties = useMemo<LocationOption[]>(() => {
        const out: LocationOption[] = [];
        for (const c of countiesRaw) {
            for (const sc of c.sub_counties ?? []) {
                out.push({ value: sc.id, label: sc.title || sc.id, count: 1 });
            }
        }
        return out.sort((a, b) => a.label.localeCompare(b.label));
    }, [countiesRaw]);

    const getCountiesByCountry = useCallback((countryValue: string): LocationOption[] => {
        if (!countryValue) return counties;
        const pool = countiesRaw.filter((c) => c.country === countryValue);
        return buildLocationOptions(pool, (c) => c.sub_counties?.length ?? 0);
    }, [countiesRaw, counties]);

    const getSubCountiesByCounty = useCallback((countyValue: string): LocationOption[] => {
        if (!countyValue) return subCounties;
        const parent = countiesRaw.find((c) => c.id === countyValue);
        if (!parent) return [];
        return (parent.sub_counties ?? [])
            .map((sc) => ({ value: sc.id, label: sc.title || sc.id, count: 1 }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [countiesRaw, subCounties]);

    const getLocationOptions = useCallback((level: LocationLevel, parentValue?: string): LocationOption[] => {
        if (level === 'country') return countries;
        if (level === 'county') {
            return parentValue ? getCountiesByCountry(parentValue) : counties;
        }
        return parentValue ? getSubCountiesByCounty(parentValue) : subCounties;
    }, [countries, counties, subCounties, getCountiesByCountry, getSubCountiesByCounty]);

    const getCountryById = useCallback((id: string) => countriesRaw.find((c) => c.id === id), [countriesRaw]);
    const getCountyById = useCallback((id: string) => countiesRaw.find((c) => c.id === id), [countiesRaw]);

    const getSubCountyById = useCallback((id: string): SubCounty | undefined => {
        for (const c of countiesRaw) {
            const found = (c.sub_counties ?? []).find((sc) => sc.id === id);
            if (found) return found;
        }
        return undefined;
    }, [countiesRaw]);

    /* ---------------------------------------------------------
     * Memoized context value
     * ------------------------------------------------------- */

    const value = useMemo<EntitiesContextType>(
        () => ({
            entitiesList,
            isEntitiesSyncing: getEntitiesApi.loading,
            isEntitiesRefreshing,
            triggerEntitiesFetch: runRemoteEntitiesSynchronizer,
            forceEntitiesRefresh,

            generalWholesalers,
            pharmaceuticalWholesalers,
            allWholesalers,
            getEntitiesByType,

            countriesRaw,
            countiesRaw,
            countries,
            counties,
            subCounties,

            isLocationsSyncing,
            isLocationsRefreshing,
            triggerLocationsFetch: runRemoteLocationsSynchronizer,
            forceLocationsRefresh,

            getCountiesByCountry,
            getSubCountiesByCounty,
            getLocationOptions,

            getCountryById,
            getCountyById,
            getSubCountyById,

            getCountriesFromStorage,
            getCountiesFromStorage,
            getCountryFromStorage,
            getCountyFromStorage,
            getSubCountiesFromStorage,
            reloadLocationsFromStorage,
        }),
        [
            entitiesList,
            getEntitiesApi.loading,
            isEntitiesRefreshing,
            runRemoteEntitiesSynchronizer,
            forceEntitiesRefresh,
            generalWholesalers,
            pharmaceuticalWholesalers,
            allWholesalers,
            getEntitiesByType,
            countriesRaw,
            countiesRaw,
            countries,
            counties,
            subCounties,
            isLocationsSyncing,
            isLocationsRefreshing,
            runRemoteLocationsSynchronizer,
            forceLocationsRefresh,
            getCountiesByCountry,
            getSubCountiesByCounty,
            getLocationOptions,
            getCountryById,
            getCountyById,
            getSubCountyById,
            getCountriesFromStorage,
            getCountiesFromStorage,
            getCountryFromStorage,
            getCountyFromStorage,
            getSubCountiesFromStorage,
            reloadLocationsFromStorage,
        ]
    );

    return (
        <EntitiesSyncContext.Provider value={value}>
            {children}
        </EntitiesSyncContext.Provider>
    );
};

/* =========================================================
 * Hook
 * ======================================================= */

export const useEntitiesSync = () => {
    const context = useContext(EntitiesSyncContext);

    if (!context) {
        throw new Error('useEntitiesSync must be used within an EntitiesSyncProvider');
    }

    return context;
};