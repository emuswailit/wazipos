// services/inventoryLocalStore.ts

import { dbInstance } from '@/databases/db';
import { RetailerReceipt } from '@/databases/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const NATIVE_KEY = 'wazipos_async_inventory_registry';
const IS_WEB = Platform.OS === 'web';

/* ---------------------------------------------------------
 * Helpers
 * ------------------------------------------------------- */

function hasDexie(): boolean {
    return IS_WEB && !!dbInstance?.retailerReceipts;
}

async function readAsync(): Promise<RetailerReceipt[]> {
    try {
        const raw = await AsyncStorage.getItem(NATIVE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.warn(
            '[inventoryLocalStore] AsyncStorage read failed:',
            err
        );
        return [];
    }
}

async function readDexie(): Promise<RetailerReceipt[]> {
    if (!hasDexie()) return [];
    try {
        return await dbInstance.retailerReceipts.toArray();
    } catch (err) {
        console.warn(
            '[inventoryLocalStore] Dexie read failed:',
            err
        );
        return [];
    }
}

/* ---------------------------------------------------------
 * Strip any invalid `id` before a Dexie write.
 *
 * retailerReceipts uses `++id` (numeric autoincrement).
 * A record arriving with a string id (e.g. "local-…")
 * makes Dexie's bulkPut throw a DataError and the entire
 * transaction rolls back. Drop the id in that case — Dexie
 * will assign a numeric one on insert.
 * ------------------------------------------------------- */
function normalizeIdForDexie(
    record: RetailerReceipt
): RetailerReceipt {
    const raw = (record as any)?.id;

    const isValidNumber =
        typeof raw === 'number' &&
        Number.isFinite(raw) &&
        raw > 0;

    if (isValidNumber) return record;

    // Drop `id` so Dexie assigns a fresh numeric key.
    const { id: _drop, ...rest } = record as any;
    return rest as RetailerReceipt;
}

/* ---------------------------------------------------------
 * Read — one canonical source per platform
 * ------------------------------------------------------- */
export async function readAllLocal(): Promise<
    RetailerReceipt[]
> {
    if (IS_WEB) return readDexie();
    return readAsync();
}

/* ---------------------------------------------------------
 * Write — canonical source first, errors propagate
 * ------------------------------------------------------- */
export async function writeAllLocal(
    records: RetailerReceipt[]
): Promise<void> {
    const safe = records.map(normalizeIdForDexie);

    if (IS_WEB) {
        if (hasDexie()) {
            // Let errors surface. If Dexie rejects the write,
            // the caller needs to know instead of silently
            // losing data.
            await dbInstance.transaction(
                'rw',
                dbInstance.retailerReceipts,
                async () => {
                    await dbInstance.retailerReceipts.clear();
                    if (safe.length > 0) {
                        await dbInstance.retailerReceipts.bulkPut(
                            safe
                        );
                    }
                }
            );
        }

        // Mirror to AsyncStorage — best-effort only.
        try {
            await AsyncStorage.setItem(
                NATIVE_KEY,
                JSON.stringify(safe)
            );
        } catch (err) {
            console.warn(
                '[inventoryLocalStore] AsyncStorage mirror failed:',
                err
            );
        }
        return;
    }

    // Native — AsyncStorage is canonical.
    await AsyncStorage.setItem(
        NATIVE_KEY,
        JSON.stringify(records)
    );
}

/* ---------------------------------------------------------
 * Identity
 *
 * A record is uniquely identified by, in order of preference:
 *   1. draft_id     — stable across local create + server push
 *   2. id           — Dexie numeric PK (already-stored rows)
 *   3. remote_id    — server UUID (legacy rows without draft_id)
 * ------------------------------------------------------- */

/* ---------------------------------------------------------
 * Upsert — draft_id is immutable once assigned
 * ------------------------------------------------------- */

/* ---------------------------------------------------------
 * Remove
 * ------------------------------------------------------- */

/* ---------------------------------------------------------
 * Pending records
 * ------------------------------------------------------- */