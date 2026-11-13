// hooks/usePrescriptionEvents.ts
//
// Live prescription events from ws/retailers/prescriptions/events/:
//   prescription.quoted              → to the customer when a pharmacy sends its quotation
//   prescription.quotation_requested → to a pharmacy's staff when a prescription is sent to it
//   prescription.digitized  → to the customer (and the pharmacy's other staff)
// Each event carries the full serialized prescription.
//
// Fail-safe: never connects without a login token, stops on auth close codes
// (4001/4002/4003), and reconnects with backoff otherwise.

import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://api.wazipos.co.ke/ws/retailers/prescriptions/events/';
const AUTH_CLOSE_CODES = new Set([4001, 4002, 4003]);
const MAX_BACKOFF_MS = 60_000;

type PrescriptionEventName = 'prescription.digitized' | 'prescription.quoted' | 'prescription.quotation_requested' | 'prescription.dispensed';

const EVENT_NAMES = new Set<string>(['prescription.digitized', 'prescription.quoted', 'prescription.quotation_requested', 'prescription.dispensed']);

interface PrescriptionEvent {
    event: PrescriptionEventName;
    prescription: any;
}

export function usePrescriptionEvents(onEvent: (e: PrescriptionEvent) => void): { isLive: boolean } {
    const { token } = useAuth() as { token?: string | null };
    const [isLive, setIsLive] = useState(false);
    const handlerRef = useRef(onEvent);
    handlerRef.current = onEvent;

    useEffect(() => {
        if (!token) {
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
                    if (EVENT_NAMES.has(data?.event) && data.prescription) {
                        handlerRef.current(data as PrescriptionEvent);
                    }
                } catch {
                    /* ignore malformed frames */
                }
            };
            ws.onclose = (e) => {
                setIsLive(false);
                if (AUTH_CLOSE_CODES.has(e.code)) return; // not logged in / token expired: wait for a new token
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
    }, [token]);

    return { isLive };
}
