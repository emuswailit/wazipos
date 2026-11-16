// utils/shoppingPlans.ts
//
// Shopping plans (wishlists): orders without commitment. A shopper builds one
// or more per shop — e.g. "Back to school · Amani (Grade 4)" — and pays for it
// by mobile money when ready, which turns it into a customer order.
//
// Stored entirely on the device (AsyncStorage, per user), lines included with
// the shop's product details, so a plan opens offline exactly as it was saved.

import type { CustomerOrder, CustomerOrderItem } from '@/databases/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export interface ShoppingPlan {
    id: string;
    /** `<user id>:<shop entity id>:<timestamp>`. Unique per plan (no two plans
     *  share one) and sent as the customer order's draft_id when it is paid. */
    draft_id?: string;
    title: string;
    /** Who it's for, e.g. "Amani · Grade 4". */
    for_whom?: string;
    /** YYYY-MM-DD the items are needed by (e.g. school opening). */
    need_by?: string;
    note?: string;
    /** What the shopper means to spend (KES); totals are checked against it. */
    budget?: number;
    /** When the lines' prices were last checked against the shop's stock. */
    prices_checked_at?: string;
    /** Last check per line (keyed by retailer_receipt). */
    checks?: Record<string, LineCheck>;
    retailer_id?: string;
    retailer_name?: string;
    retailer_type?: string;
    retailer_location?: string;
    retailer_lat?: string;
    retailer_lng?: string;
    items: CustomerOrderItem[];
    created: string;
    updated: string;
}

