// api/billingApi.ts — WaziPOS Tokens (backend billing/, POST /api/v1/billing/).
//
// Pay per use instead of a monthly fee: 1 token = KES 1, each order processed
// uses a few tokens priced on its value (busier months cost less per order, and
// there is a monthly ceiling). The first month from approval is free.

import { ApiResponse } from 'apisauce';

import client from './client';

/** EXEMPT = a kind of business WaziPOS does not bill (Publisher). */
export type BillingMode = 'SETUP' | 'TRIAL' | 'LEGACY' | 'TOKENS' | 'EXEMPT';
export type LedgerKind = 'TOPUP' | 'BONUS' | 'USAGE' | 'TRIAL' | 'COVERED' | 'ADJUST';

export interface LedgerEntry {
    id: string;
    kind: LedgerKind;
    meter: string;
    meter_label: string;
    tokens: string;
    list_tokens: string;
    balance_after: string;
    order_value: string;
    reference: string;
    note: string;
    created: string;
}

export interface TokenPack {
    code: string;
    label: string;
    kes: string;
    bonus: string;
    tokens: string;
}

export interface BillingPricing {
    token_kes: string;
    trial_days: number;
    monthly_cap: string;
    overdraft: string;
    meters: { meter: string; label: string; rate_pct: string; min: string; max: string }[];
    tiers: { from_orders: number; pays_pct: number; label: string }[];
    packs: TokenPack[];
    custom: { min: string; max: string };
}

export interface BillingStatus {
    entity: { id: string; title: string; entity_type: string };
    mode: BillingMode;
    can_operate: boolean;
    blocked_reason: string | null;
    approval: 'SETUP' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
    balance: string;
    low_balance_at: string;
    is_low: boolean;
    has_topped_up: boolean;
    trial_ends_at: string | null;
    trial_days_left: number | null;
    legacy_until: string | null;
    runway_days: number | null;
    month: {
        orders: number;
        charged: string;
        listed: string;
        value: string;
        projected: string;
        cap: string;
        cap_used_pct: number;
        by_meter: { meter: string; label: string; orders: number; listed: string; charged: string; value: string }[];
    };
    is_admin: boolean;
    pricing: BillingPricing;
    applies: string[];
    recent: LedgerEntry[];
}

export interface TopUp {
    payment_id: string;
    reference_number?: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | string;
    description?: string;
    kes: string;
    tokens: string;
    bonus?: string;
    balance?: string;
}

export interface WalletRow {
    entity: string;
    title: string;
    entity_type: string;
    town: string | null;
    balance: string;
    mode: BillingMode;
    trial_ends_at: string | null;
    has_topped_up: boolean;
    month_orders: number;
    month_charged: string;
    month_listed: string;
}

const PATH = '/billing/';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(PATH, { action, ...data });

export default {
    status: () => call('GetBilling'),
    ledger: (params: { kind?: 'IN' | 'OUT'; page?: number } = {}) => call('GetLedger', params),
    pricing: () => call('GetPricing'),
    buy: (params: { pack?: string; amount?: number; phone: string }) => call('BuyTokens', params),
    refreshTopUp: (payment_id: string) => call('RefreshTopUp', { payment_id }),
    adminWallets: (q?: string) => call('AdminWallets', q ? { q } : {}),
    adminAdjust: (entity: string, tokens: number, note: string) => call('AdminAdjustTokens', { entity, tokens, note }),
    /** WaziPOS admins: trial tokens a business has had / can still get (max 100 in total). */
    adminTrialTokens: (entity: string) => call('AdminTrialTokens', { entity }),
    adminSendTrialTokens: (entity: string, tokens: number, note?: string) => call('AdminSendTrialTokens', { entity, tokens, note }),
};
