// components/common/inventory/inventoryHelpers.ts
//
// Shared by the retailer inventory and the wholesaler inventory screens:
// stock health (expired / low / expiring), filters, formatting and the
// list-row config pieces (badges, stock cell).

import { resolveImageUrl } from '@/lib/images';
import type { AdminBadge } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';

export const INVENTORY_FILTERS = ['ALL', 'ACTIVE', 'LOW', 'OUT', 'EXPIRING', 'EXPIRED', 'UNSYNCED'] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export const INVENTORY_FILTER_LABELS: Record<InventoryFilter, string> = {
    ALL: 'All',
    ACTIVE: 'In date',
    LOW: 'Low stock',
    OUT: 'Out of stock',
    EXPIRING: 'Expiring soon',
    EXPIRED: 'Expired',
    UNSYNCED: 'Not synced',
};

export const INVENTORY_FILTER_ICONS: Record<InventoryFilter, keyof typeof Ionicons.glyphMap> = {
    ALL: 'apps-outline',
    ACTIVE: 'checkmark-circle-outline',
    LOW: 'trending-down-outline',
    OUT: 'remove-circle-outline',
    EXPIRING: 'hourglass-outline',
    EXPIRED: 'close-circle-outline',
    UNSYNCED: 'cloud-upload-outline',
};

/** Stock at or below this (but above zero) counts as low. */
const LOW_STOCK_THRESHOLD = 5;
/** Batches expiring within this many days count as "expiring soon". */
const EXPIRING_SOON_DAYS = 90;

export function isUnsynced(item: any): boolean {
    const s = item?.synced;
    return s === false || s === 'false' || s === 'FALSE' || s === 0 || s === '0';
}

export function isExpired(item: any): boolean {
    return (typeof item?.days_to_expiry === 'number' && item.days_to_expiry <= 0) || item?.expiry_status === 'EXPIRED';
}

export function stockQty(item: any): number {
    const n = Number(item?.current_unit_quantity ?? 0);
    return Number.isFinite(n) ? n : 0;
}

export function isOutOfStock(item: any): boolean {
    return stockQty(item) <= 0;
}

export function isLowStock(item: any): boolean {
    const q = stockQty(item);
    return q > 0 && q <= LOW_STOCK_THRESHOLD;
}

export function isExpiringSoon(item: any): boolean {
    if (isExpired(item)) return false;
    const status = String(item?.expiry_status || '').toUpperCase();
    if (status === 'EXPIRING' || status === 'EXPIRING_SOON') return true;
    return typeof item?.days_to_expiry === 'number' && item.days_to_expiry <= EXPIRING_SOON_DAYS;
}

export function matchesInventoryFilter(item: any, filter: InventoryFilter): boolean {
    switch (filter) {
        case 'ACTIVE':
            return !isExpired(item);
        case 'LOW':
            return isLowStock(item);
        case 'OUT':
            return isOutOfStock(item);
        case 'EXPIRING':
            return isExpiringSoon(item);
        case 'EXPIRED':
            return isExpired(item);
        case 'UNSYNCED':
            return isUnsynced(item);
        default:
            return true;
    }
}

export function matchesInventoryQuery(item: any, q: string): boolean {
    if (!q) return true;
    return [item?.title, item?.product_title, item?.long_title, item?.bar_code, item?.batch, item?.received_from_title]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
}

export function filterCounts(items: any[]): Record<InventoryFilter, number> {
    const out = Object.fromEntries(INVENTORY_FILTERS.map((f) => [f, 0])) as Record<InventoryFilter, number>;
    for (const it of items) for (const f of INVENTORY_FILTERS) if (matchesInventoryFilter(it, f)) out[f] += 1;
    return out;
}

/* ---------------------------------------------------------------- formatting */

export function expiryLabel(item: any): string {
    if (isExpired(item)) return 'EXPIRED';
    if (isExpiringSoon(item)) return 'EXPIRING';
    if (!item?.expiry_status || item.expiry_status === 'UNKNOWN') return 'ACTIVE';
    return item.expiry_status;
}

/** "in 45 days" / "12 days ago" / "today", from days_to_expiry. */
export function expiryRelative(item: any): string | null {
    const d = item?.days_to_expiry;
    if (typeof d !== 'number') return null;
    if (d === 0) return 'today';
    if (d < 0) return `${Math.abs(d)} day${d === -1 ? '' : 's'} ago`;
    return `in ${d} day${d === 1 ? '' : 's'}`;
}

export function formatKES(raw: any): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(raw: string | null | undefined): string {
    if (!raw) return '—';
    const d = new Date(String(raw).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function productTitle(item: any): string {
    const t = item?.title || item?.product_title || item?.long_title || item?.product_name;
    return String(t ?? '').trim() || 'Unnamed product';
}

/** The preparation (strength / form / pack), or null when absent or already part of the product title. */
export function preparationTitle(item: any): string | null {
    const prep = String(item?.preparation_title ?? '').trim();
    if (!prep) return null;
    if (productTitle(item).toLowerCase().includes(prep.toLowerCase())) return null;
    return prep;
}

export function unitPrice(item: any): number {
    const p = parseFloat(item?.final_unit_selling_price ?? item?.unit_selling_price ?? '0');
    return Number.isFinite(p) ? p : 0;
}

export function stockValue(item: any): number {
    return Math.max(0, stockQty(item)) * unitPrice(item);
}

export function itemImageUrl(item: any): string | null {
    return resolveImageUrl(item?.thumbnail_url || item?.image_url || item?.images?.[0]) as any;
}

/** Red for expired / out of stock, amber for low, orange for expiring, green otherwise. */
export function healthColor(item: any): string {
    if (isExpired(item) || isOutOfStock(item)) return '#f43f5e';
    if (isLowStock(item)) return '#f59e0b';
    if (isExpiringSoon(item)) return '#f97316';
    return '#10b981';
}

/* ---------------------------------------------------------------- badges */

export function expiryBadge(item: any): AdminBadge {
    if (isExpired(item)) return { label: 'Expired', tone: 'danger', icon: 'close-circle' };
    if (isExpiringSoon(item)) {
        const rel = expiryRelative(item);
        return { label: rel ? `Expires ${rel}` : 'Expiring', tone: 'warning', icon: 'hourglass-outline' };
    }
    if (!item?.expiry_date) return { label: 'No expiry', tone: 'neutral' };
    return { label: 'In date', tone: 'success', icon: 'checkmark-circle' };
}

export function stockBadge(item: any): AdminBadge | null {
    if (isOutOfStock(item)) return { label: 'Out of stock', tone: 'danger' };
    if (isLowStock(item)) return { label: 'Low stock', tone: 'warning', icon: 'trending-down' };
    return null;
}

export function syncBadge(item: any): AdminBadge | null {
    if (!isUnsynced(item)) return null;
    return item?.sync_error
        ? { label: 'Sync failed', tone: 'danger', icon: 'alert-circle' }
        : { label: 'Not synced', tone: 'info', icon: 'cloud-upload-outline' };
}

export function inventoryBadges(item: any): AdminBadge[] {
    return [expiryBadge(item), stockBadge(item), syncBadge(item)].filter(Boolean) as AdminBadge[];
}
