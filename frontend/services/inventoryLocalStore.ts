// services/inventoryLocalStore.ts

import { dbInstance } from '@/databases/db';
import { CachedReceipt } from '@/databases/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NATIVE_KEY = 'wazipos_async_inventory_registry';

/* ---------------------------------------------------------
 * Read the full list — reads BOTH stores, returns the
 * fuller of the two.
 * ------------------------------------------------------- */

export async function readAllLocal(): Promise<
    CachedReceipt[]
> {
    try {
        const [asyncData, dexieData] = await Promise.all([
            AsyncStorage.getItem(NATIVE_KEY)
                .then((raw) =>
                    raw ? JSON.parse(raw) : []
                )
                .catch(() => []),
            (async () => {
                try {
                    if (dbInstance?.retailerReceipts) {
                        return await dbInstance.retailerReceipts.toArray();
                    }
                } catch { }
                return [];
            })(),
        ]);

        return asyncData.length >= dexieData.length
            ? asyncData
            : dexieData;
    } catch {
        return [];
    }
}

/* ---------------------------------------------------------
 * Write the full list to BOTH stores
 * ------------------------------------------------------- */

export async function writeAllLocal(
    records: CachedReceipt[]
): Promise<void> {
    const tasks: Promise<any>[] = [];

    tasks.push(
        AsyncStorage.setItem(
            NATIVE_KEY,
            JSON.stringify(records)
        ).catch((err) =>
            console.warn(
                '[inventoryLocalStore] AsyncStorage write failed:',
                err
            )
        )
    );

    if (dbInstance?.retailerReceipts) {
        tasks.push(
            (async () => {
                try {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.retailerReceipts,
                        async () => {
                            await dbInstance.retailerReceipts.clear();
                            await dbInstance.retailerReceipts.bulkPut(
                                records
                            );
                        }
                    );
                } catch (err) {
                    console.warn(
                        '[inventoryLocalStore] Dexie write failed:',
                        err
                    );
                }
            })()
        );
    }

    await Promise.allSettled(tasks);
}

/* ---------------------------------------------------------
 * Upsert — draft_id is immutable once assigned
 * ------------------------------------------------------- */

export async function upsertLocal(
    record: CachedReceipt
): Promise<void> {
    const all = await readAllLocal();
    const idx = all.findIndex((r) => r.id === record.id);

    if (idx >= 0) {
        const existing = all[idx];

        const nextRecord = existing.draft_id
            ? { ...record, draft_id: existing.draft_id }
            : record;

        all[idx] = nextRecord;
    } else {
        all.push(record);
    }

    await writeAllLocal(all);
}

/* ---------------------------------------------------------
 * Remove
 * ------------------------------------------------------- */

export async function removeLocal(
    id: string
): Promise<void> {
    const all = await readAllLocal();
    const filtered = all.filter((r) => r.id !== id);
    await writeAllLocal(filtered);
}

/* ---------------------------------------------------------
 * Pending records
 * ------------------------------------------------------- */

export async function readPendingLocal(): Promise<
    CachedReceipt[]
> {
    const all = await readAllLocal();
    return all.filter((r) => r.synced === false);
}