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

export async function loadPlans(userId: string): Promise<ShoppingPlan[]> {
    try {
        const raw = await AsyncStorage.getItem(keyFor(userId));
        const list = raw ? (JSON.parse(raw) as ShoppingPlan[]) : [];
        return Array.isArray(list) ? list : [];
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

/** Inserts or merges `patch` into plan `id` (creating it if missing). */
export async function upsertPlan(userId: string, id: string, patch: Partial<ShoppingPlan>): Promise<ShoppingPlan> {
    const plans = await loadPlans(userId);
    const now = new Date().toISOString();
    const i = plans.findIndex((p) => p.id === id);
    const next: ShoppingPlan =
        i >= 0
            ? { ...plans[i], ...patch, id, updated: now }
            : { title: 'My plan', items: [], created: now, ...patch, id, updated: now };
    if (i >= 0) plans[i] = next;
    else plans.unshift(next);
    await saveAll(userId, plans);
    return next;
}

export async function deletePlan(userId: string, id: string) {
    await saveAll(userId, (await loadPlans(userId)).filter((p) => p.id !== id));
}

export async function duplicatePlan(userId: string, id: string, title?: string): Promise<ShoppingPlan | null> {
    const src = await getPlan(userId, id);
    if (!src) return null;
    const { id: _old, created: _c, updated: _u, ...rest } = src;
    return upsertPlan(userId, newPlanId(), { ...rest, title: title || `${src.title} (copy)` });
}

/* --------------------------------------------------------------- figures */

export const lineQty = (it: CustomerOrderItem) => Number(it.purchased_quantity ?? 0);
export const linePrice = (it: CustomerOrderItem) => Number(it.receipt_details?.final_unit_selling_price ?? it.item_net_price ?? 0);
export const planTotal = (p: ShoppingPlan) => p.items.reduce((s, it) => s + lineQty(it) * linePrice(it), 0);
export const planUnits = (p: ShoppingPlan) => p.items.reduce((s, it) => s + lineQty(it), 0);

/** The plan as a draft customer order, so the shop front cart and checkout work on it. */
export function planToOrder(p: ShoppingPlan): CustomerOrder {
    return {
        draft_id: p.id,
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
