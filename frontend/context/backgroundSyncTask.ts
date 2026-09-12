import retailersApi from '@/api/retailersApi';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { triggerLocalPushNotification } from './notificationHelper';
const SYNC_TASK_NAME = 'BACKGROUND_OFFLINE_ORDERS_SYNC_TASK';
const LAST_OFFLINE_ALERT_KEY = 'wazipos_last_offline_alert_timestamp';
TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    try {
        const raw = await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload');
        const list = raw ? JSON.parse(raw) : [];
        const unsyncedOrders = list.filter((o: any) => !o.synced);
        if (!unsyncedOrders.length) return BackgroundFetch.BackgroundFetchResult.NoData;
        const netState = await Network.getNetworkStateAsync();
        if (!netState.isConnected) {
            const now = Date.now();
            const lastAlertStr = await SecureStore.getItemAsync(LAST_OFFLINE_ALERT_KEY) || '0';
            if (now - Number(lastAlertStr) >= 60 * 60 * 1000) {
                await SecureStore.setItemAsync(LAST_OFFLINE_ALERT_KEY, String(now));
                await triggerLocalPushNotification("⚠️ Sync Warning Pending", `You have ${unsyncedOrders.length} offline orders. Internet connection is required to sync orders.`);
            }
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }
        console.log(`📡 [BACKGROUND OS TASK] Processing ${unsyncedOrders.length} offline orders...`);
        for (const order of unsyncedOrders) {
            const itemsPayload = (order.customerOrderItems || []).map((item: any) => ({
                retailer_receipt: String(item.retailer_receipt), purchased_quantity: item.purchased_quantity, unit_selling_price: item.unit_selling_price, final_unit_selling_price: item.final_unit_selling_price, item_discount: item.item_discount
            }));
            const endpoint = retailersApi.retailStaffAction({
                action: "CreateCustomerOrder",
                customer_order_details: {
                    city_name: "", customer_name: order.customerName, customer_phone: order.customerPhone, destination_latitude: 0, destination_longitude: 0, draft_id: order.draft_id, farness: "", order_channel: "ANDROID", order_origin: "ANDROID", delivery_method: order.deliveryMethod, shipping_amount: "0.00", payment_method: order.selectedPaymentMethodId, payment_account_number: order.paymentAccountNumber, credit_due_date: order.dueDate, vendor_session_id: null, order_items: itemsPayload
                }
            });
            const res = await fetch(endpoint.url, { method: endpoint.method || 'POST', headers: { 'Content-Type': 'application/json', ...endpoint.headers }, body: JSON.stringify(endpoint.data) });
            const json = await res.json();
            const srv = json?.data?.data || json?.data;
            if (res.ok && !json?.data?.errors) {
                const serverUuid = String(srv?.id || srv?.order_id || srv?.remote_id || srv?.customer_order_details?.id || "");
                const rawFull = await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload');
                const fullList = rawFull ? JSON.parse(rawFull) : [];
                const match = fullList.find((x: any) => x.draft_id === order.draft_id);
                if (match) { match.synced = true; match.remote_id = serverUuid; }
                await SecureStore.setItemAsync('wazipos_secure_customer_orders_payload', JSON.stringify(fullList));
                const stockRaw = await SecureStore.getItemAsync('cached_retailer_receipts');
                if (stockRaw) {
                    const stockList = JSON.parse(stockRaw);
                    for (const item of itemsPayload) {
                        const target = stockList.find((x: any) => String(x.id || x.key) === item.retailer_receipt);
                        if (target) {
                            target.available = Math.max(0, (Number(target.available) || 0) - item.purchased_quantity);
                            target.current_unit_quantity = Math.max(0, (Number(target.current_unit_quantity) || 0) - item.purchased_quantity);
                        }
                    }
                    await SecureStore.setItemAsync('cached_retailer_receipts', JSON.stringify(stockList));
                }
                await triggerLocalPushNotification("⚡ Background Sync Successful", `Offline order #${order.order_number || 'Unknown'} has been pushed and synced remotely.`);
            }
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch { return BackgroundFetch.BackgroundFetchResult.Failed; }
});
export async function registerBackgroundSyncTask() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
        if (!isRegistered) {
            await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, { minimumInterval: 15 * 60, stopOnTerminate: false, startOnBoot: true });
            console.log("✅ [BACKGROUND TASK] Registered hardware fetch thread loop successfully.");
        }
    } catch (e) { console.error("❌ Background register trace failure:", e); }
}
