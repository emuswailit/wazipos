// context/ProductsSyncContext.tsx

import productsApi from '@/api/drugs/productsApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db, dbInstance } from '@/databases/db';
import { ProductItem } from '@/databases/types';
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

const ProductsSyncContext =
    createContext<ProductsContextType | undefined>(
        undefined
    );

const ONE_HOUR_MS = 60 * 60 * 1000;
const EXPO_PRODUCTS_LAST_SYNC_KEY =
    'products_last_sync_time';
const isWeb = Platform.OS === 'web';

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

/* ---------------------------------------------------------
 * Image URL resolver
 * ------------------------------------------------------- */

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
 * Normalizer
 * ------------------------------------------------------- */

function normalizeProduct(i: any): ProductItem {
    let thumbnail: string | null = null;

    if (Array.isArray(i.images) && i.images.length > 0) {
        thumbnail = resolveImageUrl(i.images[0]);
    } else if (i.images) {
        thumbnail = resolveImageUrl(i.images);
    } else if (i.image) {
        thumbnail = resolveImageUrl(i.image);
    } else if (i.thumbnail) {
        thumbnail = resolveImageUrl(i.thumbnail);
    }

    return {
        id: String(i.id),
        title: String(i.title || ''),
        long_title: String(i.long_title || ''),
        product_name: String(i.product_name || ''),
        preparation: String(i.preparation || ''),
        preparation_title: String(
            i.preparation_title || ''
        ),
        long_preparation_title: String(
            i.long_preparation_title || ''
        ),
        formulation_title: String(
            i.formulation_title || ''
        ),
        manufacturer_title: String(
            i.manufacturer_title || ''
        ),
        country_of_origin: String(
            i.country_of_origin || ''
        ),
        category_title: String(i.category_title || ''),
        units_per_pack: Number(i.units_per_pack) || 1,
        pack_tag: String(i.pack_tag || ''),
        bar_code: String(i.bar_code || ''),
        manufacturer: String(i.manufacturer || ''),
        category: String(i.category || ''),
        images: Array.isArray(i.images) ? i.images : [],
        active: !!i.active,
        created: String(i.created || ''),
        updated: String(i.updated || ''),
        cached_at: new Date().toISOString(),
        thumbnail_url: thumbnail,
    } as ProductItem & { thumbnail_url?: string | null };
}

/* ---------------------------------------------------------
 * Unwrap response shapes
 * ------------------------------------------------------- */

function resolveProductArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results))
            return raw.results;
        if (Array.isArray(raw.data))
            return raw.data;
        if (Array.isArray(raw.products))
            return raw.products;

        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results))
                return raw.data.results;
            if (Array.isArray(raw.data.data))
                return raw.data.data;
        }
    }

    return [];
}

/* ---------------------------------------------------------
 * Provider
 * ------------------------------------------------------- */

export const ProductsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    /* Diagnostic render log — remove once loop is confirmed fixed */
    console.log('🔥 ProductsSyncProvider RENDER');

    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [productsList, setProductsList] = useState<
        ProductItem[]
    >([]);
    const [isProductsRefreshing, setIsProductsRefreshing] =
        useState(false);

    const getProductsApi = useApi(
        productsApi.productsAction
    );

    /* Guards */
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

    const runRemoteProductsSynchronizer = useCallback(
        async () => {
            if (!token) {
                console.log(
                    '[ProductsSync] No token yet — skipping'
                );
                return;
            }
            if (!isOnlineRef.current) {
                console.log(
                    '[ProductsSync] Offline — skipping'
                );
                return;
            }

            try {
                const res = await getProductsApi.request({
                    action: 'GetAllProducts',
                });

                if (!res?.ok) {
                    console.warn(
                        '[ProductsSync] Fetch failed:',
                        res?.problem ||
                        res?.status ||
                        'unknown error'
                    );
                }
            } catch (e) {
                console.warn(
                    'Remote product sync request failed:',
                    e
                );
            }
        },
        [token, getProductsApi]
    );

    /* ---------------------------------------------------------
     * Normalize + persist — guarded by identity check
     * ------------------------------------------------------- */

    useEffect(() => {
        const rawData = getProductsApi.data;

        const list = resolveProductArray(rawData);

        if (
            list.length === 0 ||
            list === lastProcessedDataRef.current
        ) {
            return;
        }

        lastProcessedDataRef.current = list;

        const normalized: ProductItem[] =
            list.map(normalizeProduct);

        console.log(
            '[ProductsSync] Normalized',
            normalized.length,
            'products'
        );

        let cancelled = false;

        (async () => {
            try {
                if (isWeb && dbInstance?.products) {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.products,
                        async () => {
                            await dbInstance.products.clear();
                            await dbInstance.products.bulkPut(
                                normalized
                            );
                        }
                    );
                } else if (db?.saveProducts) {
                    await db.saveProducts(normalized);
                }

                if (cancelled) return;

                /* Only update state if data actually changed */
                setProductsList((prev) => {
                    if (prev.length === normalized.length) {
                        return prev;
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
            } catch (e) {
                console.error(
                    'Critical database storage commit failure:',
                    e
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [getProductsApi.data]);

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
            lastProcessedDataRef.current = null;

            await runRemoteProductsSynchronizer();
        } catch (e) {
            console.error(
                'Force refresh transaction error:',
                e
            );
        } finally {
            setIsProductsRefreshing(false);
        }
    }, [runRemoteProductsSynchronizer]);

    /* ---------------------------------------------------------
     * Stable-ref pattern
     *
     * The effects below read the latest callback from a ref.
     * This lets them depend only on primitives (token,
     * isOnline) instead of unstable function identities.
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
     * Bootstrap — depends only on `token`
     * ------------------------------------------------------- */

    useEffect(() => {
        let cancelled = false;

        const initSync = async () => {
            /* 1. Load cache */
            try {
                let cached: ProductItem[] = [];

                if (isWeb && dbInstance?.products) {
                    cached =
                        await dbInstance.products.toArray();
                } else if (db?.getProducts) {
                    cached = await db.getProducts();
                }

                if (!cancelled && cached?.length) {
                    setProductsList(cached);
                    console.log(
                        '[ProductsSync] Loaded',
                        cached.length,
                        'cached products'
                    );
                }
            } catch (e) {
                console.error(
                    'Failed to load local cached product registry:',
                    e
                );
            }

            if (cancelled) return;

            /* 2. One-shot remote fetch */
            await actionsRef.current.runRemoteProductsSynchronizer();

            if (cancelled) return;

            /* 3. Hourly refresh */
            if (intervalRef.current)
                clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                actionsRef.current.runRemoteProductsSynchronizer();
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
     * Online / offline transition — depends only on primitives
     * ------------------------------------------------------- */

    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            console.log(
                '[ProductsSync] Back online — refetching'
            );
            actionsRef.current.runRemoteProductsSynchronizer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Memoized context value
     * ------------------------------------------------------- */

    const value = useMemo<ProductsContextType>(
        () => ({
            productsList,
            isProductsSyncing: getProductsApi.loading,
            isProductsRefreshing,
            triggerProductsFetch:
                runRemoteProductsSynchronizer,
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