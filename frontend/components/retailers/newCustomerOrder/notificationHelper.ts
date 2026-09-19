// context/notificationHelper.ts

import { Platform } from 'react-native';

/* ---------------------------------------------------------
 * Environment detection
 * ------------------------------------------------------- */

const isWeb = Platform.OS === 'web';

/*
 * Expo Go detection.
 *
 * Expo Go sets `Constants.appOwnership === 'expo'`.
 * Standalone / dev-client builds set it to 'standalone'.
 *
 * Wrapped in try/catch so we don't blow up if
 * expo-constants isn't installed for some reason.
 */
let isExpoGo = false;

if (!isWeb) {
    try {
        const Constants = require('expo-constants');
        const ownership =
            Constants?.default?.appOwnership ??
            Constants?.appOwnership;
        isExpoGo = ownership === 'expo';
    } catch {
        // expo-constants not installed — assume dev-client
        isExpoGo = false;
    }
}

/* ---------------------------------------------------------
 * Load expo-notifications ONLY when it's safe.
 *
 * Skip entirely on:
 *   - web
 *   - Expo Go (SDK 53+ removed notification support)
 *
 * This prevents the "Cannot find native module
 * 'ExpoPushTokenManager'" crash and any related require
 * failures.
 * ------------------------------------------------------- */

let Notifications: any = null;

if (!isWeb && !isExpoGo) {
    try {
        Notifications = require('expo-notifications');
    } catch {
        // Native module missing — silently disable.
        // No console.error: this is an expected condition
        // in some environments.
        Notifications = null;
    }
}

/* ---------------------------------------------------------
 * Foreground handler — only when the module is usable.
 * ------------------------------------------------------- */

if (Notifications && !isWeb && !__DEV__) {
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });
    } catch {
        // Some environments implement the module but not
        // the handler — ignore.
    }
}

/* ---------------------------------------------------------
 * Public API — safe to call from anywhere.
 * ------------------------------------------------------- */

export async function triggerLocalPushNotification(
    title: string,
    body: string
) {
    /*
     * Skip in development to avoid noise during hot reload.
     */
    if (__DEV__) return;

    try {
        /* ---------- WEB ---------- */
        if (isWeb) {
            if (
                typeof window !== 'undefined' &&
                'Notification' in window
            ) {
                if (
                    Notification.permission === 'granted'
                ) {
                    new Notification(title, { body });
                } else if (
                    Notification.permission !== 'denied'
                ) {
                    const perm =
                        await Notification.requestPermission();
                    if (perm === 'granted') {
                        new Notification(title, {
                            body,
                        });
                    }
                }
            }
            return;
        }

        /* ---------- NATIVE ---------- */

        /*
         * Module not available (Expo Go, missing native
         * module, or failed require) → silent no-op.
         */
        if (!Notifications) return;

        const { status } =
            await Notifications.getPermissionsAsync();

        let finalStatus = status;

        if (status !== 'granted') {
            const { status: askStatus } =
                await Notifications.requestPermissionsAsync();
            finalStatus = askStatus;
        }

        if (finalStatus !== 'granted') return;

        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
            },
            trigger: null,
        });
    } catch {
        // Any error during the notification call itself
        // (permission revocation, module unavailability,
        // etc.) is non-fatal — swallow it.
    }
}

/* ---------------------------------------------------------
 * Optional helper so callers can decide whether to even
 * bother prompting.
 * ------------------------------------------------------- */

export function isNotificationsAvailable(): boolean {
    return isWeb || !!Notifications;
}

export default {
    triggerLocalPushNotification,
    isNotificationsAvailable,
};