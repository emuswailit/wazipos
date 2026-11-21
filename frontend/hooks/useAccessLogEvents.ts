// hooks/useAccessLogEvents.ts
//
// Live API requests from ws/authentication/access-logs/ (platform admins only):
//   {"event": "access_logs.created", "logs": [AccessLog, ...]}
// sent in batches as the backend writes them (every couple of seconds at most).
//
// Fail-safe: never connects without a login token, stops on auth close codes
// (4001/4002/4003, 4004 = not an admin), and reconnects with backoff otherwise.

import type { AccessLog } from '@/api/accessLogsApi';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://api.wazipos.co.ke/ws/authentication/access-logs/';
const STOP_CODES = new Set([4001, 4002, 4003, 4004]);
const MAX_BACKOFF_MS = 60_000;

export function useAccessLogEvents(onLogs: (logs: AccessLog[]) => void, enabled = true): { isLive: boolean } {
    const { token } = useAuth() as { token?: string | null };
    const [isLive, setIsLive] = useState(false);
    const handlerRef = useRef(onLogs);
    handlerRef.current = onLogs;

    useEffect(() => {
        if (!token || !enabled) {
            setIsLive(false);
            return;
        }
        let ws: WebSocket | null = null;
        let stopped = false;
        let attempt = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

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
                setIsLive(true);
            };
            ws.onmessage = (msg) => {
                try {
                    const data = JSON.parse(String(msg.data));
                    if (data?.event === 'access_logs.created' && Array.isArray(data.logs) && data.logs.length) {
                        handlerRef.current(data.logs as AccessLog[]);
                    }
                } catch {
                    /* ignore malformed frames */
                }
            };
            ws.onclose = (e) => {
                setIsLive(false);
                if (STOP_CODES.has(e.code)) return;
                schedule();
            };
            ws.onerror = () => {
                /* onclose follows */
            };
        };

        const schedule = () => {
            if (stopped) return;
            const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
            timer = setTimeout(connect, delay);
        };

        connect();
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            if (ws) {
                ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
                try {
                    ws.close();
                } catch {
                    /* already closed */
                }
            }
            setIsLive(false);
        };
    }, [token, enabled]);

    return { isLive };
}
