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
    /** True while the live products socket is open. */
    isLiveConnected: boolean;
    /** Local time of the last successful sync, e.g. "14:05" (empty if never). */
    lastSyncedTime: string;
    triggerProductsFetch: () => Promise<void>;
    forceProductsRefresh: () => Promise<void>;
}

const ProductsSyncContext = createContext<
    ProductsContextType | undefined
>(undefined);

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
 * Live sync
 *
 * The server pushes a COMPLETE snapshot of this user's products over
 * ws/products/all/: on connect, every 30 minutes, and on {"action":"refresh"}.
 * A snapshot is authoritative — the local catalogue becomes exactly that list
 * (anything not in it is deleted). HTTP GetAllProducts is the fallback while
 * the socket is down; a complete HTTP response is applied the same way, a
 * partial one (more pages) is only merged so nothing gets wrongly deleted.
 * ------------------------------------------------------- */

const WS_PRODUCTS_URL = 'wss://api.wazipos.co.ke/ws/products/all/';
const FALLBACK_INTERVAL_MS = 30 * 60 * 1000;
const RECONNECT_MIN_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;
const REFRESH_TIMEOUT_MS = 20_000;
/** Close codes from the backend TokenAuthMiddleware: no / invalid / expired token. */
const AUTH_CLOSE_CODES = new Set([4001, 4002, 4003]);

type SyncSource = 'socket' | 'http';

async function readLocalProducts(): Promise<ProductItem[]> {
    if (isWeb && dbInstance?.products) return dbInstance.products.toArray();
    if (db?.getProducts) return db.getProducts();
    return [];
}

async function writeLocalProducts(list: ProductItem[]): Promise<void> {
    if (isWeb && dbInstance?.products) {
        await dbInstance.transaction('rw', dbInstance.products, async () => {
            await dbInstance.products.clear();
            if (list.length > 0) await dbInstance.products.bulkPut(list);
        });
    } else if (db?.saveProducts) {
        await db.saveProducts(list);
    }
}

async function writeLastSync(ms: number): Promise<void> {
    try {
        if (isWeb) localStorage.setItem(EXPO_PRODUCTS_LAST_SYNC_KEY, String(ms));
        else await SecureStore.setItemAsync(EXPO_PRODUCTS_LAST_SYNC_KEY, String(ms));
    } catch {
        /* non-fatal */
    }
}

