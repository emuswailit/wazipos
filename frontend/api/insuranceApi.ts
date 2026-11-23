// api/insuranceApi.ts — WaziPOS Cover (backend insurance/, POST /api/v1/insurance/).
//
// Five SME micro-policies: SafeParcel (deliveries), RiderShield (riders), DukaCover
// (shop stock & cash), TradeGuard (credit sales), TillGuard (staff & mobile-money fraud).
// Quotes are worked out by the server on every change (pricing.py), so what you see is
// what you pay.

import { ApiResponse } from 'apisauce';
import { Platform } from 'react-native';

import client from './client';
import multipartClient from './multipartClient';

export type CoverProduct = 'SAFE_PARCEL' | 'RIDER_SHIELD' | 'DUKA_COVER' | 'TRADE_GUARD' | 'TILL_GUARD';
export type PolicyStatus = 'INTEREST' | 'AWAITING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'FAILED';
export type ClaimStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface Scenario {
    risk: string;
    loss: number;
    you_get: number;
    note?: string;
}

export interface Quote {
    product: CoverProduct;
    name: string;
    tagline: string;
    premium: number;
    period: string;
    cover: number;
    excess: number;
    excess_text: string;
    breakdown: string[];
    covers: string[];
    excludes: string[];
    scenarios: Scenario[];
    claim_window: string;
    days?: number;
    saving?: number;
    inputs_used?: Record<string, any>;
}

export interface Policy {
    id: string;
    policy_number: string;
    product: CoverProduct;
    name: string;
    plan: string | null;
    status: PolicyStatus;
    premium: number;
    cover: number;
    excess: number;
    excess_text: string | null;
    period: string | null;
    covers: string[];
    excludes: string[];
    scenarios: Scenario[];
    claim_window: string | null;
    subject_kind: string | null;
    subject_id: string | null;
    subject_label: string | null;
    starts_at: string | null;
    ends_at: string | null;
    paid_at: string | null;
    created: string;
    claims: { id: string; status: ClaimStatus; claim_number: string }[];
    incidents: Record<string, string>;
    inputs: Record<string, any>;
}

export interface CatalogueItem {
    product: CoverProduct;
    name: string;
    tagline: string;
    from_premium: number | null;
    period: string | null;
    cover: number | null;
    prefill: Record<string, any>;
    active: Policy | null;
}

export interface Catalogue {
    audience: 'client' | 'rider' | 'business';
    entity: { id: string; title: string; type: string } | null;
    products: CatalogueItem[];
    sales_enabled: boolean;
    underwriter: string | null;
    options: {
        modes: string[];
        categories: string[];
        sectors: string[];
        cash_levels: number[];
        till_limits: number[];
        rider_plans: string[];
        incidents: Record<CoverProduct, Record<string, string>>;
    };
}

export interface Offer {
    eligible: boolean;
    covered?: boolean;
    policy?: Policy;
    quote?: Quote;
    inputs?: Record<string, any>;
    sales_enabled?: boolean;
    reason?: string;
}

export interface InsurableDelivery {
    subject_kind: string;
    subject_id: string;
    seller: string | null;
    value: number;
    distance_km: number;
    method: string;
    tracking: string | null;
    status: string;
    created: string;
}

export interface ClaimEstimate {
    loss: number;
    covered: number;
    excess: number;
    payable: number;
    notes: string[];
}

export interface Claim {
    id: string;
    claim_number: string;
    status: ClaimStatus;
    incident: string;
    incident_label: string;
    incident_at: string;
    loss_amount: number;
    nights: number;
    description: string;
    police_reference: string | null;
    estimate: ClaimEstimate;
    payable_estimate: number;
    approved_amount: number | null;
    decision_note: string | null;
    paid_at: string | null;
    created: string;
    policy: { id: string; policy_number: string; product: CoverProduct; name: string; subject_label: string | null; cover?: number; premium?: number };
    evidence: string | null;
    claimant?: { name: string; email: string; phone: string | null };
}

export interface BuyInput {
    product: CoverProduct;
    inputs: Record<string, any>;
    phone?: string;
    accept_terms: boolean;
    subject_kind?: string;
    subject_id?: string;
    source?: string;
}

export interface DeskSummary {
    products: { product: CoverProduct; name: string; active: number; interest: number; premiums: number; claims_paid: number; loss_ratio: number | null; open_claims: number }[];
    sales_enabled: boolean;
    underwriter: string | null;
}

const PATH = 'insurance/';
const post = <T = any>(action: string, body: Record<string, any> = {}): Promise<ApiResponse<T>> => client.post(PATH, { action, ...body });

const insuranceApi = {
    catalogue: () => post<{ catalogue: Catalogue }>('Catalogue'),
    quote: (product: CoverProduct, inputs: Record<string, any>) => post<{ quote: Quote }>('Quote', { product, inputs }),
    offer: (product: CoverProduct, context: Record<string, any> = {}) => post<{ offer: Offer }>('Offer', { product, context }),
    buy: (input: BuyInput) => post<{ policy: Policy }>('Buy', input),
    refreshPayment: (policy_id: string) => post<{ policy: Policy }>('RefreshPayment', { policy_id }),
    cancel: (policy_id: string) => post<{ policy: Policy }>('CancelPolicy', { policy_id }),
    myPolicies: () => post<{ policies: Policy[] }>('MyPolicies'),
    insurableDeliveries: () => post<{ deliveries: InsurableDelivery[] }>('InsurableDeliveries'),
    estimateClaim: (body: { policy_id: string; incident: string; loss_amount?: number | string; nights?: number | string }) => post<{ estimate: ClaimEstimate }>('EstimateClaim', body),
    fileClaim: (body: { policy_id: string; incident: string; incident_at: string; loss_amount?: string; nights?: string; description: string; police_reference?: string; evidence?: any }): Promise<ApiResponse<{ claim: Claim }>> => {
        const { evidence, ...rest } = body;
        if (!evidence) return post('FileClaim', rest);
        const form = new FormData();
        form.append('action', 'FileClaim');
        Object.entries(rest).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && form.append(k, String(v)));
        if (Platform.OS === 'web') form.append('evidence', evidence as any);
        else form.append('evidence', { uri: evidence.uri, name: evidence.name ?? 'evidence.jpg', type: evidence.type ?? 'image/jpeg' } as any);
        return multipartClient.post(PATH, form) as any;
    },
    myClaims: () => post<{ claims: Claim[] }>('MyClaims'),
    // claims desk
    deskClaims: (status?: ClaimStatus) => post<{ claims: Claim[] }>('DeskClaims', { status }),
    decide: (body: { claim_id: string; status: ClaimStatus; approved_amount?: number | string; note?: string }) => post<{ claim: Claim }>('DecideClaim', body),
    deskSummary: () => post<{ summary: DeskSummary }>('DeskSummary'),
};

export default insuranceApi;
