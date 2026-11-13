// components/admin/drugClasses/drugClassesConfig.tsx
//
// How a drug class is shown in the admin list.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { DrugClassItem } from './types';

export const drugClassesConfig: AdminListConfig<DrugClassItem> = {
    title: 'Drug classes',
    noun: ['class', 'classes'],
    icon: 'layers-outline',
    searchPlaceholder: 'Search classes or categories…',
    addLabel: 'Add class',
    emptyMessage: 'Add pharmacological classes, e.g. Beta blockers, Penicillins.',
    keyOf: (c, i) => `${c.id || 'class'}-${i}`,
    titleOf: (c) => textOr(c.title, 'Untitled class'),
    subtitleOf: (c) => textOr(c.description, 'No description'),
    avatarOf: (c) => ({ label: c.title }),
    badgesOf: (c) => (c.category_title ? [{ label: c.category_title, tone: 'info', icon: 'albums-outline' }] : [{ label: 'No category', tone: 'warning' }]),
    metaOf: (c) => (c.created ? formatDate(c.created) : null),
    primaryColumn: { label: 'Class', flex: 3 },
    columns: [
        { key: 'category', label: 'Category', flex: 1.8, render: (c) => textOr(c.category_title) },
        { key: 'created', label: 'Created', flex: 1.1, render: (c) => formatDate(c.created) },
    ],
};
