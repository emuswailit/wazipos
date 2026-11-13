// components/admin/roles/rolesConfig.tsx
//
// How a role (access level within a cluster) is shown in the admin list.

import { CellText, textOr, type AdminListConfig } from '@/components/admin/kit';
import type { RoleItem } from '@/databases/types';

export const rolesConfig: AdminListConfig<RoleItem> = {
    title: 'Roles',
    noun: ['role', 'roles'],
    icon: 'shield-checkmark-outline',
    searchPlaceholder: 'Search roles or clusters…',
    addLabel: 'Add role',
    emptyMessage: 'Add roles that decide what staff can see and do.',
    keyOf: (r, i) => `${r.id || 'role'}-${i}`,
    titleOf: (r) => textOr(r.title, 'Untitled role'),
    subtitleOf: (r) => textOr(r.description, '') || null,
    avatarOf: (r) => ({ icon: 'shield-checkmark-outline', label: r.title }),
    badgesOf: (r) => [
        ...(r.cluster_title ? [{ label: r.cluster_title, tone: 'info' as const, icon: 'grid-outline' as const }] : []),
        ...(r.level ? [{ label: r.level, tone: 'violet' as const }] : []),
    ],
    primaryColumn: { label: 'Role', flex: 3 },
    columns: [
        { key: 'code', label: 'Code', flex: 1.4, render: (r) => <CellText strong>{textOr(r.value)}</CellText> },
        { key: 'cluster', label: 'Cluster', flex: 1.6, render: (r) => textOr(r.cluster_title) },
        { key: 'level', label: 'Level', flex: 1, render: (r) => textOr(r.level) },
    ],
};
