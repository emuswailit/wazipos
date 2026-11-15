// services/diningOutbox.ts
//
// Offline-first for restaurant staff (bar and supplies). Every write carries a
// draft_id. Online, it's sent straight away; offline (or if the network drops),
// it's kept on the device and sent when the connection is back — the backend
// ignores a draft_id it has already applied, so retries are safe. A write the
// server refuses stays in the outbox with the reason (shown in the banner).
//
// Also a tiny per-restaurant cache so the bar and stock screens open offline.

import diningApi from '@/api/diningApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { notifyPendingOrdersChanged } from './pendingOrdersSignal';

const KEY = 'wazipos_dining_outbox';
const NETWORK = ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'CONNECTION_ERROR', 'SERVER_ERROR'];

export interface OutboxEntry {
    draft_id: string;
    action: string;
    payload: Record<string, any>;
    label: string;
    created: string;
    error?: string | null;
}

export const newDraftId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function readAll(): Promise<OutboxEntry[]> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

async function writeAll(list: OutboxEntry[]) {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
    notifyPendingOrdersChanged();
}

export const getDiningOutbox = readAll;

const isNetworkFailure = (res: any) => !res || NETWORK.includes(res.problem) || res.status === 401;
const isAccepted = (res: any) => !!res?.ok && String(res?.data?.response_code) === '0';
const errorOf = (res: any) => {
    const e = res?.data?.errors;
    return (Array.isArray(e) && e.join(' ')) || res?.data?.response_message || `Refused (HTTP ${res?.status ?? '?'})`;
};

/**
 * Send a write now, or keep it for later.
 * Returns { ok, queued, res, error }: queued = saved on the device to send later.
 */
export async function submitDining(action: string, payload: Record<string, any>, label: string, online: boolean) {
    const body = { ...payload, draft_id: payload.draft_id || newDraftId() };
    const queue = async () => {
        const list = await readAll();
        if (!list.some((e) => e.draft_id === body.draft_id)) list.push({ draft_id: body.draft_id, action, payload: body, label, created: new Date().toISOString() });
        await writeAll(list);
        return { ok: true, queued: true, res: null as any, error: null as string | null };
    };
    if (!online) return queue();
    const res: any = await diningApi.write(action, body).catch(() => null);
    if (isNetworkFailure(res)) return queue();
    if (isAccepted(res)) return { ok: true, queued: false, res, error: null };
    return { ok: false, queued: false, res, error: errorOf(res) };
}

let running: Promise<{ sent: number; failed: number; remaining: number }> | null = null;

/** Send everything waiting (in order). Concurrent calls share one run. */
export function flushDiningOutbox() {
    if (!running) {
        running = (async () => {
            const list = await readAll();
            if (!list.length) return { sent: 0, failed: 0, remaining: 0 };
            const done = new Set<string>();
            const failed = new Map<string, string>();
            for (const e of list) {
                const res: any = await diningApi.write(e.action, e.payload).catch(() => null);
                if (isNetworkFailure(res)) break;
                if (isAccepted(res)) done.add(e.draft_id);
                else failed.set(e.draft_id, errorOf(res));
            }
            const next = (await readAll()).filter((e) => !done.has(e.draft_id)).map((e) => (failed.has(e.draft_id) ? { ...e, error: failed.get(e.draft_id)! } : e));
            await writeAll(next);
            return { sent: done.size, failed: failed.size, remaining: next.length };
        })().finally(() => {
            running = null;
        });
    }
    return running;
}

/** Drop a write the server keeps refusing (after the user reads why). */
export async function discardDiningEntry(draft_id: string) {
    await writeAll((await readAll()).filter((e) => e.draft_id !== draft_id));
}

/* ---------------- cache ---------------- */

export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const raw = await AsyncStorage.getItem(`wazipos_dining_cache:${key}`);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

export async function cacheSet(key: string, value: unknown) {
    try {
        await AsyncStorage.setItem(`wazipos_dining_cache:${key}`, JSON.stringify(value));
    } catch {
        /* cache is best effort */
    }
}
