import { dbInstance } from '@/databases/db';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
export function useInventoryAdjustment(triggerManualFetch?: () => Promise<void>) {
    const deductLocalInventoryStock = async (items: { retailer_receipt: string; purchased_quantity: number }[]) => {
        try {
            if (Platform.OS === 'web' && dbInstance?.retailerReceipts) {
                for (const item of items) {
                    const matched = await dbInstance.retailerReceipts.get(item.retailer_receipt);
                    if (matched) {
                        const nextAvail = Math.max(0, (Number(matched.available) || 0) - item.purchased_quantity);
                        const nextQty = Math.max(0, (Number(matched.current_unit_quantity) || 0) - item.purchased_quantity);
                        await dbInstance.retailerReceipts.update(item.retailer_receipt, { available: nextAvail, current_unit_quantity: nextQty });
                    }
                }
            } else {
                const raw = await SecureStore.getItemAsync('cached_retailer_receipts');
                if (raw) {
                    const list = JSON.parse(raw);
                    for (const item of items) {
                        const target = list.find((x: any) => String(x.id || x.key) === item.retailer_receipt);
                        if (target) {
                            target.available = Math.max(0, (Number(target.available) || 0) - item.purchased_quantity);
                            target.current_unit_quantity = Math.max(0, (Number(target.current_unit_quantity) || 0) - item.purchased_quantity);
                        }
                    }
                    await SecureStore.setItemAsync('cached_retailer_receipts', JSON.stringify(list));
                }
            }
            if (typeof triggerManualFetch === 'function') await triggerManualFetch();
        } catch (e) { console.error(e); }
    };
    return { deductLocalInventoryStock };
}
