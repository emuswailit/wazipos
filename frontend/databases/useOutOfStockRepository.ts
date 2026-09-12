// app/databases/useOutOfStockRepository.ts

import * as SecureStore from 'expo-secure-store';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { db, OutOfStockRecord } from './db';

const SECURE_STORE_OOS_KEY = "wazipos_secure_out_of_stocks_payload";

export function useOutOfStockRepository() {
    const [oosLoading, setOosLoading] = useState<boolean>(false);

    /**
     * 👥 RETRIEVE: Pulls all unfulfilled shortages directly from platform layer tables.
     */
    const getAllShortages = useCallback(async (): Promise<OutOfStockRecord[]> => {
        setOosLoading(true);
        try {
            if (Platform.OS === 'web') {
                // 🚀 WEB: Direct direct query matching indexes array out of browser IndexedDB
                return await db.outOfStocks.orderBy('created').reverse().toArray();
            } else {
                // 📱 NATIVE: Read string packet footprint out of hardware-encrypted mobile containers
                const secureString = await SecureStore.getItemAsync(SECURE_STORE_OOS_KEY);
                return secureString ? JSON.parse(secureString) : [];
            }
        } catch (error) {
            console.error("📊 [Wazipos OOS Repo] Retrieval fault break tracker:", error);
            return [];
        } finally { setOosLoading(false); }
    }, []);

    /**
     * 🚀 BULK UPDATE / SYNC: Writes or overwrites entire response blocks atomically.
     */
    const bulkPutShortages = useCallback(async (shortagesList: OutOfStockRecord[]): Promise<void> => {
        setOosLoading(true);
        try {
            if (Platform.OS === 'web') {
                await db.outOfStocks.bulkPut(shortagesList);
            } else {
                await SecureStore.setItemAsync(SECURE_STORE_OOS_KEY, JSON.stringify(shortagesList));
            }
        } catch (error) {
            console.error("❌ [Wazipos OOS Repo] Bulk data operation entry synchronization failed:", error);
            throw error;
        } finally { setOosLoading(false); }
    }, []);

    /**
     * ➕ ADD SINGLE ITEM: Logs a brand-new shortage record anomaly line.
     */
    const addShortageItem = useCallback(async (newRecord: OutOfStockRecord): Promise<void> => {
        setOosLoading(true);
        try {
            if (Platform.OS === 'web') {
                await db.outOfStocks.put(newRecord);
            } else {
                const currentList = await getAllShortages();
                const updatedList = [newRecord, ...currentList];
                await SecureStore.setItemAsync(SECURE_STORE_OOS_KEY, JSON.stringify(updatedList));
            }
            console.log("💾 [Wazipos OOS Repo] New shortage record saved local table.");
        } catch (error) {
            console.error("❌ [Wazipos OOS Repo] Add action exception thrown:", error);
            throw error;
        } finally { setOosLoading(false); }
    }, [getAllShortages]);

    /**
     * ✏️ UPDATE SINGLE ITEM: Overwrites a matched item in place without disrupting adjacent fields.
     */
    const updateShortageItem = useCallback(async (updatedRecord: OutOfStockRecord): Promise<void> => {
        setOosLoading(true);
        try {
            if (Platform.OS === 'web') {
                await db.outOfStocks.put(updatedRecord);
            } else {
                const currentList = await getAllShortages();
                const updatedList = currentList.map(item => item.id === updatedRecord.id ? updatedRecord : item);
                await SecureStore.setItemAsync(SECURE_STORE_OOS_KEY, JSON.stringify(updatedList));
            }
            console.log(`💾 [Wazipos OOS Repo] Shortage item record ID ${updatedRecord.id} mutated successfully.`);
        } catch (error) {
            console.error("❌ [Wazipos OOS Repo] Update adjustment handler failed:", error);
            throw error;
        } finally { setOosLoading(false); }
    }, [getAllShortages]);

    /**
     * 🗑️ DELETE SINGLE ITEM: Permanently flushes an unfulfilled row option.
     */
    const deleteShortageItem = useCallback(async (id: string): Promise<void> => {
        setOosLoading(true);
        try {
            if (Platform.OS === 'web') {
                await db.outOfStocks.delete(id);
            } else {
                const currentList = await getAllShortages();
                const updatedList = currentList.filter(item => item.id !== id);
                await SecureStore.setItemAsync(SECURE_STORE_OOS_KEY, JSON.stringify(updatedList));
            }
            console.log(`🗑️ [Wazipos OOS Repo] Flushed item record link ID: ${id}`);
        } catch (error) {
            console.error("❌ [Wazipos OOS Repo] Row flush exception error:", error);
            throw error;
        } finally { setOosLoading(false); }
    }, [getAllShortages]);

    return {
        oosLoading,
        getAllShortages,
        bulkPutShortages,
        addShortageItem,
        updateShortageItem,
        deleteShortageItem
    };
}
