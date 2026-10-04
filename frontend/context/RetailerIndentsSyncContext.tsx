// @/context/RetailerIndentsSyncContext.tsx
//
// Retailer indents sync.
//
// READ PATH: WebSocket only.
// WRITE PATH: HTTP.
// LOCAL DB: every WS frame is merged by remote_id (or draft_id during
//           the draft → remote transition) and persisted via
//           `db.saveRetailerIndents`.
//
// DRAFT ID FORMATS
//   Indent draft:  <userId>:<entityId>:<timestampMs>
//   Item draft:    <userId>:<wholesaleReceiptId>:<timestampMs>
//
// ITEM IDS
//   `RetailerIndentItem.id`        → local numeric PK (never on the wire)
//   `RetailerIndentItem.remote_id` → server UUID (JSON `id` on the wire)
//   `RetailerIndentItem.draft_id`  → draft handle, see DRAFT ID FORMATS
//
// CLOSED REMOTE INDENTS
//   Open and closed remote indents are both kept in the local mirror.
//   When a frame carries an indent with is_open = false, we:
//     - drop any pending ops targeting that indent (retrying an op
//       against a closed indent can never succeed)
//     - keep the indent row in state, marked is_open = 'false'
//   A close from another device therefore shows up as a closed row
//   in the list rather than vanishing.

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { db } from '@/databases/db';
import {
    PendingIndentOp,
    RetailerIndent,
    RetailerIndentItem,
    RetailerIndentItemImage,
} from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

/* ------------------------------------------------------------------ */
/* Response shapes                                                     */
/* ------------------------------------------------------------------ */

export interface IndentItemParamsResponse {
    status?: string;
    item_id?: string;
    indent_id?: string;
    params?: Partial<RetailerIndentItem>;
}

export interface CloseIndentResult {
    ok: boolean;
    message: string;
    errors: string[];
}

export interface RemoveIndentItemResult {
    ok: boolean;
    message?: string;
    errors?: string[];
}

export interface CreateRetailerIndentResult {
    ok: boolean;
    indent_id?: string;
    message?: string;
    responseMessage?: string;
    errors?: string[];
}

export interface UpdateIndentItemResult {
    ok: boolean;
    message?: string;
    errors?: string[];
}

export interface DrainProgress {
    done: number;
    total: number;
    startedAt: number;
}

export interface SyncFailure {
    kind: string;
    client_op_id: string;
    message?: string;
    responseMessage?: string;
    errors: string[];
}

export interface LastSyncResult {
    finishedAt: number;
    processed: number;
    failed: number;
    remaining: number;
    failures: SyncFailure[];
}

interface RetailerIndentsSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    lastSyncedTime: string;
    retailerIndents: RetailerIndent[];
    openIndents: RetailerIndent[];
    openCount: number;
    currentOpenIndent: RetailerIndent | null;
    queueRevision: number;
    dataSource: 'server' | 'cache' | 'none';
    pendingIndentOpCount: number;
    drainProgress: DrainProgress | null;
    lastSyncResult: LastSyncResult | null;
    clearLastSyncResult: () => void;
    patchIndentLocally: (
        remoteId: string,
        partial: Partial<RetailerIndent>,
    ) => void;
    patchIndentItemLocally: (
        indentRemoteId: string,
        itemId: string | number,
        partial: Partial<RetailerIndentItem>,
    ) => void;
    applyServerIndentItem: (
        raw: IndentItemParamsResponse,
    ) => Promise<boolean>;
    createRetailerIndent: (input: {
        draft_id?: string | null;
        entity: string;
        entity_title: string;
        owner: string;
    }) => Promise<CreateRetailerIndentResult>;
    addOfferToIndent: (input: {
        indentId: string;
        wholesaleReceiptId: string;
        quantity: number;
    }) => Promise<IndentItemParamsResponse | null>;
    addOfferToIndentLocally: (input: {
        wholesale_receipt: string;
        wholesale_receipt_title: string;
        wholesaler: string | null;
        wholesaler_title: string;
        unit_of_receipt: string;
        unit_selling_price: string;
        final_unit_selling_price: string;
        images: any[];
        quantity: number;
        entity: string;
        entity_title: string;
        owner: string;
    }) => Promise<{
        ok: boolean;
        indentRemoteId?: string;
        itemId?: string;
    }>;
    updateIndentItem: (input: {
        indentId: string;
        itemId: string;
        required_quantity?: number;
        recommended_retail_price?: string | null;
        markup_percentage_used?: string | null;
    }) => Promise<UpdateIndentItemResult>;
    removeOfferFromIndent: (input: {
        indentId: string;
        itemId: string;
    }) => Promise<RemoveIndentItemResult>;
    closeIndent: (input: {
        indentId: string;
    }) => Promise<CloseIndentResult>;
    flushPendingOps: () => Promise<void>;
}

const RetailerIndentsSyncContext = createContext<
    RetailerIndentsSyncContextType | undefined
>(undefined);

const WS_INDENTS_URL =
    'wss://api.wazipos.co.ke/ws/retailers/indents/';

const WS_RECONNECT_DELAY_MS = 7000;
const MANUAL_REFRESH_FEEDBACK_MS = 1000;
const POLL_INTERVAL_MS = 5000;

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

const DEFAULT_ORDER_DAYS = '10';
const DEFAULT_LEAD_TIME = '1';

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

const log = (..._args: any[]) => { };
const warn = (..._args: any[]) => { };
const trace = (..._args: any[]) => { };
const patchTrace = (..._args: any[]) => { };

/* ------------------------------------------------------------------ */
/* Draft ID helpers                                                    */
/* ------------------------------------------------------------------ */

const isDraftId = (id: string | null | undefined): boolean =>
    typeof id === 'string' && id.includes(':');

function makeIndentDraftId(user: any): string {
    const userId = String(
        user?.id ?? user?.user_id ?? 'unknown-user',
    );
    const entityId = String(
        user?.entity_id ?? user?.entity ?? 'unknown-entity',
    );
    return `${userId}:${entityId}:${Date.now()}`;
}

function makeItemDraftId(
    user: any,
    wholesaleReceiptId: string,
): string {
    const userId = String(
        user?.id ?? user?.user_id ?? 'unknown-user',
    );
    const receipt = String(
        wholesaleReceiptId || 'unknown-receipt',
    );
    return `${userId}:${receipt}:${Date.now()}`;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

function uuidv4(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof (crypto as any).randomUUID === 'function'
    ) {
        return (crypto as any).randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        },
    );
}

const extractIndentsArray = (payload: any): any[] | null => {
    const p = payload?.data ?? payload;
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.results)) return p.results;
    if (Array.isArray(p?.retailer_indents)) return p.retailer_indents;
    if (Array.isArray(p?.indents)) return p.indents;
    if (Array.isArray(p?.data?.results)) return p.data.results;
    if (Array.isArray(p?.data?.retailer_indents))
        return p.data.retailer_indents;
    return null;
};

function extractServerError(data: any): {
    responseMessage: string;
    errors: string[];
} {
    const responseMessage =
        typeof data?.response_message === 'string'
            ? data.response_message
            : typeof data?.message === 'string'
                ? data.message
                : typeof data?.detail === 'string'
                    ? data.detail
                    : '';

    let errors: string[] = [];
    if (Array.isArray(data?.errors)) {
        errors = data.errors
            .map((e: any) =>
                typeof e === 'string' ? e : JSON.stringify(e),
            )
            .filter(Boolean);
    } else if (typeof data?.errors === 'string') {
        errors = [data.errors];
    } else if (data?.errors && typeof data.errors === 'object') {
        for (const [key, val] of Object.entries(data.errors)) {
            if (Array.isArray(val)) {
                for (const msg of val) {
                    errors.push(`${key}: ${String(msg)}`);
                }
            } else {
                errors.push(`${key}: ${String(val)}`);
            }
        }
    }

    return { responseMessage, errors };
}

function findServerItemByReceipt(
    indents: RetailerIndent[],
    indentRemoteId: string,
    wholesaleReceiptId: string,
): RetailerIndentItem | null {
    const indent = indents.find(
        (i) => i.remote_id === indentRemoteId,
    );
    if (!indent) return null;
    const item = indent.retailer_indent_items.find(
        (it) => it.wholesale_receipt === wholesaleReceiptId,
    );
    if (!item) return null;
    if (!item.remote_id) return null;
    return item;
}

/**
 * Drop every queued op targeting any of the supplied indent ids.
 * Matches against both `indent_local_id` (the original id an op was
 * created with) and `indent_remote_id` (the rebased id, once the
 * draft was promoted).
 */
async function dropPendingOpsForAnyId(
    ids: string[],
): Promise<number> {
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    const all = await db.getPendingIndentOps();
    const next = all.filter(
        (o) =>
            !idSet.has(o.indent_local_id) &&
            !(
                o.indent_remote_id &&
                idSet.has(o.indent_remote_id)
            ),
    );
    const dropped = all.length - next.length;
    if (dropped > 0) {
        await db.savePendingIndentOps(next);
    }
    return dropped;
}

/* ------------------------------------------------------------------ */
/* Normalizers                                                         */
/* ------------------------------------------------------------------ */