async function readLastSync(): Promise<number | null> {
    try {
        const raw = isWeb ? localStorage.getItem(EXPO_PRODUCTS_LAST_SYNC_KEY) : await SecureStore.getItemAsync(EXPO_PRODUCTS_LAST_SYNC_KEY);
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

function formatSyncTime(ms: number | null): string {
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ---------------------------------------------------------
 * Provider
 * ------------------------------------------------------- */

export const ProductsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [productsList, setProductsList] = useState<ProductItem[]>([]);
    const [isProductsRefreshing, setIsProductsRefreshing] = useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

    const getProductsApi = useApi(productsApi.productsAction);

    const tokenRef = useRef(token);
    const isOnlineRef = useRef(isOnline);
    const inFlightRef = useRef(false);
    const writeChainRef = useRef<Promise<void>>(Promise.resolve());

    const wsRef = useRef<WebSocket | null>(null);
    const wsGenerationRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectDelayRef = useRef(RECONNECT_MIN_MS);
    const authBlockedRef = useRef(false);
    const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        tokenRef.current = token;
    }, [token]);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    /** Run local-DB writes one at a time, in arrival order. */
    const enqueueWrite = useCallback((job: () => Promise<void>) => {
        const next = writeChainRef.current.then(job, job);
        writeChainRef.current = next.catch(() => undefined);
        return next;
    }, []);

    const markSynced = useCallback(async () => {
        const now = Date.now();
        setLastSyncedAt(now);
        await writeLastSync(now);
    }, []);

    /* ---------------- Authoritative replace ---------------- */
    const replaceProducts = useCallback(
        (incoming: ProductItem[], source: SyncSource) =>
            enqueueWrite(async () => {
                const existing = await readLocalProducts();
                const localByRemote = new Map<string, ProductItem>();
                for (const row of existing) if (row.remote_id && !localByRemote.has(row.remote_id)) localByRemote.set(row.remote_id, row);

                const seen = new Set<string>();
                const next: ProductItem[] = [];
                let kept = 0;
                let added = 0;
                for (const inc of incoming) {
                    if (!inc.remote_id || seen.has(inc.remote_id)) continue;
                    seen.add(inc.remote_id);
                    const local = localByRemote.get(inc.remote_id);
                    if (local) {
                        kept += 1;
                        // Keep the local row key so Dexie rows stay stable across syncs.
                        next.push(local.id !== undefined ? { ...mergeProduct(local, inc), id: local.id } : mergeProduct(local, inc));
                    } else {
                        added += 1;
                        next.push(inc);
                    }
                }
                const removed = existing.length - kept;

                await writeLocalProducts(next);
                setProductsList(next);
                await markSynced();
                always(`Replaced from ${source} — ${next.length} products (kept ${kept}, added ${added}, removed ${removed})`);
            }),
        [enqueueWrite, markSynced]
    );

    /* ---------------- Merge (partial HTTP pages only) ---------------- */
    const mergeProducts = useCallback(
        (incoming: ProductItem[]) =>
            enqueueWrite(async () => {
                const existing = await readLocalProducts();
                const byRemote = new Map<string, ProductItem>();
                for (const row of existing) if (row.remote_id) byRemote.set(row.remote_id, row);
                for (const inc of incoming) {
                    if (!inc.remote_id) continue;
                    const local = byRemote.get(inc.remote_id);
                    byRemote.set(inc.remote_id, local ? mergeProduct(local, inc) : inc);
                }
                const next = [...byRemote.values()];
                await writeLocalProducts(next);
                setProductsList(next);
                await markSynced();
                always(`Merged partial HTTP page — ${incoming.length} incoming, ${next.length} total`);
            }),
        [enqueueWrite, markSynced]
    );

    /* ---------------- HTTP fallback ---------------- */
    const runRemoteProductsSynchronizer = useCallback(async () => {
        if (!tokenRef.current || !isOnlineRef.current || inFlightRef.current) return;
        inFlightRef.current = true;
        try {
            const res = await getProductsApi.request({ action: 'GetAllProducts' });
            logRawResponse(res, 'HTTP response');
            if (!res?.ok) {
                always('HTTP fetch failed:', res?.problem, res?.status);
                return;
            }
            const body: any = res.data;
            const normalized = resolveProductArray(body).map(normalizeProduct);
            // Paginated responses say whether more pages exist; only a complete list may delete.
            const complete = Array.isArray(body) || (body && typeof body === 'object' && !body.next);
            if (complete) await replaceProducts(normalized, 'http');
            else await mergeProducts(normalized);
        } catch (e) {
            always('HTTP fetch threw:', e);
        } finally {
            inFlightRef.current = false;
        }
    }, [getProductsApi, replaceProducts, mergeProducts]);

    /* ---------------- WebSocket ---------------- */
    const clearRefreshWait = useCallback(() => {
        if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = null;
        }
        setIsProductsRefreshing(false);
    }, []);

    const closeSocket = useCallback(() => {
        wsGenerationRef.current += 1; // invalidates handlers of the old socket
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws) {
            ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
            try {
                ws.close();
            } catch {
                /* already closed */
            }
        }
        setIsLiveConnected(false);
    }, []);

    const connectSocket = useCallback(() => {
        closeSocket();
        const currentToken = tokenRef.current;
        if (!currentToken || !isOnlineRef.current || authBlockedRef.current) return;

        const generation = ++wsGenerationRef.current;
        let ws: WebSocket;
        try {
            ws = new WebSocket(`${WS_PRODUCTS_URL}?token=${encodeURIComponent(currentToken)}`);
        } catch (e) {
            warn('WebSocket constructor threw', e);
            return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
            if (generation !== wsGenerationRef.current) return;
            reconnectDelayRef.current = RECONNECT_MIN_MS;
            setIsLiveConnected(true);
            always('Live sync connected — waiting for snapshot');
        };

        ws.onmessage = async (event) => {
            if (generation !== wsGenerationRef.current) return;
            let msg: any;
            try {
                msg = JSON.parse(String(event.data));
            } catch {
                warn('Ignoring non-JSON socket message');
                return;
            }
            if (msg?.type === 'products.snapshot' || (Array.isArray(msg?.products) && msg?.type === undefined)) {
                const products = Array.isArray(msg.products) ? msg.products : [];
                always(`Snapshot (${msg.reason ?? 'push'}) — ${products.length} products`);
                try {
                    await replaceProducts(products.map(normalizeProduct), 'socket');
                } finally {
                    clearRefreshWait();
                }
            } else if (msg?.type === 'products.error') {
                warn('Server could not build a snapshot:', msg.message);
                clearRefreshWait();
            }
        };

        ws.onclose = (event) => {
            if (generation !== wsGenerationRef.current) return;
            wsRef.current = null;
            setIsLiveConnected(false);
            if (AUTH_CLOSE_CODES.has(event?.code)) {
                // Don't hammer the server with a bad token; a new token reconnects.
                authBlockedRef.current = true;
                always(`Live sync rejected (code ${event.code}) — waiting for a new token`);
                return;
            }
            if (!tokenRef.current || !isOnlineRef.current) return;
            const delay = reconnectDelayRef.current;
            reconnectDelayRef.current = Math.min(RECONNECT_MAX_MS, delay * 2);
            reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
        };

        ws.onerror = () => {
            /* onclose follows and handles reconnecting */
        };
    }, [closeSocket, replaceProducts, clearRefreshWait]);

    const connectRef = useRef(connectSocket);
    useEffect(() => {
        connectRef.current = connectSocket;
    }, [connectSocket]);

    /* ---------------- Manual refresh ---------------- */
    const forceProductsRefresh = useCallback(async () => {
        setIsProductsRefreshing(true);
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'refresh' }));
            // If no snapshot arrives in time, fall back to HTTP.
            if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = setTimeout(async () => {
                refreshTimeoutRef.current = null;
                await runRemoteProductsSynchronizer();
                setIsProductsRefreshing(false);
            }, REFRESH_TIMEOUT_MS);
            return;
        }
        try {
            await runRemoteProductsSynchronizer();
        } finally {
            setIsProductsRefreshing(false);
        }
        if (!wsRef.current) connectRef.current();
    }, [runRemoteProductsSynchronizer]);

    /* ---------------- Bootstrap: cache first, then live ---------------- */
    useEffect(() => {
        let cancelled = false;
        authBlockedRef.current = false;
        reconnectDelayRef.current = RECONNECT_MIN_MS;

        (async () => {
            try {
                const [cached, last] = await Promise.all([readLocalProducts(), readLastSync()]);
                if (cancelled) return;
                if (cached?.length) setProductsList(cached);
                setLastSyncedAt(last);
                always(`Loaded ${cached?.length ?? 0} cached products`);
            } catch (e) {
                always('Loading cached products failed', e);
            }
            if (cancelled || !token) return;
            connectRef.current();
        })();

        // HTTP safety net: only fetch when the socket isn't delivering.
        if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = setInterval(() => {
            const open = wsRef.current?.readyState === WebSocket.OPEN;
            if (!open) {
                always('Socket down at sync interval — using HTTP');
                void runRemoteProductsSynchronizer();
                if (!wsRef.current) connectRef.current();
            }
        }, FALLBACK_INTERVAL_MS);

        return () => {
            cancelled = true;
            if (fallbackTimerRef.current) {
                clearInterval(fallbackTimerRef.current);
                fallbackTimerRef.current = null;
            }
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
                refreshTimeoutRef.current = null;
            }
            closeSocket();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /* ---------------- Offline / online ---------------- */
    useEffect(() => {
        if (!token) return;
        if (isOnline) {
            // Reconnecting delivers a fresh snapshot; HTTP covers servers without the socket.
            reconnectDelayRef.current = RECONNECT_MIN_MS;
            if (!wsRef.current) connectRef.current();
        } else {
            closeSocket();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    const value = useMemo<ProductsContextType>(
        () => ({
            productsList,
            isProductsSyncing: getProductsApi.loading,
            isProductsRefreshing,
            isLiveConnected,
            lastSyncedTime: formatSyncTime(lastSyncedAt),
            triggerProductsFetch: runRemoteProductsSynchronizer,
            forceProductsRefresh,
        }),
        [productsList, getProductsApi.loading, isProductsRefreshing, isLiveConnected, lastSyncedAt, runRemoteProductsSynchronizer, forceProductsRefresh]
    );

    return <ProductsSyncContext.Provider value={value}>{children}</ProductsSyncContext.Provider>;
};

export const useProductsSync = () => {
    const context = useContext(ProductsSyncContext);
    if (!context) {
        throw new Error('useProductsSync must be used within a ProductsSyncProvider');
    }
    return context;
};
