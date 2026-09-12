import { dbInstance } from '@/databases/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { CustomerOrder } from './types';

const NATIVE_ASYNC_ORDERS_KEY = 'wazipos_async_orders_registry';

export const storageService = {
    getAllOrders: async (): Promise<CustomerOrder[]> => {
        if (Platform.OS === 'web') {
            return await dbInstance.customerOrders.reverse().toArray();
        } else {
            try {
                const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                console.error("📱 [Native Store] Failed reading AsyncStorage cache:", e);
                return [];
            }
        }
    },

    syncIncomingOrders: async (incoming: CustomerOrder[]): Promise<boolean> => {
        if (Platform.OS === 'web') {
            let mutated = false;
            await dbInstance.transaction('rw', dbInstance.customerOrders, async () => {
                for (const row of incoming) {
                    // ✅ FIXED: Explicitly maps snake_case field properties
                    const local = await dbInstance.customerOrders.where('draft_id').equals(row.draft_id).first();
                    const sanitizedItems = row.order_items ? JSON.parse(JSON.stringify(row.order_items)) : [];

                    if (local) {
                        const paymentOrStateChanged =
                            local.status !== row.status ||
                            local.is_paid !== row.is_paid ||
                            local.synced !== "TRUE" ||
                            !local.order_items || local.order_items.length === "true";

                        if (paymentOrStateChanged) {
                            console.log(`💻 [Web DB] [UPDATE] Syncing Order #${row.order_number}`);
                            await dbInstance.customerOrders.update(local.id, {
                                status: row.status,
                                is_paid: row.is_paid,
                                paid_at: row.paid_at,
                                selected_payment_method: row.selected_payment_method,
                                selected_payment_method_title: row.selected_payment_method_title,
                                provider_reference_number: row.provider_reference_number,
                                order_items: sanitizedItems.length > 0 ? sanitizedItems : local.order_items,
                                synced: "TRUE",
                                updated: new Date().toISOString()
                            });
                            mutated = true;
                        }
                    } else {
                        console.log(`💻 [Web DB] [INSERT] Recording fresh order: ${row.order_number}`);
                        await dbInstance.customerOrders.add({ ...row, order_items: sanitizedItems, synced: "TRUE" });
                        mutated = true;
                    }
                }
            });
            return mutated;
        } else {
            try {
                const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
                let local: CustomerOrder[] = data ? JSON.parse(data) : [];
                let mutated = false;

                for (const row of incoming) {
                    // ✅ FIXED: Native array tracking synchronized to use matching snake_case keys
                    const idx = local.findIndex(o => o.draft_id === row.draft_id);
                    const sanitizedItems = row.order_items ? JSON.parse(JSON.stringify(row.order_items)) : [];

                    if (idx !== -1) {
                        const existing = local[idx];
                        const stateChanged =
                            existing.status !== row.status ||
                            existing.is_paid !== row.is_paid ||
                            existing.synced !== "TRUE" ||
                            !existing.order_items || existing.order_items.length === 0;

                        if (stateChanged) {
                            console.log(`📱 [Native Store] [UPDATE] Syncing payment state on record: ${row.draft_id}`);
                            local[idx] = {
                                ...existing,
                                status: row.status,
                                is_paid: row.is_paid,
                                paid_at: row.paid_at,
                                selected_payment_method: row.selected_payment_method,
                                selected_payment_method_title: row.selected_payment_method_title,
                                provider_reference_number: row.provider_reference_number,
                                order_items: sanitizedItems.length > 0 ? sanitizedItems : existing.order_items,
                                synced: "TRUE"
                            };
                            mutated = true;
                        }
                    } else {
                        console.log(`📱 [Native Store] [INSERT] Injecting new order entry: ${row.order_number}`);
                        local.unshift({ ...row, order_items: sanitizedItems, synced: "TRUE" });
                        mutated = true;
                    }
                }

                if (mutated) {
                    await AsyncStorage.setItem(NATIVE_ASYNC_ORDERS_KEY, JSON.stringify(local));
                }
                return mutated;
            } catch (e) {
                console.error("📱 [Native Store] AsyncStorage transaction fail:", e);
                return false;
            }
        }
    }
};
