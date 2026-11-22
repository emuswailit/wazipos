// api/agentsApi.ts
//
// Agents sign up users and their businesses (entities) and earn a commission on
// those entities' subscription fees. Backend: authentication/agents.py.
//   POST /authentication/agents/admin — platform admins manage agents
//   POST /authentication/agents/me    — an agent's own users, entities, commissions
// `agentUsersApi` has the same shape as adminUsersApi, so the users screen and
// form are shared (components/admin/users, mode="agent").

import { ApiResponse } from 'apisauce';

import { appendToFormData } from '@/components/common/imagePicker';

import type { AdminUser, AdminUserDetails, PickedDocument, UsersApi } from './adminUsersApi';
import client from './client';
import multipartClient from './multipartClient';

export interface Agent {
    id: string;
    user: string | null;
    name: string;
    email: string;
    phone: string | null;
    /** Percent of each subscription fee paid by the agent's entities, e.g. "10.00". */
    commission_percentage: string;
    is_active: boolean;
    /** Blocked by an admin; their onboarders are blacklisted with them. */
    is_blacklisted: boolean;
    blacklist_reason: string;
    blacklisted_at: string | null;
    onboarders_count: number;
    users_count: number;
    entities_count: number;
    commission_earned: string;
    commission_pending: string;
    created: string | null;
}

export type CommissionStatus = 'PENDING' | 'PAID';

export interface AgentCommission {
    id: string;
    agent: string;
    entity: string;
    entity_title: string;
    payment: string;
    payment_reference: string;
    months: number;
    payment_amount: string;
    percentage: string;
    amount: string;
    platform_amount: string;
    status: CommissionStatus;
    paid_at: string | null;
    created: string | null;
}

export interface CommissionSummary {
    percentage: string;
    earned: string;
    pending: string;
    paid: string;
}

export type SubscriptionStart = 'TRIAL' | 'PAY_NOW';
export type StockTakeStatus = 'NOT_NEEDED' | 'PLANNED' | 'IN_PROGRESS' | 'DONE';

/** What the agent agreed with a business (backend EntityOnboardings). */
export interface OnboardingTerms {
    /** Negotiated; the agent's commission is their rate of each payment of it. */
    monthly_subscription: string;
    /** Only when creating; fixed afterwards. */
    subscription_start?: SubscriptionStart;
    stock_take_help: boolean;
    stock_take_persons: number | string;
    /** Paid per person per day. */
    stock_take_daily_rate: string;
    stock_take_days: number | string;
    /** AgentOnboarder ids. */
    onboarders: string[];
    /** YYYY-MM-DD: the days the onboarders may enter stock for the business (inclusive). */
    onboarder_access_from?: string | null;
    onboarder_access_to?: string | null;
    stock_take_status?: StockTakeStatus;
    notes?: string;
}

export interface EntityOnboarding extends Required<Omit<OnboardingTerms, 'stock_take_persons' | 'stock_take_days'>> {
    id: string;
    entity: string;
    stock_take_persons: number;
    stock_take_days: number;
    stock_take_total: string;
    onboarder_names: string[];
    /** The business has made a successful subscription payment (fee is then fixed). */
    has_paid: boolean;
    /** Onboarders can enter stock today (inside the dates, stock take not done). */
    onboarder_access_open: boolean;
    /** What onboarders create here: shop receipts, or a restaurant's / hotel's supplies and bar drinks. */
    receipt_kind: 'RETAILER' | 'WHOLESALER' | 'RESTAURANT' | null;
    created: string | null;
}

/** A stock-take helper under the agent (backend AgentOnboarders). */
export interface Onboarder {
    id: string;
    user: AdminUser;
    is_active: boolean;
    /** Their agent was blacklisted; only an admin lifting it clears this. */
    is_blacklisted: boolean;
    stock_takes: number;
    created: string | null;
}

/** What a user still needs to be an onboarder (mirrors backend onboarder_missing). */
export function onboarderMissing(u: AdminUser): string[] {
    const missing: string[] = [];
    if (!u.phone) missing.push('phone');
    if (u.has_email === false || !u.email || u.email.endsWith('@users.wazipos.co.ke')) missing.push('email');
    if (!u.identifier_type || !u.identifier_number) missing.push('ID / passport number');
    if (!u.document_url) missing.push('ID document upload');
    if (u.has_payout_account === false) missing.push('payout account');
    return missing;
}

