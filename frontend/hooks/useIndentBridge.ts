// @/hooks/useIndentBridge.ts
//
// Shared indent surface consumed by every "add to indent" entry point.
//
// Sync progress (`syncing` / `syncTotal` / `syncDone`) and the latest
// sync outcome (`lastSyncResult`) are re-exposed from the context so
// callers get everything through a single hook.

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type {
    RetailerIndent,
    RetailerIndentItem,
} from '@/databases/types';
import { useCallback } from 'react';

export type {
    LastSyncResult,
    SyncFailure
} from '@/context/RetailerIndentsSyncContext';

/* ── Public types ──────────────────────────────────────────── */

export interface AddToIndentInput {
    wholesaleReceipt: string;
    quantity: number;
    meta?: {
        wholesaleReceiptTitle?: string;
        wholesaler?: string | null;
        wholesalerTitle?: string;
        unitOfReceipt?: string;
        unitSellingPrice?: string;
        finalUnitSellingPrice?: string;
        images?: any[];
    };
}

export interface AddToIndentResult {
    ok: boolean;
    mode: 'remote' | 'draft' | 'failed';
    itemId?: string;
    indentId?: string;
    message?: string;
}

export interface RemoveFromIndentResult {
    ok: boolean;
    mode: 'remote' | 'draft' | 'failed';
    message?: string;
}

/* ── Constants ─────────────────────────────────────────────── */

const LOCAL_DRAFT_PREFIX = 'local-';

const isDraftId = (id: string | null | undefined): boolean =>
    typeof id === 'string' && id.startsWith(LOCAL_DRAFT_PREFIX);

/* ── Hook ──────────────────────────────────────────────────── */

