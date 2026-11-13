// components/admin/formulations/formulationsConfig.tsx
//
// How a formulation (dosage form) is shown in the admin list.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { FormulationItem } from './types';

export const formulationsConfig: AdminListConfig<FormulationItem> = {
    title: 'Formulations',
    noun: ['formulation', 'formulations'],
    icon: 'flask-outline',
    searchPlaceholder: 'Search formulations…',
    addLabel: 'Add formulation',
    emptyMessage: 'Add dosage forms, e.g. Tablet, Syrup, Injection.',
    keyOf: (f, i) => `${f.id || 'formulation'}-${i}`,
    titleOf: (f) => textOr(f.title, 'Untitled formulation'),
    subtitleOf: (f) => textOr(f.description, 'No description'),
    avatarOf: (f) => ({ icon: 'flask-outline', label: f.title }),
    metaOf: (f) => (f.created ? formatDate(f.created) : null),
    primaryColumn: { label: 'Formulation', flex: 3.4 },
    columns: [
        { key: 'created', label: 'Created', flex: 1.1, render: (f) => formatDate(f.created) },
        { key: 'updated', label: 'Updated', flex: 1.1, render: (f) => formatDate(f.updated) },
    ],
};
