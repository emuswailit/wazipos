// hooks/useOfflineOrderSync.tsx
//
// Uploads customer orders created offline, whenever the device is online:
//   - when the app starts,
//   - as soon as the connection comes back,
//   - every 2 minutes while online (retries orders the server rejected earlier).
//
// The actual work is in services/customerOrderUploader.ts, shared with
// CustomerOrdersSyncContext and the native background task (one run at a time).
// Stock is not touched here: the server deducts it when the order is created and
// InventorySyncContext picks the change up.

import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { uploadPendingCustomerOrders, type UploadSummary } from '@/services/customerOrderUploader';
import { useCallback, useEffect, useRef, useState } from 'react';

const RETRY_INTERVAL_MS = 2 * 60 * 1000;

export function useOfflineOrderSync() {
    const { isOnline } = useNetworkStatus();
    const [isCurrentlySyncing, setIsCurrentlySyncing] = useState(false);
    const [lastSummary, setLastSummary] = useState<UploadSummary | null>(null);
    const mountedRef = useRef(true);

    const forceManualSyncTrigger = useCallback(async () => {
        setIsCurrentlySyncing(true);
        try {
            const summary = await uploadPendingCustomerOrders();
            if (mountedRef.current) setLastSummary(summary);
            if (__DEV__ && (summary.uploaded || summary.failed)) {
                console.log('[useOfflineOrderSync]', summary);
            }
            return summary;
        } catch (e) {
            console.warn('[useOfflineOrderSync] upload failed:', e);
            return null;
        } finally {
            if (mountedRef.current) setIsCurrentlySyncing(false);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Upload on start and whenever we come back online; retry periodically while online.
    useEffect(() => {
        if (!isOnline) return;
        forceManualSyncTrigger();
        const timer = setInterval(forceManualSyncTrigger, RETRY_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [isOnline, forceManualSyncTrigger]);

    return { forceManualSyncTrigger, isCurrentlySyncing, lastSummary };
}
