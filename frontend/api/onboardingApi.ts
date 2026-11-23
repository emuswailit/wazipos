// api/onboardingApi.ts — self sign-up to approved business (backend onboarding/, POST /api/v1/onboarding/).

import { ApiResponse } from 'apisauce';

import type { PayoutAccountDetails } from './payoutAccountsApi';
import client from './client';

export type ApprovalStatus = 'SETUP' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface OnboardingStep {
    key: 'email' | 'phone' | 'identity' | 'business' | 'payout' | 'stock' | string;
    label: string;
    done: boolean;
    required: boolean;
    detail?: string | null;
    route?: string;
    count?: number;
}

export interface OnboardingBusiness {
    id: string;
    title: string;
    entity_type: string;
    town?: string | null;
    road?: string | null;
    building?: string | null;
    phone?: string | null;
    email?: string | null;
    is_verified: boolean;
}

export interface Approval {
    status: ApprovalStatus;
    reason: string | null;
    submitted_at: string | null;
    decided_at: string | null;
    submissions: number;
}

export interface OnboardingState {
    business: OnboardingBusiness | null;
    is_current: boolean;
    approval: Approval | null;
    steps: OnboardingStep[];
    missing: string[];
    can_submit: boolean;
    progress: number;
}

export interface OwnerOut {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    identifier_type: string | null;
    identifier_number: string | null;
    document_url: string | null;
    email_verified: boolean;
    phone_verified: boolean;
    joined: string | null;
}

export interface ApprovalRow {
    entity: OnboardingBusiness;
    approval: Approval;
    owner: OwnerOut | null;
    steps: OnboardingStep[];
    location: { latitude: number; longitude: number } | null;
    admin_note: string | null;
    decided_by: string | null;
    payout: { account_type: string; account_name: string; account_number: string; is_verified: boolean } | null;
    created: string;
}

export interface SignupRow extends OwnerOut {
    businesses: { id: string; title: string; entity_type: string; status: ApprovalStatus }[];
}

const PATH = '/onboarding/';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(PATH, { action, ...data });

export default {
    state: () => call('GetOnboarding'),
    payoutAccounts: () => call('GetPayoutAccounts'),
    savePayoutAccount: (details: PayoutAccountDetails, id?: string) =>
        call('SavePayoutAccount', { payout_account_details: details, ...(id ? { payout_account_id: id } : {}) }),
    submit: () => call('SubmitForApproval'),
    adminSignups: (params: { days?: number; q?: string } = {}) => call('AdminSignups', params),
    adminApprovals: (params: { status?: ApprovalStatus | 'ALL'; q?: string } = {}) => call('AdminApprovals', params),
    approve: (entity: string, note?: string) => call('AdminApprove', { entity, note }),
    reject: (entity: string, reason: string) => call('AdminReject', { entity, reason }),
    note: (entity: string, note: string) => call('AdminNote', { entity, note }),
};