const ADMIN = '/authentication/agents/admin';
const ME = '/authentication/agents/me';

const admin = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ADMIN, { action, ...data });
const me = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ME, { action, ...data });

function asForm(action: string, details: Record<string, any>, doc: PickedDocument): FormData {
    const form = new FormData();
    form.append('action', action);
    for (const [k, v] of Object.entries(details)) {
        if (v === undefined || v === null) continue;
        form.append(k, String(v));
    }
    appendToFormData(form, 'document', doc);
    return form;
}

function saveUser(action: 'AgentCreateUser' | 'AgentUpdateUser', details: Record<string, any>, doc?: PickedDocument | null) {
    return doc ? multipartClient.post(ME, asForm(action, details, doc)) : me(action, details);
}

/** Admins: the agents list and create / edit form. */
export const agentsAdminApi = {
    getAgents: (q?: string) => admin('AdminGetAgents', q ? { q } : {}),
    createAgent: (user: string, commission_percentage: string) => admin('AdminCreateAgent', { user, commission_percentage }),
    updateAgent: (agent: string, changes: { commission_percentage?: string; is_active?: boolean }) => admin('AdminUpdateAgent', { agent, ...changes }),
    getCommissions: (agent: string) => admin('AdminGetAgentCommissions', { agent }),
    /** Every owed commission of the agent, or just these. */
    markPaid: (agent: string, commissions?: string[]) => admin('AdminMarkCommissionsPaid', { agent, ...(commissions ? { commissions } : {}) }),
    /** Blocks the agent and blacklists all their onboarders. */
    blacklist: (agent: string, reason: string) => admin('AdminBlacklistAgent', { agent, reason }),
    liftBlacklist: (agent: string) => admin('AdminLiftAgentBlacklist', { agent }),
};

/** Agents: the users they registered (same shape as adminUsersApi). */
export const agentUsersApi: UsersApi = {
    getUsers: (params: { q?: string } = {}) => me('AgentGetUsers', params),
    createUser: (details: AdminUserDetails, doc?: PickedDocument | null) => saveUser('AgentCreateUser', details as any, doc),
    updateUser: (id: string, details: AdminUserDetails, doc?: PickedDocument | null) => saveUser('AgentUpdateUser', { user: id, ...details }, doc),
    sendConsent: (user: string) => me('AgentSendConsent', { user }),
    confirmConsent: (user: string, code: string) => me('AgentConfirmConsent', { user, code }),
    sendEmailVerification: (user: string) => me('AgentSendEmailVerification', { user }),
};

/** Agents: their profile, entities and commissions. */
export const agentMeApi = {
    getProfile: () => me('AgentGetProfile'),
    getEntities: () => me('AgentGetEntities'),
    createEntity: (entity_details: Record<string, any>, onboarding: OnboardingTerms) => me('AgentCreateEntity', { entity_details, onboarding }),
    updateEntity: (entity_details: Record<string, any>) => me('AgentUpdateEntity', { entity_details }),
    updateOnboarding: (entity: string, onboarding: OnboardingTerms) => me('AgentUpdateOnboarding', { entity, onboarding }),
    /** Mobile money prompt for the negotiated subscription (default: the owner's phone). */
    requestPayment: (entity: string, phone?: string, months = 1) => me('AgentRequestSubscriptionPayment', { entity, months, ...(phone ? { phone } : {}) }),
    getCommissions: () => me('AgentGetCommissions'),
    getOnboarders: () => me('AgentGetOnboarders'),
    /** Where one of the agent's users ({user}) or businesses ({entity}) is paid. */
    getPayoutAccounts: (target: { user?: string; entity?: string }) => me('AgentGetPayoutAccounts', target),
    savePayoutAccount: (target: { user?: string; entity?: string }, details: Record<string, any>, id?: string) =>
        me('AgentSavePayoutAccount', { ...target, payout_account_details: details, ...(id ? { payout_account_id: id } : {}) }),
    addOnboarder: (user: string) => me('AgentAddOnboarder', { user }),
    setOnboarderActive: (onboarder: string, is_active: boolean) => me('AgentSetOnboarderActive', { onboarder, is_active }),
};
