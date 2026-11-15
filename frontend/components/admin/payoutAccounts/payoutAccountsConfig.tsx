// components/admin/payoutAccounts/payoutAccountsConfig.tsx
//
// How a payout account (where an entity is paid out to) shows in the admin list.

import { formatDate, textOr, type AdminBadge, type AdminListConfig, type IconName } from '@/components/admin/kit';
import type { PayoutAccount, PayoutAccountType } from '@/api/payoutAccountsApi';

export const ACCOUNT_TYPE_META: Record<PayoutAccountType, { label: string; icon: IconName; color: string }> = {
    BANK: { label: 'Bank', icon: 'business-outline', color: '#3b82f6' },
    MOBILE: { label: 'Mobile money', icon: 'phone-portrait-outline', color: '#10b981' },
    PAYBILL: { label: 'Paybill', icon: 'receipt-outline', color: '#8b5cf6' },
    TILL: { label: 'Till', icon: 'storefront-outline', color: '#f59e0b' },
    SACCO: { label: 'Sacco', icon: 'people-outline', color: '#0ea5e9' },
    WALLET: { label: 'Wallet', icon: 'wallet-outline', color: '#ec4899' },
};

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_META) as PayoutAccountType[];

export const isActiveAccount = (a: PayoutAccount) => String(a.is_active).toLowerCase() === 'true';

/** "Paybill 247247 · Acc 0123" style destination line. */
export function destinationOf(a: PayoutAccount): string {
    if (a.account_type === 'PAYBILL' && a.business_number) return `${a.business_number} · Acc ${a.account_number}`;
    if (a.account_type === 'BANK') {
        const bank = [
            a.account_entity_title ? `${a.account_entity_title}${a.account_code ? ` (${a.account_code})` : ''}` : a.account_code ? `Code ${a.account_code}` : '',
            a.bank_branch_title ? `${a.bank_branch_title}${a.bank_branch_code ? ` (${a.bank_branch_code})` : ''}` : '',
        ].filter(Boolean).join(', ');
        return bank ? `${bank} · ${a.account_number}` : a.account_number;
    }
    return a.account_number;
}

function typeBadge(a: PayoutAccount): AdminBadge {
    const m = ACCOUNT_TYPE_META[a.account_type];
    return m ? { label: m.label, tone: 'info', icon: m.icon } : { label: a.account_type || 'Unknown', tone: 'neutral' };
}

export function payoutBadges(a: PayoutAccount): AdminBadge[] {
    return [
        typeBadge(a),
        isActiveAccount(a) ? { label: 'Active', tone: 'success', icon: 'ellipse' } : { label: 'Inactive', tone: 'neutral' },
        a.is_verified ? { label: 'Verified', tone: 'success', icon: 'shield-checkmark' } : { label: 'Unverified', tone: 'warning', icon: 'shield-outline' },
    ];
}

export const payoutAccountsConfig: AdminListConfig<PayoutAccount> = {
    title: 'Payout accounts',
    noun: ['payout account', 'payout accounts'],
    icon: 'wallet-outline',
    searchPlaceholder: 'Search entity, account name or number…',
    addLabel: 'Add payout account',
    emptyMessage: 'Add the bank, paybill, till or mobile account each entity is paid out to.',
    keyOf: (a, i) => `${a.id || 'payout'}-${i}`,
    titleOf: (a) => textOr(a.entity_title, 'Unknown entity'),
    subtitleOf: (a) => `${textOr(a.account_name, '')} · ${destinationOf(a)}`,
    avatarOf: (a) => ({ label: a.entity_title || a.account_name }),
    badgesOf: payoutBadges,
    metaOf: (a) => (a.created ? formatDate(a.created) : null),
    primaryColumn: { label: 'Entity', flex: 2.2 },
    columns: [
        { key: 'name', label: 'Account name', flex: 2, render: (a) => textOr(a.account_name) },
        { key: 'number', label: 'Account / number', flex: 2, render: (a) => destinationOf(a) },
        { key: 'type', label: 'Type', flex: 1.2, render: (a) => ACCOUNT_TYPE_META[a.account_type]?.label ?? a.account_type },
        { key: 'status', label: 'Status', flex: 1, render: (a) => (isActiveAccount(a) ? 'Active' : 'Inactive') },
        { key: 'verified', label: 'Verified', flex: 1, render: (a) => (a.is_verified ? 'Yes' : 'No') },
        { key: 'created', label: 'Created', flex: 1.1, render: (a) => formatDate(a.created) },
    ],
};
