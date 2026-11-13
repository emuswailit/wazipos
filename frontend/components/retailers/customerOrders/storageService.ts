import { dbInstance, withDb } from '@/databases/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { CustomerOrder } from './types';

const NATIVE_ASYNC_ORDERS_KEY = 'wazipos_async_orders_registry';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The order's id on the server: remote_id, or a UUID id (rows stored as the server sent them). */
function serverIdOf(o: any): string {
    for (const v of [o?.remote_id, o?.id]) {
        if (v && UUID_RE.test(String(v))) return String(v);
    }
    return '';
}

/** True for orders created on this device that haven't been uploaded yet. Never deleted by a sync. */
function isPendingUpload(o: any): boolean {
    return String(o?.synced ?? '').toUpperCase() === 'FALSE';
}

/** Same order? Matches on the server id (remote_id or id) or the draft id. */
function sameOrder(a: any, b: any): boolean {
    const ids = (o: any) => [o?.remote_id, o?.id, o?.draft_id].filter((v) => v !== undefined && v !== null && v !== '').map(String);
    const bIds = new Set(ids(b));
    return ids(a).some((v) => bIds.has(v));
}

interface ReconcileResult {
    /** Full rows to write (existing rows keep their local key in `id`). */
    upserts: any[];
    /** Local keys of synced rows the server no longer has. */
    deleteKeys: any[];
    /** The resulting local list (for native storage). */
    next: any[];
    changed: boolean;
}

/**
 * Make the local rows match the server.
 *
 * - Every incoming order is written in full (server values win), matched to an existing
 *   local row by server id, then by draft id.
 * - When `snapshot` is true (the server sent its complete list), synced local orders that
 *   aren't in it are deleted, so local data only reflects what the server has.
 * - Orders still waiting to upload (synced === 'FALSE') are never deleted: the server
 *   can't know about them yet.
 */
function reconcile(localRows: any[], incoming: any[], snapshot: boolean): ReconcileResult {
    const byServerId = new Map<string, any>();
    const byDraftId = new Map<string, any>();
    for (const lo of localRows) {
        const sid = serverIdOf(lo);
        if (sid) byServerId.set(sid, lo);
        if (lo?.draft_id) byDraftId.set(String(lo.draft_id), lo);
    }

    const matched = new Set<any>();
    const upserts: any[] = [];
    const resultRows = new Map<any, any>(); // local row (or new marker) -> resulting row
    let changed = false;

    for (const row of incoming) {
        const sid = String(row?.id ?? row?.remote_id ?? '');
        if (!sid) continue;
        const local =
            byServerId.get(sid) ?? (row?.draft_id ? byDraftId.get(String(row.draft_id)) : undefined);

        const items = Array.isArray(row?.order_items) ? JSON.parse(JSON.stringify(row.order_items)) : [];
        const merged = {
            ...(local ?? {}),
            ...row,
            order_items: items.length > 0 ? items : local?.order_items ?? [],
            remote_id: sid,
            synced: 'TRUE',
            // Keep the existing local key so the row updates in place; new rows use the server id.
            id: local ? local.id : sid,
        };

        if (local) {
            matched.add(local);
            if (JSON.stringify(local) !== JSON.stringify(merged)) changed = true;
        } else {
            changed = true;
        }
        upserts.push(merged);
        resultRows.set(local ?? merged, merged);
    }

    const deleteKeys: any[] = [];
    const next: any[] = [];
    for (const lo of localRows) {
        if (matched.has(lo)) {
            next.push(resultRows.get(lo));
        } else if (snapshot && !isPendingUpload(lo)) {
            deleteKeys.push(lo.id);
            changed = true;
        } else {
            next.push(lo);
        }
    }
    // New server orders not stored locally yet.
    for (const [key, row] of resultRows) {
        if (!localRows.includes(key)) next.unshift(row);
    }

    return { upserts, deleteKeys, next, changed };
}

