// context/ProductsSyncContext.tsx

import productsApi from '@/api/drugs/productsApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import {
    ProductCategoryDetails,
    ProductImage,
    ProductItem,
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

interface ProductsContextType {
    productsList: ProductItem[];
    isProductsSyncing: boolean;
    isProductsRefreshing: boolean;
    triggerProductsFetch: () => Promise<void>;
    forceProductsRefresh: () => Promise<void>;
}

const ProductsSyncContext = createContext<
    ProductsContextType | undefined
>(undefined);

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_PRODUCTS_LAST_SYNC_KEY = 'products_last_sync_time';
const isWeb = Platform.OS === 'web';

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

/* ---------------------------------------------------------
 * Logging
 * ------------------------------------------------------- */

const log = (...args: any[]) => {
    if (__DEV__) console.log('[ProductsSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[ProductsSync]', ...args);
};

/* ---------------------------------------------------------
 * Helpers
 * ------------------------------------------------------- */

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

function resolveImageUrl(rawPath: any): string | null {
    if (!rawPath) return null;

    const path =
        typeof rawPath === 'string'
            ? rawPath
            : rawPath?.thumbnail ||
            rawPath?.image ||
            rawPath?.url ||
            null;

    if (!path || typeof path !== 'string') return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://')
    ) {
        return trimmed;
    }

    const cleanPath = trimmed.startsWith('/')
        ? trimmed.substring(1)
        : trimmed;

    return `${IMAGE_BASE_URL}/${cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
}

/* ---------------------------------------------------------
 * normalizeProductImage — wire image → ProductImage
 * ------------------------------------------------------- */

function normalizeProductImage(raw: any): ProductImage {
    // Resolve both `image` and `thumbnail`; if only one is
    // present on the wire, the other falls back to it.
    const rawImage =
        typeof raw === 'string'
            ? raw
            : raw?.image || raw?.url || null;

    const rawThumb =
        typeof raw === 'string'
            ? raw
            : raw?.thumbnail || raw?.image || null;

    return {
        id: String(raw?.id ?? ''),
        image: resolveImageUrl(rawImage) ?? '',
        thumbnail: resolveImageUrl(rawThumb) ?? '',
        owner: String(raw?.owner ?? ''),
        product: String(raw?.product ?? ''),
        entity: String(raw?.entity ?? ''),
        created: String(raw?.created ?? ''),
        updated: String(raw?.updated ?? ''),
    };
}

/* ---------------------------------------------------------
 * normalizeCategoryDetails — wire category → ProductCategoryDetails
 * ------------------------------------------------------- */

function normalizeCategoryDetails(
    raw: any
): ProductCategoryDetails {
    if (!raw || typeof raw !== 'object') {
        return {
            id: '',
            icon: null,
            icon_category: null,
            category_class: '',
            title: '',
            description: '',
            created: '',
            updated: '',
            subcategories: [],
        };
    }

    return {
        id: String(raw.id ?? ''),
        icon: raw.icon ?? null,
        icon_category: raw.icon_category ?? null,
        category_class: String(raw.category_class ?? ''),
        title: String(raw.title ?? ''),
        description: String(raw.description ?? ''),
        created: String(raw.created ?? ''),
        updated: String(raw.updated ?? ''),
        subcategories: Array.isArray(raw.subcategories)
            ? raw.subcategories
            : [],
    };
}

/* ---------------------------------------------------------
 * normalizeProduct — wire product → ProductItem
 *
 * RULE: the server's `id` (or `key`) goes into `remote_id`.
 * The local Dexie `id` (a `++id` integer) is NEVER set here —
 * Dexie assigns it on insert.
 * ------------------------------------------------------- */

function normalizeProduct(i: any): ProductItem {
    const remoteId = String(firstDefined(i.id, i.key, ''));
    const remoteKey = i.key ? String(i.key) : undefined;

    const rawImages: any[] = Array.isArray(i.images)
        ? i.images
        : [];

    const images: ProductImage[] = rawImages.map(
        normalizeProductImage
    );

    const categoryDetails = normalizeCategoryDetails(
        i.category_details
    );

    return {
        // ---- Local persistence ----
        // `id` intentionally left undefined so Dexie assigns `++id`.
        cached_at: new Date().toISOString(),

        // ---- Server identity ----
        remote_id: remoteId,
        remote_key: remoteKey,
        url: i.url ? String(i.url) : undefined,

        // ---- Server content ----
        title: String(i.title ?? ''),
        long_title: String(i.long_title ?? ''),
        product_name: String(i.product_name ?? ''),

        preparation: i.preparation ?? null,
        preparation_details: i.preparation_details ?? null,

        manufacturer: String(i.manufacturer ?? ''),
        packaging: String(i.packaging ?? ''),
        bar_code: String(i.bar_code ?? ''),

        category: String(i.category ?? ''),
        sub_category: i.sub_category ?? null,

        is_vatable: String(i.is_vatable ?? 'false'),
        is_pom: !!i.is_pom,

        images,

        description: String(i.description ?? ''),
        owner: String(i.owner ?? ''),

        units_per_pack: Number(i.units_per_pack) || 1,
        manufacturer_title: String(i.manufacturer_title ?? ''),
        country_of_origin: String(i.country_of_origin ?? ''),

        preparation_title: String(i.preparation_title ?? ''),
        long_preparation_title: String(
            i.long_preparation_title ?? ''
        ),
        formulation_title: String(i.formulation_title ?? ''),

        category_details: categoryDetails,
        category_title: String(i.category_title ?? ''),
        sub_category_details: i.sub_category_details ?? null,

        origin_country: String(i.origin_country ?? ''),
        active: !!i.active,

        allowed_entities: Array.isArray(i.allowed_entities)
            ? i.allowed_entities.map(String)
            : [],

        created: String(i.created ?? ''),
        updated: String(i.updated ?? ''),
    };
}

/* ---------------------------------------------------------
 * Unwrap response shapes
 * ------------------------------------------------------- */

function resolveProductArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.products)) return raw.products;

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results))
                return raw.data.results;
            if (Array.isArray(raw.data.data))
                return raw.data.data;
            if (Array.isArray(raw.data.products))
                return raw.data.products;
        }
    }

    return [];
}

/* ---------------------------------------------------------
 * Debug — dump raw response
 * ------------------------------------------------------- */

function logRawResponse(res: any, label: string) {
    if (!__DEV__) return;

    log(`=== ${label} ===`);
    log('  ok:', res?.ok);
    log('  status:', res?.status);
    log('  problem:', res?.problem ?? '(none)');

    const payload = res?.data;

    if (payload === undefined || payload === null) {
        warn('  data: (empty)');
        return;
    }

    if (Array.isArray(payload)) {
        log(`  data: array (${payload.length} items)`);
        if (payload.length > 0) {
            const first = payload[0];
            log('  data[0] sample:', {
                id: first?.id,
                key: first?.key,
                title: first?.title,
            });
        }
        return;
    }

    log('  data: object with keys:', Object.keys(payload));
    if (Array.isArray(payload.results))
        log(`  results: array (${payload.results.length})`);
    if (Array.isArray(payload.data))
        log(`  data.data: array (${payload.data.length})`);
    if (Array.isArray(payload.products))
        log(`  products: array (${payload.products.length})`);

    if (payload.data && typeof payload.data === 'object') {
        if (Array.isArray(payload.data.results))
            log(
                `  data.data.results: array (${payload.data.results.length})`
            );
        if (Array.isArray(payload.data.products))
            log(
                `  data.data.products: array (${payload.data.products.length})`
            );
    }
}

/* ---------------------------------------------------------
 * Provider
 * ------------------------------------------------------- */

export const ProductsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [productsList, setProductsList] = useState<
        ProductItem[]
    >([]);
    const [isProductsRefreshing, setIsProductsRefreshing] =
        useState(false);

    const getProductsApi = useApi(productsApi.productsAction);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isOnlineRef = useRef(isOnline);
    const inFlightRef = useRef(false);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    /* ---------------------------------------------------------
     * Persist — never overwrite the local Dexie `id`
     * ------------------------------------------------------- */
    const persistProducts = useCallback(
        async (normalized: ProductItem[]) => {
            try {
                if (isWeb && dbInstance?.products) {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.products,
                        async () => {
                            // Wipe then bulkPut. Rows arrive with
                            // `id: undefined` so Dexie assigns
                            // fresh `++id`s.
                            await dbInstance.products.clear();
                            await dbInstance.products.bulkPut(
                                normalized
                            );
                        }
                    );
                } else if (db?.saveProducts) {
                    await db.saveProducts(normalized);
                }

                setProductsList((prev) => {
                    if (prev.length === normalized.length) {
                        const same = prev.every((p, idx) => {
                            const n = normalized[idx];
                            return (
                                p.remote_id === n.remote_id &&
                                p.updated === n.updated
                            );
                        });
                        if (same) return prev;
                    }
                    return normalized;
                });

                const nowStr = String(Date.now());
                if (isWeb) {
                    localStorage.setItem(
                        EXPO_PRODUCTS_LAST_SYNC_KEY,
                        nowStr
                    );
                } else {
                    await SecureStore.setItemAsync(
                        EXPO_PRODUCTS_LAST_SYNC_KEY,
                        nowStr
                    );
                }

                log(`Persisted ${normalized.length} products`);
            } catch (e) {
                warn('Persist failed:', e);
            }
        },
        []
    );

    /* ---------------------------------------------------------
     * Remote fetch
     * ------------------------------------------------------- */
    const runRemoteProductsSynchronizer = useCallback(
        async () => {
            log('Fetch starting…');

            if (!token) {
                warn('No token yet — skipping');
                return;
            }
            if (!isOnlineRef.current) {
                warn('Offline — skipping');
                return;
            }
            if (inFlightRef.current) {
                warn('Fetch already in flight — skipping');
                return;
            }

            inFlightRef.current = true;
            const startedAt = Date.now();

            try {
                const res = await getProductsApi.request({
                    action: 'GetAllProducts',
                });

                logRawResponse(res, 'Raw response');

                if (!res?.ok) {
                    warn(
                        'Fetch failed:',
                        res?.problem ||
                        res?.status ||
                        'unknown error'
                    );
                    return;
                }

                const list = resolveProductArray(res?.data);
                log(`Resolved ${list.length} raw items`);

                if (list.length === 0) {
                    warn(
                        'Fetch returned 0 products — skipping persist'
                    );
                    return;
                }

                const normalized: ProductItem[] = list.map(
                    normalizeProduct
                );

                const missingRemote = normalized.filter(
                    (p) => !p.remote_id
                ).length;
                if (missingRemote > 0) {
                    warn(
                        `${missingRemote}/${normalized.length} normalized products have no remote_id`
                    );
                }

                log(`Normalized ${normalized.length} products`);
                log(
                    'Sample normalized:',
                    normalized[0]
                        ? {
                            remote_id: normalized[0].remote_id,
                            title: normalized[0].title,
                            bar_code: normalized[0].bar_code,
                            images: normalized[0].images.length,
                            category_title:
                                normalized[0].category_title,
                        }
                        : null
                );

                await persistProducts(normalized);

                log(
                    `Fetch complete in ${Date.now() - startedAt
                    }ms`
                );
            } catch (e) {
                warn('Request threw:', e);
            } finally {
                inFlightRef.current = false;
            }
        },
        [token, getProductsApi, persistProducts]
    );

    /* ---------------------------------------------------------
     * Force refresh
     * ------------------------------------------------------- */
    const forceProductsRefresh = useCallback(async () => {
        setIsProductsRefreshing(true);
        try {
            if (isWeb && dbInstance?.products) {
                await dbInstance.products.clear();
            } else if (db?.saveProducts) {
                await db.saveProducts([]);
            }
            setProductsList([]);
            log('Cache cleared — refetching');
            await runRemoteProductsSynchronizer();
        } catch (e) {
            warn('Force refresh failed:', e);
        } finally {
            setIsProductsRefreshing(false);
        }
    }, [runRemoteProductsSynchronizer]);

    /* ---------------------------------------------------------
     * Stable refs
     * ------------------------------------------------------- */
    const actionsRef = useRef({
        runRemoteProductsSynchronizer,
    });

    useEffect(() => {
        actionsRef.current = {
            runRemoteProductsSynchronizer,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap — fetch on mount, then hourly
     * ------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;

        const initSync = async () => {
            log('Bootstrap starting…');

            /* 1. Load cache */
            try {
                let cached: ProductItem[] = [];

                if (isWeb && dbInstance?.products) {
                    cached = await dbInstance.products.toArray();
                } else if (db?.getProducts) {
                    cached = await db.getProducts();
                }

                if (!cancelled && cached?.length) {
                    setProductsList(cached);
                    log(
                        `Loaded ${cached.length} cached products`
                    );
                } else {
                    log('No cached products found');
                }
            } catch (e) {
                warn('Load cache failed:', e);
            }

            if (cancelled) return;

            /* 2. Fetch immediately on mount */
            await actionsRef.current.runRemoteProductsSynchronizer();

            if (cancelled) return;

            /* 3. Hourly refresh */
            if (intervalRef.current)
                clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                log('Hourly refresh tick');
                actionsRef.current.runRemoteProductsSynchronizer();
            }, ONE_HOUR_MS);

            log('Bootstrap complete — hourly refresh armed');
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
            log('Back online — refetching');
            actionsRef.current.runRemoteProductsSynchronizer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Memoized value
     * ------------------------------------------------------- */
    const value = useMemo<ProductsContextType>(
        () => ({
            productsList,
            isProductsSyncing: getProductsApi.loading,
            isProductsRefreshing,
            triggerProductsFetch: runRemoteProductsSynchronizer,
            forceProductsRefresh,
        }),
        [
            productsList,
            getProductsApi.loading,
            isProductsRefreshing,
            runRemoteProductsSynchronizer,
            forceProductsRefresh,
        ]
    );

    return (
        <ProductsSyncContext.Provider value={value}>
            {children}
        </ProductsSyncContext.Provider>
    );
};

export const useProductsSync = () => {
    const context = useContext(ProductsSyncContext);

    if (!context) {
        throw new Error(
            'useProductsSync must be used within a ProductsSyncProvider'
        );
    }

    return context;
};