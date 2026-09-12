// services/inventoryMigration.ts

import { CachedReceipt } from '@/databases/types';
import {
    readAllLocal,
    writeAllLocal,
} from './inventoryLocalStore';

/* ---------------------------------------------------------
 * Parse a "created" value into epoch milliseconds.
 * ------------------------------------------------------- */

function parseCreatedToMs(created: any): number | null {
    if (created === null || created === undefined) {
        return null;
    }

    if (typeof created === 'number' && isFinite(created)) {
        return created < 1e12
            ? Math.round(created * 1000)
            : Math.round(created);
    }

    const str = String(created).trim();
    if (!str) return null;

    if (/^\d+$/.test(str)) {
        const n = Number(str);
        return n < 1e12 ? n * 1000 : n;
    }

    const ms = Date.parse(str);
    if (!isNaN(ms)) return ms;

    return null;
}

/* ---------------------------------------------------------
 * Build a draft ID from the same strategy used by the modal:
 *   <userId>:<productId>:<createdTimestampMs>
 * ------------------------------------------------------- */

export function buildDraftId(
    userId: string,
    productId: string,
    createdMs: number | null
): string {
    const ts = createdMs ?? Date.now();
    return `${userId}:${productId}:${ts}`;
}

/* ---------------------------------------------------------
 * Ensure every local record has a draft_id.
 * Idempotent — safe to call on every bootstrap.
 * ------------------------------------------------------- */

export async function backfillDraftIds(
    userId: string
): Promise<{ updated: number; total: number }> {
    if (!userId) {
        console.warn(
            '[inventoryMigration] No userId — skipping draft_id backfill'
        );
        return { updated: 0, total: 0 };
    }

    const all = await readAllLocal();
    if (!Array.isArray(all) || all.length === 0) {
        return { updated: 0, total: 0 };
    }

    let updated = 0;

    const next = all.map((record) => {
        const existing = record.draft_id;

        if (
            typeof existing === 'string' &&
            existing.trim().length > 0
        ) {
            return record;
        }

        const productId = String(
            record.product || record.id || ''
        );

        const createdMs = parseCreatedToMs(
            (record as any).created ??
            (record as any).local_created_at ??
            (record as any).cached_at
        );

        if (!createdMs && record.server_id) {
            console.warn(
                '[inventoryMigration] Server record missing "created" — draft_id may not be stable across devices:',
                record.id
            );
        }

        const draftId = buildDraftId(
            userId,
            productId,
            createdMs
        );

        updated++;

        return {
            ...record,
            draft_id: draftId,
            local_created_at:
                record.local_created_at ??
                (createdMs
                    ? new Date(createdMs).toISOString()
                    : new Date().toISOString()),
        } as CachedReceipt;
    });

    if (updated === 0) {
        console.log(
            `[inventoryMigration] All ${all.length} records already have draft_id`
        );
        return { updated: 0, total: all.length };
    }

    await writeAllLocal(next);

    console.log(
        `[inventoryMigration] Backfilled draft_id for ${updated} of ${all.length} records`
    );

    return { updated, total: all.length };
}