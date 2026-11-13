// components/admin/routes/routesConfig.tsx
//
// How a route of administration is shown in the admin list (cards + table).

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { DrugRouteItem } from './types';

export const routesConfig: AdminListConfig<DrugRouteItem> = {
    title: 'Routes of administration',
    noun: ['route', 'routes'],
    icon: 'git-branch-outline',
    searchPlaceholder: 'Search routes…',
    addLabel: 'Add route',
    emptyMessage: 'Add how medicines are given, e.g. Oral, Intravenous, Topical.',
    keyOf: (r, i) => `${r.id || 'route'}-${i}`,
    titleOf: (r) => textOr(r.title, 'Untitled route'),
    subtitleOf: (r) => textOr(r.description, 'No description'),
    avatarOf: (r) => ({ icon: 'git-branch-outline', label: r.title }),
    metaOf: (r) => (r.created ? formatDate(r.created) : null),
    primaryColumn: { label: 'Route', flex: 3.4 },
    columns: [
        { key: 'created', label: 'Created', flex: 1.1, render: (r) => formatDate(r.created) },
        { key: 'updated', label: 'Updated', flex: 1.1, render: (r) => formatDate(r.updated) },
    ],
};
