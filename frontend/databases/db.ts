// databases/db.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import Dexie, { type Table } from 'dexie';
import { Platform } from 'react-native';

import {
    CustomerOrder,
    DBLineItemSchema,
    EntityItem,
    PaymentMethodItem,
    ProductItem,
    RetailerReceipt,
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
 *
 * Local primary key on each table is `++id` (auto-increment).
 * `remote_id` is the server's UUID, indexed for lookups.
 * ======================================================= */

class WaziposLocalIndexedDB extends Dexie {
    customerOrders!: Table<CustomerOrder, number>;
    lineItems!: Table<DBLineItemSchema, number>;
    retailerReceipts!: Table<RetailerReceipt, number>;
    paymentMethods!: Table<PaymentMethodItem, string>;
    products!: Table<ProductItem, number>;
    entities!: Table<EntityItem, number>;

    constructor() {
        super('WaziposInventoryDB');

        // v13: retailerReceipts moves to `++id` PK + `remote_id` index
        // to align with the server's receipt shape.
        this.version(13).stores({
            customerOrders:
                '++id, remote_id, remote_key, draft_id, synced, status, order_number, payment_status, created, updated',
            lineItems: '++id, selectedProduct',
            retailerReceipts:
                '++id, remote_id, remote_key, entity, product, bar_code, is_active, expiry_date, updated',
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
 * Dexie lifecycle — version change + open failure
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
 * Native AsyncStorage fallback
 * ======================================================= */

const ASYNC_STORAGE_PRODUCTS_KEY =
    '@wazipos:products_list';
const ASYNC_STORAGE_ENTITIES_KEY =
    '@wazipos:entities_list';

export const db = {
    saveProducts: async (
        products: ProductItem[]
    ): Promise<void> => {
        try {
            if (products.length === 0) {
                await AsyncStorage.removeItem(
                    ASYNC_STORAGE_PRODUCTS_KEY
                );
                return;
            }
            await AsyncStorage.setItem(
                ASYNC_STORAGE_PRODUCTS_KEY,
                JSON.stringify(products)
            );
        } catch (error) {
            console.error(
                'AsyncStorage failing to commit products array:',
                error
            );
            throw error;
        }
    },

    getProducts: async (): Promise<ProductItem[]> => {
        try {
            const rawData = await AsyncStorage.getItem(
                ASYNC_STORAGE_PRODUCTS_KEY
            );
            if (!rawData) return [];
            const parsedData = JSON.parse(rawData);
            return Array.isArray(parsedData)
                ? parsedData
                : [];
        } catch (error) {
            console.error(
                'AsyncStorage failing to extract cached products:',
                error
            );
            return [];
        }
    },

    saveEntities: async (
        entities: EntityItem[]
    ): Promise<void> => {
        try {
            if (entities.length === 0) {
                await AsyncStorage.removeItem(
                    ASYNC_STORAGE_ENTITIES_KEY
                );
                return;
            }
            await AsyncStorage.setItem(
                ASYNC_STORAGE_ENTITIES_KEY,
                JSON.stringify(entities)
            );
        } catch (error) {
            console.error(
                'AsyncStorage failing to commit entities array:',
                error
            );
            throw error;
        }
    },

    getEntities: async (): Promise<EntityItem[]> => {
        try {
            const rawData = await AsyncStorage.getItem(
                ASYNC_STORAGE_ENTITIES_KEY
            );
            if (!rawData) return [];
            const parsedData = JSON.parse(rawData);
            return Array.isArray(parsedData)
                ? parsedData
                : [];
        } catch (error) {
            console.error(
                'AsyncStorage failing to extract cached entities:',
                error
            );
            return [];
        }
    },
};