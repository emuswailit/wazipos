// databases/db.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import Dexie, { type Table } from 'dexie';
import { Platform } from 'react-native';

import {
    Country,
    County,
    CustomerOrder,
    DBLineItemSchema,
    EntityItem, // 🌟 ADDED
    FrequencyItem,
    PaymentMethodItem,
    PendingIndentOp,
    PendingIndentOpKind,
    PendingOfferAction,
    PendingRequestCreate,
    PreparationItem,
    ProductItem,
    ProductRequestSummary,
    RetailerForecastNormalized,
    RetailerIndent,
    RetailerIndentItem,
    RetailerOrder,
    RetailerOrderItem,
    RetailerOutOfStockNormalized,
    RetailerReceipt, // 🌟 ADDED
    RouteItem,
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
    /** CustomerOrdersSyncContext cache (customer orders from the server). */
    customerOrdersSyncCache!: Table<CustomerOrder, number>;
    shopperOrders!: Table<CustomerOrder, number>;
    lineItems!: Table<DBLineItemSchema, number>;
    retailerReceipts!: Table<RetailerReceipt, number>;
    retailerIndents!: Table<RetailerIndent, number>;
    retailerOutOfStocks!: Table<RetailerOutOfStockNormalized, number>;
    paymentMethods!: Table<PaymentMethodItem, string>;
    products!: Table<ProductItem, number>;

    // 🌟 ADDED PREPARATIONS
    preparations!: Table<PreparationItem, number>;
    // 🌟 ADDED ROUTES & FREQUENCIES
    routes!: Table<RouteItem, number>;
    frequencies!: Table<FrequencyItem, number>;

    entities!: Table<EntityItem, number>;

    retailerForecasts!: Table<RetailerForecastNormalized, number>;
    retailerProductRequests!: Table<ProductRequestSummary, number>;

    wholesalerReceipts!: Table<WholesalerReceipt, number>;

    retailerOrders!: Table<RetailerOrder, number>;

    retailerOrdersMeta!: Table<
        { key: string; value: string },
        string
    >;

    pendingIndentOps!: Table<PendingIndentOp, number>;

    countries!: Table<Country, string>;
    counties!: Table<County, string>;

    constructor() {
        super('WaziposInventoryDB');

        // ... (versions 14 to 25 remain exactly the same) ...
        this.version(14).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(15).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(16).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(17).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++_dexie_id, id, request_number, status, urgency, is_pending, draft_id, created, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        }).upgrade(async (tx) => {
            await tx.table('retailerProductRequests').clear();
        });

        this.version(18).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        }).upgrade(async (tx) => {
            await tx.table('retailerProductRequests').clear();
        });

        this.version(19).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(20).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(21).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(22).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps: '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(23).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps: '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
            countries: 'id, country_code, iso_code_two, iso_code_three, title',
            counties: 'id, county_code, country, title',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(24).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            shopperOrders: '++id, &[user+entity], remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps: '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
            countries: 'id, country_code, iso_code_two, iso_code_three, title',
            counties: 'id, county_code, country, title',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        this.version(25).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            shopperOrders: '++id, &[user+entity+draft_id], [user+entity+status], user, entity, status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps: '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
            countries: 'id, country_code, iso_code_two, iso_code_three, title',
            counties: 'id, county_code, country, title',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // 🌟 VERSION 26 - ADDED PREPARATIONS
        this.version(26).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            shopperOrders: '++id, &[user+entity+draft_id], [user+entity+status], user, entity, status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps: '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
            countries: 'id, country_code, iso_code_two, iso_code_three, title',
            counties: 'id, county_code, country, title',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            preparations: '++id, remote_id, title, formulation_id',
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // 🌟 VERSION 27 - ADDED ROUTES & FREQUENCIES
        this.version(27).stores({
            customerOrders: '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            shopperOrders: '++id, &[user+entity+draft_id], [user+entity+status], user, entity, status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts: '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
            retailerIndents: '++id, remote_id, indent_number, entity, is_open, created, updated',
            retailerOutOfStocks: '++id, remote_id, entity, product, is_ordered, is_special_order, created, updated',
            retailerForecasts: '++id, remote_id, product_title, has_offers, has_campaigns, created, run_date',
            retailerProductRequests: '++id, remote_id, request_number, status, urgency, is_pending, draft_id, created, updated',
            wholesalerReceipts: '++id, remote_id, remote_key, product, entity, bar_code, batch, is_active, expiry_date, updated',
            retailerOrders: '++id, remote_id, draft_id, retailer, wholesaler, status, is_paid, payment_method, order_origin, reference_number, created, updated',
            retailerOrdersMeta: 'key',
            pendingIndentOps: '++id, client_op_id, kind, indent_local_id, indent_remote_id, created_at',
            countries: 'id, country_code, iso_code_two, iso_code_three, title',
            counties: 'id, county_code, country, title',
            paymentMethods: 'id, title',
            products: '++id, remote_id, remote_key, bar_code, category, manufacturer, active, updated',
            preparations: '++id, remote_id, title, formulation_id',
            routes: '++id, remote_id, title', // 🌟 Added
            frequencies: '++id, remote_id, title, numerical', // 🌟 Added
            entities: '++id, remote_id, title, entity_type, phone, town, updated',
        });

        // v28: CustomerOrdersSyncContext gets its own cache. It used to write customer
        // orders into `retailerOrders`, which belongs to RetailerOrdersSyncContext
        // (retailer orders / requisitions) - a different domain. Other tables are unchanged.
        this.version(28).stores({
            customerOrdersSyncCache: '++id, remote_id, draft_id, status, is_paid, created, updated',
        });
    }
}

