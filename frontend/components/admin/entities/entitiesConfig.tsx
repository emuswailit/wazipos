// components/admin/entities/entitiesConfig.tsx
//
// How an entity (shop, facility, partner) is shown in the admin list.

import { formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import type { EntityItem } from '@/databases/types';
import { resolveImageUrl } from '@/lib/images';

const yes = (v: unknown) => v === true || String(v ?? '').toLowerCase() === 'true';

export const entityTypeLabel = (t?: string | null) => (t ? t.replace(/([a-z])([A-Z])/g, '$1 $2') : '');

export function entityImage(e: EntityItem | null | undefined): string | null {
    const first: any = (e as any)?.logos?.[0] ?? (e as any)?.images?.[0];
    return resolveImageUrl(first?.thumbnail || first?.image || first?.url || first);
}

function entityPlace(e: EntityItem | null | undefined): string {
    return [e?.town, e?.county_title].filter(Boolean).join(', ');
}

export function entityBadges(e: EntityItem): AdminBadge[] {
    const badges: AdminBadge[] = [];
    if (yes(e.is_verified)) badges.push({ label: 'Verified', tone: 'success', icon: 'checkmark-circle' });
    else badges.push({ label: 'Unverified', tone: 'warning' });
    if (yes(e.is_subscribed)) badges.push({ label: e.plan_title || 'Subscribed', tone: 'violet' });
    return badges;
}

export const entitiesConfig: AdminListConfig<EntityItem> = {
    title: 'Entities',
    noun: ['entity', 'entities'],
    icon: 'storefront-outline',
    searchPlaceholder: 'Search name, type, town, phone…',
    addLabel: 'Add entity',
    emptyMessage: 'Register shops, facilities and partners on the platform.',
    keyOf: (e, i) => `${e.remote_id || e.id || 'entity'}-${i}`,
    titleOf: (e) => textOr(e.title, 'Untitled entity'),
    subtitleOf: (e) => [entityTypeLabel(e.entity_type), entityPlace(e)].filter(Boolean).join(' · ') || null,
    avatarOf: (e) => ({ uri: entityImage(e), label: e.title }),
    badgesOf: entityBadges,
    metaOf: (e) => (e.phone ? String(e.phone) : null),
    metaIcon: 'call-outline',
    primaryColumn: { label: 'Entity', flex: 2.8 },
    columns: [
        { key: 'type', label: 'Type', flex: 1.5, render: (e) => textOr(entityTypeLabel(e.entity_type)) },
        { key: 'place', label: 'Location', flex: 1.6, render: (e) => textOr(entityPlace(e)) },
        { key: 'phone', label: 'Phone', flex: 1.2, render: (e) => textOr(e.phone) },
        { key: 'created', label: 'Created', flex: 1, render: (e) => formatDate(e.created) },
    ],
};
