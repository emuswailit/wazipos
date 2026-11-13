// components/admin/drugSubClasses/AdminDrugSubClassDetailsModal.tsx
//
// Read-only details for a drug sub-class.

import { AdminDetailsSheet, textOr } from '@/components/admin/kit';

import type { DrugSubClassItem } from './types';

interface Props {
    routeItem: DrugSubClassItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: DrugSubClassItem) => void;
}

export default function AdminDrugSubClassDetailsModal({ routeItem: c, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    return (
        <AdminDetailsSheet
            visible={!!c}
            onClose={onClose}
            heading="Sub-class details"
            icon="git-network-outline"
            title={textOr(c?.title, 'Untitled sub-class')}
            subtitle="Drug sub-class"
            avatar={{ label: c?.title }}
            badges={c?.drug_class_title ? [{ label: c.drug_class_title, tone: 'info', icon: 'layers-outline' }] : [{ label: 'No class', tone: 'warning' }]}
            sections={[
                { title: 'Description', icon: 'document-text-outline', fields: [{ label: 'About this sub-class', value: textOr(c?.description, ''), full: true }] },
                { title: 'Classification', icon: 'layers-outline', fields: [{ label: 'Drug class', value: textOr(c?.drug_class_title, '') }] },
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
            editLabel="Edit sub-class"
        />
    );
}
