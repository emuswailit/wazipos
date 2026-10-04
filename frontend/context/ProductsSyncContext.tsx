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
 *
 * `log` / `warn` are gated by __DEV__ (they're noisy).
 * `always` is NOT gated — it's used to trace the fetch
 * lifecycle during debugging. Remove or re-gate when you're
 * done with this investigation.
 * ------------------------------------------------------- */

const log = (...args: any[]) => {
    if (__DEV__) console.log('[ProductsSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[ProductsSync]', ...args);
};
const always = (...args: any[]) => {
    // Intentionally not gated by __DEV__ — used during the
    // catalog-empty investigation.
    console.log('[ProductsSync][TRACE]', ...args);
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

function normalizeProductImage(raw: any): ProductImage {
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
        cached_at: new Date().toISOString(),

        remote_id: remoteId,
        remote_key: remoteKey,
        url: i.url ? String(i.url) : undefined,

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

function mergeProduct(
    local: ProductItem,
    incoming: ProductItem
): ProductItem {
    const next: any = { ...local };
    let changed = false;

    for (const k of Object.keys(incoming) as (keyof ProductItem)[]) {
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
    return next as ProductItem;
}

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

function summarize(payload: any): string {
    if (payload === undefined) return 'undefined';
    if (payload === null) return 'null';
    if (Array.isArray(payload)) {
        return `array(${payload.length})`;
    }
    if (typeof payload === 'object') {
        const keys = Object.keys(payload);
        if (keys.length > 20) {
            return `object(${keys.length}) {${keys
                .slice(0, 5)
                .join(', ')}…}`;
        }
        return `object(${keys.length}) {${keys.join(', ')}}`;
    }
    return typeof payload;
}

/**
 * Dumps a summary of the raw response. Uses `always` (not
 * `__DEV__`-gated) so you can verify the fetch on any build.
 */
function logRawResponse(res: any, label: string) {
    always(`=== ${label} ===`);
    always('  ok:', res?.ok);
    always('  status:', res?.status);
    always('  problem:', res?.problem ?? '(none)');

    const payload = res?.data;

    if (payload === undefined || payload === null) {
        always('  data: (empty)');
        return;
    }

    if (Array.isArray(payload)) {
        always(`  data: array (${payload.length} items)`);
        if (payload.length > 0) {
            const first = payload[0];
            always('  data[0] sample:', {
                id: first?.id,
                key: first?.key,
                title: first?.title,
                bar_code: first?.bar_code,
            });
        }
        return;
    }

    always('  data:', summarize(payload));
    if (Array.isArray(payload.results))
        always(`  results: array (${payload.results.length})`);
    if (Array.isArray(payload.data))
        always(`  data.data: array (${payload.data.length})`);
    if (Array.isArray(payload.products))
        always(`  products: array (${payload.products.length})`);

    if (payload.data && typeof payload.data === 'object') {
        if (Array.isArray(payload.data.results))
            always(
                `  data.data.results: array (${payload.data.results.length})`
            );
        if (Array.isArray(payload.data.products))
            always(
                `  data.data.products: array (${payload.data.products.length})`
            );
    }

    // If it's an error envelope, print it in full so nothing
    // important is hidden behind the summary.
    if (res?.ok === false) {
        try {
            always(
                '  full error body:',
                JSON.stringify(payload, null, 2).slice(0, 2000)
            );
        } catch {
            always('  (could not stringify error body)');
        }
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
    const bootstrapCountRef = useRef(0);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const persistProducts = useCallback(
        async (incoming: ProductItem[]) => {
            try {
                let existing: ProductItem[] = [];
                if (isWeb && dbInstance?.products) {
                    existing = await dbInstance.products.toArray();
                } else if (db?.getProducts) {
                    existing = await db.getProducts();
                }

                const byRemoteId = new Map<string, ProductItem>();
                const orphans: ProductItem[] = [];

                for (const row of existing) {
                    const key = row.remote_id;
                    if (!key) {
                        orphans.push(row);
                        continue;
                    }

                    const kept = byRemoteId.get(key);
                    if (!kept) {
                        byRemoteId.set(key, row);
                    } else if (
                        kept.id === undefined &&
                        row.id !== undefined
                    ) {
                        byRemoteId.set(key, row);
                    }
                }

                let matched = 0;
                let updated = 0;
                let inserted = 0;

                for (const inc of incoming) {
                    if (!inc.remote_id) continue;
                    const local = byRemoteId.get(inc.remote_id);

                    if (local) {
                        matched += 1;
                        const merged = mergeProduct(local, inc);
                        if (merged !== local) updated += 1;
                        byRemoteId.set(inc.remote_id, merged);
                    } else {
                        byRemoteId.set(inc.remote_id, inc);
                        inserted += 1;
                    }
                }

                const mergedList: ProductItem[] = [
                    ...byRemoteId.values(),
                    ...orphans,
                ];

                if (isWeb && dbInstance?.products) {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.products,
                        async () => {
                            await dbInstance.products.clear();
                            if (mergedList.length > 0) {
                                await dbInstance.products.bulkPut(
                                    mergedList
                                );
                            }
                        }
                    );
                } else if (db?.saveProducts) {
                    await db.saveProducts(mergedList);
                }

                setProductsList((prev) => {
                    if (prev.length === mergedList.length) {
                        const same = prev.every(
                            (p, idx) => p === mergedList[idx]
                        );
                        if (same) return prev;
                    }
                    return mergedList;
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

                always(
                    `Persisted — total ${mergedList.length}, ` +
                    `matched ${matched}, updated ${updated}, ` +
                    `inserted ${inserted}, ` +
                    `local-only ${orphans.length}, ` +
                    `incoming ${incoming.length}`
                );
            } catch (e) {
                always('Persist failed:', e);
            }
        },
        []
    );

    const runRemoteProductsSynchronizer = useCallback(
        async () => {
            always('Fetch starting…');

            if (!token) {
                always('No token yet — skipping');
                return;
            }
            if (!isOnlineRef.current) {
                always('Offline — skipping');
                return;
            }
            if (inFlightRef.current) {
                always('Fetch already in flight — skipping');
                return;
            }

            inFlightRef.current = true;
            const startedAt = Date.now();

            try {
                always('→ POST GetAllProducts');

                const res = await getProductsApi.request({
                    action: 'GetAllProducts',
                });

                logRawResponse(res, 'Raw response');

                if (!res?.ok) {
                    always(
                        'Fetch failed:',
                        res?.problem ||
                        res?.status ||
                        'unknown error'
                    );
                    return;
                }

                const list = resolveProductArray(res?.data);
                always(`Resolved ${list.length} raw items`);

                if (list.length === 0) {
                    always(
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
                    always(
                        `${missingRemote}/${normalized.length} normalized products have no remote_id`
                    );
                }

                always(`Normalized ${normalized.length} products`);
                always(
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

                always(
                    `Fetch complete in ${Date.now() - startedAt}ms`
                );
            } catch (e) {
                always('Request threw:', e);
            } finally {
                inFlightRef.current = false;
            }
        },
        [token, getProductsApi, persistProducts]
    );

    const forceProductsRefresh = useCallback(async () => {
        always('Manual refresh triggered');
        setIsProductsRefreshing(true);
        try {
            await runRemoteProductsSynchronizer();
        } catch (e) {
            always('Force refresh failed:', e);
        } finally {
            setIsProductsRefreshing(false);
        }
    }, [runRemoteProductsSynchronizer]);

    const actionsRef = useRef({
        runRemoteProductsSynchronizer,
    });

    useEffect(() => {
        actionsRef.current = {
            runRemoteProductsSynchronizer,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap — load cache, then fetch, then hourly.
     *
     * Fires on mount AND whenever `token` changes. Logs a
     * bootstrap counter so you can see it re-firing on reload.
     * ------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;
        bootstrapCountRef.current += 1;
        const bootstrapId = bootstrapCountRef.current;

        const initSync = async () => {
            always(
                `Bootstrap #${bootstrapId} starting… (token=${token ? 'present' : 'missing'
                }, online=${isOnlineRef.current})`
            );

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
                    always(
                        `Bootstrap #${bootstrapId}: loaded ${cached.length} cached products`
                    );
                } else {
                    always(
                        `Bootstrap #${bootstrapId}: no cached products`
                    );
                }
            } catch (e) {
                always(
                    `Bootstrap #${bootstrapId}: load cache failed`,
                    e
                );
            }

            if (cancelled) return;

            /* 2. Fetch immediately */
            always(
                `Bootstrap #${bootstrapId}: firing remote fetch`
            );
            await actionsRef.current.runRemoteProductsSynchronizer();

            if (cancelled) return;

            /* 3. Hourly refresh */
            if (intervalRef.current)
                clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                always('Hourly refresh tick');
                actionsRef.current.runRemoteProductsSynchronizer();
            }, ONE_HOUR_MS);

            always(
                `Bootstrap #${bootstrapId} complete — hourly refresh armed`
            );
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
            always('Back online — refetching');
            actionsRef.current.runRemoteProductsSynchronizer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

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