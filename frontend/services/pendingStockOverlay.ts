// services/pendingStockOverlay.ts
//
// Stock sold in orders that are still queued on this device (made offline, not
// uploaded yet). The server doesn't know about those sales, so whenever server
// stock is merged into the local inventory (pull or socket) these quantities
// are taken off again — otherwise the shelf count would "bounce back" until the
// orders upload. Once an order is uploaded it leaves the queue and the server's
// figure already includes it.

import { storageService } from '@/components/retailers/customerOrders/storageService';

import { getPendingWholesaleOrders } from './wholesaleOrderUploader';

export type SoldMap = Map<string, number>;

function add(map: SoldMap, id: unknown, qty: unknown) {
    const key = id == null ? '' : String(id);
    const n = Number(qty) || 0;
    if (key && n > 0) map.set(key, (map.get(key) ?? 0) + n);
}

/** Retailer stock sold in customer orders waiting to upload: retailer_receipt -> qty. */
export async function pendingRetailSales(): Promise<SoldMap> {
    const sold: SoldMap = new Map();
    try {
        const pending = await storageService.getPendingOrders();
        for (const order of pending) {
            const items: any[] = order?.upload_payload?.order_items ?? order?.items ?? order?.customerOrderItems ?? [];
            for (const i of items) add(sold, i?.retailer_receipt ?? i?.selectedProduct, i?.purchased_quantity ?? i?.quantity);
        }
    } catch {
        /* no overlay rather than no stock */
    }
    return sold;
}

/** Wholesaler stock sold in retailer orders waiting to upload: wholesaler_receipt -> qty. */
export async function pendingWholesaleSales(): Promise<SoldMap> {
    const sold: SoldMap = new Map();
    try {
        for (const order of await getPendingWholesaleOrders()) {
            for (const i of order?.payload?.retailer_order_details?.order_items ?? []) {
                add(sold, i?.wholesaler_receipt, i?.purchased_quantity);
            }
        }
    } catch {
        /* no overlay rather than no stock */
    }
    return sold;
}

/** A server row with the queued sales taken off its current quantity. */
export function withPendingSales<T extends { remote_id?: any; remote_key?: any; current_unit_quantity?: any }>(row: T, sold: SoldMap): T {
    if (!sold.size) return row;
    const key = [row.remote_id, (row as any).remote_key].map((k) => (k == null ? '' : String(k))).find((k) => k && sold.has(k));
    if (!key) return row;
    return { ...row, current_unit_quantity: Math.max(0, (Number(row.current_unit_quantity) || 0) - sold.get(key)!) };
}
