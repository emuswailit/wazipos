// components/common/LiveAlertsHost.tsx
//
// Web: shows live alerts (hooks/useLiveAlerts.ts) — new orders, payments received,
// payouts — with the shared LiveAlertBanner, one at a time, newest first. Phones show
// them as local notifications instead, so this renders nothing there.

import { LiveAlertBanner, type LiveAlert as Banner } from '@/components/common/LiveAlertBanner';
import { onLiveAlert } from '@/hooks/useLiveAlerts';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { routeForAlert } from '@/hooks/usePushRegistration';

const ICONS: Record<string, Banner['icon']> = {
    order: 'cube',
    customer_order: 'bag-handle',
    food_order: 'restaurant',
    payment: 'cash',
    payout: 'wallet',
    room_booking: 'bed',
};

export default function LiveAlertsHost() {
    const [queue, setQueue] = useState<Banner[]>([]);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        return onLiveAlert((a) => {
            const to = routeForAlert(a.data);
            setQueue((q) => [
                ...q,
                {
                    id: a.id,
                    title: a.title,
                    message: a.body,
                    icon: ICONS[String(a.data?.type)] ?? 'notifications',
                    onPress: to ? () => router.push(to as any) : undefined,
                },
            ].slice(-5));
        });
    }, []);

    const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
    if (Platform.OS !== 'web') return null;
    return <LiveAlertBanner alert={queue[0] ?? null} onDismiss={dismiss} />;
}
