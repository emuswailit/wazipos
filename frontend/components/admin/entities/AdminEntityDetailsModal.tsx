// components/admin/entities/AdminEntityDetailsModal.tsx
//
// Read-only details for an entity.

import { AdminDetailsSheet, ChipList, textOr } from '@/components/admin/kit';
import type { EntityItem } from '@/databases/types';

import { entityBadges, entityImage, entityTypeLabel } from './entitiesConfig';

interface Props {
    visible: boolean;
    onClose: () => void;
    onEdit: () => void;
    item: EntityItem | null;
    formatDateHandler: (s?: string | null) => string;
}

const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

export default function AdminEntityDetailsModal({ visible, onClose, onEdit, item: e, formatDateHandler }: Props) {
    const categories = Array.isArray((e as any)?.categories_array) ? (e as any).categories_array.map((c: any) => c?.title).filter(Boolean) : [];
    const phones = [e?.phone, e?.phone1, e?.phone2, e?.phone3].filter(Boolean).map(String);
    const hasBank = !!(e?.bank_title || e?.account_number || e?.bank_code);

    return (
        <AdminDetailsSheet
            visible={visible && !!e}
            onClose={onClose}
            heading="Entity details"
            icon="storefront-outline"
            title={textOr(e?.title, 'Untitled entity')}
            subtitle={[entityTypeLabel(e?.entity_type), titleCase(e?.entity_ownership)].filter(Boolean).join(' · ')}
            avatar={{ uri: entityImage(e), label: e?.title }}
            badges={e ? entityBadges(e) : []}
            sections={[
                {
                    title: 'Contact',
                    icon: 'call-outline',
                    fields: [
                        { label: 'Phone', value: phones.join(', ') },
                        { label: 'Email', value: textOr(e?.email, '') },
                        { label: 'Entity code', value: textOr(e?.entity_code, ''), mono: true },
                    ],
                },
                {
                    title: 'Location',
                    icon: 'location-outline',
                    fields: [
                        { label: 'Country', value: textOr(e?.country_title || e?.country, '') },
                        { label: 'County', value: textOr(e?.county_title || e?.county, '') },
                        { label: 'Town', value: textOr(e?.town, '') },
                        { label: 'Road', value: textOr(e?.road, '') },
                        { label: 'Building', value: textOr(e?.building, ''), full: true },
                    ],
                },
                ...(hasBank
                    ? [
                        {
                            title: 'Bank account',
                            icon: 'card-outline' as const,
                            fields: [
                                { label: 'Bank', value: textOr(e?.bank_title, '') },
                                { label: 'Account number', value: textOr(e?.account_number, ''), mono: true },
                                { label: 'Account name', value: textOr(e?.account_name, '') },
                                { label: 'Bank code', value: textOr(e?.bank_code, ''), mono: true },
                            ],
                        },
                    ]
                    : []),
                ...(categories.length
                    ? [{ title: 'Categories', icon: 'pricetags-outline' as const, fields: [{ label: 'Sells', value: <ChipList items={categories} />, full: true }] }]
                    : []),
                {
                    title: 'Record',
                    icon: 'time-outline',
                    fields: [
                        { label: 'Created', value: formatDateHandler(e?.created) },
                        { label: 'Last updated', value: formatDateHandler(e?.updated) },
                    ],
                },
            ]}
            onEdit={onEdit}
            editLabel="Edit entity"
        />
    );
}
