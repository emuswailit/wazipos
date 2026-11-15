// components/restaurants/owner/bar/useBarData.ts
//
// Drinks + open tabs for the restaurant the user works in. Offline first: the
// last copy loads from the device straight away, then the server copy replaces
// it when online. Writes go through the dining outbox (sent now, or queued).

import diningApi, { isOk, type BarLine, type BarTab, type Drink } from '@/api/diningApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { cacheGet, cacheSet, submitDining } from '@/services/diningOutbox';
import { onPendingOrdersChanged } from '@/services/pendingOrdersSignal';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useBarData() {
    const { user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const entity = String(user?.entity_id || 'none');
    const [drinks, setDrinksState] = useState<Drink[]>([]);
    const [tabs, setTabsState] = useState<BarTab[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncedAt, setSyncedAt] = useState<string | null>(null);
    const onlineRef = useRef(isOnline);
    onlineRef.current = isOnline;

    const setDrinks = useCallback(
        (next: Drink[]) => {
            setDrinksState(next);
            void cacheSet(`drinks:${entity}`, next);
        },
        [entity],
    );
    const setTabs = useCallback(
        (next: BarTab[]) => {
            setTabsState(next);
            void cacheSet(`tabs:${entity}`, next);
        },
        [entity],
    );

    const refresh = useCallback(async () => {
        if (!onlineRef.current) {
            setLoading(false);
            return;
        }
        try {
            const [d, t]: any[] = await Promise.all([diningApi.drinks(), diningApi.barTabs('open')]);
            if (isOk(d)) setDrinks(d.data.drinks ?? []);
            if (isOk(t)) setTabs(t.data.tabs ?? []);
            if (isOk(d)) {
                setError(null);
                setSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else setError(d?.data?.response_message || 'Could not load the bar.');
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setLoading(false);
        }
    }, [setDrinks, setTabs]);

    // Device copy first, then the server.
    useEffect(() => {
        let alive = true;
        (async () => {
            const [d, t] = await Promise.all([cacheGet<Drink[]>(`drinks:${entity}`), cacheGet<BarTab[]>(`tabs:${entity}`)]);
            if (!alive) return;
            if (d) setDrinksState(d);
            if (t) setTabsState(t);
            await refresh();
        })();
        return () => {
            alive = false;
        };
    }, [entity, refresh]);

    // Back online / outbox flushed: refresh.
    useEffect(() => {
        if (isOnline) void refresh();
    }, [isOnline, refresh]);
    useEffect(() => onPendingOrdersChanged(() => void refresh()), [refresh]);

    /** Take a sale off the local stock (shown at once, also offline). */
    const applyLocalSale = useCallback(
        (lines: BarLine[]) => {
            const used = new Map<string, number>();
            for (const l of lines) {
                const d = drinks.find((x) => x.id === l.drink);
                if (!d) continue;
                const per = l.unit === 'TOT' && d.tot_ml ? d.tot_ml / d.volume_ml : 1;
                used.set(d.id, (used.get(d.id) ?? 0) + per * l.quantity);
            }
            setDrinks(
                drinks.map((d) => {
                    if (!used.has(d.id)) return d;
                    const stock = Math.max(0, Number(d.stock_bottles) - used.get(d.id)!);
                    const full = Math.floor(stock);
                    return {
                        ...d,
                        stock_bottles: stock.toFixed(4),
                        full_bottles: full,
                        open_bottle_tots: d.sells_tots && d.tot_ml ? Math.floor(((stock - full) * d.volume_ml) / d.tot_ml) : null,
                        is_low: stock <= Number(d.reorder_level),
                    };
                }),
            );
        },
        [drinks, setDrinks],
    );

    const write = useCallback((action: string, payload: Record<string, any>, label: string) => submitDining(action, payload, label, onlineRef.current), []);

    const upsertDrink = useCallback((d: Drink) => setDrinks(drinks.some((x) => x.id === d.id) ? drinks.map((x) => (x.id === d.id ? d : x)) : [...drinks, d]), [drinks, setDrinks]);
    const upsertTab = useCallback(
        (t: BarTab) => {
            const others = tabs.filter((x) => x.id !== t.id);
            setTabs(t.status === 'OPEN' ? [t, ...others] : others);
        },
        [tabs, setTabs],
    );

    return { drinks, tabs, loading, error, syncedAt, isOnline, refresh, write, applyLocalSale, upsertDrink, upsertTab };
}

export type BarData = ReturnType<typeof useBarData>;

export const stockLabel = (d: Drink) => {
    const full = d.full_bottles;
    const tots = d.open_bottle_tots;
    if (Number(d.stock_bottles) <= 0) return 'Out of stock';
    return `${full} bottle${full === 1 ? '' : 's'}${tots ? ` + ${tots} tot${tots === 1 ? '' : 's'}` : ''}`;
};
