// @/utils/notify.ts

import { Alert, Platform } from 'react-native';

export type NotifyKind = 'success' | 'error' | 'info';

export function notify(
    title: string,
    message: string,
    kind: NotifyKind = 'info'
) {
    if (Platform.OS === 'web') {
        if (typeof window === 'undefined') {
            console.log(`[NOTIFY:${kind}] ${title} — ${message}`);
            return;
        }
        // Prefer a modal alert; fall back to confirm/alert.
        if (typeof window.alert === 'function') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY:${kind}] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

export function notifySuccess(title: string, message: string) {
    notify(title, message, 'success');
}

export function notifyError(title: string, message: string) {
    notify(title, message, 'error');
}