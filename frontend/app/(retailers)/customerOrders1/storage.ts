import { Platform } from 'react-native';

// Dynamically handle native bundle resolution to prevent Web compilation crashes
let SecureStore: any = null;
if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

const DB_NAME = 'OrdersCacheDB';
const STORE_NAME = 'orders_store';
const NATIVE_KEY = 'cached_customer_orders';

// ─── WEB PERSISTENCE MODULE (INDEXEDDB) ───
const getIndexedDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveWeb = async (data: any): Promise<void> => {
    const db = await getIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, 'cached_orders');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const loadWeb = async (): Promise<any | null> => {
    try {
        const db = await getIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('cached_orders');

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return null;
    }
};

// ─── UNIFIED UNIFIED INTERFACE EXPORT ───
export const localCache = {
    /**
     * Persists data payload locally across cross-platform environment boundaries.
     */
    async save(data: any): Promise<void> {
        if (Platform.OS === 'web') {
            await saveWeb(data);
        } else if (SecureStore) {
            // Native SecureStore values must always be cast to a string format
            await SecureStore.setItemAsync(NATIVE_KEY, JSON.stringify(data));
        }
    },

    /**
     * Discovers and returns active data references stored on system hardware frames.
     */
    async load(): Promise<any | null> {
        if (Platform.OS === 'web') {
            return await loadWeb();
        } else if (SecureStore) {
            const nativeData = await SecureStore.getItemAsync(NATIVE_KEY);
            return nativeData ? JSON.parse(nativeData) : null;
        }
        return null;
    }
};
