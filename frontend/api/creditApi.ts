// api/creditApi.ts — WaziPOS Credit / Lipa Baadaye (backend credit/, POST /api/v1/credit/).
//
// A lender (Bank / Facilitator) pays a buyer's order on the spot; the buyer repays the
// lender in 7, 14 or 28 days by mobile money straight into the lender's wallet.

import { ApiResponse } from 'apisauce';

import client from './client';

export type CreditKind = 'retailer' | 'wholesaler' | 'customer' | 'food';
export type FacilityStatus = 'ACTIVE' | 'OVERDUE' | 'REPAID' | 'DEFAULTED' | 'WRITTEN_OFF';
export type Tenor = 7 | 14 | 28;

export interface CreditQuote {
    tenor: Tenor;
    principal: number;
    interest: number;
    rate_pct: number;
    admin_fee: number;
    excise: number;
    total: number;
    charges: number;
    apr: number;
    due_date: string;
    late_fee: string;
}

export interface LenderOffer {
    lender_id: string;
    name: string;
    regulator: string;
    licence: string;
    terms: string | null;
    quotes: CreditQuote[];
}

export interface CreditOffers {
    eligible: boolean;
    reason: string | null;
    amount: number;
    segment: string;
    mode: 'self' | 'consent';
    borrower: { name: string | null };
    score: { score: number; limit: number; reasons: string[] };
    available_limit: number;
    lenders: LenderOffer[];
    facility?: Facility;
}

export interface Repayment {
    id: string;
    amount: number;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    reference: string;
    source: string;
    phone: string;
    paid_at: string | null;
    created: string;
}

export interface Facility {
    id: string;
    reference: string;
    status: FacilityStatus;
    segment: string;
    lender: { id: string; name: string };
    seller: string | null;
    order_kind: CreditKind;
    order_id: string;
    order_reference: string;
    borrower: string;
    principal: number;
    interest: number;
    admin_fee: number;
    excise: number;
    late_fees: number;
    total_due: number;
    repaid: number;
    outstanding: number;
    tenor_days: number;
    apr: number;
    disbursed_at: string;
    due_date: string;
    days_to_due: number;
    repaid_at: string | null;
    repayments: Repayment[];
    borrower_phone?: string | null;
    consent_via?: string;
}

export interface LenderProfile {
    id: string;
    status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED';
    display_name: string;
    regulator: string;
    licence_number: string;
    segments: string[];
    rate_7: number;
    rate_14: number;
    rate_28: number;
    admin_fee_pct: number;
    admin_fee_min: number;
    excise_pct: number;
    late_fee_pct_week: number;
    grace_days: number;
    min_amount: number;
    max_amount: number;
    max_exposure_per_borrower: number;
    min_score: number;
    auto_collect: boolean;
    terms: string | null;
    float_balance: number;
    total_disbursed: number;
    wallet: string | null;
    entity: { id: string; title: string; type: string };
    example: CreditQuote;
}

export interface LenderBook {
    profile: LenderProfile;
    stats: { loans: number; active: number; overdue: number; defaulted: number; disbursed: number; outstanding: number; collected: number; due_this_week: number; par30_pct: number; income: number };
    facilities: Facility[];
    float: { id: string; kind: string; amount: number; status: string; reference: string | null; note: string | null; created: string }[];
}

const PATH = 'credit/';
const post = <T = any>(action: string, body: Record<string, any> = {}): Promise<ApiResponse<T>> => client.post(PATH, { action, ...body });

const creditApi = {
    offers: (order_kind: CreditKind, order_id: string) => post<{ offers: CreditOffers }>('Offers', { order_kind, order_id }),
    requestConsent: (b: { order_kind: CreditKind; order_id: string; lender_id: string; tenor: Tenor; phone?: string }) => post<{ consent: { consent_id: string; phone: string; expires_in: number } }>('RequestConsent', b),
    borrow: (b: { order_kind: CreditKind; order_id: string; lender_id: string; tenor: Tenor; accept_terms: boolean; consent_id?: string; consent_code?: string }) => post<{ facility: Facility }>('Borrow', b),
    myLoans: () => post<{ facilities: Facility[] }>('MyLoans'),
    repay: (facility_id: string, phone: string, amount?: number | string) => post<{ repayment: Repayment }>('Repay', { facility_id, phone, amount }),
    refreshRepayment: (repayment_id: string) => post<{ repayment: Repayment }>('RefreshRepayment', { repayment_id }),
    myLender: () => post<{ lender: { profile: LenderProfile | null; entity: { id: string; title: string; type: string }; has_wallet: boolean } }>('MyLender'),
    saveLender: (b: Record<string, any>) => post<{ profile: LenderProfile }>('SaveLender', b),
    book: (status?: FacilityStatus) => post<{ book: LenderBook }>('LenderBook', { status }),
    topUp: (amount: number | string, phone: string) => post<{ topup: { id: string; reference: string; amount: number; status: string } }>('TopUpFloat', { amount, phone }),
    refreshTopUp: (movement_id: string) => post<{ topup: { id: string; status: string; amount: number } }>('RefreshTopUp', { movement_id }),
    withdraw: (amount: number | string) => post<{ withdrawal: { id: string; reference: string; amount: number } }>('WithdrawFloat', { amount }),
    deskLenders: () => post<{ lenders: LenderProfile[] }>('DeskLenders'),
    decideLender: (lender_id: string, decision: 'APPROVE' | 'SUSPEND') => post<{ profile: LenderProfile }>('DecideLender', { lender_id, decision }),
};

export default creditApi;
