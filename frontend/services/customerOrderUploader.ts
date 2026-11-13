// services/customerOrderUploader.ts
//
// The single uploader for customer orders created offline.
//
// Pending orders live in the Customer Orders store (storageService) with synced 'FALSE'.
// Each one is sent with CreateCustomerOrder; the backend is idempotent on draft_id, so a
// retry after a lost response can't create a duplicate. On success the stored row is
// replaced by the server's order (synced 'TRUE'). If the server rejects an order, the
// reason is kept on the row (sync_error) and it stays pending, so no sale is lost.
//
// Everything that uploads (the global sync hook, CustomerOrdersSyncContext, the native
// background task) calls uploadPendingCustomerOrders(); only one run happens at a time.

import retailersApi from '@/api/retailersApi';
import { storageService } from '@/components/retailers/customerOrders/storageService';
import { readAllLocal } from '@/services/inventoryLocalStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface UploadSummary {
    uploaded: number;
    failed: number;
    remaining: number;
    /** True if the run stopped because the network / server couldn't be reached. */
    offline: boolean;
}

/** Older places offline orders were saved by earlier app versions (native only). */
const LEGACY_ASYNC_KEYS = ['wazipos_offline_customer_orders', 'wazipos_customer_orders_payload'];
const LEGACY_SECURE_KEY = 'wazipos_secure_customer_orders_payload';

const NETWORK_PROBLEMS = ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'CONNECTION_ERROR', 'SERVER_ERROR'];

let running: Promise<UploadSummary> | null = null;

/** Upload every pending offline order. Concurrent calls share the same run. */
export function uploadPendingCustomerOrders(): Promise<UploadSummary> {
    if (!running) {
        running = doUpload().finally(() => {
            running = null;
        });
    }
    return running;
}

/* ---------------------------------------------------------------------------
 * Payload building
 * ------------------------------------------------------------------------- */

const draftIdOf = (o: any): string => String(o?.draft_id ?? o?.draftId ?? '');

function isLegacyPending(o: any): boolean {
    const s = String(o?.synced ?? '').toUpperCase();
    return s !== 'TRUE' && o?.synced !== true;
}

type PriceLookup = (receiptId: string) => number | null;

async function buildPriceLookup(): Promise<PriceLookup> {
    try {
        const receipts: any[] = (await readAllLocal()) as any[];
        const byId = new Map<string, number>();
        for (const r of receipts) {
            const price = Number(r?.unit_selling_price ?? r?.price);
            if (!Number.isFinite(price)) continue;
            for (const key of [r?.remote_id, r?.remote_key, r?.id]) {
                if (key !== undefined && key !== null && key !== '') byId.set(String(key), price);
            }
        }
        return (id) => (byId.has(id) ? byId.get(id)! : null);
    } catch {
        return () => null;
    }
}

/**
 * The CreateCustomerOrder `customer_order_details` for a pending row.
 * New rows carry it in `upload_payload`; rows saved by older app versions are converted.
 */
function buildUploadPayload(row: any, priceOf: PriceLookup): { payload: any | null; error?: string } {
    if (row?.upload_payload) return { payload: row.upload_payload };

    // Items: older camelCase records (customerOrderItems) or snake_case ones (items).
    const rawItems: any[] = Array.isArray(row?.customerOrderItems)
        ? row.customerOrderItems
        : Array.isArray(row?.items)
            ? row.items
            : [];

    const orderItems = rawItems
        .map((i) => {
            const receipt = String(i?.retailer_receipt ?? i?.selectedProduct ?? '').trim();
            const qty = Number(i?.purchased_quantity ?? i?.quantity ?? 0);
            const unit = Number(i?.unit_selling_price ?? i?.price ?? priceOf(receipt) ?? NaN);
            const discount = Number(i?.item_discount ?? i?.discount ?? 0) || 0;
            const finalUnit = Number(i?.final_unit_selling_price ?? (Number.isFinite(unit) && qty ? unit - discount / qty : NaN));
            return {
                retailer_receipt: receipt,
                purchased_quantity: qty,
                unit_selling_price: unit,
                final_unit_selling_price: finalUnit,
                item_discount: discount,
            };
        })
        .filter((i) => i.retailer_receipt && i.purchased_quantity > 0);

    if (orderItems.length === 0) return { payload: null, error: 'The order has no items to upload.' };
    if (orderItems.some((i) => !Number.isFinite(i.unit_selling_price) || !Number.isFinite(i.final_unit_selling_price))) {
        return { payload: null, error: 'An item price is missing; open the product list once while online and try again.' };
    }

    const origin = Platform.OS === 'web' ? 'WEB' : Platform.OS.toUpperCase();
    return {
        payload: {
            draft_id: draftIdOf(row),
            customer_name: row?.customer_name ?? row?.customerName ?? 'Walk-in Customer',
            customer_phone: row?.customer_phone ?? row?.customerPhone ?? '',
            credit_due_date: row?.credit_due_date ?? row?.due_date ?? row?.dueDate ?? null,
            payment_method: row?.payment_method ?? row?.selectedPaymentMethodId ?? row?.selected_payment_method,
            payment_account_number: row?.payment_account_number ?? row?.paymentAccountNumber ?? '',
            delivery_method: row?.delivery_method ?? row?.deliveryMethod ?? 'PICKUP',
            order_channel: Platform.OS === 'web' ? 'WEB' : 'ANDROID',
            order_origin: origin,
            shipping_amount: String(row?.shipping_amount ?? row?.shippingCost ?? '0'),
            order_items: orderItems,
        },
    };
}

