// services/wholesalerInventoryMigration.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { dbInstance } from '@/databases/db';
import { WholesalerReceipt } from '@/databases/types';

const NATIVE_KEY = 'wazipos_async_wholesaler_receipts_registry';

/**
 * Deterministic draft ID for a wholesaler-created receipt.
 *
 *   `<userId>:<productId>:<createdMs>`
 *
 * The same user + product + creation instant produces the same id.
 * Used as the idempotency key for CreateWholesalerReceipt.
 */
export function buildWholesalerDraftId(
    userId: string,
    productId: string,
    createdMs: number | null
): string {
    const ts = createdMs ?? Date.now();
    return `${userId}:${productId}:${ts}`;
}

/**
 * One-time migration: assign draft_id to any local row that has
 * `synced === false` and no `draft_id`. Safe to run repeatedly.
 */
export async function backfillWholesalerDraftIds(
    userId: string
): Promise<void> {
    if (!userId) return;

    try {
        // Read from whichever local store has the most rows.
        const [asyncRaw, dexieRows] = await Promise.all([
            AsyncStorage.getItem(NATIVE_KEY).catch(() => null),
            (async () => {
                try {
                    if (dbInstance?.wholesalerReceipts) {
                        return await dbInstance.wholesalerReceipts.toArray();
                    }
                } catch { }
                return [];
            })(),
        ]);

        let webRows: WholesalerReceipt[] = [];
        if (
            Platform.OS === 'web' &&
            typeof window !== 'undefined'
        ) {
            try {
                const raw = window.localStorage.getItem(
                    NATIVE_KEY
                );
                webRows = raw ? JSON.parse(raw) : [];
            } catch { }
        }

        const asyncRows: WholesalerReceipt[] = asyncRaw
            ? JSON.parse(asyncRaw)
            : [];

        const source =
            asyncRows.length >= webRows.length &&
                asyncRows.length >= dexieRows.length
                ? asyncRows
                : webRows.length >= dexieRows.length
                    ? webRows
                    : dexieRows;

        if (!Array.isArray(source) || source.length === 0) {
            return;
        }

        let changed = false;
        const migrated: WholesalerReceipt[] = source.map(
            (row) => {
                if (
                    row.synced === false ||
                    row.synced === ('false' as any)
                ) {
                    if (!row.draft_id) {
                        changed = true;
                        return {
                            ...row,
                            draft_id: buildWholesalerDraftId(
                                userId,
                                row.product || '',
                                null
                            ),
                        };
                    }
                }
                return row;
            }
        );

        if (!changed) return;

        // Persist everywhere.
        await AsyncStorage.setItem(
            NATIVE_KEY,
            JSON.stringify(migrated)
        );

        if (
            Platform.OS === 'web' &&
            typeof window !== 'undefined'
        ) {
            try {
                window.localStorage.setItem(
                    NATIVE_KEY,
                    JSON.stringify(migrated)
                );
            } catch { }
        }

        if (dbInstance?.wholesalerReceipts) {
            try {
                await dbInstance.transaction(
                    'rw',
                    dbInstance.wholesalerReceipts,
                    async () => {
                        await dbInstance.wholesalerReceipts.clear();
                        const rows = migrated.map((row) => {
                            if (
                                row.id === undefined ||
                                row.id === null
                            ) {
                                const { id, ...rest } = row;
                                return rest;
                            }
                            return row;
                        });
                        await dbInstance.wholesalerReceipts.bulkPut(
                            rows
                        );
                    }
                );
            } catch { }
        }
    } catch (e) {
        console.warn(
            '[wholesalerInventoryMigration] threw:',
            e
        );
    }
}