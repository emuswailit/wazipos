// databases/db.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import Dexie, { type Table } from 'dexie';
import { Platform } from 'react-native';

import {
    CustomerOrder,
    DBLineItemSchema,
    EntityItem,
    PaymentMethodItem,
    PendingOfferAction,
    PendingRequestCreate,
    ProductItem,
    ProductRequestSummary,
    RetailerForecastNormalized,
    RetailerIndent,
    RetailerOrder,
    RetailerOutOfStockNormalized,
    RetailerReceipt,
    WholesalerReceipt,
} from './types';

const isWeb = Platform.OS === 'web';

/* =========================================================
 * IndexedDB availability check
 * ======================================================= */

function hasIndexedDB(): boolean {
    if (typeof globalThis === 'undefined') return false;

    const g: any = globalThis as any;
    return (
        typeof g.indexedDB !== 'undefined' &&
        g.indexedDB !== null &&
        typeof g.IDBKeyRange !== 'undefined'
    );
}

const IDB_AVAILABLE = isWeb && hasIndexedDB();

/* =========================================================
 * Web database — Dexie
 * ======================================================= */

class WaziposLocalIndexedDB extends Dexie {
    customerOrders!: Table<CustomerOrder, number>;
    lineItems!: Table<DBLineItemSchema, number>;
    retailerReceipts!: Table<RetailerReceipt, number>;
    retailerIndents!: Table<RetailerIndent, number>;
    retailerOutOfStocks!: Table<RetailerOutOfStockNormalized, number>;
    paymentMethods!: Table<PaymentMethodItem, string>;
    products!: Table<ProductItem, number>;
    entities!: Table<EntityItem, number>;

    retailerForecasts!: Table<RetailerForecastNormalized, number>;
    retailerProductRequests!: Table<ProductRequestSummary, number>;

    wholesalerReceipts!: Table<WholesalerReceipt, number>;
    retailerOrders!: Table<RetailerOrder, number>;