/* ---------------------------------------------------------------------------
 * Legacy migration (native)
 * ------------------------------------------------------------------------- */

/** Move pending orders from older native keys into the current store, once. */
async function migrateLegacyNativeOrders(): Promise<void> {
    if (Platform.OS === 'web') return;

    const known = new Set((await storageService.getAllOrders()).map(draftIdOf).filter(Boolean));

    const moveFrom = async (read: () => Promise<string | null>, write: (v: string | null) => Promise<void>) => {
        let list: any[] = [];
        try {
            const raw = await read();
            list = raw ? JSON.parse(raw) : [];
        } catch {
            return;
        }
        if (!Array.isArray(list) || list.length === 0) return;

        const keep: any[] = [];
        for (const o of list) {
            if (!isLegacyPending(o)) continue; // already uploaded: drop
            // Very old records may lack a draft id; give them one so they can be uploaded
            // (and de-duplicated by the server) instead of being lost.
            const draft =
                draftIdOf(o) || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            if (!known.has(draft)) {
                await storageService.addPendingOrder({
                    ...o,
                    draft_id: draft,
                    customer_name: o?.customer_name ?? o?.customerName ?? 'Walk-in Customer',
                    customer_phone: o?.customer_phone ?? o?.customerPhone ?? '',
                    selected_payment_method_title: o?.selected_payment_method_title ?? o?.payment_method_title ?? '',
                    created: o?.created ?? o?.created_at ?? o?.updatedAt ?? new Date().toISOString(),
                });
                known.add(draft);
            }
        }
        await write(keep.length ? JSON.stringify(keep) : null);
    };

    for (const key of LEGACY_ASYNC_KEYS) {
        await moveFrom(
            () => AsyncStorage.getItem(key),
            (v) => (v === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, v))
        );
    }
    await moveFrom(
        () => SecureStore.getItemAsync(LEGACY_SECURE_KEY),
        (v) => (v === null ? SecureStore.deleteItemAsync(LEGACY_SECURE_KEY) : SecureStore.setItemAsync(LEGACY_SECURE_KEY, v))
    );
}

/* ---------------------------------------------------------------------------
 * Upload
 * ------------------------------------------------------------------------- */

async function doUpload(): Promise<UploadSummary> {
    const summary: UploadSummary = { uploaded: 0, failed: 0, remaining: 0, offline: false };

    try {
        await migrateLegacyNativeOrders();
    } catch (e) {
        console.warn('[customerOrderUploader] legacy migration failed:', e);
    }

    const pending = await storageService.getPendingOrders();
    if (pending.length === 0) return summary;

    const priceOf = await buildPriceLookup();

    for (const row of pending) {
        const { payload, error } = buildUploadPayload(row, priceOf);
        if (!payload) {
            summary.failed += 1;
            await storageService.patchOrder(row, { sync_error: error, sync_attempted_at: new Date().toISOString() }).catch(() => { });
            continue;
        }

        const res: any = await retailersApi
            .retailStaffAction({ action: 'CreateCustomerOrder', customer_order_details: payload })
            .catch(() => null);

        // Couldn't reach the server: stop and keep everything pending for the next run.
        if (!res || NETWORK_PROBLEMS.includes(res.problem) || res.status === 401) {
            summary.offline = true;
            break;
        }

        const body = res.data;
        const created = body?.customer_order;
        if (res.ok && String(body?.response_code) === '0' && created?.id) {
            // Replace the pending row with the server's order (matched by draft_id).
            await storageService.syncIncomingOrders([created], { snapshot: false });
            summary.uploaded += 1;
        } else {
            const errors: string[] = Array.isArray(body?.errors)
                ? body.errors.map(String)
                : [body?.response_message || body?.detail || `Upload failed (HTTP ${res.status ?? '?'})`];
            summary.failed += 1;
            await storageService
                .patchOrder(row, { sync_error: errors.join(' · '), sync_attempted_at: new Date().toISOString() })
                .catch(() => { });
        }
    }

    summary.remaining = (await storageService.getPendingOrders()).length;
    return summary;
}
