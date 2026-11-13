// components/admin/products/AdminProductDetailsModal.tsx
//
// Read-only details for a catalogue product.

import { AdminDetailsSheet, ChipList, textOr } from '@/components/admin/kit';
import ImageWithFallback from '@/components/common/ImageWithFallback';
import { resolveImageUrl } from '@/lib/images';
import { ScrollView, View } from 'react-native';

import { isVatable, productBadges, productImage } from './productsConfig';
import type { ProductItem } from './types';

interface Props {
    routeItem: ProductItem | null;
    onClose: () => void;
    theme?: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: ProductItem) => void;
}

export default function AdminProductDetailsModal({ routeItem: p, onClose, formatDateHandler, onOpenEditTrigger }: Props) {
    const images = (p?.images ?? []).map((i: any) => resolveImageUrl(i?.thumbnail || i?.image || i)).filter(Boolean) as string[];
    const allowed = p?.allowed_entities_titles?.length ? p.allowed_entities_titles : (p?.allowed_entities ?? []).map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2'));

    return (
        <AdminDetailsSheet
            visible={!!p}
            onClose={onClose}
            heading="Product details"
            icon="cube-outline"
            title={textOr(p?.title, 'Untitled product')}
            subtitle={textOr(p?.long_preparation_title || p?.preparation_title, '') || textOr(p?.manufacturer_title, '')}
            avatar={{ uri: productImage(p), label: p?.title }}
            badges={p ? productBadges(p) : []}
            stats={[
                { label: 'Units / pack', value: p?.units_per_pack ? String(p.units_per_pack) : '—' },
                { label: 'Pack tag', value: textOr(p?.pack_tag) },
                { label: 'VAT', value: isVatable(p) ? 'Vatable' : 'Exempt', color: isVatable(p) ? '#8b5cf6' : undefined },
            ]}
            sections={[
                ...(images.length > 1
                    ? [
                        {
                            title: 'Images',
                            icon: 'images-outline' as const,
                            children: (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    {images.map((uri) => (
                                        <View key={uri} style={{ borderRadius: 14, overflow: 'hidden' }}>
                                            <ImageWithFallback uri={uri} width={88} height={88} borderRadius={14} fallback="📦" />
                                        </View>
                                    ))}
                                </ScrollView>
                            ),
                        },
                    ]
                    : []),
                {
                    title: 'Product',
                    icon: 'medkit-outline',
                    fields: [
                        { label: 'Preparation', value: textOr(p?.long_preparation_title || p?.preparation_title, '') },
                        { label: 'Formulation', value: textOr(p?.formulation_title, '') },
                        { label: 'Category', value: textOr(p?.category_title, '') },
                        { label: 'Manufacturer', value: textOr(p?.manufacturer_title, '') },
                        { label: 'Country of origin', value: textOr(p?.country_of_origin, '') },
                        { label: 'Barcode', value: textOr(p?.bar_code, ''), mono: true },
                        { label: 'Description', value: textOr(p?.description, ''), full: true },
                    ],
                },
                {
                    title: 'Who can stock it',
                    icon: 'storefront-outline',
                    fields: [{ label: 'Allowed entity types', value: <ChipList items={allowed} empty="Not restricted" />, full: true }],
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
            editLabel="Edit product"
        />
    );
}
