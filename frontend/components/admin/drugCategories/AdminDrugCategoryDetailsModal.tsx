// components/admin/drugCategories/AdminDrugCategoryDetailsModal.tsx
//
// Read-only details for a drug category (body system).

import { AdminDetailsSheet, textOr } from '@/components/admin/kit';

import type { DrugCategoryItem } from './AdminDrugCategoriesList';

interface Props {
    routeItem: DrugCategoryItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: DrugCategoryItem) => void;
}

export default function AdminDrugCategoryDetailsModal({ routeItem: c, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    return (
        <AdminDetailsSheet
            visible={!!c}
            onClose={onClose}
            heading="Category details"
            icon="albums-outline"
            title={textOr(c?.title, 'Untitled category')}
            subtitle="Drug category · body system"
            avatar={{ label: c?.title }}
            sections={[
                { title: 'Description', icon: 'document-text-outline', fields: [{ label: 'About this category', value: textOr(c?.description, ''), full: true }] },
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
            editLabel="Edit category"
        />
    );
}