export function useIndentBridge() {
    const { user } = useAuth();
    const {
        currentOpenIndent,
        queueRevision,
        pendingIndentOpCount,
        drainProgress,
        lastSyncResult,
        clearLastSyncResult,
        addOfferToIndent,
        addOfferToIndentLocally,
        removeOfferFromIndent,
        flushPendingOps,
    } = useRetailerIndentsSync();

    /* ── Lookups ───────────────────────────────────────────── */

    const findItemByReceipt = useCallback(
        (
            receiptId: string | null | undefined,
        ): RetailerIndentItem | null => {
            if (!receiptId || !currentOpenIndent) return null;
            return (
                currentOpenIndent.retailer_indent_items.find(
                    (it) => it.wholesale_receipt === receiptId,
                ) ?? null
            );
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [currentOpenIndent, queueRevision],
    );

    const findItemByReceipts = useCallback(
        (receiptIds: string[]): RetailerIndentItem | null => {
            if (
                !currentOpenIndent ||
                receiptIds.length === 0
            ) {
                return null;
            }
            const set = new Set(receiptIds);
            return (
                currentOpenIndent.retailer_indent_items.find(
                    (it) =>
                        it.wholesale_receipt &&
                        set.has(it.wholesale_receipt),
                ) ?? null
            );
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [currentOpenIndent, queueRevision],
    );

    const getQuantityByReceipts = useCallback(
        (receiptIds: string[]): number => {
            if (
                !currentOpenIndent ||
                receiptIds.length === 0
            ) {
                return 0;
            }
            const set = new Set(receiptIds);
            return currentOpenIndent.retailer_indent_items
                .filter(
                    (it) =>
                        it.wholesale_receipt &&
                        set.has(it.wholesale_receipt),
                )
                .reduce(
                    (sum, it) =>
                        sum + Number(it.required_quantity ?? 0),
                    0,
                );
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [currentOpenIndent, queueRevision],
    );

    const isOnIndent = useCallback(
        (receiptId: string | null | undefined): boolean =>
            !!findItemByReceipt(receiptId),
        [findItemByReceipt],
    );

    /* ── Sync progress ────────────────────────────────────── */

    const syncPendingOps = useCallback(async () => {
        if (drainProgress) return;
        if (pendingIndentOpCount === 0) return;
        try {
            await flushPendingOps();
        } catch {
            // Drainer swallows per-op errors internally.
        }
    }, [drainProgress, pendingIndentOpCount, flushPendingOps]);

    /* ── Mutations ────────────────────────────────────────── */

    const addToIndent = useCallback(
        async (
            input: AddToIndentInput,
        ): Promise<AddToIndentResult> => {
            const qty = Math.max(
                1,
                Math.floor(Number(input.quantity) || 0),
            );
            if (qty <= 0) {
                return {
                    ok: false,
                    mode: 'failed',
                    message: 'Quantity must be positive.',
                };
            }

            const authUser = user as any;
            const entity = String(
                authUser?.entity ??
                authUser?.remote_id ??
                authUser?.id ??
                '',
            );
            const entity_title = String(
                authUser?.entity_title ??
                authUser?.title ??
                '',
            );
            const owner = String(
                authUser?.owner ?? authUser?.id ?? '',
            );

            const meta = input.meta ?? {};
            const local = await addOfferToIndentLocally({
                wholesale_receipt: input.wholesaleReceipt,
                wholesale_receipt_title:
                    meta.wholesaleReceiptTitle ?? '',
                wholesaler: meta.wholesaler ?? null,
                wholesaler_title: meta.wholesalerTitle ?? '',
                unit_of_receipt: meta.unitOfReceipt ?? 'unit',
                unit_selling_price:
                    meta.unitSellingPrice ?? '0',
                final_unit_selling_price:
                    meta.finalUnitSellingPrice ?? '0',
                images: meta.images ?? [],
                quantity: qty,
                entity,
                entity_title,
                owner,
            });

            if (!local.ok || !local.indentRemoteId) {
                return {
                    ok: false,
                    mode: 'failed',
                    message:
                        'Could not save the item locally.',
                };
            }

            try {
                const remote = await addOfferToIndent({
                    indentId: local.indentRemoteId,
                    wholesaleReceiptId: input.wholesaleReceipt,
                    quantity: qty,
                });

                return {
                    ok: true,
                    mode: 'remote',
                    itemId: remote?.item_id ?? local.itemId,
                    indentId:
                        remote?.indent_id ??
                        local.indentRemoteId,
                };
            } catch (e: any) {
                flushPendingOps().catch(() => { });
                return {
                    ok: true,
                    mode: 'draft',
                    itemId: local.itemId,
                    indentId: local.indentRemoteId,
                    message:
                        e?.message ??
                        'Saved locally — will sync when online.',
                };
            }
        },
        [
            user,
            addOfferToIndent,
            addOfferToIndentLocally,
            flushPendingOps,
        ],
    );

    const removeFromIndent = useCallback(
        async (
            itemId: string,
        ): Promise<RemoveFromIndentResult> => {
            if (!itemId) {
                return {
                    ok: false,
                    mode: 'failed',
                    message: 'Missing item id.',
                };
            }

            if (!currentOpenIndent) {
                return {
                    ok: false,
                    mode: 'failed',
                    message: 'No open indent.',
                };
            }

            const res = await removeOfferFromIndent({
                indentId: currentOpenIndent.remote_id,
                itemId,
            });

            if (res.ok) {
                return { ok: true, mode: 'remote' };
            }

            const isDraftIndent = isDraftId(
                currentOpenIndent.remote_id,
            );

            return {
                ok: false,
                mode: isDraftIndent ? 'draft' : 'failed',
                message:
                    res.message ??
                    'Could not remove the item.',
            };
        },
        [currentOpenIndent, removeOfferFromIndent],
    );

    /* ── Public surface ────────────────────────────────────── */

    return {
        currentOpenIndent:
            currentOpenIndent as RetailerIndent | null,
        hasOpenIndent: !!currentOpenIndent,
        isDraftIndent: isDraftId(
            currentOpenIndent?.remote_id,
        ),
        queueRevision,
        pendingOpCount: pendingIndentOpCount,

        /* Sync progress */
        syncing: !!drainProgress,
        syncTotal: drainProgress?.total ?? 0,
        syncDone: drainProgress?.done ?? 0,
        syncPendingOps,

        /* Latest sync result */
        lastSyncResult,
        clearLastSyncResult,

        findItemByReceipt,
        findItemByReceipts,
        getQuantityByReceipts,
        isOnIndent,

        addToIndent,
        removeFromIndent,
    };
}