// components/admin/employees/employeesConfig.tsx
//
// How an employee is shown in the admin list.

import { formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import type { EmployeeItem } from '@/databases/types';
import { resolveImageUrl } from '@/lib/images';

const yes = (v: unknown) => String(v ?? '').toLowerCase() === 'true';

function employeeBadges(e: EmployeeItem): AdminBadge[] {
    const badges: AdminBadge[] = [];
    if (e.terminal_date) badges.push({ label: 'Left', tone: 'neutral' });
    else if (!yes(e.is_active)) badges.push({ label: 'Inactive', tone: 'neutral' });
    else badges.push({ label: 'Active', tone: 'success' });
    if (!yes(e.is_authorized)) badges.push({ label: 'Not authorised', tone: 'warning' });
    if (e.can_deliver) badges.push({ label: 'Delivers', tone: 'violet', icon: 'bicycle-outline' });
    return badges;
}

const employeeName = (e: EmployeeItem) => textOr(e.title || e.user_title, 'Unnamed employee');

export const employeesConfig: AdminListConfig<EmployeeItem> = {
    title: 'Employees',
    noun: ['employee', 'employees'],
    icon: 'people-outline',
    searchPlaceholder: 'Search name, phone, designation…',
    addLabel: 'Add employee',
    emptyMessage: 'Link user accounts to your entity and give them roles.',
    keyOf: (e, i) => `${e.id || 'employee'}-${i}`,
    titleOf: employeeName,
    subtitleOf: (e) => [e.designation_title, e.department_title].filter(Boolean).join(' · ') || e.phone || null,
    avatarOf: (e) => ({ uri: e.images ? resolveImageUrl(e.images) : null, label: employeeName(e) }),
    badgesOf: employeeBadges,
    metaOf: (e) => (e.hire_date ? `Since ${formatDate(e.hire_date)}` : null),
    metaIcon: 'briefcase-outline',
    primaryColumn: { label: 'Employee', flex: 2.6 },
    columns: [
        { key: 'designation', label: 'Designation', flex: 1.7, render: (e) => textOr(e.designation_title) },
        { key: 'department', label: 'Department', flex: 1.4, render: (e) => textOr(e.department_title) },
        { key: 'contact', label: 'Phone', flex: 1.3, render: (e) => textOr(e.phone) },
        { key: 'roles', label: 'Roles', flex: 1.7, render: (e) => (e.roles ?? []).map((r: any) => r?.title).filter(Boolean).join(', ') || '—' },
        { key: 'hired', label: 'Hired', flex: 1.1, render: (e) => formatDate(e.hire_date) },
    ],
};
