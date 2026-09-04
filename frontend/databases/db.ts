import Dexie, { type Table } from 'dexie';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CachedIndentSelection, CachedReceipt, CustomerOrder, DBLineItemSchema, OutOfStockRecord, PaymentMethodItem, ProcurementIntentRecord, ProductItem } from './types';

const [E_PR, E_LI, S_OS, S_PD, S_OR, E_PM, E_ST] = ['cached_retailer_receipts', 'local_active_checkout_lines', 'wazipos_secure_out_of_stocks_payload', 'wazipos_secure_products_catalog_payload', 'wazipos_secure_customer_orders_payload', 'cached_payment_methods', 'payment_methods_last_sync_time'];
const isWeb = Platform.OS === 'web';

class WaziposDB extends Dexie {
    retailerReceipts!: Table<CachedReceipt>; products!: Table<ProductItem>; outOfStocks!: Table<OutOfStockRecord>;
    customerOrders!: Table<CustomerOrder, string>; indents!: Table<CachedIndentSelection>; procurementIntents!: Table<ProcurementIntentRecord>;
    lineItems!: Table<DBLineItemSchema, number>; paymentMethods!: Table<PaymentMethodItem, string>;
    constructor() {
        super('WaziposInventoryDB');
        this.version(15).stores({
            retailerReceipts: 'key, id, title, bar_code, expiry_status', products: 'id, title, product_name, bar_code, manufacturer_title, category_title',
            outOfStocks: 'id, product, product_title, customer_name, is_ordered, created', customerOrders: 'draftId, status, vendor_session_id', indents: 'id',
            procurementIntents: 'product_id, title, bar_code', lineItems: 'id, selectedProduct, selectedProductTitle, quantity, price, discount, isDropdownOpen', paymentMethods: 'id, title, active'
        });
    }
}
export const dbInstance = new WaziposDB();

const getSec = async (k: string) => { try { return JSON.parse(await SecureStore.getItemAsync(k) || '[]'); } catch { return []; } };
const setSec = async (k: string, v: any) => SecureStore.setItemAsync(k, JSON.stringify(v));

export const DatabaseEngine = {
    outOfStocks: {
        orderBy: (k: string) => ({ reverse: () => ({ toArray: () => dbInstance.outOfStocks.orderBy(k).reverse().toArray() }) }),
        bulkPut: (r: OutOfStockRecord[]) => dbInstance.outOfStocks.bulkPut(r), put: (r: OutOfStockRecord) => dbInstance.outOfStocks.put(r), delete: (id: string) => dbInstance.outOfStocks.delete(id)
    },

    // UPDATED PRODUCTS INTERACTION ENGINE (WITH FULL WEB/NATIVE CRUD MAPPINGS)
    products: {
        toArray: () => isWeb ? dbInstance.products.toArray() : getSec(S_PD),
        bulkPut: (r: ProductItem[]) => isWeb ? dbInstance.products.bulkPut(r) : setSec(S_PD, r),
        clear: () => isWeb ? dbInstance.products.clear() : SecureStore.deleteItemAsync(S_PD),
        put: async (p: ProductItem) => {
            if (isWeb) return dbInstance.products.put(p);
            const l = (await getSec(S_PD)).filter((i: any) => i.id !== p.id);
            l.push(p); await setSec(S_PD, l);
        },
        delete: async (id: string) => {
            if (isWeb) return dbInstance.products.delete(id);
            await setSec(S_PD, (await getSec(S_PD)).filter((i: any) => i.id !== id));
        }
    },

    getOpenOrderForUser: async (vId: string) => isWeb ? (await dbInstance.customerOrders.where({ status: 'OPEN' }).toArray()).find(o => o.draftId.startsWith(vId)) || null : (await getSec(S_OR)).find((o: any) => o.status === 'OPEN' && o.draftId.startsWith(vId)) || null,
    upsertOrder: async (o: CustomerOrder) => { if (isWeb) return dbInstance.customerOrders.put(o); const l = (await getSec(S_OR)).filter((i: any) => i.draftId !== o.draftId); l.push(o); await setSec(S_OR, l); },
    getProducts: () => isWeb ? dbInstance.products.toArray() : getSec(S_PD),
    saveProducts: (p: ProductItem[]) => isWeb ? dbInstance.products.clear().then(() => dbInstance.products.bulkPut(p)) : setSec(S_PD, p),
    saveRetailerReceipts: (r: CachedReceipt[]) => isWeb ? dbInstance.retailerReceipts.clear().then(() => dbInstance.retailerReceipts.bulkPut(r)) : setSec(E_PR, r),
    getRetailerReceipts: () => isWeb ? dbInstance.retailerReceipts.toArray() : getSec(E_PR),

    paymentMethods: {
        getAll: () => isWeb ? dbInstance.paymentMethods.toArray() : getSec(E_PM),
        saveAll: (m: PaymentMethodItem[]) => isWeb ? dbInstance.paymentMethods.clear().then(() => dbInstance.paymentMethods.bulkPut(m)) : setSec(E_PM, m),
        put: async (m: PaymentMethodItem) => { if (isWeb) return dbInstance.paymentMethods.put(m); const l = (await getSec(E_PM)).filter((i: any) => i.id !== m.id); l.push(m); await setSec(E_PM, l); },
        delete: async (id: string) => { if (isWeb) return dbInstance.paymentMethods.delete(id); await setSec(E_PM, (await getSec(E_PM)).filter((i: any) => i.id !== id)); },
        getLastSync: async () => Number((isWeb ? localStorage.getItem(E_ST) : await SecureStore.getItemAsync(E_ST)) || 0),
        setLastSync: (t: number) => isWeb ? localStorage.setItem(E_ST, String(t)) : SecureStore.setItemAsync(E_ST, String(t))
    },

    getLineItems: async () => {
        try {
            let c = isWeb ? await dbInstance.lineItems.toArray() : await getSec(E_LI);
            if (!c.length) { c = [{ id: 1, selectedProduct: "", selectedProductTitle: "", quantity: 1, price: 0, discount: 0, searchQuery: "", isDropdownOpen: false }]; isWeb ? await dbInstance.lineItems.put(c) : await setSec(E_LI, c); }
            return c;
        } catch { return []; }
    },
    saveLineItems: async (l: any[]) => {
        try {
            const s = l.map(i => ({ id: Number(i.id) || 1, selectedProduct: typeof i.selectedProduct === 'object' && i.selectedProduct !== null ? JSON.stringify(i.selectedProduct) : String(i.selectedProduct || ""), selectedProductTitle: String(i.selectedProductTitle || ""), quantity: Number(i.quantity) || 1, price: Number(i.price) || 0, discount: Number(i.discount) || 0, searchQuery: String(i.searchQuery || ""), isDropdownOpen: !!i.isDropdownOpen }));
            isWeb ? await dbInstance.lineItems.clear().then(() => dbInstance.lineItems.bulkPut(s)) : await setSec(E_LI, s);
        } catch (e) { console.error(e); }
    },
    clearLineItems: async () => { try { isWeb ? await dbInstance.lineItems.clear() : await SecureStore.deleteItemAsync(E_LI); } catch (e) { console.error(e); } }
};
export const db = DatabaseEngine;
