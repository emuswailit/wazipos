// components/admin/generics/AdminGenericDetailsModal.tsx
//
// Read-only details for a generic (active ingredient).

import { AdminDetailsSheet, ChipList, textOr } from '@/components/admin/kit';

import { splitTitles } from './genericsConfig';
import type { GenericItem } from './types';

interface Props {
    routeItem: GenericItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: GenericItem) => void;
}

export default function AdminGenericDetailsModal({ routeItem: g, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    const classes = splitTitles(g?.drug_class_titles);
    const subclasses = splitTitles(g?.drug_sub_class_titles);
    return (
        <AdminDetailsSheet
            visible={!!g}
            onClose={onClose}
            heading="Generic details"
            icon="beaker-outline"
            title={textOr(g?.title, 'Untitled generic')}
            subtitle={g?.synonym ? `Also known as ${g.synonym}` : 'Active ingredient'}
            avatar={{ label: g?.title }}
            stats={[
                { label: 'Drug classes', value: String(classes.length) },
                { label: 'Sub-classes', value: String(subclasses.length) },
            ]}
            sections={[
                { title: 'Description', icon: 'document-text-outline', fields: [{ label: 'About this generic', value: textOr(g?.description, ''), full: true }] },
                {
                    title: 'Classification',
                    icon: 'layers-outline',
                    fields: [
                        { label: 'Drug classes', value: <ChipList items={classes} empty="Not classified" />, full: true },
                        { label: 'Sub-classes', value: <ChipList items={subclasses} empty="None" />, full: true },
                    ],
                },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: g ? formatDateHandler(g.created) : '' },
                        { label: 'Last updated', value: g ? formatDateHandler(g.updated) : '' },
                    ],
                },
            ]}
            onEdit={g ? () => (onClose(), onOpenEditTrigger(g)) : undefined}
            editLabel="Edit generic"
        />
    );
}
