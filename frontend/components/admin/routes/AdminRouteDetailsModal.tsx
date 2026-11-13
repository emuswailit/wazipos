// components/admin/routes/AdminRouteDetailsModal.tsx
//
// Read-only details for a route of administration.

import { AdminDetailsSheet, textOr } from '@/components/admin/kit';

import type { DrugRouteItem } from './types';

interface Props {
    routeItem: DrugRouteItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: DrugRouteItem) => void;
}

export default function AdminRouteDetailsModal({ routeItem, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    const r = routeItem;
    return (
        <AdminDetailsSheet
            visible={!!r}
            onClose={onClose}
            heading="Route details"
            icon="git-branch-outline"
            title={textOr(r?.title, 'Untitled route')}
            subtitle="Route of administration"
            avatar={{ icon: 'git-branch-outline', label: r?.title }}
            sections={[
                { title: 'Description', icon: 'document-text-outline', fields: [{ label: 'How it is given', value: textOr(r?.description, ''), full: true }] },
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: r ? formatDateHandler(r.created) : '' },
                        { label: 'Last updated', value: r ? formatDateHandler(r.updated) : '' },
                    ],
                },
            ]}
            onEdit={
                r
                    ? () => {
                        onClose();
                        onOpenEditTrigger(r);
                    }
                    : undefined
            }
            editLabel="Edit route"
        />
    );
}
