// hooks/useWifiPaymentsLive.ts — live WiFi payments: ws/wifi/payments/?token=<jwt>
//
// The server (backend wifi/payments.py) confirms every package payment, connects
// the device and pays the hotspot owner's payout account; this socket pushes each
// change as it happens (status, connected, payout DUE -> PROCESSING -> PAID).
// Returns the payments merged over `base` (the cached REST list), newest first,
// plus whether the socket is up and a `recheck` to ask the gateway about one now.

import type { WifiPayment } from '@/api/wifiApi';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

const WS_URL = 'wss://api.wazipos.co.ke/ws/wifi/payments/';
const STOP_CODES = new Set([4001, 4002, 4003, 4403]);
const MAX_BACKOFF_MS = 60_000;
const PING_MS = 30_000;

export function useWifiPaymentsLive(base: WifiPayment[], enabled: boolean) {
    const { token } = useAuth() as { token?: string | null };
    const [live, setLive] = useState<Record<string, WifiPayment>>({});
    const [connected, setConnected] = useState(false);
    const sock = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!enabled || !token) return;
        let stopped = false;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let ping: ReturnType<typeof setInterval> | null = null;
        let backoff = 2000;

        const merge = (rows: WifiPayment[]) =>
            setLive((cur) => {
                const next = { ...cur };
                for (const r of rows) if (r?.id) next[r.id] = { ...(next[r.id] ?? {}), ...r };
                return next;
            });

        const open = () => {
            if (stopped) return;
            console.log('[wifi-live] connecting', WS_URL);
            const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
            sock.current = ws;
            ws.onopen = () => {
                console.log('[wifi-live] connected');
                backoff = 2000;
                setConnected(true);
                ping = setInterval(() => {
                    try {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    } catch {
                        /* reconnect handles it */
                    }
                }, PING_MS);
            };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(String(e.data));
                    console.log('[wifi-live]', msg.event, msg.event === 'wifi.snapshot' ? `${(msg.payments ?? []).length} payments` : msg.payment?.status ?? msg.message ?? '');
                    if (msg.event === 'wifi.snapshot') merge(msg.payments ?? []);
                    else if (msg.event === 'wifi.payment' && msg.payment) merge([msg.payment]);
                } catch (err) {
                    console.warn('[wifi-live] bad frame', err, String(e.data).slice(0, 200));
                }
            };
            ws.onclose = (e) => {
                console.warn('[wifi-live] closed', { code: e.code, reason: e.reason, retryInMs: STOP_CODES.has(e.code) ? null : backoff },
                    e.code === 4001 ? 'not signed in' : e.code === 4403 ? 'not an admin of this business' : '');
                setConnected(false);
                if (ping) clearInterval(ping);
                sock.current = null;
                if (stopped || STOP_CODES.has(e.code)) return;
                retry = setTimeout(open, backoff);
                backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
            };
            ws.onerror = (err) => {
                console.warn('[wifi-live] socket error', (err as any)?.message ?? err);
                try {
                    ws.close();
                } catch {
                    /* closed already */
                }
            };
        };

        open();
        // Back in front: reconnect at once rather than waiting out the backoff.
        const app = AppState.addEventListener('change', (s) => {
            if (s === 'active' && !sock.current && !stopped) {
                if (retry) clearTimeout(retry);
                backoff = 2000;
                open();
            }
        });
        return () => {
            stopped = true;
            app.remove();
            if (retry) clearTimeout(retry);
            if (ping) clearInterval(ping);
            sock.current?.close();
            sock.current = null;
            setConnected(false);
        };
    }, [enabled, token]);

    const items = useMemo(() => {
        const byId: Record<string, WifiPayment> = {};
        for (const p of base) byId[p.id] = p;
        for (const [id, p] of Object.entries(live)) byId[id] = { ...(byId[id] ?? {}), ...p };
        return Object.values(byId).sort((a, b) => String(b.created).localeCompare(String(a.created)));
    }, [base, live]);

    /** Over the socket when it's up (the reply arrives as a live update). Returns false when it isn't. */
    const recheck = (id: string) => {
        const ws = sock.current;
        if (!ws || ws.readyState !== 1) return false;
        ws.send(JSON.stringify({ type: 'recheck', payment_id: id }));
        return true;
    };

    return { items, connected, recheck };
}
