// databases/db.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import Dexie, { type Table } from 'dexie';
import { Platform } from 'react-native';

import {
    CustomerOrder,
    DBLineItemSchema,
    EntityItem,
    PaymentMethodItem,
    PendingIndentOp,
    PendingIndentOpKind,
    PendingOfferAction,
    PendingRequestCreate,
    ProductItem,
    ProductRequestSummary,
    RetailerForecastNormalized,
    RetailerIndent,
    RetailerIndentItem,
    RetailerOrder,
    RetailerOrderItem,
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
 * UUID helper
 * ======================================================= */

function uuidv4(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof (crypto as any).randomUUID === 'function'
    ) {
        return (crypto as any).randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        }
    );
}

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

    /**
     * `++id` is the local Dexie PK. `remote_id` is the server UUID.
     */
    retailerOrders!: Table<RetailerOrder, number>;

    /**
     * Small KV table used only on web to persist the retailer-orders
     * synced-at timestamp. On native, that timestamp lives in
     * AsyncStorage under `RETAILER_ORDERS_SYNCED_AT`.
     */
    retailerOrdersMeta!: Table<
        { key: string; value: string },
        string
    >;

    /**
     * Offline-first retry queue for indent mutations. Drained by the
     * RetailerIndentsSyncContext poller on connectivity restore and on
     * a fixed interval while the queue is non-empty.
     */
    pendingIndentOps!: Table<PendingIndentOp, number>;

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
        // on retailerProductRequests.
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

        // v19: adds wholesalerReceipts.
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
                '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v21: adds retailerOrdersMeta — a tiny KV table used only
        // on web for the retailer-orders synced-at timestamp, so
        // web no longer touches AsyncStorage / localStorage for
        // retailer orders.
        this.version(21).stores({
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
                '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            paymentMethods: 'id, title',
            products:
                '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities:
                '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v22: adds pendingIndentOps — offline-first retry queue for
        // indent mutations. Drained by the RetailerIndentsSyncContext
        // poller on connectivity restore and on a fixed interval while
        // the queue is non-empty.
        this.version(22).stores({
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
                '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps:
                '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
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
    chain.get = async () => null;
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
    retailerOrdersMeta = makeNoopTable();
    pendingIndentOps = makeNoopTable();

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

// Pending queues for product requests (write-only outbound).
const ASYNC_STORAGE_PENDING_CREATES_KEY =
    'wazipos_async_retailer_product_requests_pending_creates';
const ASYNC_STORAGE_PENDING_OFFERS_KEY =
    'wazipos_async_retailer_product_requests_pending_offers';

// Pending indent-op queue (write-only outbound).
const ASYNC_STORAGE_PENDING_INDENT_OPS_KEY =
    'wazipos_async_pending_indent_ops';

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
        | 'retailerOrders'
        | 'pendingIndentOps',
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
 * Retailer order normalization
 * ======================================================= */

function normalizeRetailerOrderItem(raw: any): RetailerOrderItem {
    const { id, ...rest } = raw;

    const isWireId = typeof id === 'string' && id.length > 0;
    const remoteId = raw.remote_id ?? (isWireId ? id : '');

    return {
        ...rest,
        remote_id: remoteId,
        cached_at: raw.cached_at,
    };
}

function normalizeRetailerOrder(raw: any): RetailerOrder {
    const { id, ...rest } = raw;

    const isWireId = typeof id === 'string' && id.length > 0;
    const localId = typeof id === 'number' ? id : undefined;
    const remoteId = raw.remote_id ?? (isWireId ? id : '');

    const items = Array.isArray(raw.order_items)
        ? raw.order_items.map(normalizeRetailerOrderItem)
        : [];

    return {
        ...rest,
        id: localId,
        remote_id: remoteId,
        draft_id: raw.draft_id ?? null,
        cached_at: raw.cached_at ?? new Date().toISOString(),
        order_items: items,
    };
}

/* =========================================================
 * Retailer indent item shape migration
 * ======================================================= */

/**
 * Coerce a persisted item row into the current schema:
 *   - `id`        → local Dexie-style number (undefined if not yet assigned)
 *   - `remote_id` → server UUID, or null while local-only
 *   - `draft_id`  → client UUID, or null
 *
 * Handles the legacy shape where `id` was a string that played double
 * duty (draft id `<user>:<entity>:<ts>` before sync, server UUID after).
 */
function normalizeIndentItemShape(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;

    const rawId = raw.id;

    const hasNumericId =
        typeof rawId === 'number' && Number.isFinite(rawId);

    const hasStringId =
        typeof rawId === 'string' && rawId.length > 0;

    const isDraftStringId =
        hasStringId && String(rawId).includes(':');

    const derivedRemote: string | null = raw.remote_id
        ? String(raw.remote_id)
        : hasStringId && !isDraftStringId
            ? String(rawId)
            : null;

    return {
        ...raw,
        id: hasNumericId ? rawId : undefined,
        remote_id: derivedRemote,
        draft_id: raw.draft_id ? String(raw.draft_id) : null,
    };
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
        /* Normalize shapes (legacy string id → remote_id) and assign
         * local numeric ids to any item that doesn't have one yet.
         *
         * Items are nested inside the indent blob, so Dexie's `++id`
         * doesn't apply to them — we hand out ids here. Ids are global
         * across the whole item set so `it.id` remains a stable, unique
         * local key. Never sent to the server. */
        const normalized = indents.map((ind) => ({
            ...ind,
            retailer_indent_items: (
                ind.retailer_indent_items ?? []
            ).map(normalizeIndentItemShape),
        }));

        let nextItemId = 0;
        for (const ind of normalized) {
            for (const it of ind.retailer_indent_items) {
                if (
                    typeof it.id === 'number' &&
                    it.id > nextItemId
                ) {
                    nextItemId = it.id;
                }
            }
        }

        const withIds = normalized.map((ind) => ({
            ...ind,
            retailer_indent_items: ind.retailer_indent_items.map(
                (it) => {
                    if (typeof it.id === 'number') return it;
                    nextItemId += 1;
                    return { ...it, id: nextItemId };
                }
            ),
        }));

        await writeJson(
            ASYNC_STORAGE_INDENTS_KEY,
            withIds,
            'retailer indents'
        );

        if (dbInstance?.retailerIndents) {
            try {
                await dbInstance.transaction(
                    'rw',
                    dbInstance.retailerIndents,
                    async () => {
                        await dbInstance.retailerIndents.clear();
                        if (withIds.length > 0) {
                            const sanitized = withIds.map(
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
                            await dbInstance.retailerIndents.bulkPut(
                                sanitized
                            );
                        }
                    }
                );
            } catch (err) {
                console.warn(
                    '[db] retailerIndents mirror failed:',
                    err
                );
            }
        }
    },

    getRetailerIndents: async (): Promise<RetailerIndent[]> => {
        let rows: RetailerIndent[] = [];

        // On web with IndexedDB available, prefer the Dexie mirror.
        // On native, `dbInstance.retailerIndents` is a no-op stub, so
        // this branch falls through to AsyncStorage.
        if (dbInstance?.retailerIndents) {
            try {
                const dexieRows =
                    await dbInstance.retailerIndents.toArray();
                if (
                    Array.isArray(dexieRows) &&
                    dexieRows.length > 0
                ) {
                    rows = dexieRows as RetailerIndent[];
                }
            } catch (err) {
                console.warn(
                    '[db] retailerIndents Dexie read failed:',
                    err
                );
            }
        }

        if (rows.length === 0) {
            rows = await readJson<RetailerIndent>(
                ASYNC_STORAGE_INDENTS_KEY,
                'retailer indents'
            );
        }

        /* Normalize on read so callers always see the current shape
         * (numeric local `id`, string `remote_id`), even if the on-disk
         * rows predate this schema. */
        return rows.map((ind) => ({
            ...ind,
            retailer_indent_items: (
                ind.retailer_indent_items ?? []
            ).map(normalizeIndentItemShape),
        }));
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

    /* ---------------- Retailer orders (read-only cache) ---------------- */

    /**
     * Persist retailer orders coming from the websocket frame.
     *
     * Accepts either raw wire payloads (where `id` is the server
     * UUID) or already-normalized `RetailerOrder` rows. Both are run
     * through `normalizeRetailerOrder` so the wire `id` is mapped
     * to `remote_id` and the local Dexie PK stays numeric.
     */
    saveRetailerOrders: async (
        orders: Array<Partial<RetailerOrder> & { id?: any }>
    ): Promise<void> => {
        const normalized = orders.map(normalizeRetailerOrder);

        await writeJson(
            ASYNC_STORAGE_RETAILER_ORDERS_KEY,
            normalized,
            'retailer orders'
        );

        await mirrorToDexie('retailerOrders', normalized);
    },

    getRetailerOrders: async (): Promise<RetailerOrder[]> => {
        return readJson<RetailerOrder>(
            ASYNC_STORAGE_RETAILER_ORDERS_KEY,
            'retailer orders'
        );
    },

    /* ---------------- Pending creates queue (product requests) ---------------- */

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

    /* ---------------- Pending offers queue (product requests) ---------------- */

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

    /* ============================================================
     * Pending indent operations queue
     *
     * This is the offline-first retry queue for indent mutations.
     * Every write the user makes on an indent — add, change qty,
     * remove, close — is either applied on the server immediately
     * (happy path) or enqueued here for retry by the sync engine.
     *
     * The helpers below are pure storage CRUD. The orchestration of
     * "when to drain" and "how to POST each op" lives in the
     * RetailerIndentsSyncContext, not here.
     * ============================================================ */

    /**
     * Append a single operation to the queue. Returns the persisted
     * row with `id` assigned. The caller is responsible for setting
     * `client_op_id` on retries.
     */
    enqueuePendingIndentOp: async (
        input: {
            client_op_id?: string;
            kind: PendingIndentOpKind;
            indent_local_id: string;
            indent_remote_id?: string | null;
            item_id?: string | null;
            wholesale_receipt?: string | null;
            quantity?: number;
            item_snapshot?: Partial<RetailerIndentItem> | null;
            close_note?: string | null;
        }
    ): Promise<PendingIndentOp> => {
        const now = new Date().toISOString();
        const op: PendingIndentOp = {
            client_op_id: input.client_op_id ?? uuidv4(),
            kind: input.kind,
            indent_local_id: input.indent_local_id,
            indent_remote_id: input.indent_remote_id ?? null,
            item_id: input.item_id ?? null,
            wholesale_receipt: input.wholesale_receipt ?? null,
            quantity: input.quantity,
            item_snapshot: input.item_snapshot ?? null,
            close_note: input.close_note ?? null,
            attempts: 0,
            last_error: null,
            created_at: now,
            updated_at: now,
        };

        const current = await db.getPendingIndentOps();
        const next = [...current, op];
        await db.savePendingIndentOps(next);
        return op;
    },

    /** All pending ops, oldest first. */
    listPendingIndentOps: async (): Promise<PendingIndentOp[]> => {
        const all = await db.getPendingIndentOps();
        return [...all].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
        );
    },

    /** Count of ops in the queue. */
    countPendingIndentOps: async (): Promise<number> => {
        const all = await db.getPendingIndentOps();
        return all.length;
    },

    /** Remove a single op by its Dexie `id`. */
    completePendingIndentOp: async (
        opId: number
    ): Promise<void> => {
        const all = await db.getPendingIndentOps();
        const next = all.filter((o) => o.id !== opId);
        await db.savePendingIndentOps(next);
    },

    /** Increment attempts and record the last error. */
    markPendingIndentOpAttempt: async (
        opId: number,
        error: string
    ): Promise<void> => {
        const all = await db.getPendingIndentOps();
        const next = all.map((o) =>
            o.id === opId
                ? {
                    ...o,
                    attempts: o.attempts + 1,
                    last_error: error,
                    updated_at: new Date().toISOString(),
                }
                : o
        );
        await db.savePendingIndentOps(next);
    },

    /** Drop every queued op for one indent (used on server-side close). */
    dropPendingIndentOpsForIndent: async (
        indentLocalId: string
    ): Promise<number> => {
        const all = await db.getPendingIndentOps();
        const next = all.filter(
            (o) => o.indent_local_id !== indentLocalId
        );
        const dropped = all.length - next.length;
        if (dropped > 0) {
            await db.savePendingIndentOps(next);
        }
        return dropped;
    },

    /**
     * After CreateRetailerIndent returns the real UUID, rewrite every
     * queued op for the local draft to point at the server id instead.
     */
    rebasePendingIndentId: async (
        oldLocalId: string,
        newRemoteId: string
    ): Promise<void> => {
        const all = await db.getPendingIndentOps();
        const next = all.map((o) =>
            o.indent_local_id === oldLocalId
                ? { ...o, indent_remote_id: newRemoteId }
                : o
        );
        await db.savePendingIndentOps(next);
    },

    /**
     * After CreateRetailerIndentItem returns the real item UUID,
     * rewrite every queued op targeting the local item placeholder.
     */
    rebasePendingIndentItemId: async (
        oldItemId: string,
        newRemoteItemId: string
    ): Promise<void> => {
        const all = await db.getPendingIndentOps();
        const next = all.map((o) =>
            o.item_id === oldItemId
                ? { ...o, item_id: newRemoteItemId }
                : o
        );
        await db.savePendingIndentOps(next);
    },

    /**
     * Return the set of indent local ids that have at least one queued
     * op. Used by the WS reconciliation to protect those indents from
     * being pruned by a server snapshot.
     */
    getProtectedIndentIds: async (): Promise<Set<string>> => {
        const all = await db.getPendingIndentOps();
        return new Set(all.map((o) => o.indent_local_id));
    },

    /* ---------------- Pending indent ops — raw access ---------------- */

    /**
     * Low-level write for the whole queue. Most callers should use the
     * granular helpers above. Exposed for the schema-reset path and
     * for tests.
     */
    savePendingIndentOps: async (
        ops: PendingIndentOp[]
    ): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_PENDING_INDENT_OPS_KEY,
            ops,
            'pending indent ops'
        );

        await mirrorToDexie('pendingIndentOps', ops);
    },

    getPendingIndentOps: async (): Promise<PendingIndentOp[]> => {
        // On web, prefer the Dexie mirror so we get proper indexing
        // and can query the queue without re-parsing JSON.
        if (dbInstance?.pendingIndentOps) {
            try {
                const rows = await dbInstance.pendingIndentOps.toArray();
                if (Array.isArray(rows) && rows.length > 0) {
                    return rows as PendingIndentOp[];
                }
            } catch (err) {
                console.warn(
                    '[db] pendingIndentOps read failed:',
                    err
                );
            }
        }

        return readJson<PendingIndentOp>(
            ASYNC_STORAGE_PENDING_INDENT_OPS_KEY,
            'pending indent ops'
        );
    },
};

/* =========================================================
 * Full local wipe — used on logout
 * ======================================================= */

export async function wipeLocalData(): Promise<void> {
    const tasks: Promise<any>[] = [];

    tasks.push(
        AsyncStorage.clear().catch((err) =>
            console.warn(
                '[wipeLocalData] AsyncStorage.clear failed:',
                err
            )
        )
    );

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