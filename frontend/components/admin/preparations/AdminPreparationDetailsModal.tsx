// components/admin/preparations/AdminPreparationDetailsModal.tsx
//
// Read-only details for a preparation.

import { AdminDetailsSheet, ChipList, textOr } from '@/components/admin/kit';

import { preparationGenerics } from './preparationsConfig';
import type { PreparationItem } from './types';

interface Props {
    routeItem: PreparationItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: PreparationItem) => void;
}

export default function AdminPreparationDetailsModal({ routeItem: p, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    const generics = preparationGenerics(p);
    return (
        <AdminDetailsSheet
            visible={!!p}
            onClose={onClose}
            heading="Preparation details"
            icon="eyedrop-outline"
            title={textOr(p?.long_title || p?.title, 'Untitled preparation')}
            subtitle={p?.long_title && p?.title !== p?.long_title ? p?.title : 'Preparation'}
            avatar={{ label: p?.title }}
            badges={p?.formulation_title ? [{ label: p.formulation_title, tone: 'info', icon: 'flask-outline' }] : []}
            stats={[
                { label: 'Generics', value: String(generics.length) },
                { label: 'Formulation', value: textOr(p?.formulation_title) },
            ]}
            sections={[
                {
                    title: 'Composition',
                    icon: 'beaker-outline',
                    fields: [
                        { label: 'Generics', value: <ChipList items={generics} empty="No generics linked" />, full: true },
                        { label: 'Description', value: textOr(p?.description, ''), full: true },
                    ],
                },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: p ? formatDateHandler(p.created) : '' },
                        { label: 'Last updated', value: p ? formatDateHandler(p.updated) : '' },
                    ],
                },
            ]}
            onEdit={p ? () => (onClose(), onOpenEditTrigger(p)) : undefined}
            editLabel="Edit preparation"
        />
    );
}
