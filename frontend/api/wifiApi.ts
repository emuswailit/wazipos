// api/wifiApi.ts
//
// Wi-Fi hotspot business — POST /wifi/ (backend wifi/views.py wifiAPIView).
// Routers (hotspots), packages (tariffs: price for a length of time),
// customers' subscriptions and their mobile money payments.

import type { ApiResponse } from 'apisauce';

import client from './client';

export type Duration = 'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';
export type TrueFalse = 'true' | 'false';

export interface WifiRouter {
    id: string;
    entity: string;
    entity_title?: string;
    title: string;
    router_ip: string;
    nas_id: string;
    location: string | null;
    contact: string;
    brand: string;
    model: string;
    is_active?: TrueFalse;
    description?: string | null;
    created: string;
    updated: string;
}

export interface WifiTariff {
    id: string;
    entity: string;
    entity_title?: string;
    router: string | null;
    router_title?: string | null;
    title: string;
    price: string;
    length: number;
    duration: Duration;
    is_active: TrueFalse;
    description?: string | null;
    created: string;
    updated: string;
}

export interface WifiSubscription {
    id: string;
    entity: string;
    entity_title?: string;
    mac_address: string;
    username?: string;
    tariff_selected?: string | null;
    payment: string | null;
    valid_from: string;
    valid_to: string;
    /** "true" while valid_to is in the future. */
    is_active: TrueFalse;
    created: string;
}

export interface WifiPayment {
    id: string;
    entity: string;
    entity_title?: string;
    tariff: string | null;
    tariff_title?: string | null;
    reference_number: string;
    payout_reference_number?: string | null;
    psp_reference_number?: string | null;
    provider_reference_number?: string | null;
    account?: string | null;
    currency?: string;
    telco?: string | null;
    description?: string | null;
    status: 'PENDING' | 'SUCCESS' | 'CANCELLED' | 'FAILED' | string;
    amount: string;
    is_settled?: TrueFalse;
    /** Live monitor (backend wifi/payments.py). */
    mac_address?: string | null;
    connected?: boolean;
    activation_error?: string | null;
    payout?: WifiPayout | null;
    created: string;
}

/** The hotspot owner's share of a paid package, paid to the business's payout account. */
export interface WifiPayout {
    id: string;
    status: 'DUE' | 'PROCESSING' | 'PAID' | 'FAILED' | 'NO_ACCOUNT' | string;
    /** What to show: status, or BELOW_MINIMUM (under KES 10) / SENDING (no JamboPay reference yet). */
    stage?: 'DUE' | 'PROCESSING' | 'SENDING' | 'PAID' | 'FAILED' | 'NO_ACCOUNT' | 'BELOW_MINIMUM' | string;
    min_payout?: string;
    attempts?: number;
    reference_number?: string | null;
    updated?: string | null;
    status_label: string;
    amount: string;
    fee: string;
    account: string | null;
    account_type: string | null;
    note: string | null;
    paid_at: string | null;
    psp_reference: string | null;
}

export const DURATION_LABELS: Record<Duration, [string, string]> = {
    MINUTE: ['minute', 'minutes'],
    HOUR: ['hour', 'hours'],
    DAY: ['day', 'days'],
    WEEK: ['week', 'weeks'],
    MONTH: ['month', 'months'],
};
export const lengthLabel = (t: Pick<WifiTariff, 'length' | 'duration'>) => {
    const n = Number(t.length) || 1;
    const [one, many] = DURATION_LABELS[t.duration] ?? ['', ''];
    return `${n} ${n === 1 ? one : many}`;
};

/**
 * Every Wi-Fi call is logged to the console as "[wifi] …": the action, HTTP status,
 * apisauce problem (NETWORK_ERROR, TIMEOUT_ERROR, SERVER_ERROR…), response_code,
 * row count and any errors — so an empty screen says why.
 */
const call = async (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => {
    const started = Date.now();
    console.log(`[wifi] → ${action}`, Object.keys(data).length ? data : '');
    let res: ApiResponse<any>;
    try {
        res = await client.post('/wifi/', { action, ...data });
    } catch (e) {
        console.error(`[wifi] ✗ ${action} threw before a response`, e);
        throw e;
    }
    const body: any = res.data;
    const rows = Array.isArray(body) ? body : body?.results;
    const summary = {
        ms: Date.now() - started,
        ok: res.ok,
        status: res.status ?? null,
        problem: res.problem ?? null,
        url: (res.config?.baseURL ?? '') + (res.config?.url ?? ''),
        response_code: body?.response_code ?? null,
        message: body?.response_message ?? body?.detail ?? null,
        count: body?.count ?? (Array.isArray(rows) ? rows.length : null),
        returned: Array.isArray(rows) ? rows.length : null,
        errors: body?.errors ?? null,
    };
    if (!res.ok || (summary.response_code != null && String(summary.response_code) !== '0')) {
        console.warn(`[wifi] ✗ ${action}`, summary, typeof body === 'string' ? body.slice(0, 500) : body);
    } else {
        console.log(`[wifi] ✓ ${action}`, summary);
        if (Array.isArray(rows) && rows.length === 0) console.log(`[wifi] ${action}: the server returned no rows for this business (check which business you are working in).`);
    }
    return res;
};

const wifiApi = {
    routers: () => call('GetWifiRouters'),
    createRouter: (d: Record<string, any>) => call('CreateWifiRouter', d),
    updateRouter: (d: Record<string, any>) => call('UpdateWifiRouter', d),
    /** scope "all": include packages that are switched off. */
    tariffs: () => call('GetWifiTariffs', { scope: 'all' }),
    createTariff: (d: Record<string, any>) => call('CreateWifiTariff', d),
    updateTariff: (d: Record<string, any>) => call('UpdateWifiTariff', d),
    deleteTariff: (id: string) => call('DeleteWifiTariff', { id }),
    deleteRouter: (id: string) => call('DeleteWifiRouter', { id }),
    /** Subscriptions are created by customers' payments: read only. */
    subscriptions: () => call('GetWifiSubscriptions'),
    /** Customers' package payments: read only. */
    payments: () => call('GetWifiPayments'),
    /** Check one payment with the gateway now (connects the device and queues the payout if paid). */
    recheckPayment: (id: string) => call('RecheckWifiPayment', { id }),
};

export default wifiApi;
