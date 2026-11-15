// components/common/PendingSyncBanner.tsx
//
// A loud notice that orders were saved on this device while offline and have
// not reached the server yet. They upload by themselves as soon as the
// connection is back (hooks/useOfflineOrderSync); "Sync now" forces a try.
// kind: "customer" (counter orders), "wholesale" (retailer orders made by
// wholesaler staff) or "all".

import { storageService } from '@/components/retailers/customerOrders/storageService';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { uploadPendingCustomerOrders } from '@/services/customerOrderUploader';
import { onPendingOrdersChanged } from '@/services/pendingOrdersSignal';
import { getPendingWholesaleOrders, uploadPendingWholesaleOrders } from '@/services/wholesaleOrderUploader';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type Kind = 'customer' | 'wholesale' | 'all';

export default function PendingSyncBanner({ kind = 'all' }: { kind?: Kind }) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [count, setCount] = useState(0);
    const [firstError, setFirstError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    const refresh = useCallback(async () => {
        let n = 0;
        let err: string | null = null;
        if (kind !== 'wholesale') {
            const pending = await storageService.getPendingOrders().catch(() => [] as any[]);
            n += pending.length;
            err = err ?? (pending.find((o: any) => o?.sync_error)?.sync_error ?? null);
        }
        if (kind !== 'customer') {
            const pending = await getPendingWholesaleOrders();
            n += pending.length;
            err = err ?? (pending.find((o) => o.sync_error)?.sync_error ?? null);
        }
        setCount(n);
        setFirstError(err);
    }, [kind]);

    useEffect(() => {
        void refresh();
        return onPendingOrdersChanged(() => void refresh());
    }, [refresh]);

    const syncNow = async () => {
        setSyncing(true);
        try {
            if (kind !== 'wholesale') await uploadPendingCustomerOrders();
            if (kind !== 'customer') await uploadPendingWholesaleOrders();
        } finally {
            setSyncing(false);
            void refresh();
        }
    };

    if (count === 0) return null;

    const tone = firstError && isOnline ? '#e11d48' : '#d97706';
    return (
        <View
            accessibilityRole="alert"
            className="w-full rounded-2xl px-4 py-3 mb-3 flex-row items-center"
            style={{ backgroundColor: `${tone}18`, borderWidth: 2, borderColor: tone, gap: 12 }}
        >
            <Ionicons name={isOnline ? 'cloud-upload' : 'cloud-offline'} size={26} color={tone} />
            <View className="flex-1 min-w-0" style={{ gap: 2 }}>
                <Text style={{ color: tone, fontFamily: theme.font.bold, fontSize: 14.5 }}>
                    {count} order{count === 1 ? '' : 's'} waiting to sync
                </Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    {isOnline
                        ? firstError
                            ? `The server refused one: ${firstError}`
                            : 'Saved while offline — sending them to the server now.'
                        : "You're offline. These cash orders are saved on this device and will sync automatically when the connection is back. Don't clear the app's data."}
                </Text>
            </View>
            {isOnline ? (
                <Pressable
                    onPress={syncNow}
                    disabled={syncing}
                    className="flex-row items-center gap-1.5 px-3 h-9 rounded-xl"
                    style={{ backgroundColor: tone, opacity: syncing ? 0.6 : 1 }}
                >
                    {syncing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sync" size={15} color="#fff" />}
                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12.5 }}>Sync now</Text>
                </Pressable>
            ) : null}
        </View>
    );
}
