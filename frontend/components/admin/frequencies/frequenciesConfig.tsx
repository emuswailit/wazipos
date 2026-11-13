// components/admin/frequencies/frequenciesConfig.tsx
//
// How a dosing frequency is shown in the admin list.

import { CellText, formatDate, textOr, type AdminListConfig } from '@/components/admin/kit';

import type { FrequencyItem } from './types';

const perDay = (f: FrequencyItem) => `${Number(f.numerical ?? 0)}×`;

export const frequenciesConfig: AdminListConfig<FrequencyItem> = {
    title: 'Frequencies',
    noun: ['frequency', 'frequencies'],
    icon: 'time-outline',
    searchPlaceholder: 'Search frequencies, codes, Latin…',
    addLabel: 'Add frequency',
    emptyMessage: 'Add dosing intervals, e.g. Twice daily (BD), Three times daily (TDS).',
    keyOf: (f, i) => `${f.id || 'frequency'}-${i}`,
    titleOf: (f) => textOr(f.title, 'Untitled frequency'),
    subtitleOf: (f) => [textOr(f.latin, ''), textOr(f.description, '')].filter(Boolean).join(' · ') || 'No description',
    avatarOf: (f) => ({ label: f.abbreviation || f.title }),
    badgesOf: (f) => (f.abbreviation ? [{ label: f.abbreviation, tone: 'primary' }] : []),
    metricOf: (f) => ({ value: perDay(f), label: 'per day' }),
    metaOf: (f) => (f.created ? formatDate(f.created) : null),
    primaryColumn: { label: 'Frequency', flex: 2.6 },
    columns: [
        { key: 'code', label: 'Code', flex: 0.9, render: (f) => <CellText strong>{textOr(f.abbreviation)}</CellText> },
        { key: 'latin', label: 'Latin', flex: 1.6, render: (f) => textOr(f.latin) },
        { key: 'perDay', label: 'Per day', flex: 0.8, align: 'right', render: (f) => <CellText strong align="right">{perDay(f)}</CellText> },
        { key: 'created', label: 'Created', flex: 1.1, render: (f) => formatDate(f.created) },
    ],
};