const keyFor = (userId: string) => `wazipos_shopping_plans:${userId || 'guest'}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const newPlanId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Draft id shared by a plan and the customer order it becomes:
 *  `<logged-in user id>:<entity id>:<timestamp>` (entity = the shop). */
export const makeDraftId = (userId: string, entityId?: string | null) => `${userId || 'guest'}:${entityId || 'none'}:${Date.now()}`;

/** The entity segment of a draft id. */
export const draftEntity = (draftId?: string) => (draftId ? draftId.split(':')[1] ?? '' : '');

export async function loadPlans(userId: string): Promise<ShoppingPlan[]> {
    try {
        const raw = await AsyncStorage.getItem(keyFor(userId));
        const list = raw ? (JSON.parse(raw) as ShoppingPlan[]) : [];
        if (!Array.isArray(list)) return [];
        // One plan per draft id: if a draft id ever got saved twice, keep the latest.
        const seen = new Set<string>();
        return list
            .slice()
            .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
            .filter((p) => {
                if (!p.draft_id) return true;
                if (seen.has(p.draft_id)) return false;
                seen.add(p.draft_id);
                return true;
            });
    } catch {
        return [];
    }
}

async function saveAll(userId: string, plans: ShoppingPlan[]) {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(plans));
    notify();
}

export async function getPlan(userId: string, id: string): Promise<ShoppingPlan | null> {
    return (await loadPlans(userId)).find((p) => p.id === id) ?? null;
}

/** Inserts or merges `patch` into plan `id` (creating it if missing). A new
 *  plan whose draft_id already exists merges into that plan instead. */
export async function upsertPlan(userId: string, id: string, patch: Partial<ShoppingPlan>): Promise<ShoppingPlan> {
    const plans = await loadPlans(userId);
    const now = new Date().toISOString();
    let i = plans.findIndex((p) => p.id === id);
    if (i < 0 && patch.draft_id) {
        i = plans.findIndex((p) => p.draft_id === patch.draft_id);
        if (i >= 0) id = plans[i].id;
    }
    const next: ShoppingPlan =
        i >= 0
            ? { ...plans[i], ...patch, id, updated: now }
            : { title: 'My plan', items: [], created: now, draft_id: makeDraftId(userId, patch.retailer_id), ...patch, id, updated: now };
    if (i >= 0) plans[i] = next;
    else plans.unshift(next);
    await saveAll(userId, plans);
    return next;
}

export async function deletePlan(userId: string, id: string) {
    await saveAll(userId, (await loadPlans(userId)).filter((p) => p.id !== id));
}

/** "Back to school" → "Back to school 2" (next free number; old "(copy)" tails dropped). */
export function nextCopyTitle(title: string, existing: string[]): string {
    const base = title.replace(/(\s*\(copy\))+$/i, '').replace(/\s+\d+$/, '').trim() || 'My plan';
    const taken = new Set(existing.map((t) => t.trim().toLowerCase()));
    for (let n = 2; n < 1000; n++) {
        const t = `${base} ${n}`;
        if (!taken.has(t.toLowerCase())) return t;
    }
    return `${base} ${Date.now()}`;
}

export async function duplicatePlan(userId: string, id: string, title?: string): Promise<ShoppingPlan | null> {
    const plans = await loadPlans(userId);
    const src = plans.find((p) => p.id === id);
    if (!src) return null;
    const { id: _old, created: _c, updated: _u, draft_id: _d, ...rest } = src;
    return upsertPlan(userId, newPlanId(), {
        ...rest,
        draft_id: makeDraftId(userId, src.retailer_id),
        title: title || nextCopyTitle(src.title, plans.map((p) => p.title)),
    });
}

/* --------------------------------------------------------------- live check */

/** How a planned line stands against the shop's stock right now. */
export interface LineCheck {
    state: 'OK' | 'LOW' | 'OUT' | 'GONE';
    /** Set when the price differs from what the plan had: the previous price. */
    price_was?: number;
    price_now?: number;
    /** Units the shop has now. */
    available?: number;
}

export interface PlanCheckSummary {
    before: number;
    after: number;
    up: number;
    down: number;
    low: string[];
    out: string[];
    gone: string[];
}

const receiptKey = (r: any) => String(r?.remote_id || r?.id || '');
const titleOf = (it: CustomerOrderItem) => it.title || it.receipt_details?.product_title || 'An item';

/** The line re-priced at `price` (all totals recomputed). */
export function repriceItem(it: CustomerOrderItem, price: number): CustomerOrderItem {
    const q = lineQty(it);
    return {
        ...it,
        item_net_price: String(price),
        item_net_price_total: (price * q).toFixed(2),
        receipt_details: it.receipt_details ? { ...it.receipt_details, final_unit_selling_price: String(price) } : it.receipt_details,
        updated: new Date().toISOString(),
    };
}

/**
 * Compares the plan with the shop's live stock (`receipts`): new prices go
 * into the lines, and each line gets a state (in stock / low / out / no longer
 * sold). A price change stays flagged ("was KES x") until the next change.
 */
export function checkPlan(
    plan: ShoppingPlan,
    receipts: any[],
    priceOf: (r: any) => number,
): { items: CustomerOrderItem[]; checks: Record<string, LineCheck>; changed: CustomerOrderItem[]; summary: PlanCheckSummary } {
    const byId = new Map<string, any>();
    for (const r of receipts) {
        const k = receiptKey(r);
        if (k) byId.set(k, r);
    }
    const summary: PlanCheckSummary = { before: 0, after: 0, up: 0, down: 0, low: [], out: [], gone: [] };
    const checks: Record<string, LineCheck> = {};
    const changed: CustomerOrderItem[] = [];
    const items = plan.items.map((it) => {
        const id = String(it.retailer_receipt);
        const q = lineQty(it);
        const was = linePrice(it);
        summary.before += was * q;
        const prev = plan.checks?.[id];
        const r = byId.get(id);
        if (!r) {
            summary.gone.push(titleOf(it));
            summary.after += was * q;
            checks[id] = { state: 'GONE', price_was: prev?.price_was, price_now: was, available: 0 };
            return it;
        }
        const now = priceOf(r);
        const available = Number(r.current_unit_quantity ?? 0);
        const state: LineCheck['state'] = available <= 0 ? 'OUT' : available < q ? 'LOW' : 'OK';
        if (state === 'OUT') summary.out.push(titleOf(it));
        if (state === 'LOW') summary.low.push(`${titleOf(it)} (${available} left)`);
        summary.after += now * q;
        if (Math.abs(now - was) > 0.004) {
            if (now > was) summary.up += 1;
            else summary.down += 1;
            const next = repriceItem(it, now);
            changed.push(next);
            checks[id] = { state, price_was: was, price_now: now, available };
            return next;
        }
        checks[id] = { state, price_was: prev?.price_was, price_now: now, available };
        return it;
    });
    return { items, checks, changed, summary };
}

/** One message about what changed, or null when nothing did. */
export function describeCheck(s: PlanCheckSummary): string | null {
    const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
    const parts: string[] = [];
    if (s.up || s.down) {
        const moves = [s.up ? `${s.up} went up` : null, s.down ? `${s.down} went down` : null].filter(Boolean).join(', ');
        parts.push(`Prices changed (${moves}). Total ${kes(s.before)} → ${kes(s.after)}.`);
    }
    const list = (a: string[]) => `${a.slice(0, 3).join(', ')}${a.length > 3 ? ` and ${a.length - 3} more` : ''}`;
    if (s.out.length) parts.push(`Out of stock now: ${list(s.out)}.`);
    if (s.low.length) parts.push(`Not enough in stock: ${list(s.low)}.`);
    if (s.gone.length) parts.push(`No longer sold here: ${list(s.gone)}. Remove or swap them before paying.`);
    return parts.length ? parts.join('\n\n') : null;
}

/* --------------------------------------------------------------- figures */

export const lineQty = (it: CustomerOrderItem) => Number(it.purchased_quantity ?? 0);
export const linePrice = (it: CustomerOrderItem) => Number(it.receipt_details?.final_unit_selling_price ?? it.item_net_price ?? 0);
export const planTotal = (p: ShoppingPlan) => p.items.reduce((s, it) => s + lineQty(it) * linePrice(it), 0);
export const planUnits = (p: ShoppingPlan) => p.items.reduce((s, it) => s + lineQty(it), 0);

/** The plan as a draft customer order, so the shop front cart and checkout work on it. */
export function planToOrder(p: ShoppingPlan): CustomerOrder {
    return {
        draft_id: p.draft_id || p.id, // same draft id as the plan
        remote_id: '',
        status: 'draft',
        synced: 'FALSE',
        entity: p.retailer_id ?? '',
        entity_title: p.retailer_name ?? '',
        order_items: p.items,
        created: p.created,
        updated: p.updated,
    } as unknown as CustomerOrder;
}

/* --------------------------------------------------------------- hook */

/** All of the user's plans, kept in sync across screens. */
export function useShoppingPlans(userId: string) {
    const [plans, setPlans] = useState<ShoppingPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const reload = useCallback(async () => {
        setPlans(await loadPlans(userId));
        setLoading(false);
    }, [userId]);
    useEffect(() => {
        void reload();
        listeners.add(reload);
        return () => {
            listeners.delete(reload);
        };
    }, [reload]);
    return { plans, loading, reload };
}
