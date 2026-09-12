import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { CustomerOrder } from '@/databases/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { triggerLocalPushNotification } from './notificationHelper';
import { OrderLineItem } from './types';
import { useInventoryAdjustment } from './useInventoryAdjustment';

const [KEY_ORDERS, KEY_LINES] = ['wazipos_customer_orders_payload', 'local_active_checkout_lines'];
const isWeb = Platform.OS === 'web';

export function useOrderPersistence(submitOrderApi?: any, triggerManualFetch?: () => Promise<void>) {
    const { isOnline } = useNetworkStatus();
    const { deductLocalInventoryStock } = useInventoryAdjustment(triggerManualFetch);
    const lastReminder = useRef(0);

    const getNativeOrders = async () => {
        const raw = await AsyncStorage.getItem(KEY_ORDERS);
        return raw ? JSON.parse(raw) : [];
    };

    const hydrateCachedDatabaseRows = async (setLineItems: (lines: OrderLineItem[]) => void) => {
        try {
            const raw = isWeb ? await dbInstance.lineItems.toArray() : await AsyncStorage.getItem(KEY_LINES).then(r => r ? JSON.parse(r) : []);
            if (raw?.length) setLineItems(raw.map((i: any) => ({ ...i, id: String(i.id), quantity: Number(i.quantity) || 1, price: Number(i.price) || 0, discount: Number(i.discount) || 0 })));
        } catch (e) { console.error(e); }
    };

    const saveLinesToStorage = async (nextLines: OrderLineItem[]) => {
        try {
            if (isWeb) {
                await dbInstance.lineItems.clear();
                await dbInstance.lineItems.bulkPut(nextLines.map(i => ({ ...i, id: String(i.id) })));
            } else {
                await AsyncStorage.setItem(KEY_LINES, JSON.stringify(nextLines));
            }
        } catch (e) { console.error(e); }
    };

    const persistFinalCustomerOrder = async (finalOrder: CustomerOrder, draftId: string) => {
        try {
            const payload = { ...finalOrder, synced: finalOrder.synced ? "TRUE" : "FALSE" };
            if (isWeb) {
                delete (payload as any).id;
                await dbInstance.customerOrders.add(payload);
            } else {
                const list = await getNativeOrders();
                const filtered = list.filter((i: any) => i.draft_id !== draftId);
                filtered.push(payload);
                await AsyncStorage.setItem(KEY_ORDERS, JSON.stringify(filtered));
            }
        } catch (e) { console.error(e); }
    };

    const clearStorageActiveLines = async () => {
        isWeb ? await dbInstance.lineItems.clear() : await AsyncStorage.removeItem(KEY_LINES);
    };

    const forceImmediateSyncQueuePass = async () => {
        try {
            if (!isOnline) return;
            const unsynced = isWeb ? await dbInstance.customerOrders.where('synced').equals("FALSE").toArray() : (await getNativeOrders()).filter((o: any) => o.synced === "FALSE");
            if (!unsynced.length) return;

            for (const order of unsynced) {
                const itemsPayload = (order.customerOrderItems || []).map((i: any) => ({ retailer_receipt: String(i.retailer_receipt), purchased_quantity: i.purchased_quantity, unit_selling_price: i.unit_selling_price, final_unit_selling_price: i.final_unit_selling_price, item_discount: i.item_discount }));
                const res = await submitOrderApi.request({
                    action: "CreateCustomerOrder",
                    customer_order_details: {
                        city_name: "", customer_name: order.customerName, customer_phone: order.customerPhone, destination_latitude: 0, destination_longitude: 0, draft_id: order.draft_id, farness: "", order_channel: isWeb ? "WEB" : "ANDROID", order_origin: isWeb ? "WEB" : Platform.OS.toUpperCase(), delivery_method: order.deliveryMethod, shipping_amount: "0.00", payment_method: order.selectedPaymentMethodId, payment_account_number: order.paymentAccountNumber, credit_due_date: order.dueDate, vendor_session_id: null, order_items: itemsPayload
                    }
                });
                if (res?.ok && !res?.data?.errors) {
                    const serverUuid = String(res?.data?.data?.id || res?.data?.id || "");
                    await deductLocalInventoryStock(itemsPayload);
                    if (isWeb) {
                        const target = await dbInstance.customerOrders.where('draft_id').equals(order.draft_id).first();
                        if (target) await dbInstance.customerOrders.update(target.id, { synced: "TRUE", remote_id: serverUuid });
                    } else {
                        const fullList = await getNativeOrders();
                        const match = fullList.find((x: any) => x.draft_id === order.draft_id);
                        if (match) { match.synced = "TRUE"; match.remote_id = serverUuid; }
                        await AsyncStorage.setItem(KEY_ORDERS, JSON.stringify(fullList));
                    }
                    if (triggerManualFetch) await triggerManualFetch();
                }
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        let isMounted = true;
        if (!isOnline) {
            (async () => {
                const unsynced = isWeb ? (dbInstance?.customerOrders ? await dbInstance.customerOrders.where('synced').equals("FALSE").toArray() : []) : (await getNativeOrders()).filter((o: any) => o.synced === "FALSE");
                if (isMounted && unsynced.length && Date.now() - lastReminder.current > 15 * 60 * 1000) {
                    await triggerLocalPushNotification("Unsynced Orders Pending", `You have ${unsynced.length} orders waiting to save online.`);
                    lastReminder.current = Date.now();
                }
            })();
        }
        return () => { isMounted = false; };
    }, [isOnline]);

    return { hydrateCachedDatabaseRows, saveLinesToStorage, persistFinalCustomerOrder, clearStorageActiveLines, forceImmediateSyncQueuePass };
}
