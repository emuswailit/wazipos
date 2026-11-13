// components/admin/drugSubClasses/drugSubClassesConfig.tsx
//
// How a drug sub-class is shown in the admin list.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { DrugSubClassItem } from './types';

export const drugSubClassesConfig: AdminListConfig<DrugSubClassItem> = {
    title: 'Drug sub-classes',
    noun: ['sub-class', 'sub-classes'],
    icon: 'git-network-outline',
    searchPlaceholder: 'Search sub-classes or classes…',
    addLabel: 'Add sub-class',
    emptyMessage: 'Split drug classes further, e.g. Cardioselective beta blockers.',
    keyOf: (c, i) => `${c.id || 'subclass'}-${i}`,
    titleOf: (c) => textOr(c.title, 'Untitled sub-class'),
    subtitleOf: (c) => textOr(c.description, 'No description'),
    avatarOf: (c) => ({ label: c.title }),
    badgesOf: (c) => (c.drug_class_title ? [{ label: c.drug_class_title, tone: 'info', icon: 'layers-outline' }] : [{ label: 'No class', tone: 'warning' }]),
    metaOf: (c) => (c.created ? formatDate(c.created) : null),
    primaryColumn: { label: 'Sub-class', flex: 3 },
    columns: [
        { key: 'class', label: 'Drug class', flex: 1.8, render: (c) => textOr(c.drug_class_title) },
        { key: 'created', label: 'Created', flex: 1.1, render: (c) => formatDate(c.created) },
    ],
};