function resolveImageUrl(rawPath: any): string | null {
    if (!rawPath) return null;

    const path =
        typeof rawPath === 'string'
            ? rawPath
            : rawPath?.thumbnail || rawPath?.image || rawPath?.url || null;

    if (!path || typeof path !== 'string') return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }

    const cleanPath = trimmed.startsWith('/')
        ? trimmed.substring(1)
        : trimmed;

    return `${IMAGE_BASE_URL}/${cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
}

function normalizeIndentItemImage(
    raw: any,
): RetailerIndentItemImage {
    const rawImage =
        typeof raw === 'string'
            ? raw
            : raw?.image || raw?.url || null;

    const rawThumb =
        typeof raw === 'string'
            ? raw
            : raw?.thumbnail || raw?.image || null;

    return {
        id: String(raw?.id ?? ''),
        image: resolveImageUrl(rawImage) ?? '',
        thumbnail: resolveImageUrl(rawThumb) ?? '',
        owner: String(raw?.owner ?? ''),
        product: String(raw?.product ?? ''),
        entity: String(raw?.entity ?? ''),
        created: String(raw?.created ?? ''),
        updated: String(raw?.updated ?? ''),
    };
}

/**
 * Normalize an item from either the wire or a persisted row.
 *
 * Wire payload: `id` is the server UUID (string). No `remote_id` field.
 * Persisted row: `id` is a local number, `remote_id` is the server UUID.
 *
 * Legacy rows may still have a string `id`; if that string doesn't
 * contain a colon (the draft-id separator), it's treated as the server
 * UUID and moved into `remote_id`. Draft ids `<user>:<receipt>:<ts>`
 * are discarded from `id` since the local PK must be numeric.
 */
function normalizeIndentItem(raw: any): RetailerIndentItem {
    const rawId = raw?.id;

    const hasNumericId =
        typeof rawId === 'number' && Number.isFinite(rawId);

    const isWireId =
        typeof rawId === 'string' &&
        rawId.length > 0 &&
        !rawId.includes(':'); // draft ids carry a colon

    const remoteId: string | null = raw?.remote_id
        ? String(raw.remote_id)
        : isWireId
            ? String(rawId)
            : null;

    return {
        id: hasNumericId ? (rawId as number) : undefined,
        remote_id: remoteId,
        draft_id: raw?.draft_id ? String(raw.draft_id) : null,

        entity: String(raw?.entity ?? ''),
        entity_title: String(raw?.entity_title ?? ''),

        source: String(raw?.source ?? 'PREDICTION'),
        source_label: String(raw?.source_label ?? ''),

        retailer_indent: String(raw?.retailer_indent ?? ''),
        wholesale_receipt: raw?.wholesale_receipt ?? null,
        wholesale_receipt_title: String(
            raw?.wholesale_receipt_title ?? '',
        ),
        wholesaler: raw?.wholesaler ?? null,
        wholesaler_title: String(raw?.wholesaler_title ?? ''),

        wholesaler_price_discount:
            raw?.wholesaler_price_discount ?? null,
        wholesaler_price_discount_title: String(
            raw?.wholesaler_price_discount_title ?? '',
        ),
        wholesaler_quantity_discount:
            raw?.wholesaler_quantity_discount ?? null,
        wholesaler_quantity_discount_title: String(
            raw?.wholesaler_quantity_discount_title ?? '',
        ),

        campaign_item: raw?.campaign_item ?? null,
        campaign_item_details: raw?.campaign_item_details ?? null,

        required_quantity: Number(raw?.required_quantity ?? 0),
        total_quantity: Number(raw?.total_quantity ?? 0),

        bonus_quantity_earned: Number(
            raw?.bonus_quantity_earned ?? 0,
        ),
        bonus_blocks_earned: Number(
            raw?.bonus_blocks_earned ?? 0,
        ),
        bonus_rule_buy_quantity:
            raw?.bonus_rule_buy_quantity ?? null,
        bonus_rule_free_quantity:
            raw?.bonus_rule_free_quantity ?? null,

        supplier_unit_selling_price:
            raw?.supplier_unit_selling_price ?? null,
        final_supplier_unit_selling_price:
            raw?.final_supplier_unit_selling_price ?? null,
        recommended_retail_price:
            raw?.recommended_retail_price ?? null,
        markup_percentage_used:
            raw?.markup_percentage_used ?? null,

        final_unit_price: raw?.final_unit_price ?? null,
        item_gross_total_amount:
            raw?.item_gross_total_amount ?? null,
        item_net_total_amount:
            raw?.item_net_total_amount ?? null,

        profit_estimate: raw?.profit_estimate ?? null,
        cost_per_unit: raw?.cost_per_unit ?? null,
        sell_per_unit: raw?.sell_per_unit ?? null,
        profit_per_unit: raw?.profit_per_unit ?? null,
        total_profit: raw?.total_profit ?? null,
        total_revenue: raw?.total_revenue ?? null,
        margin_percent: raw?.margin_percent ?? null,
        pricing_source: raw?.pricing_source ?? null,

        lead_time_days: Number(raw?.lead_time_days ?? 0),
        lead_time_variance_days: Number(
            raw?.lead_time_variance_days ?? 0,
        ),
        lead_time_source: String(
            raw?.lead_time_source ?? 'default',
        ),

        manufacture_date: raw?.manufacture_date ?? null,
        expiry_date: raw?.expiry_date ?? null,
        images: Array.isArray(raw?.images)
            ? raw.images.map(normalizeIndentItemImage)
            : [],

        created: String(raw?.created ?? ''),
        updated: String(raw?.updated ?? ''),
        owner: String(raw?.owner ?? ''),
    };
}

function normalizeIndent(i: any, ts: string): RetailerIndent {
    return {
        cached_at: String(firstDefined(i.cached_at, ts)),
        remote_id: String(firstDefined(i.id, i.key, '')),
        draft_id: i.draft_id ? String(i.draft_id) : null,

        is_open: String(i.is_open ?? 'false'),
        indent_number: String(i.indent_number ?? ''),
        entity: String(i.entity ?? ''),
        entity_title: String(i.entity_title ?? ''),

        lead_time: Number(i.lead_time ?? 0),
        order_days: Number(i.order_days ?? 0),
        budget_amount: i.budget_amount ?? null,
        budget_enforced: String(i.budget_enforced ?? 'false'),
        pricing_percentage: String(
            i.pricing_percentage ?? '0.00',
        ),

        average_lead_time_days: String(
            i.average_lead_time_days ?? '0.00',
        ),
        average_variance_days: String(
            i.average_variance_days ?? '0.00',
        ),
        min_lead_time_days: Number(i.min_lead_time_days ?? 0),
        max_lead_time_days: Number(i.max_lead_time_days ?? 0),
        lead_time_updated_at: i.lead_time_updated_at ?? null,

        total_cost: String(i.total_cost ?? '0.00'),
        total_revenue: String(i.total_revenue ?? '0.00'),
        total_profit: String(i.total_profit ?? '0.00'),
        included_item_count: Number(i.included_item_count ?? 0),
        excluded_item_count: Number(i.excluded_item_count ?? 0),
        over_budget: toBool(i.over_budget),

        has_items: toBool(
            firstDefined(
                i.has_items,
                Array.isArray(i.retailer_indent_items) &&
                i.retailer_indent_items.length > 0,
            ),
        ),
        active_item_count: Number(
            firstDefined(
                i.active_item_count,
                Array.isArray(i.retailer_indent_items)
                    ? i.retailer_indent_items.filter(
                        (it: any) =>
                            Number(it?.total_quantity ?? 0) > 0,
                    ).length
                    : 0,
            ),
        ),

        config_snapshot: i.config_snapshot ?? null,

        retailer_indent_items: Array.isArray(
            i.retailer_indent_items,
        )
            ? i.retailer_indent_items.map(normalizeIndentItem)
            : [],

        created: String(firstDefined(i.created, ts)),
        updated: String(firstDefined(i.updated, ts)),
        owner: String(i.owner ?? ''),
    };
}

/* ------------------------------------------------------------------ */
/* Equality / merge helpers                                            */
/* ------------------------------------------------------------------ */

function areIndentsEqual(
    a: RetailerIndent[],
    b: RetailerIndent[],
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];

        if (
            x.remote_id !== y.remote_id ||
            x.draft_id !== y.draft_id ||
            x.updated !== y.updated ||
            x.is_open !== y.is_open ||
            x.indent_number !== y.indent_number ||
            x.entity_title !== y.entity_title ||
            x.total_cost !== y.total_cost ||
            x.total_revenue !== y.total_revenue ||
            x.total_profit !== y.total_profit ||
            x.included_item_count !== y.included_item_count ||
            x.excluded_item_count !== y.excluded_item_count ||
            x.active_item_count !== y.active_item_count ||
            x.has_items !== y.has_items ||
            x.retailer_indent_items.length !==
            y.retailer_indent_items.length
        ) {
            return false;
        }
    }

    return true;
}

function mergeIndentItems(
    local: RetailerIndentItem[],
    incoming: RetailerIndentItem[],
): RetailerIndentItem[] {
    const byKey = new Map<string, RetailerIndentItem>();

    const keyOf = (it: RetailerIndentItem): string => {
        if (it.draft_id) return `draft:${it.draft_id}`;
        if (it.remote_id) return `remote:${it.remote_id}`;
        return `local:${it.id ?? 'unset'}`;
    };

    for (const it of local) {
        byKey.set(keyOf(it), it);
    }

    for (const inc of incoming) {
        let existing = byKey.get(keyOf(inc));

        /* First fallback: same remote_id, different key (draft → remote). */
        if (!existing && inc.remote_id) {
            for (const [k, v] of byKey.entries()) {
                if (v.remote_id === inc.remote_id) {
                    existing = v;
                    byKey.delete(k);
                    break;
                }
            }
        }

        /* Second fallback: incoming remote replaces a local draft
         * that carries the same wholesale_receipt but no remote_id. */
        if (!existing && inc.remote_id && inc.wholesale_receipt) {
            for (const [k, v] of byKey.entries()) {
                if (
                    !v.remote_id &&
                    v.wholesale_receipt === inc.wholesale_receipt
                ) {
                    existing = v;
                    byKey.delete(k);
                    break;
                }
            }
        }

        if (existing) {
            byKey.set(keyOf(inc), { ...existing, ...inc });
        } else {
            byKey.set(keyOf(inc), inc);
        }
    }

    return Array.from(byKey.values());
}

function adoptServerIndentForLoneDraft(
    current: RetailerIndent[],
    incoming: RetailerIndent[],
): RetailerIndent[] {
    const incomingOpenReals = incoming.filter(
        (i) => toBool(i.is_open) && !isDraftId(i.remote_id),
    );
    const localOpenDrafts = current.filter(
        (i) => toBool(i.is_open) && isDraftId(i.remote_id),
    );

    if (
        incomingOpenReals.length !== 1 ||
        localOpenDrafts.length !== 1
    ) {
        return current;
    }

    const real = incomingOpenReals[0];
    const draft = localOpenDrafts[0];

    if (
        current.some(
            (i) =>
                !isDraftId(i.remote_id) &&
                i.remote_id === real.remote_id,
        )
    ) {
        return current;
    }

    return current.map((ind) =>
        ind.remote_id === draft.remote_id
            ? { ...ind, remote_id: real.remote_id }
            : ind,
    );
}

function consolidateOpenIndents(
    indents: RetailerIndent[],
): RetailerIndent[] {
    const openReals = indents.filter(
        (i) => toBool(i.is_open) && !isDraftId(i.remote_id),
    );
    const openDrafts = indents.filter(
        (i) => toBool(i.is_open) && isDraftId(i.remote_id),
    );

    if (openReals.length === 0 || openDrafts.length === 0) {
        return indents;
    }

    const real = openReals[0];
    const items = mergeIndentItems(
        real.retailer_indent_items,
        openDrafts.flatMap((d) => d.retailer_indent_items),
    );

    const draftIds = new Set(openDrafts.map((d) => d.remote_id));

    const mergedReal: RetailerIndent = {
        ...real,
        retailer_indent_items: items,
        active_item_count: items.filter(
            (it) => Number(it.total_quantity ?? 0) > 0,
        ).length,
        has_items: items.length > 0,
    };

    return [
        mergedReal,
        ...indents.filter(
            (i) =>
                i.remote_id !== real.remote_id &&
                !draftIds.has(i.remote_id),
        ),
    ];
}

/**
 * Merge a WS snapshot into the current set.
 *
 * Open and closed remote indents are both kept. Closed remote
 * indents still have their queued ops dropped — retrying an op
 * against a closed indent can never succeed — but the row itself
 * stays in the mirror so the UI can render it.
 */
function mergeIndentsSnapshot(
    current: RetailerIndent[],
    incoming: RetailerIndent[],
    protectedIds: Set<string>,
): RetailerIndent[] {
    if (incoming.length === 0) return current;

    /* ── 1. Detect closed remote indents ────────────────────── */
    const closedRemoteIds = new Set<string>();
    const closedDraftIds = new Set<string>();

    for (const inc of incoming) {
        if (isDraftId(inc.remote_id)) continue;
        if (toBool(inc.is_open)) continue;
        closedRemoteIds.add(inc.remote_id);
        if (inc.draft_id) closedDraftIds.add(inc.draft_id);
    }

    /* ── 2. Drop queued ops targeting now-closed indents. ─────
     * The row stays; only the queue is pruned. */
    if (closedRemoteIds.size > 0 || closedDraftIds.size > 0) {
        const droppedIds: string[] = [];
        for (const ind of current) {
            if (closedRemoteIds.has(ind.remote_id)) {
                droppedIds.push(ind.remote_id);
                if (ind.draft_id) droppedIds.push(ind.draft_id);
            } else if (
                ind.draft_id &&
                closedDraftIds.has(ind.draft_id)
            ) {
                droppedIds.push(ind.draft_id);
            }
        }
        if (droppedIds.length > 0) {
            dropPendingOpsForAnyId(droppedIds)
                .then((n) => {
                    if (n > 0) setQueueRevision((r) => r + 1);
                })
                .catch(() => { });
        }
    }

    /* ── 3. Adopt a lone draft onto an incoming open indent ─── */
    const adoptedCurrent = adoptServerIndentForLoneDraft(
        current,
        incoming,
    );

    /* ── 4. Standard merge. Closed rows are kept. ───────────── */
    const byRemoteId = new Map<string, RetailerIndent>();
    const byDraftId = new Map<string, RetailerIndent>();

    for (const ind of adoptedCurrent) {
        if (ind.remote_id) byRemoteId.set(ind.remote_id, ind);
        if (ind.draft_id) byDraftId.set(ind.draft_id, ind);
    }

    const matchedDraftIds = new Set<string>();
    const next: RetailerIndent[] = [];

    for (const inc of incoming) {
        const localDraft =
            inc.draft_id && byDraftId.get(inc.draft_id)
                ? byDraftId.get(inc.draft_id)!
                : null;

        if (localDraft && isDraftId(localDraft.remote_id)) {
            matchedDraftIds.add(inc.draft_id!);

            const mergedItems = mergeIndentItems(
                localDraft.retailer_indent_items,
                inc.retailer_indent_items,
            );

            next.push({
                ...localDraft,
                ...inc,
                remote_id: inc.remote_id,
                draft_id: inc.draft_id ?? localDraft.draft_id,
                retailer_indent_items: mergedItems,
            });

            byRemoteId.delete(localDraft.remote_id);
            byRemoteId.set(inc.remote_id, inc);

            continue;
        }

        const existing = byRemoteId.get(inc.remote_id);
        if (existing) {
            next.push({
                ...existing,
                ...inc,
                draft_id:
                    inc.draft_id ?? existing.draft_id ?? null,
                retailer_indent_items: mergeIndentItems(
                    existing.retailer_indent_items,
                    inc.retailer_indent_items,
                ),
            });
        } else {
            next.push(inc);
        }
    }

    for (const ind of adoptedCurrent) {
        const matchedByRemote = next.some(
            (n) => n.remote_id === ind.remote_id,
        );
        if (matchedByRemote) continue;

        const isDraft = isDraftId(ind.remote_id);
        const draftId = ind.draft_id ?? null;
        const draftWasConfirmed = draftId
            ? matchedDraftIds.has(draftId)
            : false;

        if (draftWasConfirmed) continue;

        /* Keep drafts (unconfirmed), pending-op indents, and
         * closed reals. Only drop open reals the server stopped
         * sending — those are gone server-side. */
        const keep =
            protectedIds.has(ind.remote_id) ||
            isDraft ||
            !toBool(ind.is_open);

        if (keep) next.push(ind);
    }

    return consolidateOpenIndents(next);
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const RetailerIndentsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [retailerIndents, setRetailerIndents] = useState<
        RetailerIndent[]
    >([]);
    const [queueRevision, setQueueRevision] = useState(0);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [dataSource, setDataSource] = useState<
        'server' | 'cache' | 'none'
    >('none');
    const [pendingIndentOpCount, setPendingIndentOpCount] =
        useState(0);
    const [drainProgress, setDrainProgress] =
        useState<DrainProgress | null>(null);
    const [lastSyncResult, setLastSyncResult] =
        useState<LastSyncResult | null>(null);

    const addOfferApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload),
    );
    const updateOfferApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload),
    );
    const removeOfferApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload),
    );
    const closeIndentApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload),
    );
    const createIndentApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload),
    );
    const drainApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailStaffAction(payload),
    );

    const wsRef = useRef<WebSocket | null>(null);
    const indentsStateRef = useRef<RetailerIndent[]>([]);
    const reconnectTimeoutRef =
        useRef<NodeJS.Timeout | null>(null);
    const wsGenerationRef = useRef(0);
    const isOnlineRef = useRef(isOnline);
    const userRef = useRef(user);
    const isDrainingRef = useRef(false);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        indentsStateRef.current = retailerIndents;
    }, [retailerIndents]);

    const openIndents = useMemo(
        () => retailerIndents.filter((i) => toBool(i.is_open)),
        [retailerIndents],
    );

    const currentOpenIndent = useMemo<RetailerIndent | null>(
        () => (openIndents.length > 0 ? openIndents[0] : null),
        [openIndents],
    );

    const commitToStorage = useCallback(
        async (data: RetailerIndent[]) => {
            await db.saveRetailerIndents(data);
        },
        [],
    );

    const patchIndentLocally = useCallback(
        (remoteId: string, partial: Partial<RetailerIndent>) => {
            setRetailerIndents((prev) => {
                let changed = false;
                const next = prev.map((i) => {
                    if (i.remote_id !== remoteId) return i;
                    changed = true;
                    return { ...i, ...partial };
                });
                return changed ? next : prev;
            });
        },
        [],
    );

    /**
     * Patch an item's fields in memory. `itemId` may be:
     *   - a numeric local id (matches `it.id`)
     *   - a server UUID (matches `it.remote_id`)
     *   - a client draft id (matches `it.draft_id`)
     */
    const patchIndentItemLocally = useCallback(
        (
            indentRemoteId: string,
            itemId: string | number,
            partial: Partial<RetailerIndentItem>,
        ) => {
            const matchesItem = (it: RetailerIndentItem): boolean => {
                if (typeof itemId === 'number') {
                    return it.id === itemId;
                }
                if (it.remote_id && it.remote_id === itemId) {
                    return true;
                }
                if (it.draft_id && it.draft_id === itemId) {
                    return true;
                }
                return false;
            };

            setRetailerIndents((prev) => {
                let anyChanged = false;
                const next = prev.map((indent) => {
                    if (indent.remote_id !== indentRemoteId)
                        return indent;
                    let indentChanged = false;
                    const items = indent.retailer_indent_items.map(
                        (it) => {
                            if (!matchesItem(it)) return it;
                            indentChanged = true;
                            return { ...it, ...partial };
                        },
                    );
                    if (!indentChanged) return indent;
                    anyChanged = true;
                    return {
                        ...indent,
                        retailer_indent_items: items,
                    };
                });
                return anyChanged ? next : prev;
            });
        },
        [],
    );

    const clearLastSyncResult = useCallback(() => {
        setLastSyncResult(null);
    }, []);

    const applyServerIndentItem = useCallback(
        async (
            raw: IndentItemParamsResponse,
        ): Promise<boolean> => {
            if (!raw?.item_id || !raw?.indent_id) return false;

            const current = indentsStateRef.current;
            let anyChanged = false;

            const next = current.map((indent) => {
                if (indent.remote_id !== raw.indent_id) return indent;

                let itemChanged = false;
                const items = indent.retailer_indent_items.map(
                    (it) => {
                        const matches =
                            (it.remote_id &&
                                it.remote_id === raw.item_id) ||
                            (it.draft_id &&
                                raw.params?.draft_id === it.draft_id) ||
                            (!it.remote_id &&
                                it.wholesale_receipt &&
                                raw.params?.wholesale_receipt ===
                                it.wholesale_receipt);

                        if (!matches) return it;
                        itemChanged = true;
                        return {
                            ...it,
                            ...(raw.params ?? {}),
                            remote_id: String(raw.item_id),
                            draft_id: null,
                        };
                    },
                );

                if (!itemChanged) return indent;
                anyChanged = true;

                const activeItemCount = items.filter(
                    (it) => Number(it.total_quantity ?? 0) > 0,
                ).length;

                return {
                    ...indent,
                    retailer_indent_items: items,
                    active_item_count: activeItemCount,
                    has_items: items.length > 0,
                };
            });

            if (!anyChanged) return false;

            indentsStateRef.current = next;
            setRetailerIndents(next);
            setDataSource('server');
            setQueueRevision((r) => r + 1);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            );

            await commitToStorage(next);
            return true;
        },
        [commitToStorage],
    );

    const createRetailerIndent = useCallback(
        async (_input: {
            draft_id?: string | null;
            entity: string;
            entity_title: string;
            owner: string;
        }): Promise<CreateRetailerIndentResult> => {
            try {
                const res: any = await createIndentApi.request({
                    action: 'CreateRetailerIndent',
                    order_days: DEFAULT_ORDER_DAYS,
                    lead_time: DEFAULT_LEAD_TIME,
                });

                console.log('[CreateRetailerIndent] res', res);

                const data = res?.data ?? res;

                const { responseMessage, errors } =
                    extractServerError(data);

                const isOk =
                    res?.ok === true ||
                    String(data?.response_code ?? '') === '0';

                if (!isOk) {
                    const serverMessage = String(
                        responseMessage ||
                        errors[0] ||
                        res?.problem ||
                        'CreateRetailerIndent was rejected by the server.',
                    );
                    return {
                        ok: false,
                        message: serverMessage,
                        responseMessage:
                            responseMessage || serverMessage,
                        errors:
                            errors.length > 0
                                ? errors
                                : [serverMessage],
                    };
                }

                const indentId =
                    data?.indent_id ??
                    data?.retailer_indent ??
                    data?.id ??
                    data?.params?.indent_id ??
                    data?.params?.id ??
                    data?.params?.retailer_indent;

                if (!indentId) {
                    const fallback =
                        'Server returned no indent id.';
                    return {
                        ok: false,
                        message: fallback,
                        responseMessage:
                            responseMessage || fallback,
                        errors:
                            errors.length > 0
                                ? errors
                                : [fallback],
                    };
                }

                return { ok: true, indent_id: String(indentId) };
            } catch (e: any) {
                const responseData = e?.response?.data;
                const { responseMessage, errors } =
                    extractServerError(responseData);

                const msg =
                    responseMessage ||
                    errors[0] ||
                    e?.message ||
                    'Could not create indent.';

                return {
                    ok: false,
                    message: msg,
                    responseMessage: responseMessage || msg,
                    errors: errors.length > 0 ? errors : [msg],
                };
            }
        },
        [createIndentApi],
    );

    const addOfferToIndentLocally = useCallback(
        async (input: {
            wholesale_receipt: string;
            wholesale_receipt_title: string;
            wholesaler: string | null;
            wholesaler_title: string;
            unit_of_receipt: string;
            unit_selling_price: string;
            final_unit_selling_price: string;
            images: any[];
            quantity: number;
            entity: string;
            entity_title: string;
            owner: string;
        }): Promise<{
            ok: boolean;
            indentRemoteId?: string;
            itemId?: string;
        }> => {
            const qty = Math.max(
                1,
                Math.floor(Number(input.quantity) || 0),
            );
            if (qty <= 0) return { ok: false };

            const nowIso = new Date().toISOString();
            const current = consolidateOpenIndents(
                indentsStateRef.current,
            );

            const realTarget = current.find(
                (i) => toBool(i.is_open) && !isDraftId(i.remote_id),
            );
            const draftTarget = current.find(
                (i) => toBool(i.is_open) && isDraftId(i.remote_id),
            );
            const target = realTarget ?? draftTarget;

            let indentRemoteId: string;
            let next: RetailerIndent[];

            if (target) {
                indentRemoteId = target.remote_id;
                next = current;
            } else {
                indentRemoteId = makeIndentDraftId(userRef.current);
                const draft: RetailerIndent = {
                    cached_at: nowIso,
                    remote_id: indentRemoteId,
                    draft_id: uuidv4(),
                    is_open: 'true',
                    indent_number: '',
                    entity: input.entity,
                    entity_title: input.entity_title,
                    lead_time: Number(DEFAULT_LEAD_TIME) || 0,
                    order_days: Number(DEFAULT_ORDER_DAYS) || 0,
                    budget_amount: null,
                    budget_enforced: 'false',
                    pricing_percentage: '0.00',
                    average_lead_time_days: '0.00',
                    average_variance_days: '0.00',
                    min_lead_time_days: 0,
                    max_lead_time_days: 0,
                    lead_time_updated_at: null,
                    total_cost: '0.00',
                    total_revenue: '0.00',
                    total_profit: '0.00',
                    included_item_count: 0,
                    excluded_item_count: 0,
                    over_budget: false,
                    has_items: false,
                    active_item_count: 0,
                    config_snapshot: null,
                    retailer_indent_items: [],
                    created: nowIso,
                    updated: nowIso,
                    owner: input.owner,
                };
                next = [draft, ...current];
            }

            const unitPrice = Number(
                input.final_unit_selling_price ||
                input.unit_selling_price ||
                '0',
            );

            /* Item draft id: <userId>:<wholesaleReceiptId>:<timestampMs>.
             * Note: `id` (local numeric PK) is intentionally omitted —
             * the db layer assigns it on the next save. */
            const itemDraftId = makeItemDraftId(
                userRef.current,
                input.wholesale_receipt,
            );

            const newItem: RetailerIndentItem = {
                remote_id: null,
                draft_id: itemDraftId,

                entity: input.entity,
                entity_title: input.entity_title,
                source: 'MANUAL',
                source_label: 'Manually added',
                retailer_indent: indentRemoteId,
                wholesale_receipt: input.wholesale_receipt,
                wholesale_receipt_title:
                    input.wholesale_receipt_title,
                wholesaler: input.wholesaler,
                wholesaler_title: input.wholesaler_title,
                wholesaler_price_discount: null,
                wholesaler_price_discount_title: '',
                wholesaler_quantity_discount: null,
                wholesaler_quantity_discount_title: '',
                campaign_item: null,
                campaign_item_details: null,
                required_quantity: qty,
                total_quantity: qty,
                bonus_quantity_earned: 0,
                bonus_blocks_earned: 0,
                bonus_rule_buy_quantity: null,
                bonus_rule_free_quantity: null,
                supplier_unit_selling_price:
                    input.unit_selling_price || null,
                final_supplier_unit_selling_price:
                    input.final_unit_selling_price || null,
                recommended_retail_price: null,
                markup_percentage_used: null,
                final_unit_price: String(unitPrice),
                item_gross_total_amount: String(unitPrice * qty),
                item_net_total_amount: String(unitPrice * qty),
                profit_estimate: null,
                cost_per_unit: unitPrice,
                sell_per_unit: null,
                profit_per_unit: null,
                total_profit: null,
                total_revenue: null,
                margin_percent: null,
                pricing_source: 'manual',
                lead_time_days: 0,
                lead_time_variance_days: 0,
                lead_time_source: 'default',
                manufacture_date: null,
                expiry_date: null,
                images: Array.isArray(input.images)
                    ? input.images.map(normalizeIndentItemImage)
                    : [],
                created: nowIso,
                updated: nowIso,
                owner: input.owner,
            };

            const merged = next.map((indent) => {
                if (indent.remote_id !== indentRemoteId)
                    return indent;

                const existingIdx =
                    indent.retailer_indent_items.findIndex(
                        (it) =>
                            it.wholesale_receipt ===
                            input.wholesale_receipt,
                    );

                let items: RetailerIndentItem[];
                if (existingIdx >= 0) {
                    items = indent.retailer_indent_items.map(
                        (it, i) => {
                            if (i !== existingIdx) return it;
                            const newQty =
                                it.required_quantity + qty;
                            return {
                                ...it,
                                required_quantity: newQty,
                                total_quantity: newQty,
                                final_unit_price:
                                    String(unitPrice),
                                item_gross_total_amount:
                                    String(unitPrice * newQty),
                                item_net_total_amount: String(
                                    unitPrice * newQty,
                                ),
                                updated: nowIso,
                            };
                        },
                    );
                } else {
                    items = [
                        ...indent.retailer_indent_items,
                        newItem,
                    ];
                }

                const activeItemCount = items.filter(
                    (it) => Number(it.total_quantity ?? 0) > 0,
                ).length;

                return {
                    ...indent,
                    retailer_indent_items: items,
                    active_item_count: activeItemCount,
                    has_items: items.length > 0,
                    updated: nowIso,
                };
            });

            indentsStateRef.current = merged;
            setRetailerIndents(merged);
            setQueueRevision((r) => r + 1);
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            );

            try {
                await commitToStorage(merged);
            } catch { }

            return {
                ok: true,
                indentRemoteId,
                itemId: itemDraftId,
            };
        },
        [commitToStorage],
    );

    const addOfferToIndent = useCallback(
        async (input: {
            indentId: string;
            wholesaleReceiptId: string;
            quantity: number;
        }): Promise<IndentItemParamsResponse | null> => {
            let resolvedIndentId = input.indentId;
            const needsResolve =
                !resolvedIndentId || isDraftId(resolvedIndentId);

            if (needsResolve) {
                const existingReal = indentsStateRef.current.find(
                    (i) =>
                        toBool(i.is_open) &&
                        !isDraftId(i.remote_id),
                );

                if (existingReal) {
                    resolvedIndentId = existingReal.remote_id;
                } else {
                    const draftIndent =
                        indentsStateRef.current.find(
                            (i) => i.remote_id === input.indentId,
                        );

                    const created = await createRetailerIndent({
                        draft_id: draftIndent?.draft_id ?? null,
                        entity: '',
                        entity_title: '',
                        owner: '',
                    });

                    if (!created.ok || !created.indent_id) {
                        await db.enqueuePendingIndentOp({
                            kind: 'ITEM_ADD',
                            indent_local_id: input.indentId,
                            indent_remote_id: null,
                            wholesale_receipt:
                                input.wholesaleReceiptId,
                            quantity: input.quantity,
                        });
                        setQueueRevision((r) => r + 1);
                        const c =
                            await db.countPendingIndentOps();
                        setPendingIndentOpCount(c);

                        const err: any = new Error(
                            created.message ??
                            'Could not create indent.',
                        );
                        err.responseMessage =
                            created.responseMessage ??
                            created.message;
                        err.errors = created.errors ?? [];
                        throw err;
                    }

                    resolvedIndentId = created.indent_id;

                    if (
                        input.indentId &&
                        isDraftId(input.indentId)
                    ) {
                        await db.rebasePendingIndentId(
                            input.indentId,
                            resolvedIndentId,
                        );

                        const rebased = consolidateOpenIndents(
                            indentsStateRef.current.map((ind) =>
                                ind.remote_id === input.indentId
                                    ? {
                                        ...ind,
                                        remote_id:
                                            resolvedIndentId!,
                                    }
                                    : ind,
                            ),
                        );
                        indentsStateRef.current = rebased;
                        setRetailerIndents(rebased);
                        await commitToStorage(rebased);
                        setQueueRevision((r) => r + 1);
                    }
                }
            }

            const existingServerItem = findServerItemByReceipt(
                indentsStateRef.current,
                resolvedIndentId,
                input.wholesaleReceiptId,
            );

            try {
                let res: any;

                if (existingServerItem) {
                    const newTotal =
                        Number(
                            existingServerItem.required_quantity ??
                            0,
                        ) + input.quantity;

                    res = await updateOfferApi.request({
                        action: 'UpdateRetailerIndentItem',
                        retailer_indent: resolvedIndentId,
                        retailer_indent_item:
                            existingServerItem.remote_id,
                        required_quantity: newTotal,
                    });

                    console.log(
                        '[UpdateRetailerIndentItem] res',
                        res,
                    );

                    const data = res?.data ?? res;
                    const isOk =
                        res?.ok === true ||
                        String(data?.response_code ?? '') ===
                        '0';

                    if (!isOk) {
                        const { responseMessage, errors } =
                            extractServerError(data);
                        const message =
                            responseMessage ||
                            errors[0] ||
                            'Update rejected.';
                        const err: any = new Error(message);
                        err.responseMessage = responseMessage;
                        err.errors = errors;
                        throw err;
                    }

                    const updated = indentsStateRef.current.map(
                        (indent) => {
                            if (
                                indent.remote_id !==
                                resolvedIndentId
                            )
                                return indent;
                            const items =
                                indent.retailer_indent_items.map(
                                    (it) => {
                                        if (
                                            it.remote_id !==
                                            existingServerItem.remote_id
                                        )
                                            return it;
                                        return {
                                            ...it,
                                            ...(data?.params ?? {}),
                                            required_quantity:
                                                newTotal,
                                            total_quantity:
                                                newTotal,
                                        };
                                    },
                                );
                            return {
                                ...indent,
                                retailer_indent_items: items,
                            };
                        },
                    );
                    indentsStateRef.current = updated;
                    setRetailerIndents(updated);
                    setQueueRevision((r) => r + 1);
                    await commitToStorage(updated);

                    return {
                        item_id:
                            existingServerItem.remote_id ??
                            undefined,
                        indent_id: resolvedIndentId,
                        params:
                            data?.params ??
                            ({
                                required_quantity: newTotal,
                            } as Partial<RetailerIndentItem>),
                    };
                }

                res = await addOfferApi.request({
                    action: 'CreateRetailerIndentItem',
                    wholesale_receipt: input.wholesaleReceiptId,
                    required_quantity: input.quantity,
                    retailer_indent: resolvedIndentId,
                    source: 'MANUAL',
                });

                console.log(
                    '[CreateRetailerIndentItem] res',
                    res,
                );

                const data = res?.data ?? res;
                const isOk =
                    res?.ok === true ||
                    String(data?.response_code ?? '') === '0';

                if (!isOk) {
                    const { responseMessage, errors } =
                        extractServerError(data);
                    const message =
                        responseMessage ||
                        errors[0] ||
                        'Add-to-indent rejected.';
                    const err: any = new Error(message);
                    err.responseMessage = responseMessage;
                    err.errors = errors;
                    throw err;
                }

                const itemId = data?.item_id;
                const indentId = data?.indent_id;

                if (itemId) {
                    const targetIndentId =
                        indentId ?? resolvedIndentId;
                    let touched = false;
                    const updated = indentsStateRef.current.map(
                        (indent) => {
                            if (
                                indent.remote_id !==
                                targetIndentId
                            )
                                return indent;
                            const items =
                                indent.retailer_indent_items.map(
                                    (it) => {
                                        if (
                                            it.wholesale_receipt ===
                                            input.wholesaleReceiptId &&
                                            !it.remote_id
                                        ) {
                                            touched = true;
                                            return {
                                                ...it,
                                                ...(data?.params ??
                                                    {}),
                                                remote_id: String(
                                                    itemId,
                                                ),
                                                draft_id: null,
                                            };
                                        }
                                        return it;
                                    },
                                );
                            return {
                                ...indent,
                                retailer_indent_items: items,
                            };
                        },
                    );
                    if (touched) {
                        indentsStateRef.current = updated;
                        setRetailerIndents(updated);
                        setQueueRevision((r) => r + 1);
                        await commitToStorage(updated);
                    }
                }

                if (itemId) {
                    return {
                        item_id: itemId,
                        indent_id: indentId ?? resolvedIndentId,
                        params: data?.params,
                    };
                }

                return null;
            } catch (e: any) {
                await db.enqueuePendingIndentOp({
                    kind: 'ITEM_ADD',
                    indent_local_id: resolvedIndentId,
                    indent_remote_id: resolvedIndentId,
                    wholesale_receipt: input.wholesaleReceiptId,
                    quantity: input.quantity,
                });
                setQueueRevision((r) => r + 1);
                const c = await db.countPendingIndentOps();
                setPendingIndentOpCount(c);
                throw e;
            }
        },
        [
            addOfferApi,
            updateOfferApi,
            createRetailerIndent,
            commitToStorage,
        ],
    );

    /* --------------------------------------------------------- */
    /* Update a single item (remote first, then local mirror).   */
    /*                                                           */
    /* Wire shape:                                               */
    /*   {                                                       */
    /*     action: 'UpdateRetailerIndentItem',                   */
    /*     indent_id: '<retailer indent id>',                    */
    /*     item_id:   '<retailer indent item id>',               */
    /*     params: {                                             */
    /*       required_quantity:        <number>,                 */
    /*       recommended_retail_price: '<decimal>' | 0,          */
    /*       markup_percentage_used:   '<decimal>' | 0,          */
    /*     },                                                    */
    /*   }                                                       */
    /*                                                           */
    /* Empty / null price inputs are normalized to 0 so the wire */
    /* payload always carries a number for those two fields.     */
    /* --------------------------------------------------------- */

    const updateIndentItem = useCallback(
        async (input: {
            indentId: string;
            itemId: string;
            required_quantity?: number;
            recommended_retail_price?: string | null;
            markup_percentage_used?: string | null;
        }): Promise<UpdateIndentItemResult> => {
            const params: Record<string, any> = {};
            if (input.required_quantity !== undefined) {
                params.required_quantity = input.required_quantity;
            }
            if (input.recommended_retail_price !== undefined) {
                const v = input.recommended_retail_price;
                params.recommended_retail_price =
                    v === null || v === undefined || v === ''
                        ? 0
                        : v;
            }
            if (input.markup_percentage_used !== undefined) {
                const v = input.markup_percentage_used;
                params.markup_percentage_used =
                    v === null || v === undefined || v === ''
                        ? 0
                        : v;
            }

            if (Object.keys(params).length === 0) {
                return { ok: true };
            }

            /* Locate the item in the live mirror. `itemId` may be
             * either a remote UUID or a client draft id. */
            const indent = indentsStateRef.current.find(
                (i) => i.remote_id === input.indentId,
            );
            const item = indent?.retailer_indent_items.find(
                (it) =>
                    it.remote_id === input.itemId ||
                    it.draft_id === input.itemId,
            );

            /* Draft item → server doesn't know it yet; local-only. */
            if (item && !item.remote_id) {
                const next = indentsStateRef.current.map((ind) =>
                    ind.remote_id !== input.indentId
                        ? ind
                        : {
                            ...ind,
                            retailer_indent_items:
                                ind.retailer_indent_items.map((it) =>
                                    it.draft_id === item.draft_id
                                        ? { ...it, ...params }
                                        : it,
                                ),
                        },
                );
                indentsStateRef.current = next;
                setRetailerIndents(next);
                setQueueRevision((r) => r + 1);
                await commitToStorage(next);
                return { ok: true };
            }

            /* Remote first. */
            try {
                const res: any = await updateOfferApi.request({
                    action: 'UpdateRetailerIndentItem',
                    indent_id: input.indentId,
                    item_id: item?.remote_id ?? input.itemId,
                    params,
                });

                console.log('[UpdateRetailerIndentItem] res', res);

                const data = res?.data ?? res;
                const isOk =
                    res?.ok === true ||
                    String(data?.response_code ?? '') === '0';

                if (!isOk) {
                    const { responseMessage, errors } =
                        extractServerError(data);
                    return {
                        ok: false,
                        message:
                            responseMessage ||
                            errors[0] ||
                            'Update rejected.',
                        errors,
                    };
                }

                const serverParams: Partial<RetailerIndentItem> =
                    data?.params ?? params;

                const targetRemoteId =
                    item?.remote_id ?? input.itemId;

                let anyChanged = false;
                const next = indentsStateRef.current.map((ind) => {
                    if (ind.remote_id !== input.indentId) return ind;

                    let itemChanged = false;
                    const items = ind.retailer_indent_items.map(
                        (it) => {
                            if (it.remote_id !== targetRemoteId)
                                return it;
                            itemChanged = true;
                            return { ...it, ...serverParams };
                        },
                    );

                    if (!itemChanged) return ind;
                    anyChanged = true;

                    const activeItemCount = items.filter(
                        (it) => Number(it.total_quantity ?? 0) > 0,
                    ).length;

                    return {
                        ...ind,
                        retailer_indent_items: items,
                        active_item_count: activeItemCount,
                        has_items: items.length > 0,
                    };
                });

                if (anyChanged) {
                    indentsStateRef.current = next;
                    setRetailerIndents(next);
                    setQueueRevision((r) => r + 1);
                    await commitToStorage(next);
                }

                return { ok: true };
            } catch (e: any) {
                const { responseMessage, errors } =
                    extractServerError(e?.response?.data);
                return {
                    ok: false,
                    message:
                        responseMessage ||
                        errors[0] ||
                        e?.message ||
                        'Could not reach the server.',
                    errors,
                };
            }
        },
        [updateOfferApi, commitToStorage],
    );

    const removeOfferFromIndent = useCallback(
        async (input: {
            indentId: string;
            itemId: string;
        }): Promise<RemoveIndentItemResult> => {
            /* Draft item → never on the server; remove locally. */
            const indent = indentsStateRef.current.find(
                (i) => i.remote_id === input.indentId,
            );
            const item = indent?.retailer_indent_items.find(
                (it) =>
                    it.remote_id === input.itemId ||
                    it.draft_id === input.itemId,
            );

            if (item && !item.remote_id) {
                const next = indentsStateRef.current.map((ind) => {
                    if (ind.remote_id !== input.indentId) return ind;
                    const remaining =
                        ind.retailer_indent_items.filter(
                            (it) =>
                                it.draft_id !== item.draft_id,
                        );
                    return {
                        ...ind,
                        retailer_indent_items: remaining,
                        active_item_count: remaining.filter(
                            (it) =>
                                Number(it.total_quantity ?? 0) > 0,
                        ).length,
                        has_items: remaining.length > 0,
                    };
                });
                indentsStateRef.current = next;
                setRetailerIndents(next);
                setQueueRevision((r) => r + 1);
                await commitToStorage(next);
                return { ok: true };
            }

            try {
                const res: any = await removeOfferApi.request({
                    action: 'RemoveRetailerIndentItem',
                    retailer_indent: input.indentId,
                    retailer_indent_item:
                        item?.remote_id ?? input.itemId,
                });

                const data = res?.data ?? res;
                const isOk =
                    res?.ok === true ||
                    String(data?.response_code ?? '') === '0';

                if (!isOk) {
                    const { responseMessage, errors } =
                        extractServerError(data);
                    return {
                        ok: false,
                        message:
                            responseMessage ||
                            errors[0] ||
                            'Item not removed.',
                        errors,
                    };
                }

                const remaining = Array.isArray(
                    data?.indent_items,
                )
                    ? data.indent_items
                    : null;

                if (remaining) {
                    const updated = indentsStateRef.current.map(
                        (indent) => {
                            if (
                                indent.remote_id !==
                                input.indentId
                            )
                                return indent;
                            return {
                                ...indent,
                                retailer_indent_items:
                                    remaining.map(
                                        normalizeIndentItem,
                                    ),
                                active_item_count:
                                    remaining.filter(
                                        (it: any) =>
                                            Number(
                                                it.total_quantity ??
                                                0,
                                            ) > 0,
                                    ).length,
                                has_items:
                                    remaining.length > 0,
                            };
                        },
                    );
                    indentsStateRef.current = updated;
                    setRetailerIndents(updated);
                    setQueueRevision((r) => r + 1);
                    await commitToStorage(updated);
                }

                return { ok: true };
            } catch (e: any) {
                await db.enqueuePendingIndentOp({
                    kind: 'ITEM_REMOVE',
                    indent_local_id: input.indentId,
                    indent_remote_id: isDraftId(input.indentId)
                        ? null
                        : input.indentId,
                    item_id: item?.remote_id ?? input.itemId,
                });
                setQueueRevision((r) => r + 1);
                const c = await db.countPendingIndentOps();
                setPendingIndentOpCount(c);

                const responseData = e?.response?.data;
                const { responseMessage, errors } =
                    extractServerError(responseData);
                return {
                    ok: false,
                    message:
                        responseMessage ||
                        errors[0] ||
                        e?.message ||
                        'Could not reach the server.',
                    errors,
                };
            }
        },
        [removeOfferApi, commitToStorage],
    );

    const closeIndent = useCallback(
        async (input: {
            indentId: string;
        }): Promise<CloseIndentResult> => {
            try {
                const res: any = await closeIndentApi.request({
                    action: 'CloseRetailerIndent',
                    indent: input.indentId,
                });

                const data = res?.data ?? res;
                const { responseMessage, errors } =
                    extractServerError(data);

                const isOk =
                    res?.ok === true ||
                    String(data?.response_code ?? '') === '0';

                if (!isOk) {
                    return {
                        ok: false,
                        message:
                            responseMessage ||
                            errors[0] ||
                            'Indent was not closed.',
                        errors,
                    };
                }

                const dropped = await dropPendingOpsForAnyId([
                    input.indentId,
                ]);

                /* The server confirmed the close. Mark the row
                 * closed and keep it in the mirror so the list
                 * continues to show it. */
                const updated = indentsStateRef.current.map((i) =>
                    i.remote_id === input.indentId
                        ? { ...i, is_open: 'false' }
                        : i,
                );
                indentsStateRef.current = updated;
                setRetailerIndents(updated);
                setQueueRevision((r) => r + 1);
                await commitToStorage(updated);

                if (dropped > 0) {
                    const c = await db.countPendingIndentOps();
                    setPendingIndentOpCount(c);
                }

                return {
                    ok: true,
                    message:
                        responseMessage ||
                        'Retailer indent closed successfully',
                    errors: [],
                };
            } catch (e: any) {
                await db.enqueuePendingIndentOp({
                    kind: 'INDENT_CLOSE',
                    indent_local_id: input.indentId,
                    indent_remote_id: isDraftId(input.indentId)
                        ? null
                        : input.indentId,
                });
                setQueueRevision((r) => r + 1);
                const c = await db.countPendingIndentOps();
                setPendingIndentOpCount(c);

                const responseData = e?.response?.data;
                const { responseMessage, errors } =
                    extractServerError(responseData);
                return {
                    ok: false,
                    message:
                        responseMessage ||
                        errors[0] ||
                        e?.message ||
                        'Could not reach the server.',
                    errors,
                };
            }
        },
        [closeIndentApi, commitToStorage],
    );

    /* --------------------------------------------------------- */
    /* Drainer                                                   */
    /* --------------------------------------------------------- */

    const interpretOp = (
        res: any,
    ): {
        ok: boolean;
        message?: string;
        responseMessage?: string;
        errors?: string[];
        data?: any;
    } => {
        const data = res?.data ?? res;
        const ok =
            res?.ok === true ||
            String(data?.response_code ?? '') === '0';
        if (ok) return { ok: true, data };

        const { responseMessage, errors } =
            extractServerError(data);

        const message =
            responseMessage ||
            errors[0] ||
            String(
                res?.problem ??
                'Server rejected the operation.',
            );

        return {
            ok: false,
            message,
            responseMessage,
            errors,
            data,
        };
    };

    const applyOp = useCallback(
        async (
            op: PendingIndentOp,
            indentRemoteId: string,
        ): Promise<{
            ok: boolean;
            message?: string;
            responseMessage?: string;
            errors?: string[];
        }> => {
            switch (op.kind) {
                case 'ITEM_ADD': {
                    if (!op.wholesale_receipt || !op.quantity) {
                        return {
                            ok: false,
                            message: 'Malformed ITEM_ADD op.',
                            errors: [],
                        };
                    }

                    const existing = findServerItemByReceipt(
                        indentsStateRef.current,
                        indentRemoteId,
                        op.wholesale_receipt,
                    );

                    if (existing) {
                        const newTotal =
                            Number(
                                existing.required_quantity ?? 0,
                            ) + op.quantity;

                        const res = await drainApi.request({
                            action: 'UpdateRetailerIndentItem',
                            retailer_indent: indentRemoteId,
                            retailer_indent_item:
                                existing.remote_id,
                            required_quantity: newTotal,
                            client_op_id: op.client_op_id,
                        });

                        console.log(
                            '[UpdateRetailerIndentItem] res (drain)',
                            res,
                        );

                        const parsed = interpretOp(res);
                        if (!parsed.ok) return parsed;

                        const updated =
                            indentsStateRef.current.map(
                                (indent) => {
                                    if (
                                        indent.remote_id !==
                                        indentRemoteId
                                    )
                                        return indent;
                                    const items =
                                        indent.retailer_indent_items.map(
                                            (it) => {
                                                if (
                                                    it.remote_id !==
                                                    existing.remote_id
                                                )
                                                    return it;
                                                return {
                                                    ...it,
                                                    required_quantity:
                                                        newTotal,
                                                    total_quantity:
                                                        newTotal,
                                                };
                                            },
                                        );
                                    return {
                                        ...indent,
                                        retailer_indent_items:
                                            items,
                                    };
                                },
                            );
                        indentsStateRef.current = updated;
                        setRetailerIndents(updated);
                        await commitToStorage(updated);
                        setQueueRevision((r) => r + 1);

                        return { ok: true };
                    }

                    const res = await drainApi.request({
                        action: 'CreateRetailerIndentItem',
                        wholesale_receipt: op.wholesale_receipt,
                        required_quantity: op.quantity,
                        retailer_indent: indentRemoteId,
                        source: 'MANUAL',
                        client_op_id: op.client_op_id,
                    });

                    console.log(
                        '[CreateRetailerIndentItem] res (drain)',
                        res,
                    );

                    const parsed = interpretOp(res);
                    if (!parsed.ok) return parsed;

                    const realItemId = parsed.data?.item_id;
                    if (realItemId && op.item_id) {
                        await db.rebasePendingIndentItemId(
                            op.item_id,
                            String(realItemId),
                        );
                    }
                    return { ok: true };
                }

                case 'ITEM_SET_QTY': {
                    if (
                        !op.item_id ||
                        op.quantity === undefined
                    ) {
                        return {
                            ok: false,
                            message: 'Malformed ITEM_SET_QTY op.',
                            errors: [],
                        };
                    }
                    const res = await drainApi.request({
                        action: 'UpdateRetailerIndentItem',
                        retailer_indent: indentRemoteId,
                        retailer_indent_item: op.item_id,
                        required_quantity: op.quantity,
                        client_op_id: op.client_op_id,
                    });
                    return interpretOp(res);
                }

                case 'ITEM_REMOVE': {
                    if (!op.item_id) {
                        return {
                            ok: false,
                            message: 'Malformed ITEM_REMOVE op.',
                            errors: [],
                        };
                    }
                    const res = await drainApi.request({
                        action: 'RemoveRetailerIndentItem',
                        retailer_indent: indentRemoteId,
                        retailer_indent_item: op.item_id,
                        client_op_id: op.client_op_id,
                    });
                    return interpretOp(res);
                }

                case 'INDENT_CLOSE': {
                    const res = await drainApi.request({
                        action: 'CloseRetailerIndent',
                        indent: indentRemoteId,
                        client_op_id: op.client_op_id,
                    });
                    return interpretOp(res);
                }

                default:
                    return {
                        ok: false,
                        message: `Unknown op kind: ${op.kind}`,
                        errors: [],
                    };
            }
        },
        [drainApi, commitToStorage],
    );

    const runDrain = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;
        if (isDrainingRef.current) return;

        isDrainingRef.current = true;

        const startedAt = Date.now();
        const results: Array<{
            client_op_id: string;
            kind: string;
            ok: boolean;
            message?: string;
            responseMessage?: string;
            errors?: string[];
        }> = [];
        let processed = 0;
        let failed = 0;

        try {
            const allOps = await db.listPendingIndentOps();
            if (allOps.length === 0) {
                setPendingIndentOpCount(0);
                return;
            }

            setDrainProgress({
                done: 0,
                total: allOps.length,
                startedAt,
            });

            const groups = new Map<string, PendingIndentOp[]>();
            for (const op of allOps) {
                if (!groups.has(op.indent_local_id))
                    groups.set(op.indent_local_id, []);
                groups.get(op.indent_local_id)!.push(op);
            }

            for (const [indentLocalId, ops] of groups) {
                let indentRemoteId =
                    ops[0].indent_remote_id ?? null;

                if (!indentRemoteId) {
                    const created = await createRetailerIndent({
                        draft_id:
                            indentsStateRef.current.find(
                                (i) =>
                                    i.remote_id === indentLocalId,
                            )?.draft_id ?? null,
                        entity: '',
                        entity_title: '',
                        owner: '',
                    });

                    if (!created.ok || !created.indent_id) {
                        failed += ops.length;
                        results.push({
                            client_op_id: '(create-indent)',
                            kind: 'INDENT_CREATE',
                            ok: false,
                            message:
                                created.message ??
                                'CreateRetailerIndent failed.',
                            responseMessage:
                                created.responseMessage ??
                                created.message ??
                                'CreateRetailerIndent failed.',
                            errors:
                                created.errors &&
                                    created.errors.length > 0
                                    ? created.errors
                                    : created.message
                                        ? [created.message]
                                        : [
                                            'CreateRetailerIndent failed.',
                                        ],
                        });
                        break;
                    }

                    indentRemoteId = created.indent_id;

                    await db.rebasePendingIndentId(
                        indentLocalId,
                        indentRemoteId,
                    );

                    const rebasedState = consolidateOpenIndents(
                        indentsStateRef.current.map((ind) =>
                            ind.remote_id === indentLocalId
                                ? {
                                    ...ind,
                                    remote_id:
                                        indentRemoteId!,
                                }
                                : ind,
                        ),
                    );
                    indentsStateRef.current = rebasedState;
                    setRetailerIndents(rebasedState);
                    await commitToStorage(rebasedState);
                    setQueueRevision((r) => r + 1);
                }

                let groupFailed = false;
                for (const op of ops) {
                    if (op.id === undefined) continue;

                    try {
                        const res = await applyOp(
                            op,
                            indentRemoteId!,
                        );
                        if (!res.ok) {
                            await db.markPendingIndentOpAttempt(
                                op.id,
                                res.message ?? 'unknown',
                            );
                            results.push({
                                client_op_id: op.client_op_id,
                                kind: op.kind,
                                ok: false,
                                message: res.message,
                                responseMessage:
                                    res.responseMessage,
                                errors: res.errors ?? [],
                            });
                            failed += 1;
                            groupFailed = true;
                            break;
                        }
                        await db.completePendingIndentOp(op.id);
                        processed += 1;
                        results.push({
                            client_op_id: op.client_op_id,
                            kind: op.kind,
                            ok: true,
                        });

                        if (op.kind === 'INDENT_CLOSE') {
                            const dropped =
                                await dropPendingOpsForAnyId([
                                    indentRemoteId,
                                    indentLocalId,
                                ]);
                            /* Keep the row; flip to closed. */
                            const updated =
                                indentsStateRef.current.map((i) =>
                                    i.remote_id === indentRemoteId
                                        ? { ...i, is_open: 'false' }
                                        : i,
                                );
                            indentsStateRef.current = updated;
                            setRetailerIndents(updated);
                            await commitToStorage(updated);
                            setQueueRevision((r) => r + 1);

                            if (dropped > 0) {
                                const fresh =
                                    await db.countPendingIndentOps();
                                setPendingIndentOpCount(fresh);
                            }
                            break;
                        }

                        const freshCount =
                            await db.countPendingIndentOps();
                        setPendingIndentOpCount(freshCount);
                        setDrainProgress({
                            done: processed,
                            total: allOps.length,
                            startedAt,
                        });
                    } catch (e: any) {
                        await db.markPendingIndentOpAttempt(
                            op.id,
                            e?.message ?? 'unknown',
                        );
                        results.push({
                            client_op_id: op.client_op_id,
                            kind: op.kind,
                            ok: false,
                            message: e?.message,
                            errors: [],
                        });
                        failed += 1;
                        groupFailed = true;
                        break;
                    }
                }

                if (groupFailed) break;
            }

            const remaining = await db.countPendingIndentOps();
            setPendingIndentOpCount(remaining);

            const finishedAt = Date.now();

            setLastSyncResult({
                finishedAt,
                processed,
                failed,
                remaining,
                failures: results
                    .filter((r) => !r.ok)
                    .map((r) => ({
                        kind: r.kind,
                        client_op_id: r.client_op_id,
                        message: r.message,
                        responseMessage: r.responseMessage,
                        errors: r.errors ?? [],
                    })),
            });
        } catch {
            // Swallow; retried on the next poll cycle.
        } finally {
            isDrainingRef.current = false;
            setDrainProgress(null);
        }
    }, [
        token,
        createRetailerIndent,
        applyOp,
        commitToStorage,
    ]);

    const flushPendingOps = useCallback(async () => {
        await runDrain();
    }, [runDrain]);

    /* --------------------------------------------------------- */
    /* Hydration                                                 */
    /* --------------------------------------------------------- */

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await db.getRetailerIndents();

            const sanitized = cached.filter(
                (i) => !isDraftId(i.remote_id) || !!i.draft_id,
            );
            const consolidated = consolidateOpenIndents(sanitized);

            if (
                consolidated.length !== cached.length ||
                consolidated.some(
                    (c, i) =>
                        c.remote_id !== cached[i]?.remote_id,
                )
            ) {
                await commitToStorage(consolidated);
            }

            if (
                Array.isArray(consolidated) &&
                consolidated.length > 0
            ) {
                indentsStateRef.current = consolidated;
                setRetailerIndents((prev) =>
                    areIndentsEqual(prev, consolidated)
                        ? prev
                        : consolidated,
                );
                setDataSource('cache');
                setQueueRevision((r) => r + 1);
            } else {
                setDataSource('none');
            }

            const c = await db.countPendingIndentOps();
            setPendingIndentOpCount(c);

            return consolidated;
        } catch {
            return [];
        }
    }, [commitToStorage]);

    /* --------------------------------------------------------- */
    /* WebSocket live sync                                       */
    /* --------------------------------------------------------- */

    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.onerror = null;
                    wsRef.current.onmessage = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }

            if (!currentToken) {
                setIsLiveConnected(false);
                return;
            }

            if (!isOnlineRef.current) {
                setIsLiveConnected(false);
                return;
            }

            const generation = ++wsGenerationRef.current;

            try {
                const url = `${WS_INDENTS_URL}?token=${encodeURIComponent(
                    currentToken,
                )}`;
                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onopen = () => {
                    if (generation !== wsGenerationRef.current)
                        return;
                    setIsLiveConnected(true);
                };

                ws.onmessage = async (event) => {
                    if (generation !== wsGenerationRef.current)
                        return;

                    try {
                        const parsed = JSON.parse(event.data);
                        const incoming =
                            extractIndentsArray(parsed);

                        if (!Array.isArray(incoming)) return;

                        const nowStr =
                            new Date().toISOString();
                        const normalizedIncoming: RetailerIndent[] =
                            incoming.map((raw: any) =>
                                normalizeIndent(raw, nowStr),
                            );

                        const protectedIds =
                            await db.getProtectedIndentIds();

                        const merged = mergeIndentsSnapshot(
                            indentsStateRef.current,
                            normalizedIncoming,
                            protectedIds,
                        );

                        await commitToStorage(merged);

                        indentsStateRef.current = merged;
                        setRetailerIndents((prev) =>
                            areIndentsEqual(prev, merged)
                                ? prev
                                : merged,
                        );
                        setDataSource('server');
                        setQueueRevision((r) => r + 1);
                        setLastSyncedTime(
                            new Date().toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                        );
                    } catch { }
                };

                ws.onclose = (ev: any) => {
                    if (generation !== wsGenerationRef.current)
                        return;
                    setIsLiveConnected(false);
                    wsRef.current = null;

                    if (currentToken && isOnlineRef.current) {
                        reconnectTimeoutRef.current =
                            setTimeout(
                                () =>
                                    establishLiveWebSocketSync(
                                        currentToken,
                                    ),
                                WS_RECONNECT_DELAY_MS,
                            );
                    }
                };

                ws.onerror = () => { };
            } catch { }
        },
        [commitToStorage],
    );

    /* --------------------------------------------------------- */
    /* Poller                                                    */
    /* --------------------------------------------------------- */

    useEffect(() => {
        if (pendingIndentOpCount === 0) return;
        const id = setInterval(() => {
            runDrain();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [pendingIndentOpCount, runDrain]);

    /* --------------------------------------------------------- */
    /* Bootstrap                                                 */
    /* --------------------------------------------------------- */

    const actionsRef = useRef({
        hydrateFromLocalDB,
        establishLiveWebSocketSync,
        runDrain,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            establishLiveWebSocketSync,
            runDrain,
        };
    });

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            if (token) {
                actionsRef.current.establishLiveWebSocketSync(
                    token,
                );
                actionsRef.current.runDrain();
            } else {
                indentsStateRef.current = [];
                setRetailerIndents([]);
                setDataSource('none');
                if (wsRef.current) {
                    try {
                        wsRef.current.onclose = null;
                        wsRef.current.onerror = null;
                        wsRef.current.close();
                    } catch { }
                    wsRef.current = null;
                }
            }
        };

        init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            actionsRef.current.establishLiveWebSocketSync(token);
            actionsRef.current.runDrain();
        } else {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.onerror = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }
            setIsLiveConnected(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* --------------------------------------------------------- */
    /* Manual refresh                                            */
    /* --------------------------------------------------------- */

    const forceManualRefresh = useCallback(async () => {
        if (!token) return;

        setIsManualRefreshing(true);
        try {
            establishLiveWebSocketSync(token);
            await runDrain();
        } finally {
            setTimeout(
                () => setIsManualRefreshing(false),
                MANUAL_REFRESH_FEEDBACK_MS,
            );
        }
    }, [token, establishLiveWebSocketSync, runDrain]);

    const triggerManualFetch = forceManualRefresh;

    /* --------------------------------------------------------- */
    /* Value                                                     */
    /* --------------------------------------------------------- */

    const isMutating =
        addOfferApi.loading ||
        updateOfferApi.loading ||
        removeOfferApi.loading ||
        closeIndentApi.loading ||
        createIndentApi.loading;

    const isSyncing =
        isMutating ||
        (retailerIndents.length === 0 &&
            !isLiveConnected &&
            isOnline) ||
        pendingIndentOpCount > 0;

    const value = useMemo<RetailerIndentsSyncContextType>(
        () => ({
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            triggerManualFetch,
            forceManualRefresh,
            lastSyncedTime,
            retailerIndents,
            openIndents,
            openCount: openIndents.length,
            currentOpenIndent,
            queueRevision,
            dataSource,
            pendingIndentOpCount,
            drainProgress,
            lastSyncResult,
            clearLastSyncResult,
            patchIndentLocally,
            patchIndentItemLocally,
            applyServerIndentItem,
            createRetailerIndent,
            addOfferToIndent,
            addOfferToIndentLocally,
            updateIndentItem,
            removeOfferFromIndent,
            closeIndent,
            flushPendingOps,
        }),
        [
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            triggerManualFetch,
            forceManualRefresh,
            lastSyncedTime,
            retailerIndents,
            openIndents,
            currentOpenIndent,
            queueRevision,
            dataSource,
            pendingIndentOpCount,
            drainProgress,
            lastSyncResult,
            clearLastSyncResult,
            patchIndentLocally,
            patchIndentItemLocally,
            applyServerIndentItem,
            createRetailerIndent,
            addOfferToIndent,
            addOfferToIndentLocally,
            updateIndentItem,
            removeOfferFromIndent,
            closeIndent,
            flushPendingOps,
        ],
    );

    return (
        <RetailerIndentsSyncContext.Provider value={value}>
            {children}
        </RetailerIndentsSyncContext.Provider>
    );
};

export const useRetailerIndentsSync = () => {
    const context = useContext(RetailerIndentsSyncContext);
    if (!context) {
        throw new Error(
            'useRetailerIndentsSync must be used within a RetailerIndentsSyncProvider',
        );
    }
    return context;
};