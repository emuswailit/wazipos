// components/admin/users/usersConfig.tsx
//
// How a user shows in the admin Users list (cards on phones, table on web).

import type { AdminUser, ConsentStatus } from '@/api/adminUsersApi';
import { AdminBadgePill, formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import React from 'react';
import { View } from 'react-native';

export const CONSENT_META: Record<ConsentStatus, AdminBadge> = {
    CONFIRMED: { label: 'Consent given', tone: 'success', icon: 'shield-checkmark' },
    PENDING: { label: 'Awaiting code', tone: 'warning', icon: 'chatbubble-ellipses-outline' },
    EXPIRED: { label: 'Code expired', tone: 'danger', icon: 'time-outline' },
    REVOKED: { label: 'Consent withdrawn', tone: 'neutral' },
    NONE: { label: 'No consent', tone: 'neutral', icon: 'call-outline' },
};

export const METHOD_LABEL: Record<string, string> = {
    Email: 'Email',
    Google: 'Google',
    Facebook: 'Facebook',
    Admin: 'Added by admin',
};

export const consentBadge = (u: AdminUser): AdminBadge => CONSENT_META[u.consent_status] ?? CONSENT_META.NONE;

/** Phone proven by the SMS code. */
export const phoneBadge = (u: AdminUser): AdminBadge | null =>
    !u.phone ? null : u.phone_verified ? { label: 'Phone ✓', tone: 'success', icon: 'phone-portrait-outline' } : { label: 'Phone unconfirmed', tone: 'warning', icon: 'phone-portrait-outline' };

/** Email proven by opening the emailed link (none for placeholder logins). */
export const emailBadge = (u: AdminUser): AdminBadge | null =>
    u.has_email === false ? null : u.email_verified ? { label: 'Email ✓', tone: 'success', icon: 'mail-outline' } : { label: 'Email unconfirmed', tone: 'warning', icon: 'mail-outline' };

export const phoneUnconfirmed = (u: AdminUser) => !!u.phone && !u.phone_verified;
export const emailUnconfirmed = (u: AdminUser) => u.has_email !== false && !u.email_verified;

export function userBadges(u: AdminUser): AdminBadge[] {
    const out: AdminBadge[] = [];
    const p = phoneBadge(u);
    const e = emailBadge(u);
    if (p) out.push(p);
    if (e) out.push(e);
    out.push(consentBadge(u));
    out.push(u.is_active ? { label: 'Active', tone: 'success', icon: 'ellipse' } : { label: 'Inactive', tone: 'neutral' });
    if (u.identifier_type) out.push({ label: u.identifier_type === 'Passport' ? 'Passport' : 'National ID', tone: 'info', icon: 'id-card-outline' });
    if (u.is_staff) out.push({ label: 'Staff', tone: 'violet', icon: 'shield-outline' });
    return out;
}

export const usersConfig: AdminListConfig<AdminUser> = {
    title: 'Users',
    noun: ['user', 'users'],
    icon: 'people-outline',
    searchPlaceholder: 'Search name, phone, email, ID or entity…',
    addLabel: 'Add user',
    emptyMessage: 'Add people who use WaziPOS. They get an SMS code to consent to calls and messages.',
    keyOf: (u, i) => `${u.id || 'user'}-${i}`,
    titleOf: (u) => textOr(u.name, u.email),
    subtitleOf: (u) => [u.phone, u.email?.endsWith('@users.wazipos.co.ke') ? null : u.email].filter(Boolean).join(' · ') || null,
    avatarOf: (u) => ({ label: u.name || u.email }),
    badgesOf: userBadges,
    metaOf: (u) => u.entity_title ?? null,
    metaIcon: 'business-outline',
    primaryColumn: { label: 'User', flex: 2.4 },
    columns: [
        { key: 'phone', label: 'Phone', flex: 1.3, render: (u) => textOr(u.phone) },
        { key: 'entity', label: 'Entity', flex: 1.6, render: (u) => textOr(u.entity_title) },
        { key: 'id', label: 'ID / passport', flex: 1.3, render: (u) => (u.identifier_number ? `${u.identifier_type === 'Passport' ? 'PP' : 'ID'} ${u.identifier_number}` : '—') },
        {
            key: 'verified',
            label: 'Verified',
            flex: 1.7,
            render: (u) => (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {[phoneBadge(u), emailBadge(u)].filter(Boolean).map((b) => (
                        <AdminBadgePill key={b!.label} badge={b!} />
                    ))}
                </View>
            ),
        },
        { key: 'consent', label: 'SMS / call consent', flex: 1.5, render: (u) => <AdminBadgePill badge={consentBadge(u)} /> },
        { key: 'via', label: 'Joined via', flex: 1.1, render: (u) => METHOD_LABEL[u.registration_method] ?? u.registration_method },
        { key: 'created', label: 'Joined', flex: 1, render: (u) => formatDate(u.created) },
    ],
};
