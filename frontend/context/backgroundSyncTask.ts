// context/backgroundSyncTask.ts
//
// Native background task: uploads customer orders created offline while the app is in
// the background. Uses the same uploader as the foreground (services/customerOrderUploader).

import { storageService } from '@/components/retailers/customerOrders/storageService';
import { uploadPendingCustomerOrders } from '@/services/customerOrderUploader';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { triggerLocalPushNotification } from './notificationHelper';

const SYNC_TASK_NAME = 'BACKGROUND_OFFLINE_ORDERS_SYNC_TASK';
const LAST_OFFLINE_ALERT_KEY = 'wazipos_last_offline_alert_timestamp';

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    try {
        const pending = await storageService.getPendingOrders();
        if (!pending.length) return BackgroundFetch.BackgroundFetchResult.NoData;

        const netState = await Network.getNetworkStateAsync();
        if (!netState.isConnected) {
            // Remind at most once an hour that orders are waiting for a connection.
            const now = Date.now();
            const lastAlert = Number((await SecureStore.getItemAsync(LAST_OFFLINE_ALERT_KEY)) || '0');
            if (now - lastAlert >= 60 * 60 * 1000) {
                await SecureStore.setItemAsync(LAST_OFFLINE_ALERT_KEY, String(now));
                await triggerLocalPushNotification(
                    '⚠️ Orders waiting to sync',
                    `You have ${pending.length} order(s) saved offline. They will upload when you're back online.`
                );
            }
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const summary = await uploadPendingCustomerOrders();
        if (summary.uploaded > 0) {
            await triggerLocalPushNotification(
                '⚡ Offline orders synced',
                `${summary.uploaded} order(s) uploaded.${summary.remaining ? ` ${summary.remaining} still waiting.` : ''}`
            );
        }
        return summary.uploaded > 0
            ? BackgroundFetch.BackgroundFetchResult.NewData
            : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
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
