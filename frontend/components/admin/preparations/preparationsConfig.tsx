// components/admin/preparations/preparationsConfig.tsx
//
// How a preparation (formulation + generics, e.g. "Amoxicillin 500mg capsule") is shown.

import { formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { PreparationItem } from './types';

export function preparationGenerics(p: PreparationItem | null | undefined): string[] {
    if (!p) return [];
    if (Array.isArray(p.gen_array) && p.gen_array.length) return p.gen_array.map((g) => g.title).filter(Boolean);
    return String(p.generics_string ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

export const preparationsConfig: AdminListConfig<PreparationItem> = {
    title: 'Preparations',
    noun: ['preparation', 'preparations'],
    icon: 'eyedrop-outline',
    searchPlaceholder: 'Search preparations, generics, forms…',
    addLabel: 'Add preparation',
    emptyMessage: 'Combine a formulation with its generics, e.g. Amoxicillin 500mg capsule.',
    keyOf: (p, i) => `${p.id || p.key || 'prep'}-${i}`,
    titleOf: (p) => textOr(p.long_title || p.title, 'Untitled preparation'),
    subtitleOf: (p) => preparationGenerics(p).join(' + ') || textOr(p.description, 'No generics linked'),
    avatarOf: (p) => ({ label: p.title }),
    badgesOf: (p) => {
        const n = preparationGenerics(p).length;
        return [
            ...(p.formulation_title ? [{ label: p.formulation_title, tone: 'info' as const, icon: 'flask-outline' as const }] : []),
            n > 1 ? { label: `${n} generics`, tone: 'violet' as const } : n === 0 ? { label: 'No generics', tone: 'warning' as const } : null,
        ].filter(Boolean) as any;
    },
    metaOf: (p) => (p.created ? formatDate(p.created) : null),
    primaryColumn: { label: 'Preparation', flex: 3 },
    columns: [
        { key: 'formulation', label: 'Formulation', flex: 1.3, render: (p) => textOr(p.formulation_title) },
        { key: 'generics', label: 'Generics', flex: 2.2, render: (p) => preparationGenerics(p).join(', ') || '—' },
        { key: 'created', label: 'Created', flex: 1, render: (p) => formatDate(p.created) },
    ],
};
