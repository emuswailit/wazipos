import retailersApi from '@/api/retailersApi';
import { db, dbInstance } from '@/databases/db';
import { useApi } from '@/hooks/useApi';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
export function useOfflineOrderSync() {
    const submitOrderApi = useApi(retailersApi.retailStaffAction);
    const getInventoryApi = useApi(retailersApi.retailerInventoryAction);
    const isSyncingRef = useRef(false);
    const executeSyncAndRefreshPipeline = useCallback(async () => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        try {
            let rawOrdersData: any[] = [];
            if (Platform.OS === 'web') {
                if (dbInstance?.customerOrders) rawOrdersData = await dbInstance.customerOrders.toArray();
            } else {
                rawOrdersData = JSON.parse(await SecureStore.getItemAsync('wazipos_secure_customer_orders_payload') || '[]');
            }
            const pendingOrders = Array.isArray(rawOrdersData) ? rawOrdersData.filter((o: any) => o.status === 'CLOSED' && (o.synced === "FALSE" || o.synced === false || o.synced === 0)) : [];
            if (pendingOrders.length > 0) {
                for (const order of pendingOrders) {
                    const payload = {
                        action: "CreateCustomerOrder",
                        customer_order_details: {
                            city_name: "", customer_name: order.customerName, customer_phone: order.customerPhone, destination_latitude: 0, destination_longitude: 0, draft_id: order.draftId || order.draft_id, farness: "", order_channel: Platform.OS === 'web' ? "WEB" : "ANDROID", order_origin: Platform.OS === 'web' ? "WEB" : Platform.OS.toUpperCase(), delivery_method: order.deliveryMethod, shipping_amount: String(order.shippingCost || "0.00"), payment_method: order.selectedPaymentMethodId, payment_account_number: order.paymentAccountNumber, credit_due_date: order.dueDate, vendor_session_id: order.vendor_session_id, order_items: order.customerOrderItems
                        }
                    };
                    const res = await submitOrderApi.request(payload);
                    const srv = res?.data?.data || res?.data;
                    const rNum = srv?.order_number || srv?.customer_order_details?.order_number || "";
                    if (res?.ok || res?.status === 200 || res?.status === 201) {
                        const serverUuid = String(srv?.id || srv?.order_id || srv?.remote_id || srv?.customer_order_details?.id || "");
                        order.synced = "TRUE"; order.order_number = String(rNum); order.remote_id = serverUuid; order.updatedAt = new Date().toISOString();
                        if (Platform.OS === 'web') {
                            if (dbInstance?.customerOrders) await dbInstance.customerOrders.put(order);
                        } else {
                            const updatedPayloadList = rawOrdersData.map((o: any) => (o.draft_id === order.draft_id || o.draftId === order.draftId) ? { ...o, synced: "TRUE", order_number: String(rNum), remote_id: serverUuid, updatedAt: order.updatedAt } : o);
                            await SecureStore.setItemAsync('wazipos_secure_customer_orders_payload', JSON.stringify(updatedPayloadList));
                        }
                    }
                }
            }
            const stockRes = await getInventoryApi.request({ action: "RetrieveInventoryStock" });
            const freshStocks = stockRes?.data?.results || stockRes?.data;
            if (stockRes?.ok && Array.isArray(freshStocks)) {
                if (Platform.OS === 'web') {
                    if (dbInstance?.retailerReceipts) {
                        await dbInstance.retailerReceipts.clear();
                        await dbInstance.retailerReceipts.bulkPut(freshStocks);
                    }
                } else {
                    await SecureStore.setItemAsync('cached_retailer_receipts', JSON.stringify(freshStocks));
                }
                if (db?.saveRetailerReceipts) await db.saveRetailerReceipts(freshStocks);
            }
        } catch (error) { console.log("Sync worker anomaly trace:", error); }
        finally { isSyncingRef.current = false; }
    }, [submitOrderApi, getInventoryApi]);
    useEffect(() => {
        if (Platform.OS === 'web') {
            const handleWebOnline = () => navigator.onLine && executeSyncAndRefreshPipeline();
            window.addEventListener('online', handleWebOnline);
            if (navigator.onLine) executeSyncAndRefreshPipeline();
            return () => window.removeEventListener('online', handleWebOnline);
        } else {
            const nativeTimerId = setInterval(async () => {
                const state = await Network.getNetworkStateAsync();
                if (state.isConnected && state.isInternetReachable) await executeSyncAndRefreshPipeline();
            }, 45000);
            return () => clearInterval(nativeTimerId);
        }
    }, [executeSyncAndRefreshPipeline]);
    return { forceManualSyncTrigger: executeSyncAndRefreshPipeline, isCurrentlySyncing: submitOrderApi.loading || getInventoryApi.loading };
}
