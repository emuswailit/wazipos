// components/admin/generics/genericsConfig.tsx
//
// How a generic (active ingredient) is shown in the admin list.

import { formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';

import type { GenericItem } from './types';

/** "A, B" (or an array) → ["A", "B"]. */
export function splitTitles(raw: string | string[] | null | undefined): string[] {
    if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
    return String(raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

export const genericsConfig: AdminListConfig<GenericItem> = {
    title: 'Generics',
    noun: ['generic', 'generics'],
    icon: 'beaker-outline',
    searchPlaceholder: 'Search generics, synonyms, classes…',
    addLabel: 'Add generic',
    emptyMessage: 'Add active ingredients, e.g. Amoxicillin, Paracetamol.',
    keyOf: (g, i) => `${g.id || 'generic'}-${i}`,
    titleOf: (g) => textOr(g.title, 'Untitled generic'),
    subtitleOf: (g) => (g.synonym ? `Also: ${g.synonym}` : textOr(g.description, 'No description')),
    avatarOf: (g) => ({ label: g.title }),
    badgesOf: (g) => {
        const classes = splitTitles(g.drug_class_titles);
        const badges: AdminBadge[] = classes.slice(0, 2).map((c) => ({ label: c, tone: 'info' }));
        if (classes.length > 2) badges.push({ label: `+${classes.length - 2}`, tone: 'neutral' });
        if (classes.length === 0) badges.push({ label: 'Unclassified', tone: 'warning' });
        return badges;
    },
    metaOf: (g) => (g.created ? formatDate(g.created) : null),
    primaryColumn: { label: 'Generic', flex: 2.6 },
    columns: [
        { key: 'classes', label: 'Drug classes', flex: 2, render: (g) => splitTitles(g.drug_class_titles).join(', ') || '—' },
        { key: 'subclasses', label: 'Sub-classes', flex: 2, render: (g) => splitTitles(g.drug_sub_class_titles).join(', ') || '—' },
        { key: 'created', label: 'Created', flex: 1.1, render: (g) => formatDate(g.created) },
    ],
};