export const storageService = {
    /**
     * Save an order created while offline. It shows in the Customer Orders list straight
     * away (pending upload) and is uploaded by uploadPendingCustomerOrders() later.
     * `record.upload_payload` must hold the CreateCustomerOrder `customer_order_details`.
     */
    addPendingOrder: async (record: Record<string, any>): Promise<void> => {
        const row = { ...record, synced: 'FALSE' };
        delete (row as any).id; // web: let Dexie assign the key; native: draft_id identifies it
        if (Platform.OS === 'web') {
            await withDb(() => dbInstance.customerOrders.add(row));
        } else {
            const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
            const local: any[] = data ? JSON.parse(data) : [];
            local.unshift(row);
            await AsyncStorage.setItem(NATIVE_ASYNC_ORDERS_KEY, JSON.stringify(local));
        }
    },

    /** Write back existing rows (as returned by getAllOrders) in place; never removes rows. */
    putOrders: async (rows: any[]): Promise<void> => {
        if (!rows?.length) return;
        if (Platform.OS === 'web') {
            await withDb(() => dbInstance.customerOrders.bulkPut(rows));
            return;
        }
        const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
        const local: any[] = data ? JSON.parse(data) : [];
        let changed = false;
        for (const row of rows) {
            const idx = local.findIndex((o) => sameOrder(o, row));
            if (idx !== -1) {
                local[idx] = { ...local[idx], ...row };
                changed = true;
            }
        }
        if (changed) await AsyncStorage.setItem(NATIVE_ASYNC_ORDERS_KEY, JSON.stringify(local));
    },

    /** Orders created offline that haven't been uploaded yet, oldest first. */
    getPendingOrders: async (): Promise<any[]> => {
        const all: any[] = await storageService.getAllOrders();
        return all
            .filter(isPendingUpload)
            .sort((a, b) => String(a?.created ?? a?.created_at ?? '').localeCompare(String(b?.created ?? b?.created_at ?? '')));
    },

    /** Apply a local change (e.g. a new due date) to one stored order. */
    patchOrder: async (order: { remote_id?: any; id?: any; draft_id?: any }, patch: Record<string, any>): Promise<void> => {
        if (Platform.OS === 'web') {
            const all = await dbInstance.customerOrders.toArray();
            const local = all.find((o: any) => sameOrder(o, order));
            if (local?.id !== undefined) await dbInstance.customerOrders.update(local.id, patch);
        } else {
            const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
            const local: any[] = data ? JSON.parse(data) : [];
            const idx = local.findIndex((o) => sameOrder(o, order));
            if (idx !== -1) {
                local[idx] = { ...local[idx], ...patch };
                await AsyncStorage.setItem(NATIVE_ASYNC_ORDERS_KEY, JSON.stringify(local));
            }
        }
    },

    getAllOrders: async (): Promise<CustomerOrder[]> => {
        if (Platform.OS === 'web') {
            return await withDb(() => dbInstance.customerOrders.toArray());
        } else {
            try {
                const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                console.error("📱 [Native Store] Failed reading AsyncStorage cache:", e);
                return [];
            }
        }
    },

    /**
     * Apply orders from the server. Pass `snapshot: true` when `incoming` is the server's
     * complete list, so orders the server no longer has are removed locally.
     * Returns true if anything changed.
     */
    syncIncomingOrders: async (incoming: CustomerOrder[], options: { snapshot?: boolean } = {}): Promise<boolean> => {
        const snapshot = !!options.snapshot;

        if (Platform.OS === 'web') {
            let changed = false;
            await withDb(() =>
                dbInstance.transaction('rw', dbInstance.customerOrders, async () => {
                    const localRows = await dbInstance.customerOrders.toArray();
                    const result = reconcile(localRows, incoming as any[], snapshot);
                    if (result.upserts.length) await dbInstance.customerOrders.bulkPut(result.upserts);
                    if (result.deleteKeys.length) await dbInstance.customerOrders.bulkDelete(result.deleteKeys);
                    changed = result.changed;
                })
            );
            return changed;
        }

        try {
            const data = await AsyncStorage.getItem(NATIVE_ASYNC_ORDERS_KEY);
            const localRows: any[] = data ? JSON.parse(data) : [];
            const result = reconcile(localRows, incoming as any[], snapshot);
            if (result.changed) {
                await AsyncStorage.setItem(NATIVE_ASYNC_ORDERS_KEY, JSON.stringify(result.next));
            }
            return result.changed;
        } catch (e) {
            console.error("📱 [Native Store] AsyncStorage transaction fail:", e);
            return false;
        }
    },
};
