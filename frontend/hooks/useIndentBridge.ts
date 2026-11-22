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
import { Alert, Platform } from 'react-native';

/**
 * Ask before closing the open indent: closing submits it to the wholesalers
 * as orders and can't be undone. Cross-platform (Alert has no web version).
 */
export function confirmCloseIndent(itemCount: number, subtotal?: string): Promise<boolean> {
    const title = 'Close indent and place orders?';
    const message =
        `${itemCount} item${itemCount === 1 ? '' : 's'}${subtotal ? ` · ${subtotal}` : ''} will be sent to the wholesaler${itemCount === 1 ? '' : 's'} as orders. ` +
        "You can't add to this indent afterwards.";
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Close indent', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
}

/* ── Public types ──────────────────────────────────────────── */

interface AddToIndentInput {
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

interface AddToIndentResult {
    ok: boolean;
    mode: 'remote' | 'draft' | 'failed';
    itemId?: string;
    indentId?: string;
    message?: string;
}

interface RemoveFromIndentResult {
    ok: boolean;
    mode: 'remote' | 'draft' | 'failed';
    message?: string;
}

interface CloseOpenIndentResult {
    ok: boolean;
    message: string;
}

/* ── Constants ─────────────────────────────────────────────── */

const LOCAL_DRAFT_PREFIX = 'local-';

/**
 * Draft (not yet on the server) ids. RetailerIndentsSyncContext makes them as
 * `<userId>:<entityId>:<ts>`; the old `local-` prefix is kept for safety.
 */
const isDraftId = (id: string | null | undefined): boolean =>
    typeof id === 'string' && (id.includes(':') || id.startsWith(LOCAL_DRAFT_PREFIX));

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
        closeIndent,
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

    /**
     * Close the open indent: the server turns it into one retailer order per
     * wholesaler (paid separately, from the orders screen).
     * Refuses while any item is still only on this device: the server would
     * close the indent without it (that produced closed KES 0 indents). In
     * that case the upload is retried and the user closes again once done.
     * Callers confirm with the user first (confirmCloseIndent).
     */
    const closeOpenIndent = useCallback(async (): Promise<CloseOpenIndentResult> => {
        if (!currentOpenIndent) return { ok: false, message: 'There is no open indent to close.' };
        const items = currentOpenIndent.retailer_indent_items ?? [];
        if (!items.length) {
            return { ok: false, message: 'Add at least one product before closing the indent.' };
        }
        const waiting = items.filter((it) => !it.remote_id).length;
        if (isDraftId(currentOpenIndent.remote_id) || waiting > 0 || pendingIndentOpCount > 0) {
            flushPendingOps().catch(() => { });
            const n = waiting || pendingIndentOpCount;
            return {
                ok: false,
                message: `${n || 'Some'} change${n === 1 ? ' is' : 's are'} still uploading. Close the indent once everything shows as uploaded.`,
            };
        }
        const res = await closeIndent({ indentId: currentOpenIndent.remote_id });
        if (res.ok) {
            return { ok: true, message: res.message || 'Indent closed. Your orders were sent to the wholesalers.' };
        }
        const headline = res.message || 'Indent was not closed.';
        // Add the server's field errors unless the headline already is one of them.
        const extra = (res.errors ?? []).filter((e) => e && e !== headline);
        return { ok: false, message: [headline, ...extra].join(' ') };
    }, [currentOpenIndent, pendingIndentOpCount, flushPendingOps, closeIndent]);

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
        closeOpenIndent,
    };
}