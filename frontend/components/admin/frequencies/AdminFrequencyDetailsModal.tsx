// components/admin/frequencies/AdminFrequencyDetailsModal.tsx
//
// Read-only details for a dosing frequency.

import { AdminDetailsSheet, textOr } from '@/components/admin/kit';

import type { FrequencyItem } from './types';

interface Props {
    routeItem: FrequencyItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: FrequencyItem) => void;
}

export default function AdminFrequencyDetailsModal({ routeItem: f, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    return (
        <AdminDetailsSheet
            visible={!!f}
            onClose={onClose}
            heading="Frequency details"
            icon="time-outline"
            title={textOr(f?.title, 'Untitled frequency')}
            subtitle={textOr(f?.latin, 'Dosing frequency')}
            avatar={{ label: f?.abbreviation || f?.title }}
            badges={f?.abbreviation ? [{ label: f.abbreviation, tone: 'primary' }] : []}
            stats={[
                { label: 'Doses per day', value: `${Number(f?.numerical ?? 0)}×` },
                { label: 'Prescription code', value: textOr(f?.abbreviation) },
            ]}
            sections={[
                {
                    title: 'Dosing',
                    icon: 'medkit-outline',
                    fields: [
                        { label: 'Latin term', value: textOr(f?.latin, '') },
                        { label: 'Code (SIG)', value: textOr(f?.abbreviation, '') },
                        { label: 'Description', value: textOr(f?.description, ''), full: true },
                    ],
                },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: f ? formatDateHandler(f.created) : '' },
                        { label: 'Last updated', value: f ? formatDateHandler(f.updated) : '' },
                    ],
                },
            ]}
            onEdit={f ? () => (onClose(), onOpenEditTrigger(f)) : undefined}
            editLabel="Edit frequency"
        />
    );
}
