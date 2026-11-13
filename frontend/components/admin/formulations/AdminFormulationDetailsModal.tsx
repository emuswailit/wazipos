// components/admin/formulations/AdminFormulationDetailsModal.tsx
//
// Read-only details for a formulation (dosage form).

import { AdminDetailsSheet, textOr } from '@/components/admin/kit';

import type { FormulationItem } from './types';

interface Props {
    routeItem: FormulationItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: FormulationItem) => void;
}

export default function AdminFormulationDetailsModal({ routeItem: f, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    return (
        <AdminDetailsSheet
            visible={!!f}
            onClose={onClose}
            heading="Formulation details"
            icon="flask-outline"
            title={textOr(f?.title, 'Untitled formulation')}
            subtitle="Dosage form"
            avatar={{ icon: 'flask-outline', label: f?.title }}
            sections={[
                { title: 'Description', icon: 'document-text-outline', fields: [{ label: 'About this formulation', value: textOr(f?.description, ''), full: true }] },
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
            editLabel="Edit formulation"
        />
    );
}
