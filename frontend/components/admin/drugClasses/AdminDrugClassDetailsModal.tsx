// components/admin/drugClasses/AdminDrugClassDetailsModal.tsx
//
// Read-only details for a drug class.

import { AdminDetailsSheet, textOr } from '@/components/admin/kit';

import type { DrugClassItem } from './types';

interface Props {
    routeItem: DrugClassItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: DrugClassItem) => void;
}

export default function AdminDrugClassDetailsModal({ routeItem: c, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    return (
        <AdminDetailsSheet
            visible={!!c}
            onClose={onClose}
            heading="Class details"
            icon="layers-outline"
            title={textOr(c?.title, 'Untitled class')}
            subtitle="Drug class"
            avatar={{ label: c?.title }}
            badges={c?.category_title ? [{ label: c.category_title, tone: 'info', icon: 'albums-outline' }] : [{ label: 'No category', tone: 'warning' }]}
            sections={[
                { title: 'Description', icon: 'document-text-outline', fields: [{ label: 'About this class', value: textOr(c?.description, ''), full: true }] },
                {
                    title: 'Classification',
                    icon: 'albums-outline',
                    fields: [{ label: 'Category', value: textOr(c?.category_title, '') }],
                },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: c ? formatDateHandler(c.created) : '' },
                        { label: 'Last updated', value: c ? formatDateHandler(c.updated) : '' },
                    ],
                },
            ]}
            onEdit={c ? () => (onClose(), onOpenEditTrigger(c)) : undefined}
            editLabel="Edit class"
        />
    );
}
