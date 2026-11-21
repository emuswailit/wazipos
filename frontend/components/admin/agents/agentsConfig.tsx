// components/admin/agents/agentsConfig.tsx
//
// How an agent (and an agent's commission) shows in the admin and agent lists.

import type { Agent, AgentCommission } from '@/api/agentsApi';
import { formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';

export const percent = (v: string | number | null | undefined) => `${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export const agentsConfig: AdminListConfig<Agent> = {
    title: 'Agents',
    noun: ['agent', 'agents'],
    icon: 'people-circle-outline',
    searchPlaceholder: 'Search name, email or phone…',
    addLabel: 'Add agent',
    emptyMessage: 'Make a user an agent: they register users and businesses and earn a share of those businesses’ subscription fees.',
    keyOf: (a) => a.id,
    titleOf: (a) => textOr(a.name, a.email),
    subtitleOf: (a) => [a.phone, a.email].filter(Boolean).join(' · ') || null,
    avatarOf: (a) => ({ label: a.name || a.email }),
    badgesOf: (a): AdminBadge[] => [
        a.is_blacklisted
            ? { label: 'Blacklisted', tone: 'danger', icon: 'ban-outline' }
            : a.is_active
                ? { label: 'Active', tone: 'success', icon: 'checkmark-circle' }
                : { label: 'Inactive', tone: 'neutral', icon: 'pause-circle-outline' },
        { label: `${percent(a.commission_percentage)} commission`, tone: 'violet', icon: 'pie-chart-outline' },
    ],
    metaOf: (a) => (a.created ? `Since ${formatDate(a.created)}` : null),
    metaIcon: 'calendar-outline',
    metricOf: (a) => ({ value: formatKES(a.commission_pending), label: 'owed', color: Number(a.commission_pending) > 0 ? '#f59e0b' : undefined }),
    primaryColumn: { label: 'Agent', flex: 2.2 },
    columns: [
        { key: 'rate', label: 'Commission', flex: 0.9, render: (a) => percent(a.commission_percentage) },
        { key: 'users', label: 'Users', flex: 0.7, align: 'right', render: (a) => a.users_count.toLocaleString() },
        { key: 'entities', label: 'Entities', flex: 0.7, align: 'right', render: (a) => a.entities_count.toLocaleString() },
        { key: 'onboarders', label: 'Onboarders', flex: 0.8, align: 'right', render: (a) => a.onboarders_count.toLocaleString() },
        { key: 'earned', label: 'Earned', flex: 1.1, align: 'right', render: (a) => formatKES(a.commission_earned) },
        { key: 'owed', label: 'Owed', flex: 1.1, align: 'right', render: (a) => formatKES(a.commission_pending) },
        { key: 'since', label: 'Since', flex: 1, render: (a) => formatDate(a.created) },
    ],
};

/** The details sheet also shows why an agent is blacklisted. */
export const agentDetailsConfig: AdminListConfig<Agent> = {
    ...agentsConfig,
    columns: [
        ...agentsConfig.columns,
        { key: 'blacklist', label: 'Blacklisted', flex: 1, render: (a) => (a.is_blacklisted ? `${formatDate(a.blacklisted_at)} — ${textOr(a.blacklist_reason)}` : 'No') },
    ],
};

export const commissionStatusBadge = (c: AgentCommission): AdminBadge =>
    c.status === 'PAID'
        ? { label: 'Paid out', tone: 'success', icon: 'checkmark-circle' }
        : { label: 'Owed', tone: 'warning', icon: 'time-outline' };

export const commissionsConfig: AdminListConfig<AgentCommission> = {
    title: 'My commissions',
    noun: ['commission', 'commissions'],
    icon: 'cash-outline',
    searchPlaceholder: 'Search business or payment reference…',
    emptyTitle: 'No commissions yet',
    emptyMessage: 'When a business you registered pays its subscription, your share shows here.',
    keyOf: (c) => c.id,
    titleOf: (c) => textOr(c.entity_title, 'Business'),
    subtitleOf: (c) => `${percent(c.percentage)} of ${formatKES(c.payment_amount)} · ${c.months} month${c.months === 1 ? '' : 's'}`,
    avatarOf: (c) => ({ label: c.entity_title }),
    badgesOf: (c) => [commissionStatusBadge(c)],
    metaOf: (c) => formatDate(c.created),
    metaIcon: 'calendar-outline',
    metricOf: (c) => ({ value: formatKES(c.amount), label: 'your share', color: '#10b981' }),
    primaryColumn: { label: 'Business', flex: 2 },
    columns: [
        { key: 'date', label: 'Paid on', flex: 1, render: (c) => formatDate(c.created) },
        { key: 'fee', label: 'Subscription fee', flex: 1.2, align: 'right', render: (c) => formatKES(c.payment_amount) },
        { key: 'rate', label: 'Rate', flex: 0.7, align: 'right', render: (c) => percent(c.percentage) },
        { key: 'share', label: 'Your share', flex: 1.1, align: 'right', render: (c) => formatKES(c.amount) },
        { key: 'status', label: 'Status', flex: 0.9, render: (c) => commissionStatusBadge(c).label },
        { key: 'ref', label: 'Reference', flex: 1.2, render: (c) => textOr(c.payment_reference) },
    ],
};
