import retailerReceiptsApi from '@/api/retailersApi';
import { db, dbInstance } from '@/databases/db';
import { useApi } from '@/hooks/useApi';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
let SecureStore: any;
if (Platform.OS !== 'web') {
    try { SecureStore = require('expo-secure-store'); } catch (e) { console.error(e); }
}
export function useRetailerInventory() {
    const getInventoryApi = useApi(retailerReceiptsApi.retailerReceiptsAction);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const isFetchingRef = useRef(false);
    const fetchLocalInventoryCatalog = async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        try {
            let data: any[] = [];
            if (Platform.OS === 'web') {
                if (dbInstance?.retailerReceipts) data = await dbInstance.retailerReceipts.toArray();
            } else if (db?.getRetailerReceipts) {
                data = await db.getRetailerReceipts();
            }
            if (Array.isArray(data)) setInventoryItems(data);
        } catch (err) {
            console.log("Local inventory lookup breach:", err);
        } finally {
            isFetchingRef.current = false;
        }
    };
    useEffect(() => {
        fetchLocalInventoryCatalog();
    }, []);
    return { inventoryItems, refreshInventoryCatalog: fetchLocalInventoryCatalog, isInventoryLoading: getInventoryApi.loading };
}
