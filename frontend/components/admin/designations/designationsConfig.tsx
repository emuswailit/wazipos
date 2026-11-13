// components/admin/designations/designationsConfig.tsx
//
// How a designation (job position with slots) is shown in the admin list.

import { CellText, textOr, type AdminListConfig } from '@/components/admin/kit';
import type { DesignationItem } from '@/databases/types';

const tenureLabel = (t?: string | null) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : '');

export const designationsConfig: AdminListConfig<DesignationItem> = {
    title: 'Designations',
    noun: ['designation', 'designations'],
    icon: 'id-card-outline',
    searchPlaceholder: 'Search designations or cadres…',
    addLabel: 'Add designation',
    emptyMessage: 'Add job positions under each cadre, with how many slots are open.',
    keyOf: (d, i) => `${d.id || 'designation'}-${i}`,
    titleOf: (d) => textOr(d.title, 'Untitled designation'),
    subtitleOf: (d) => textOr(d.cadre_title, '') || textOr(d.description, '') || null,
    avatarOf: (d) => ({ label: d.title }),
    badgesOf: (d) => [
        ...(d.tenure ? [{ label: tenureLabel(d.tenure), tone: 'info' as const }] : []),
        ...(d.duration_in_months ? [{ label: `${d.duration_in_months} mo`, tone: 'neutral' as const, icon: 'calendar-outline' as const }] : []),
    ],
    metricOf: (d) => (d.total_slots !== undefined ? { value: String(d.total_slots), label: d.total_slots === 1 ? 'slot' : 'slots' } : null),
    primaryColumn: { label: 'Designation', flex: 2.8 },
    columns: [
        { key: 'cadre', label: 'Cadre', flex: 1.8, render: (d) => textOr(d.cadre_title) },
        { key: 'tenure', label: 'Tenure', flex: 1.2, render: (d) => textOr(tenureLabel(d.tenure)) },
        { key: 'slots', label: 'Slots', flex: 0.8, align: 'right', render: (d) => <CellText strong align="right">{d.total_slots ?? '—'}</CellText> },
        { key: 'duration', label: 'Duration', flex: 1, align: 'right', render: (d) => <CellText align="right">{d.duration_in_months ? `${d.duration_in_months} mo` : '—'}</CellText> },
    ],
};
