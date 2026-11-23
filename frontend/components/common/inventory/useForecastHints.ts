// components/common/inventory/useForecastHints.ts
//
// Forecast hints for the retailer / wholesaler inventory lists: for each product,
// how long the stock lasts, when it runs out and how much to reorder — from the
// forecast engine's profit outlook (analytics GetProfitOutlook). Saved on the device
// (the same copy Forecasting → Profit & AI analyst uses), so the hints show offline.

import analyticsApi, { type OutlookProduct, type ProfitOutlook } from '@/api/analyticsApi';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type ForecastHint = Pick<OutlookProduct, 'days_of_cover' | 'stockout_on' | 'reorder_qty' | 'forecast_units' | 'accuracy_pct' | 'avg_daily' | 'flags'>;
export type ForecastHints = Record<string, ForecastHint>;

const KEY = 'wazipos_profit_outlook_v1';

function toHints(o: ProfitOutlook | null): ForecastHints {
    const out: ForecastHints = {};
    for (const p of o?.products ?? []) {
        out[p.product_id] = {
            days_of_cover: p.days_of_cover, stockout_on: p.stockout_on, reorder_qty: p.reorder_qty,
            forecast_units: p.forecast_units, accuracy_pct: p.accuracy_pct, avg_daily: p.avg_daily, flags: p.flags,
        };
    }
    return out;
}

export function useForecastHints(): ForecastHints {
    const { isOnline } = useNetworkStatus();
    const [hints, setHints] = useState<ForecastHints>({});
    useEffect(() => {
        let live = true;
        (async () => {
            const raw = await AsyncStorage.getItem(KEY).catch(() => null);
            if (raw && live) {
                try {
                    setHints(toHints(JSON.parse(raw)));
                } catch {
                    /* stale copy */
                }
            }
            if (!isOnline) return;
            const res: any = await analyticsApi.getProfitOutlookAction().catch(() => null);
            if (live && isServerOk(res)) {
                setHints(toHints(res.data.outlook));
                AsyncStorage.setItem(KEY, JSON.stringify(res.data.outlook)).catch(() => undefined);
            }
        })();
        return () => {
            live = false;
        };
    }, [isOnline]);
    return hints;
}

/** "~12 days" / "Runs out ~14 Jan" — short text for a row. */
export function hintLabel(h: ForecastHint | undefined): string | null {
    if (!h) return null;
    if (h.stockout_on) {
        const d = new Date(`${h.stockout_on}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
        return `Runs out ~${d}`;
    }
    if (h.days_of_cover != null) return h.days_of_cover > 90 ? '90+ days of stock' : `~${Math.round(h.days_of_cover)} days of stock`;
    return null;
}
