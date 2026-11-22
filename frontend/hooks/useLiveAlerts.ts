// hooks/useLiveAlerts.ts
//
// Live alerts while the app is connected: ws/notifications/alerts/?token=<jwt>
// (backend notifications/consumers.py). Every order / payment / payout message the
// backend emails, texts or pushes (core/notify.py) also arrives here instantly:
//   phones: shown as a local notification (no Google involved);
//   web:    shown as a banner (components/common/LiveAlertsHost.tsx).
// While this socket is live and the app is in front, the matching Expo/Google push
// is hidden (hooks/usePushRegistration.ts), so nobody is alerted twice. When the app
// is closed, the push is what arrives.
//
// Reconnects with backoff; stops on auth close codes (4001-4003); keep-alive ping.

import { useAuth } from '@/context/AuthContext';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

const WS_URL = 'wss://api.wazipos.co.ke/ws/notifications/alerts/';
const STOP_CODES = new Set([4001, 4002, 4003]);
const MAX_BACKOFF_MS = 60_000;
const PING_MS = 30_000;
const NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

export interface LiveAlert {
    id: string;
    title: string;
    body: string;
    lines: string[];
    data: Record<string, any>;
    created: string;
}

/** Shared state: is the alerts socket up right now (read by the push handler). */
export const liveAlerts = {
    connected: false,
    seen: new Set<string>(),
    listeners: new Set<(a: LiveAlert) => void>(),
};

/** The app is in front and getting live alerts: pushes would be duplicates. */
export function liveAlertsActive() {
    return liveAlerts.connected && AppState.currentState === 'active';
}

export function onLiveAlert(fn: (a: LiveAlert) => void) {
    liveAlerts.listeners.add(fn);
    return () => {
        liveAlerts.listeners.delete(fn);
    };
}

async function show(alert: LiveAlert) {
    if (liveAlerts.seen.has(alert.id)) return;
    liveAlerts.seen.add(alert.id);
    if (liveAlerts.seen.size > 200) liveAlerts.seen.clear();
    liveAlerts.listeners.forEach((fn) => {
        try {
            fn(alert);
        } catch {
            /* a broken listener never stops the others */
        }
    });
    if (NATIVE) {
        try {
            await Notifications.scheduleNotificationAsync({
                content: { title: alert.title, body: alert.body, data: { ...alert.data, source: 'live', alertId: alert.id } },
                trigger: null,
            });
        } catch (e) {
            console.warn('[alerts] local notification failed', e);
        }
    }
}

/** Keep the live alerts socket open while someone is signed in (call once, high in the app). */
export function useLiveAlerts() {
    const { token } = useAuth() as { token?: string | null };

    useEffect(() => {
        if (!token) {
            liveAlerts.connected = false;
            return;
        }
        let ws: WebSocket | null = null;
        let stopped = false;
        let attempt = 0;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let ping: ReturnType<typeof setInterval> | null = null;

        const schedule = () => {
            if (stopped) return;
            const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
            retry = setTimeout(connect, wait);
        };
        const connect = () => {
            if (stopped) return;
            try {
                ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
            } catch {
                schedule();
                return;
            }
            ws.onopen = () => {
                attempt = 0;
                liveAlerts.connected = true;
                ping = setInterval(() => {
                    try {
                        ws?.send(JSON.stringify({ type: 'ping' }));
                    } catch {
                        /* closed */
                    }
                }, PING_MS);
            };
            ws.onmessage = (msg) => {
                try {
                    const data = JSON.parse(String(msg.data));
                    if (data?.event === 'alert' && data.alert?.id) void show(data.alert as LiveAlert);
                } catch {
                    /* ignore malformed frames */
                }
            };
            ws.onclose = (e) => {
                liveAlerts.connected = false;
                if (ping) clearInterval(ping);
                ping = null;
                if (STOP_CODES.has(e.code)) return;
                schedule();
            };
            ws.onerror = () => {
                try {
                    ws?.close();
                } catch {
                    /* already closed */
                }
            };
        };

        // Phones: reconnect at once when the app comes back to the front.
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active' && !liveAlerts.connected && !stopped) {
                if (retry) clearTimeout(retry);
                attempt = 0;
                connect();
            }
        });

        connect();
        return () => {
            stopped = true;
            liveAlerts.connected = false;
            sub.remove();
            if (retry) clearTimeout(retry);
            if (ping) clearInterval(ping);
            try {
                ws?.close();
            } catch {
                /* already closed */
            }
        };
    }, [token]);
}
