// components/admin/cadres/cadresConfig.tsx
//
// How a cadre (staff grade within a cluster) is shown in the admin list.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';
import type { CadreItem } from '@/databases/types';

export const cadresConfig: AdminListConfig<CadreItem> = {
    title: 'Cadres',
    noun: ['cadre', 'cadres'],
    icon: 'ribbon-outline',
    searchPlaceholder: 'Search cadres or clusters…',
    addLabel: 'Add cadre',
    emptyMessage: 'Add staff grades within each cluster, e.g. Pharmacist, Accountant.',
    keyOf: (c, i) => `${c.id || 'cadre'}-${i}`,
    titleOf: (c) => textOr(c.title, 'Untitled cadre'),
    subtitleOf: (c) => textOr(c.description, '') || null,
    avatarOf: (c) => ({ label: c.title }),
    badgesOf: (c) => (c.cluster_title ? [{ label: c.cluster_title, tone: 'info', icon: 'grid-outline' }] : [{ label: 'No cluster', tone: 'warning' }]),
    metaOf: (c) => (c.created ? formatDate(c.created) : null),
    primaryColumn: { label: 'Cadre', flex: 3 },
    columns: [
        { key: 'cluster', label: 'Cluster', flex: 2, render: (c) => textOr(c.cluster_title) },
        { key: 'created', label: 'Created', flex: 1.1, render: (c) => formatDate(c.created) },
    ],
};
