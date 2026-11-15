// services/wholesaleOrderUploader.ts
//
// Retailer orders that wholesaler staff made while offline (CASH only).
//
// Each one is kept on the device (AsyncStorage — localStorage on web) with the exact
// CreateStaffRetailerOrder payload, including the CASH payment method. When the
// connection is back it is sent as-is; the backend is idempotent on draft_id, so a
// retry after a lost response can't create a duplicate, and records the cash
// payment in the same call. A rejected order keeps the server's reason
// (sync_error) and stays queued, so no sale is lost.

import wholesalersApi, { type CreateStaffRetailerOrderPayload } from '@/api/wholesalersApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { notifyPendingOrdersChanged } from './pendingOrdersSignal';

const KEY = 'wazipos_pending_wholesale_orders';
const NETWORK_PROBLEMS = ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'CONNECTION_ERROR', 'SERVER_ERROR'];

export interface PendingWholesaleOrder {
    draft_id: string;
    payload: CreateStaffRetailerOrderPayload;
    retailer_title: string;
    total: number;
    items: number;
    created: string;
    sync_error?: string | null;
    sync_attempted_at?: string | null;
}

export interface WholesaleUploadSummary {
    uploaded: number;
    failed: number;
    remaining: number;
    offline: boolean;
}

async function readAll(): Promise<PendingWholesaleOrder[]> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

async function writeAll(list: PendingWholesaleOrder[]): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
    notifyPendingOrdersChanged();
}

export async function getPendingWholesaleOrders(): Promise<PendingWholesaleOrder[]> {
    return readAll();
}

export async function queueWholesaleOrder(order: PendingWholesaleOrder): Promise<void> {
    const list = await readAll();
    if (!list.some((o) => o.draft_id === order.draft_id)) list.push(order);
    await writeAll(list);
}

let running: Promise<WholesaleUploadSummary> | null = null;

/** Upload every queued offline retailer order. Concurrent calls share one run. */
export function uploadPendingWholesaleOrders(): Promise<WholesaleUploadSummary> {
    if (!running) {
        running = doUpload().finally(() => {
            running = null;
        });
    }
    return running;
}

async function doUpload(): Promise<WholesaleUploadSummary> {
    const summary: WholesaleUploadSummary = { uploaded: 0, failed: 0, remaining: 0, offline: false };
    const pending = await readAll();
    if (!pending.length) return summary;

    const done = new Set<string>();
    const errors = new Map<string, string>();
    for (const order of pending) {
        const res: any = await wholesalersApi.wholesaleRetailerOrdersStaffAction(order.payload).catch(() => null);
        if (!res || NETWORK_PROBLEMS.includes(res.problem) || res.status === 401) {
            summary.offline = true;
            break;
        }
        const body = res.data;
        if (res.ok && String(body?.response_code) === '0' && body?.retailer_order?.id) {
            done.add(order.draft_id);
            summary.uploaded += 1;
        } else {
            const errs = body?.errors;
            const msg = Array.isArray(errs)
                ? errs.join(' · ')
                : errs && typeof errs === 'object'
                    ? Object.values(errs).flat().join(' · ')
                    : body?.response_message || `Upload failed (HTTP ${res.status ?? '?'})`;
            errors.set(order.draft_id, String(msg));
            summary.failed += 1;
        }
    }

    // Re-read: an order may have been queued while uploading.
    const now = new Date().toISOString();
    const next = (await readAll())
        .filter((o) => !done.has(o.draft_id))
        .map((o) => (errors.has(o.draft_id) ? { ...o, sync_error: errors.get(o.draft_id)!, sync_attempted_at: now } : o));
    await writeAll(next);
    summary.remaining = next.length;
    return summary;
}