/* =========================================================
 * Dexie self-heal
 * ======================================================= */

function isDatabaseClosedError(err: any): boolean {
    if (!err) return false;
    const name = String(err?.name ?? '');
    const message = String(err?.message ?? '');
    return (
        name === 'DatabaseClosedError' ||
        message.includes('Database has been closed')
    );
}

async function ensureDbOpen(): Promise<void> {
    if (!IDB_AVAILABLE) return;
    if (!(dbInstance instanceof WaziposLocalIndexedDB)) return;
    if (dbInstance.isOpen()) return;

    try {
        await dbInstance.open();
    } catch (err: any) {
        console.warn(
            '[db] ensureDbOpen failed:',
            err?.name ?? '',
            err?.message ?? err
        );
    }
}

export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
    if (!IDB_AVAILABLE) return fn();

    try {
        return await fn();
    } catch (err) {
        if (!isDatabaseClosedError(err)) throw err;
        await ensureDbOpen();
        return await fn();
    }
}

/* =========================================================
 * No-op stub
 * ======================================================= */

function makeNoopTable() {
    const chain: any = {};
    chain.where = () => chain;
    chain.equals = () => chain;
    chain.and = () => chain;
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
    customerOrdersSyncCache = makeNoopTable();
    shopperOrders = makeNoopTable();
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

    countries = makeNoopTable();
    counties = makeNoopTable();

    paymentMethods = makeNoopTable();
    products = makeNoopTable();

    // 🌟 ADDED
    preparations = makeNoopTable();
    routes = makeNoopTable();
    frequencies = makeNoopTable();

    entities = makeNoopTable();

    transaction = async (..._args: any[]) => {
        const fn = _args[_args.length - 1];
        if (typeof fn === 'function') {
            await fn();
        }
    };

    open = async () => { };
    close = () => { };
    isOpen = () => false;
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
        console.warn(
            '[db] versionchange — closing handle; next query will reopen'
        );
        // disableAutoOpen: false keeps this shared instance usable: Dexie reopens it on
        // the next query. The default (true) leaves it permanently closed, so every later
        // read throws DatabaseClosedError.
        dbInstance.close({ disableAutoOpen: false });
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
        } else if (isDatabaseClosedError(err)) {
            console.warn(
                '[db] open raced by versionchange — will reopen on next query'
            );
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

const ASYNC_STORAGE_PRODUCTS_KEY = '@wazipos:products_list';
const ASYNC_STORAGE_PREPARATIONS_KEY = '@wazipos:preparations_list';
const ASYNC_STORAGE_ROUTES_KEY = '@wazipos:routes_list'; // 🌟 ADDED
const ASYNC_STORAGE_FREQUENCIES_KEY = '@wazipos:frequencies_list'; // 🌟 ADDED
const ASYNC_STORAGE_ENTITIES_KEY = '@wazipos:entities_list';
const ASYNC_STORAGE_INDENTS_KEY = '@wazipos:retailer_indents_list';
const ASYNC_STORAGE_OUT_OF_STOCKS_KEY =
    '@wazipos:retailer_out_of_stocks_list';
const ASYNC_STORAGE_FORECASTS_KEY = '@wazipos:retailer_forecasts_list';
const ASYNC_STORAGE_PRODUCT_REQUESTS_KEY =
    '@wazipos:retailer_product_requests_list';
const ASYNC_STORAGE_WHOLESALER_RECEIPTS_KEY =
    '@wazipos:wholesaler_receipts_list';
const ASYNC_STORAGE_RETAILER_ORDERS_KEY =
    '@wazipos:retailer_orders_list';
const ASYNC_STORAGE_SHOPPER_ORDERS_KEY =
    '@wazipos:shopper_orders_list';
const ASYNC_STORAGE_COUNTRIES_KEY = '@wazipos:countries_list';
const ASYNC_STORAGE_COUNTIES_KEY = '@wazipos:counties_list';

const ASYNC_STORAGE_PENDING_CREATES_KEY =
    'wazipos_async_retailer_product_requests_pending_creates';
const ASYNC_STORAGE_PENDING_OFFERS_KEY =
    'wazipos_async_retailer_product_requests_pending_offers';

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
        | 'pendingIndentOps'
        | 'countries'
        | 'counties'
        | 'preparations'
        | 'routes' // 🌟 ADDED
        | 'frequencies', // 🌟 ADDED
    rows: T[]
): Promise<void> {
    if (!IDB_AVAILABLE) return;
    if (!dbInstance?.[tableName]) return;

    try {
        await withDb(() =>
            dbInstance.transaction(
                'rw',
                dbInstance[tableName],
                async () => {
                    await dbInstance[tableName].clear();
                    if (rows.length > 0) {
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
            )
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

    /* ---------------- Preparations 🌟 ADDED ---------------- */

    savePreparations: async (preparations: PreparationItem[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_PREPARATIONS_KEY,
            preparations,
            'preparations array'
        );

        await mirrorToDexie('preparations', preparations);
    },

    getPreparations: async (): Promise<PreparationItem[]> => {
        if (IDB_AVAILABLE && dbInstance?.preparations) {
            try {
                const dexieRows = await withDb(() =>
                    dbInstance.preparations.toArray()
                );
                if (Array.isArray(dexieRows) && dexieRows.length > 0) {
                    return dexieRows as PreparationItem[];
                }
            } catch (err) {
                console.warn('[db] preparations Dexie read failed:', err);
            }
        }

        return readJson<PreparationItem>(
            ASYNC_STORAGE_PREPARATIONS_KEY,
            'preparations'
        );
    },

    /* ---------------- Routes 🌟 ADDED ---------------- */

    saveRoutes: async (routes: RouteItem[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_ROUTES_KEY,
            routes,
            'routes array'
        );

        await mirrorToDexie('routes', routes);
    },

    getRoutes: async (): Promise<RouteItem[]> => {
        if (IDB_AVAILABLE && dbInstance?.routes) {
            try {
                const dexieRows = await withDb(() =>
                    dbInstance.routes.toArray()
                );
                if (Array.isArray(dexieRows) && dexieRows.length > 0) {
                    return dexieRows as RouteItem[];
                }
            } catch (err) {
                console.warn('[db] routes Dexie read failed:', err);
            }
        }

        return readJson<RouteItem>(
            ASYNC_STORAGE_ROUTES_KEY,
            'routes'
        );
    },

    /* ---------------- Frequencies 🌟 ADDED ---------------- */

    saveFrequencies: async (frequencies: FrequencyItem[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_FREQUENCIES_KEY,
            frequencies,
            'frequencies array'
        );

        await mirrorToDexie('frequencies', frequencies);
    },

    getFrequencies: async (): Promise<FrequencyItem[]> => {
        if (IDB_AVAILABLE && dbInstance?.frequencies) {
            try {
                const dexieRows = await withDb(() =>
                    dbInstance.frequencies.toArray()
                );
                if (Array.isArray(dexieRows) && dexieRows.length > 0) {
                    return dexieRows as FrequencyItem[];
                }
            } catch (err) {
                console.warn('[db] frequencies Dexie read failed:', err);
            }
        }

        return readJson<FrequencyItem>(
            ASYNC_STORAGE_FREQUENCIES_KEY,
            'frequencies'
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

    /* ---------------- Countries ---------------- */

    saveCountries: async (countries: Country[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_COUNTRIES_KEY,
            countries,
            'countries'
        );
        await mirrorToDexie('countries', countries);
    },

    getCountries: async (): Promise<Country[]> => {
        if (IDB_AVAILABLE && dbInstance?.countries) {
            try {
                const dexieRows = await withDb(() =>
                    dbInstance.countries.toArray()
                );
                if (Array.isArray(dexieRows) && dexieRows.length > 0) {
                    return dexieRows as Country[];
                }
            } catch (err) {
                console.warn('[db] countries Dexie read failed:', err);
            }
        }

        return readJson<Country>(
            ASYNC_STORAGE_COUNTRIES_KEY,
            'countries'
        );
    },

    /* ---------------- Counties ---------------- */

    saveCounties: async (counties: County[]): Promise<void> => {
        await writeJson(
            ASYNC_STORAGE_COUNTIES_KEY,
            counties,
            'counties'
        );
        await mirrorToDexie('counties', counties);
    },

    getCounties: async (): Promise<County[]> => {
        if (IDB_AVAILABLE && dbInstance?.counties) {
            try {
                const dexieRows = await withDb(() =>
                    dbInstance.counties.toArray()
                );
                if (Array.isArray(dexieRows) && dexieRows.length > 0) {
                    return dexieRows as County[];
                }
            } catch (err) {
                console.warn('[db] counties Dexie read failed:', err);
            }
        }

        return readJson<County>(
            ASYNC_STORAGE_COUNTIES_KEY,
            'counties'
        );
    },

    /* ---------------- Retailer indents ---------------- */

    saveRetailerIndents: async (indents: RetailerIndent[]): Promise<void> => {
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

        if (IDB_AVAILABLE && dbInstance?.retailerIndents) {
            try {
                await withDb(() =>
                    dbInstance.transaction(
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
                                            const {
                                                id,
                                                ...rest
                                            } = row;
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
                    )
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

        if (IDB_AVAILABLE && dbInstance?.retailerIndents) {
            try {
                const dexieRows = await withDb(() =>
                    dbInstance.retailerIndents.toArray()
                );
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

    /* ============================================================
     * Shopper orders
     * ============================================================ */

    getShopperOrdersByUserAndEntity: async (
        userId: string,
        retailerId: string
    ): Promise<CustomerOrder[]> => {
        if (IDB_AVAILABLE && dbInstance?.shopperOrders) {
            try {
                const rows = await withDb(() =>
                    dbInstance.shopperOrders
                        .where('user')
                        .equals(userId)
                        .and(
                            (o: CustomerOrder) =>
                                o.entity === retailerId
                        )
                        .toArray()
                );
                if (Array.isArray(rows)) {
                    return (rows as CustomerOrder[]).sort((a, b) =>
                        (b.created ?? '').localeCompare(
                            a.created ?? ''
                        )
                    );
                }
            } catch (err) {
                console.warn(
                    '[db] shopperOrders read (by user+entity) failed:',
                    err
                );
            }
        }

        const all = await readJson<CustomerOrder>(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            'shopper orders'
        );
        return all
            .filter(
                (o) => o.user === userId && o.entity === retailerId
            )
            .sort((a, b) =>
                (b.created ?? '').localeCompare(a.created ?? '')
            );
    },

    getOpenShopperDraft: async (
        userId: string,
        retailerId: string
    ): Promise<CustomerOrder | undefined> => {
        if (IDB_AVAILABLE && dbInstance?.shopperOrders) {
            try {
                const row = await withDb(() =>
                    dbInstance.shopperOrders
                        .where('[user+entity+status]')
                        .equals([userId, retailerId, 'draft'])
                        .first()
                );
                if (row) return row as CustomerOrder;
            } catch (err) {
                console.warn(
                    '[db] shopperOrders compound read failed:',
                    err
                );
            }
        }

        const all = await readJson<CustomerOrder>(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            'shopper orders'
        );
        return all.find(
            (o) =>
                o.user === userId &&
                o.entity === retailerId &&
                o.status === 'draft'
        );
    },

    getPendingShopperOrders: async (): Promise<
        CustomerOrder[]
    > => {
        if (IDB_AVAILABLE && dbInstance?.shopperOrders) {
            try {
                const rows = await withDb(() =>
                    dbInstance.shopperOrders
                        .where('status')
                        .equals('closed')
                        .toArray()
                );
                if (Array.isArray(rows)) {
                    return (rows as CustomerOrder[]).filter(
                        (o) =>
                            !o.remote_id ||
                            o.remote_id.length === 0
                    );
                }
            } catch (err) {
                console.warn(
                    '[db] shopperOrders pending read failed:',
                    err
                );
            }
        }

        const all = await readJson<CustomerOrder>(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            'shopper orders'
        );
        return all.filter(
            (o) =>
                o.status === 'closed' &&
                (!o.remote_id || o.remote_id.length === 0)
        );
    },

    putShopperOrder: async (
        order: CustomerOrder
    ): Promise<CustomerOrder> => {
        let persisted = order;

        if (IDB_AVAILABLE && dbInstance?.shopperOrders) {
            try {
                if (
                    order.id !== undefined &&
                    order.id !== null
                ) {
                    await withDb(() =>
                        dbInstance.shopperOrders.put(order)
                    );
                } else {
                    const { id, ...rest } = order;
                    const newId = await withDb(() =>
                        dbInstance.shopperOrders.add(
                            rest as CustomerOrder
                        )
                    );
                    persisted = { ...order, id: newId as number };
                }
            } catch (err) {
                console.warn(
                    '[db] shopperOrders put failed:',
                    err
                );
            }
        }

        const current = await readJson<CustomerOrder>(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            'shopper orders'
        );
        const idx =
            persisted.id !== undefined && persisted.id !== null
                ? current.findIndex(
                    (o) => o.id === persisted.id
                )
                : -1;

        const next =
            idx >= 0
                ? current.map((o, i) =>
                    i === idx ? persisted : o
                )
                : [...current, persisted];

        await writeJson(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            next,
            'shopper orders'
        );

        return persisted;
    },

    closeShopperOrder: async (
        order: CustomerOrder
    ): Promise<CustomerOrder> => {
        if (!order) {
            throw new Error(
                'closeShopperOrder: order is required'
            );
        }

        const next: CustomerOrder = {
            ...order,
            status: 'closed',
            updated: new Date().toISOString(),
        };

        return db.putShopperOrder(next);
    },

    deleteShopperOrderById: async (
        id: number
    ): Promise<void> => {
        if (IDB_AVAILABLE && dbInstance?.shopperOrders) {
            try {
                await withDb(() =>
                    dbInstance.shopperOrders.delete(id)
                );
            } catch (err) {
                console.warn(
                    '[db] shopperOrders delete failed:',
                    err
                );
            }
        }

        const current = await readJson<CustomerOrder>(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            'shopper orders'
        );
        const next = current.filter((o) => o.id !== id);
        await writeJson(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            next,
            'shopper orders'
        );
    },

    deleteShopperOrdersForUser: async (
        userId: string
    ): Promise<void> => {
        if (IDB_AVAILABLE && dbInstance?.shopperOrders) {
            try {
                await withDb(() =>
                    dbInstance.shopperOrders
                        .where('user')
                        .equals(userId)
                        .delete()
                );
            } catch (err) {
                console.warn(
                    '[db] shopperOrders user delete failed:',
                    err
                );
            }
        }

        const current = await readJson<CustomerOrder>(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            'shopper orders'
        );
        const next = current.filter((o) => o.user !== userId);
        await writeJson(
            ASYNC_STORAGE_SHOPPER_ORDERS_KEY,
            next,
            'shopper orders'
        );
    },

    /* ---------------- Shopper orders — draft helpers ---------------- */

    buildShopperDraftId: (
        userId: string,
        retailerId: string
    ): string => `${userId}:${retailerId}:${Date.now()}`,

    getOrCreateShopperDraft: async (
        userId: string,
        retailerId: string,
        retailerName: string
    ): Promise<CustomerOrder> => {
        const existing = await db.getOpenShopperDraft(
            userId,
            retailerId
        );
        if (existing) return existing;

        const now = new Date().toISOString();
        const draft: CustomerOrder = {
            cached_at: now,
            remote_id: '',
            remote_key: undefined,
            draft_id: `${userId}:${retailerId}:${Date.now()}`,
            synced: 'FALSE',

            customerName: undefined,
            customerPhone: undefined,
            dueDate: undefined,
            deliveryMethod: undefined,
            shippingCost: undefined,
            selectedPaymentMethodId: undefined,
            paymentAccountNumber: undefined,
            customerOrderItems: undefined,

            status: 'draft',
            reference_number: null,
            psp_reference_number: '',
            provider_reference_number: null,
            employee: null,
            order_number: '',
            order_type: '',
            payment_account_number: '',
            order_price_discount_total: 0,
            order_net_price_total: '0',
            order_origin: '',
            order_price_total: '0',
            order_tax_total: 0,
            shipping_cost: '0',
            is_quoted: 'false',
            is_paid: 'false',
            paid_at: '',
            due_date: '',
            is_delivered: 'false',
            is_delivered_string: '',
            is_packed_string: '',
            delivered_at: '',
            delivered_by: null,
            is_packed: 'false',
            packed_at: '',
            packed_by: null,
            is_received: 'false',
            received_at: '',
            received_by: null,
            delivery_method: '',
            customer: null,
            coupon: null,
            entity: retailerId,
            entity_title: retailerName,
            vendor: '',
            user: userId,
            phone: '',
            email: '',
            bodaboda_latitude: null,
            bodaboda_longitude: null,
            origin_latitude: null,
            origin_longitude: null,
            destination_latitude: null,
            destination_longitude: null,
            created: now,
            updated: now,
            owner: userId,
            customer_name: '',
            customer_phone: '',
            recipient_name: null,
            recipient_phone: null,
            selected_payment_method: '',
            selected_payment_method_title: '',
            payment_status: '',
            payment_description: '',
            order_items: [],
            images: [],
            shipping_address: null,
            origin_point: null,
            destination_point: null,
            farness: '',
            bodaboda: null,
            bodaboda_title: '',
            bodaboda_farness: '',
            city_name: null,
            total_amount: '0',
            fulfillment_status: '',
        } as CustomerOrder;

        return db.putShopperOrder(draft);
    },

    replaceShopperItems: async (
        order: CustomerOrder
    ): Promise<CustomerOrder> => {
        const items = order.order_items ?? [];

        let subtotal = 0;
        for (const it of items) {
            const price = Number(
                it.receipt_details?.final_unit_selling_price ??
                it.receipt_details?.unit_selling_price ??
                0
            );
            const qty = Number(it.purchased_quantity ?? 0);
            subtotal += price * qty;
        }

        const next: CustomerOrder = {
            ...order,
            order_price_total: subtotal.toFixed(2),
            order_net_price_total: subtotal.toFixed(2),
            total_amount: subtotal.toFixed(2),
            updated: new Date().toISOString(),
        };

        return db.putShopperOrder(next);
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

    /* ============================================================
     * Pending indent operations queue
     * ============================================================ */

    enqueuePendingIndentOp: async (input: {
        client_op_id?: string;
        kind: PendingIndentOpKind;
        indent_local_id: string;
        indent_remote_id?: string | null;
        item_id?: string | null;
        wholesale_receipt?: string | null;
        quantity?: number;
        item_snapshot?: Partial<RetailerIndentItem> | null;
        close_note?: string | null;
    }): Promise<PendingIndentOp> => {
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

    listPendingIndentOps: async (): Promise<PendingIndentOp[]> => {
        const all = await db.getPendingIndentOps();
        return [...all].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
        );
    },

    countPendingIndentOps: async (): Promise<number> => {
        const all = await db.getPendingIndentOps();
        return all.length;
    },

    completePendingIndentOp: async (
        opId: number
    ): Promise<void> => {
        const all = await db.getPendingIndentOps();
        const next = all.filter((o) => o.id !== opId);
        await db.savePendingIndentOps(next);
    },

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

    getProtectedIndentIds: async (): Promise<Set<string>> => {
        const all = await db.getPendingIndentOps();
        return new Set(all.map((o) => o.indent_local_id));
    },

    /* ---------------- Pending indent ops — raw access ---------------- */

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
        if (IDB_AVAILABLE && dbInstance?.pendingIndentOps) {
            try {
                const rows = await withDb(() =>
                    dbInstance.pendingIndentOps.toArray()
                );
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
            // Without disableAutoOpen: false, Dexie keeps the singleton closed after the
            // delete, so the next session's reads (e.g. cached entities after logging back
            // in) fail with DatabaseClosedError. With it, Dexie recreates an empty DB on demand.
            dbInstance.delete({ disableAutoOpen: false }).catch((err: any) => {
                console.warn(
                    '[wipeLocalData] Dexie delete failed:',
                    err
                );
            })

        );
    }

    await Promise.allSettled(tasks);

    if (__DEV__) {
        console.log('[wipeLocalData] local stores cleared');
    }
}