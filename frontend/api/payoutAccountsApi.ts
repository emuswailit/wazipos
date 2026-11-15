// api/payoutAccountsApi.ts
//
// Platform-admin payout accounts (any entity) — /payments/admin.
// Backend: payments/utils/admin_payout_accounts.py.

import { ApiResponse } from 'apisauce';

import client from './client';

export type PayoutAccountType = 'BANK' | 'MOBILE' | 'PAYBILL' | 'SACCO' | 'TILL' | 'WALLET';

export interface PayoutAccount {
    id: string;
    entity: string | null;
    entity_title: string | null;
    /** The bank (an entity of type "Bank") for bank accounts. */
    account_entity: string | null;
    account_entity_title?: string | null;
    /** Bank accounts: the branch (authentication.Branches) holding the account. */
    bank_branch?: string | null;
    bank_branch_title?: string | null;
    bank_branch_code?: string | null;
    account_type: PayoutAccountType;
    /** "true" / "false" string on the server. */
    is_active: string | boolean;
    account_code: string | null;
    account_name: string;
    account_number: string;
    business_number: string | null;
    description: string | null;
    owner: string | null;
    owner_title: string | null;
    is_verified: boolean;
    verified_by: string | null;
    verified_by_title: string | null;
    created: string;
    updated: string;
}

export interface PayoutAccountDetails {
    entity: string;
    account_type: PayoutAccountType;
    account_name: string;
    account_number: string;
    account_code?: string;
    /** Bank accounts: the bank entity; the server sets account_code from its bank_code. */
    account_entity?: string;
    /** Bank accounts: a branch of that bank. */
    bank_branch?: string;
    business_number?: string;
    description?: string;
    is_active: boolean;
    is_verified: boolean;
}

const ADMIN_PAYMENTS_ENDPOINT = '/payments/admin';

const getPayoutAccounts = (filters: { search?: string; entity?: string; account_type?: string; is_active?: string } = {}): Promise<ApiResponse<any>> =>
    client.post(ADMIN_PAYMENTS_ENDPOINT, { action: 'AdminGetPayoutAccounts', ...filters });

const createPayoutAccount = (details: PayoutAccountDetails): Promise<ApiResponse<any>> =>
    client.post(ADMIN_PAYMENTS_ENDPOINT, { action: 'AdminCreatePayoutAccount', payout_account_details: details });

const updatePayoutAccount = (id: string, details: Partial<PayoutAccountDetails>): Promise<ApiResponse<any>> =>
    client.post(ADMIN_PAYMENTS_ENDPOINT, { action: 'AdminUpdatePayoutAccount', payout_account_id: id, payout_account_details: details });

/* ---- A person's own payout accounts (e.g. delivery earnings) — /payments/accounts ---- */

const USER_ACCOUNTS_ENDPOINT = '/payments/accounts';

const getMyPayoutAccounts = (): Promise<ApiResponse<any>> =>
    client.post(USER_ACCOUNTS_ENDPOINT, { action: 'GetMyPayoutAccounts' });

/** Create, or update with id. The server ignores entity / is_verified here. */
const saveMyPayoutAccount = (details: Partial<PayoutAccountDetails>, id?: string): Promise<ApiResponse<any>> =>
    client.post(USER_ACCOUNTS_ENDPOINT, { action: 'SaveMyPayoutAccount', payout_account_id: id, payout_account_details: details });

export default { getPayoutAccounts, createPayoutAccount, updatePayoutAccount, getMyPayoutAccounts, saveMyPayoutAccount };
