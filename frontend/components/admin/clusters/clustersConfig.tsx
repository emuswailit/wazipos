// components/admin/clusters/clustersConfig.tsx
//
// How a cluster (group of roles / cadres) is shown in the admin list.

import { CellText, formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';
import type { ClusterItem } from '@/databases/types';

export const clustersConfig: AdminListConfig<ClusterItem> = {
    title: 'Clusters',
    noun: ['cluster', 'clusters'],
    icon: 'grid-outline',
    searchPlaceholder: 'Search clusters…',
    addLabel: 'Add cluster',
    emptyMessage: 'Group roles and cadres, e.g. Accounts, Pharmacy, Nursing.',
    keyOf: (c, i) => `${c.id || 'cluster'}-${i}`,
    titleOf: (c) => textOr(c.title, 'Untitled cluster'),
    subtitleOf: (c) => textOr(c.entity_title, '') || null,
    avatarOf: (c) => ({ icon: 'grid-outline', label: c.title }),
    badgesOf: (c) => (c.value ? [{ label: c.value, tone: 'primary' }] : []),
    metaOf: (c) => (c.created ? formatDate(c.created) : null),
    primaryColumn: { label: 'Cluster', flex: 3 },
    columns: [
        { key: 'code', label: 'Code', flex: 1.4, render: (c) => <CellText strong>{textOr(c.value)}</CellText> },
        { key: 'entity', label: 'Entity', flex: 1.8, render: (c) => textOr(c.entity_title) },
        { key: 'created', label: 'Created', flex: 1.1, render: (c) => formatDate(c.created) },
    ],
};
