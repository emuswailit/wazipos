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
    created: string;
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

const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post('/wifi/', { action, ...data });

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
};

export default wifiApi;
