// components/admin/products/productsConfig.tsx
//
// How a catalogue product is shown in the admin list.

import { CellText, formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import { resolveImageUrl } from '@/lib/images';

import type { ProductItem } from './types';

export function productImage(p: ProductItem | null | undefined): string | null {
    const first: any = p?.images?.[0];
    return resolveImageUrl(first?.thumbnail || first?.image || first);
}

export function isVatable(p: ProductItem | null | undefined): boolean {
    return String(p?.is_vatable ?? '').toLowerCase() === 'true';
}

export function productBadges(p: ProductItem): AdminBadge[] {
    const badges: AdminBadge[] = [];
    if (p.active === false) badges.push({ label: 'Inactive', tone: 'neutral' });
    if (isVatable(p)) badges.push({ label: 'VAT', tone: 'violet' });
    if (p.category_title) badges.push({ label: p.category_title, tone: 'info' });
    return badges;
}

export const productsConfig: AdminListConfig<ProductItem> = {
    title: 'Products',
    noun: ['product', 'products'],
    icon: 'cube-outline',
    searchPlaceholder: 'Search brand, preparation, barcode…',
    addLabel: 'Add product',
    emptyMessage: 'Register branded products so stores can stock and sell them.',
    keyOf: (p, i) => `${p.id || 'product'}-${i}`,
    titleOf: (p) => textOr(p.title, 'Untitled product'),
    subtitleOf: (p) => textOr(p.long_preparation_title || p.preparation_title, '') || textOr(p.manufacturer_title, 'No preparation'),
    avatarOf: (p) => ({ uri: productImage(p), label: p.title }),
    badgesOf: productBadges,
    metricOf: (p) => (p.units_per_pack ? { value: String(p.units_per_pack), label: p.pack_tag || 'per pack' } : null),
    metaOf: (p) => textOr(p.manufacturer_title, '') || null,
    metaIcon: 'business-outline',
    primaryColumn: { label: 'Product', flex: 3 },
    columns: [
        { key: 'manufacturer', label: 'Manufacturer', flex: 1.7, render: (p) => textOr(p.manufacturer_title) },
        { key: 'category', label: 'Category', flex: 1.3, render: (p) => textOr(p.category_title) },
        { key: 'pack', label: 'Pack', flex: 0.9, align: 'right', render: (p) => <CellText strong align="right">{p.units_per_pack ? `${p.units_per_pack} · ${p.pack_tag || ''}`.trim() : '—'}</CellText> },
        { key: 'barcode', label: 'Barcode', flex: 1.3, render: (p) => textOr(p.bar_code) },
        { key: 'created', label: 'Created', flex: 1, render: (p) => formatDate(p.created) },
    ],
};
