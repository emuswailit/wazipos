// components/admin/drugCategories/drugCategoriesConfig.tsx
//
// How a drug category (body system) is shown in the admin list.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { DrugCategoryItem } from './AdminDrugCategoriesList';

export const drugCategoriesConfig: AdminListConfig<DrugCategoryItem> = {
    title: 'Drug categories',
    noun: ['category', 'categories'],
    icon: 'albums-outline',
    searchPlaceholder: 'Search categories…',
    addLabel: 'Add category',
    emptyMessage: 'Group drug classes by body system, e.g. Cardiovascular, Respiratory.',
    keyOf: (c, i) => `${c.id || 'category'}-${i}`,
    titleOf: (c) => textOr(c.title, 'Untitled category'),
    subtitleOf: (c) => textOr(c.description, 'No description'),
    avatarOf: (c) => ({ label: c.title }),
    metaOf: (c) => (c.created ? formatDate(c.created) : null),
    primaryColumn: { label: 'Category', flex: 3.4 },
    columns: [
        { key: 'created', label: 'Created', flex: 1.1, render: (c) => formatDate(c.created) },
        { key: 'updated', label: 'Updated', flex: 1.1, render: (c) => formatDate(c.updated) },
    ],
};
