// hooks/usePushRegistration.ts
//
// Native builds (not web, not Expo Go on Android — remote push needs a development or
// production build from SDK 53): once someone is signed in, ask for notification
// permission, get this device's Expo push token and save it to their account
// (POST /users/me/push-token). The backend then sends order, payment and payout
// notices to it (backend notifications/signals.py). On sign-out the token is removed
// so the next person on this phone doesn't get the previous account's messages.
//
// Expo SDK 57 (docs.expo.dev/versions/v57.0.0/sdk/notifications):
//   - Android: create the notification channel BEFORE asking for permission / the token
//     (Android 13 shows the permission prompt only once a channel exists);
//   - getExpoPushTokenAsync({ projectId }) with the EAS project id;
//   - setNotificationHandler with shouldShowBanner / shouldShowList (shouldShowAlert is deprecated).

import usersApi from '@/api/usersApi';
import { liveAlertsActive } from '@/hooks/useLiveAlerts';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/** Where a notice should open the app (data.type from the backend, notifications/signals.py). */
export function routeForAlert(data: Record<string, any> | undefined | null): string | null {
    switch (String(data?.type || '')) {
        case 'payout':
            return '/orderPayouts?tab=orderPayouts';
        case 'customer_order':
            return '/customerOrders?tab=customerOrders';
        case 'food_order':
        case 'room_booking':
        case 'order':
        case 'payment':
            return '/(tabs)';
        default:
            return null;
    }
}

if (NATIVE) {
    // In front: live alerts (websocket, hooks/useLiveAlerts.ts) already show each notice,
    // so the matching Expo/Google push is hidden to avoid a double alert. Notices raised
    // by the live alerts themselves (source "live") and pushes while the socket is down
    // are shown.
    Notifications.setNotificationHandler({
        handleNotification: async (n) => {
            const live = (n.request.content.data as any)?.source === 'live';
            const show = live || !liveAlertsActive();
            return { shouldPlaySound: show, shouldSetBadge: false, shouldShowBanner: show, shouldShowList: show };
        },
    });
}

async function deviceToken(): Promise<string | null> {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Orders, payments and payouts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2a6ff3',
        });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = (Constants?.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any)?.easConfig?.projectId;
    if (!projectId) {
        console.warn('[push] No EAS projectId; cannot get a push token');
        return null;
    }
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Tapping a notice (push or live) opens the screen it is about. */
export function useNotificationTaps() {
    useEffect(() => {
        if (!NATIVE) return;
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const to = routeForAlert(response.notification.request.content.data as any);
            if (to) router.push(to as any);
        });
        return () => sub.remove();
    }, []);
}

/** Register this device for the signed-in user (call once, high in the app). */
export function usePushRegistration(user: { id?: string; notification_token?: string } | null) {
    const registeredFor = useRef<string | null>(null);
    const lastToken = useRef<string | null>(null);

    useEffect(() => {
        if (!NATIVE) return;
        const userId = user?.id ? String(user.id) : null;

        // Signed out: the token was already removed by logout() while the session was valid.
        if (!userId) {
            registeredFor.current = null;
            return;
        }
        if (registeredFor.current === userId) return;

        let alive = true;
        (async () => {
            // The token request is a network call: retry a few times when offline.
            for (let attempt = 0; attempt < 3 && alive; attempt++) {
                try {
                    const token = await deviceToken();
                    if (!token || !alive) return;
                    lastToken.current = token;
                    if (token !== user?.notification_token) {
                        const res: any = await usersApi.updateNotificationToken(token);
                        if (!res?.ok) throw new Error(res?.problem || 'save failed');
                    }
                    registeredFor.current = userId;
                    return;
                } catch (e: any) {
                    console.warn('[push] registration failed', e?.message || e);
                    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
                }
            }
        })();
        return () => {
            alive = false;
        };
    }, [user?.id, user?.notification_token]);
}