    constructor() {
        super('WaziposInventoryDB');

        // v14: adds retailerIndents table.
        this.version(14).stores({
            customerOrders:
                '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts:
                '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents:
                '++id, remote_id, indent_number, entity, is_open, created, updated',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v15: adds retailerOutOfStocks table.
        this.version(15).stores({
            customerOrders:
                '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts:
                '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents:
                '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks:
                '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v16: adds retailerForecasts and retailerProductRequests tables.
        this.version(16).stores({
            customerOrders:
                '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts:
                '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents:
                '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks:
                '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts:
                '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests:
                '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v17: fix `++id` collision with the object's `id: string` field
        // on retailerProductRequests. Rename the auto-increment PK to
        // `_dexie_id`. Forecasts are unchanged.
        this.version(17)
            .stores({
                customerOrders:
                    '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
                lineItems: '++id, selectedProduct',
                retailerReceipts:
                    '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
                retailerIndents:
                    '++id, remote_id, indent_number, entity, is_open, created, updated',
                retailerOutOfStocks:
                    '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
                retailerForecasts:
                    '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
                retailerProductRequests:
                    '++_dexie_id, id, request_number, status, urgency, is_pending, draft_id, created, updated',
                paymentMethods: 'id, title',
                products:
                    '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
                entities:
                    '++id, remote_id, title, entity_type, phone, town, updated',
            })
            .upgrade(async (tx) => {
                await tx.table('retailerProductRequests').clear();
            });

        // v18: unify drafts + submitted requests in one table.
        // Domain id moves to `remote_id`; `++id` is the Dexie PK.
        this.version(18)
            .stores({
                customerOrders:
                    '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
                lineItems: '++id, selectedProduct',
                retailerReceipts:
                    '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
                retailerIndents:
                    '++id, remote_id, indent_number, entity, is_open, created, updated',
                retailerOutOfStocks:
                    '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
                retailerForecasts:
                    '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
                retailerProductRequests:
                    '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
                paymentMethods: 'id, title',
                products:
                    '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
                entities:
                    '++id, remote_id, title, entity_type, phone, town, updated',
            })
            .upgrade(async (tx) => {
                await tx.table('retailerProductRequests').clear();
            });

        // v19: adds wholesalerReceipts. `++id` is the Dexie PK;
        // `remote_id` is the server UUID, indexed for lookups.
        this.version(19).stores({
            customerOrders:
                '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts:
                '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents:
                '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks:
                '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts:
                '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests:
                '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts:
                '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v20: adds retailerOrders.
        // `++id` is the Dexie PK; `remote_id` is the server UUID;
        // `draft_id` is the offline-first idempotency key.
        this.version(20).stores({
            customerOrders:
                '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts:
                '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents:
                '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks:
                '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts:
                '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests:
                '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts:
                '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders:
                '++id, remote_id, draft_id, retailer, wholesaler, status, payment_method, order_origin, reference_number, synced, created, updated',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });
    }
}

/* =========================================================
 * No-op stub
 * ======================================================= */

function makeNoopTable() {
    const chain: any = {};

    chain.where = () => chain;
    chain.equals = () => chain;
    chain.first = async () => null;
    chain.toArray = async () => [];
    chain.count = async () => 0;

    chain.clear = async () => { };
    chain.bulkPut = async () => { };
    chain.bulkAdd = async () => { };
    chain.add = async () => 0;
    chain.put = async () => 0;
    chain.update = async () => 0;
    chain.delete = async () => { };

    return chain;
}

class NoopDB {
    customerOrders = makeNoopTable();
    lineItems = makeNoopTable();
    retailerReceipts = makeNoopTable();
    retailerIndents = makeNoopTable();
    retailerOutOfStocks = makeNoopTable();

    retailerForecasts = makeNoopTable();
    retailerProductRequests = makeNoopTable();

    wholesalerReceipts = makeNoopTable();
    retailerOrders = makeNoopTable();

    paymentMethods = makeNoopTable();
    products = makeNoopTable();
    entities = makeNoopTable();

    transaction = async (..._args: any[]) => {
        const fn = _args[_args.length - 1];
        if (typeof fn === 'function') {
            await fn();
        }
    };

    open = async () => { };
    close = () => { };
    delete = async () => { };
}

/* =========================================================
 * Exported singleton
 * ======================================================= */

export const dbInstance: any = IDB_AVAILABLE
    ? new WaziposLocalIndexedDB()
    : new NoopDB();

/* =========================================================
 * Dexie lifecycle
 * ======================================================= */

if (IDB_AVAILABLE && dbInstance instanceof WaziposLocalIndexedDB) {
    dbInstance.on('versionchange', () => {
        dbInstance.close();
    });

    dbInstance.open().catch(async (err: any) => {
        if (
            err.name === 'SchemaError' ||
            err.name === 'UpgradeError'
        ) {
            console.warn(
                '[db] Dexie schema mismatch — resetting store'
            );
            await Dexie.delete('WaziposInventoryDB');
            if (
                typeof window !== 'undefined' &&
                window.location
            ) {
                window.location.reload();
            }
        } else {
            console.warn(
                '[db] Dexie open failed:',
                err?.message || err
            );
        }
    });
}

/* =========================================================
 * AsyncStorage keys
 * ======================================================= */

const ASYNC_STORAGE_PRODUCTS_KEY =
    '@wazipos:products_list';
const ASYNC_STORAGE_ENTITIES_KEY =
    '@wazipos:entities_list';
const ASYNC_STORAGE_INDENTS_KEY =
    '@wazipos:retailer_indents_list';
const ASYNC_STORAGE_OUT_OF_STOCKS_KEY =
    '@wazipos:retailer_out_of_stocks_list';

const ASYNC_STORAGE_FORECASTS_KEY =
    '@wazipos:retailer_forecasts_list';

const ASYNC_STORAGE_PRODUCT_REQUESTS_KEY =
    '@wazipos:retailer_product_requests_list';

const ASYNC_STORAGE_WHOLESALER_RECEIPTS_KEY =
    '@wazipos:wholesaler_receipts_list';

const ASYNC_STORAGE_RETAILER_ORDERS_KEY =
    '@wazipos:retailer_orders_list';

// Pending queues (not mirrored to Dexie — write-only outbound).
const ASYNC_STORAGE_PENDING_CREATES_KEY =
    'wazipos_async_retailer_product_requests_pending_creates';
const ASYNC_STORAGE_PENDING_OFFERS_KEY =
    'wazipos_async_retailer_product_requests_pending_offers';

/* =========================================================
 * Shared helpers
 * ======================================================= */

async function writeJson(
    key: string,
    data: unknown,
    label: string
): Promise<void> {
    try {
        if (Array.isArray(data) && data.length === 0) {
            await AsyncStorage.removeItem(key);
            return;
        }
        await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error(
            `AsyncStorage failing to commit ${label}:`,
            error
        );
        throw error;
    }
}

async function readJson<T>(
    key: string,
    label: string
): Promise<T[]> {
    try {
        const rawData = await AsyncStorage.getItem(key);
        if (!rawData) return [];
        const parsedData = JSON.parse(rawData);
        return Array.isArray(parsedData) ? (parsedData as T[]) : [];
    } catch (error) {
        console.error(
            `AsyncStorage failing to extract cached ${label}:`,
            error
        );
        return [];
    }
}

async function mirrorToDexie<T>(
    tableName:
        | 'retailerForecasts'
        | 'retailerProductRequests'
        | 'wholesalerReceipts'
        | 'retailerOrders',
    rows: T[]
): Promise<void> {
    if (!dbInstance?.[tableName]) return;

    try {
        await dbInstance.transaction(
            'rw',
            dbInstance[tableName],
            async () => {
                await dbInstance[tableName].clear();
                if (rows.length > 0) {
                    // Strip undefined `id` so Dexie assigns ++id.
                    // Keep set ids so rows update in place.
                    const sanitized = (rows as any[]).map(
                        (row) => {
                            if (
                                row.id === undefined ||
                                row.id === null
                            ) {
                                const { id, ...rest } = row;
                                return rest;
                            }
                            return row;
                        }
                    );
                    await dbInstance[tableName].bulkPut(
                        sanitized
                    );
                }
            }
        );
    } catch (err) {
        console.warn(
            `[db] Dexie mirror failed for ${tableName}:`,
            err
        );
    }
}

/* =========================================================
 * db facade
 * ======================================================= */

export const db = {
    /* ---------------- Products ---------------- */

    saveProducts: async (products: ProductItem[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_PRODUCTS_KEY,
            products,
            'products array'
        );
    },

    getProducts: async (): Promise<ProductItem[]> => {
        return readJson<ProductItem>(
            ASYNC_STORAGE_PRODUCTS_KEY,
            'products'
        );
    },

    /* ---------------- Entities ---------------- */

    saveEntities: async (entities: EntityItem[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_ENTITIES_KEY,
            entities,
            'entities array'
        );
    },

    getEntities: async (): Promise<EntityItem[]> => {
        return readJson<EntityItem>(
            ASYNC_STORAGE_ENTITIES_KEY,
            'entities'
        );
    },

    /* ---------------- Retailer indents ---------------- */

    saveRetailerIndents: async (
        indents: RetailerIndent[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_INDENTS_KEY,
            indents,
            'retailer indents'
        );
    },

    getRetailerIndents: async (): Promise<RetailerIndent[]> => {
        return readJson<RetailerIndent>(
            ASYNC_STORAGE_INDENTS_KEY,
            'retailer indents'
        );
    },

    /* ---------------- Retailer out of stocks ---------------- */

    saveRetailerOutOfStocks: async (
        outOfStocks: RetailerOutOfStockNormalized[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_OUT_OF_STOCKS_KEY,
            outOfStocks,
            'retailer out of stocks'
        );
    },

    getRetailerOutOfStocks: async (): Promise<
        RetailerOutOfStockNormalized[]
    > => {
        return readJson<RetailerOutOfStockNormalized>(
            ASYNC_STORAGE_OUT_OF_STOCKS_KEY,
            'retailer out of stocks'
        );
    },

    /* ---------------- Retailer forecasts ---------------- */

    saveRetailerForecasts: async (
        forecasts: RetailerForecastNormalized[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_FORECASTS_KEY,
            forecasts,
            'retailer forecasts'
        );

        await mirrorToDexie('retailerForecasts', forecasts);
    },

    getRetailerForecasts: async (): Promise<
        RetailerForecastNormalized[]
    > => {
        return readJson<RetailerForecastNormalized>(
            ASYNC_STORAGE_FORECASTS_KEY,
            'retailer forecasts'
        );
    },

    /* ---------------- Product requests (unified) ---------------- */

    saveProductRequests: async (
        requests: ProductRequestSummary[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_PRODUCT_REQUESTS_KEY,
            requests,
            'product requests'
        );

        await mirrorToDexie('retailerProductRequests', requests);
    },

    getProductRequests: async (): Promise<
        ProductRequestSummary[]
    > => {
        return readJson<ProductRequestSummary>(
            ASYNC_STORAGE_PRODUCT_REQUESTS_KEY,
            'product requests'
        );
    },

    /* ---------------- Wholesaler receipts ---------------- */

    saveWholesalerReceipts: async (
        receipts: WholesalerReceipt[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_WHOLESALER_RECEIPTS_KEY,
            receipts,
            'wholesaler receipts'
        );

        await mirrorToDexie('wholesalerReceipts', receipts);
    },

    getWholesalerReceipts: async (): Promise<
        WholesalerReceipt[]
    > => {
        return readJson<WholesalerReceipt>(
            ASYNC_STORAGE_WHOLESALER_RECEIPTS_KEY,
            'wholesaler receipts'
        );
    },

    /* ---------------- Retailer orders ---------------- */

    saveRetailerOrders: async (
        orders: RetailerOrder[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_RETAILER_ORDERS_KEY,
            orders,
            'retailer orders'
        );

        await mirrorToDexie('retailerOrders', orders);
    },

    getRetailerOrders: async (): Promise<RetailerOrder[]> => {
        return readJson<RetailerOrder>(
            ASYNC_STORAGE_RETAILER_ORDERS_KEY,
            'retailer orders'
        );
    },

    /* ---------------- Pending creates queue ---------------- */

    saveRetailerProductRequestPendingCreates: async (
        creates: PendingRequestCreate[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_PENDING_CREATES_KEY,
            creates,
            'retailer product request pending creates'
        );
    },

    getRetailerProductRequestPendingCreates: async (): Promise<
        PendingRequestCreate[]
    > => {
        return readJson<PendingRequestCreate>(
            ASYNC_STORAGE_PENDING_CREATES_KEY,
            'retailer product request pending creates'
        );
    },

    /* ---------------- Pending offers queue ---------------- */

    saveRetailerProductRequestPendingOffers: async (
        offers: PendingOfferAction[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_PENDING_OFFERS_KEY,
            offers,
            'retailer product request pending offers'
        );
    },

    getRetailerProductRequestPendingOffers: async (): Promise<
        PendingOfferAction[]
    > => {
        return readJson<PendingOfferAction>(
            ASYNC_STORAGE_PENDING_OFFERS_KEY,
            'retailer product request pending offers'
        );
    },
};

/* =========================================================
 * Full local wipe — used on logout
 *
 * Clears:
 *   - AsyncStorage (all keys)
 *   - localStorage (web)
 *   - Dexie database (web) — the entire store is dropped
 *     and will be recreated on next open
 *
 * Note: SecureStore items (native) are NOT cleared here —
 * AuthContext removes the token explicitly before calling
 * this function.
 * ======================================================= */

export async function wipeLocalData(): Promise<void> {
    const tasks: Promise<any>[] = [];

    /* -------- AsyncStorage (native + web shim) -------- */
    tasks.push(
        AsyncStorage.clear().catch((err) =>
            console.warn(
                '[wipeLocalData] AsyncStorage.clear failed:',
                err
            )
        )
    );

    /* -------- localStorage (web only) -------- */
    if (isWeb && typeof window !== 'undefined') {
        try {
            window.localStorage.clear();
        } catch (err) {
            console.warn(
                '[wipeLocalData] localStorage.clear failed:',
                err
            );
        }
    }

    /* -------- Dexie (web only) -------- */
    if (
        IDB_AVAILABLE &&
        dbInstance &&
        typeof dbInstance.delete === 'function'
    ) {
        tasks.push(
            dbInstance.delete().catch((err: any) => {
                console.warn(
                    '[wipeLocalData] Dexie delete failed:',
                    err
                );
            })
        );
    }

    await Promise.allSettled(tasks);

    if (__DEV__) {
        console.log(
            '[wipeLocalData] local stores cleared'
        );
    }
}