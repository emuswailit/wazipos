// databases/productRequestsRepo.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { db } from '@/databases/db';
import {
    PendingOfferAction,
    PendingRequestCreate,
    ProductRequestSummary,
    ProductRequestSummaryLineItem,
} from '@/databases/types';

const isWeb = Platform.OS === 'web';

const NATIVE_REQUESTS_SYNCED_AT =
    'wazipos_async_retailer_product_requests_synced_at';

const CACHE_SCHEMA_VERSION = 2;
const NATIVE_SCHEMA_KEY = 'wazipos_product_requests_cache_schema';

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__) console.log('[ProductRequestsRepo]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[ProductRequestsRepo]', ...args);
};

/* =========================================================
 * Normalization
 * ======================================================= */

export function normalizeRequestSummary(
    raw: any,
    ts: string
): ProductRequestSummary {
    const rawItems =
        raw?.items ??
        raw?.request_items ??
        raw?.line_items ??
        raw?.product_request_items ??
        null;

    const itemsPreview: ProductRequestSummaryLineItem[] | undefined =
        Array.isArray(rawItems)
            ? rawItems.map((it: any) => ({
                product_id: String(
                    it?.product_id ?? it?.product ?? ''
                ),
                product_title: it?.product_title ?? undefined,
                requested_quantity:
                    Number(
                        it?.requested_quantity ??
                        it?.quantity ??
                        0
                    ) || undefined,
                wholesaler_titles: Array.isArray(
                    it?.wholesaler_titles
                )
                    ? it.wholesaler_titles
                    : it?.wholesaler_title
                        ? [it.wholesaler_title]
                        : undefined,
            }))
            : undefined;

    if (itemsPreview && Array.isArray(rawItems)) {
        for (let i = 0; i < itemsPreview.length; i++) {
            const rawItem = rawItems[i];
            if (
                rawItem &&
                Array.isArray(rawItem.target_wholesaler_ids)
            ) {
                (itemsPreview[i] as any).target_wholesaler_ids =
                    rawItem.target_wholesaler_ids;
            }
        }
    }

    const domainId = String(raw?.remote_id ?? raw?.id ?? '');

    return {
        remote_id: domainId,
        request_number: String(raw?.request_number ?? ''),
        entity: String(raw?.entity ?? ''),
        entity_title: String(raw?.entity_title ?? ''),
        urgency: String(raw?.urgency ?? 'medium'),
        urgency_display: String(raw?.urgency_display ?? 'Medium'),
        status: String(raw?.status ?? 'OPEN'),
        status_display: String(raw?.status_display ?? 'Open'),
        total_line_count: Number(raw?.total_line_count ?? 0),
        fulfilled_line_count: Number(
            raw?.fulfilled_line_count ?? 0
        ),
        pending_line_count: Number(
            raw?.pending_line_count ?? 0
        ),
        expires_at: raw?.expires_at ?? null,
        created: String(raw?.created ?? ts),
        cached_at: String(raw?.cached_at ?? ts),
        is_pending: raw?.is_pending ?? false,
        draft_id: raw?.draft_id ?? undefined,
        items_preview: itemsPreview,
    };
}

export function extractRequestsArray(payload: any): any[] | null {
    const p = payload?.data ?? payload;
    if (Array.isArray(p)) return p;
    if (Array.isArray(p?.results)) return p.results;
    if (Array.isArray(p?.requests)) return p.requests;
    if (Array.isArray(p?.product_requests))
        return p.product_requests;
    if (Array.isArray(p?.my_requests)) return p.my_requests;
    if (Array.isArray(p?.data?.results)) return p.data.results;
    if (Array.isArray(p?.data?.requests)) return p.data.requests;
    if (Array.isArray(p?.data?.product_requests))
        return p.data.product_requests;
    if (Array.isArray(p?.data?.my_requests))
        return p.data.my_requests;
    return null;
}

export function areRequestsEqual(
    a: ProductRequestSummary[],
    b: ProductRequestSummary[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.remote_id !== y.remote_id ||
            x.status !== y.status ||
            x.fulfilled_line_count !== y.fulfilled_line_count ||
            x.pending_line_count !== y.pending_line_count ||
            x.is_pending !== y.is_pending
        ) {
            return false;
        }
    }
    return true;
}

/* =========================================================
 * Requests (unified drafts + submitted)
 * ======================================================= */

export async function writeRequestsToStorage(
    data: ProductRequestSummary[]
): Promise<void> {
    const tasks: Promise<any>[] = [];

    tasks.push(
        db.saveProductRequests(data).catch((err) =>
            warn('Requests write failed:', err)
        )
    );

    if (!isWeb) {
        tasks.push(
            AsyncStorage.setItem(
                NATIVE_REQUESTS_SYNCED_AT,
                new Date().toISOString()
            ).catch(() => null)
        );
    }

    await Promise.allSettled(tasks);
}

export async function readRequestsFromStorage(): Promise<
    ProductRequestSummary[]
> {
    try {
        const viaDb = await db.getProductRequests();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readRequestsFromStorage', err);
        return [];
    }
}

/* =========================================================
 * Pending queues
 * ======================================================= */

export async function readPendingCreatesFromStorage(): Promise<
    PendingRequestCreate[]
> {
    try {
        const viaDb =
            await db.getRetailerProductRequestPendingCreates();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readPendingCreatesFromStorage', err);
        return [];
    }
}

export async function writePendingCreatesToStorage(
    creates: PendingRequestCreate[]
): Promise<void> {
    try {
        await db.saveRetailerProductRequestPendingCreates(creates);
    } catch (err) {
        warn('writePendingCreatesToStorage', err);
    }
}

export async function readPendingOffersFromStorage(): Promise<
    PendingOfferAction[]
> {
    try {
        const viaDb =
            await db.getRetailerProductRequestPendingOffers();
        return Array.isArray(viaDb) ? viaDb : [];
    } catch (err) {
        warn('readPendingOffersFromStorage', err);
        return [];
    }
}

export async function writePendingOffersToStorage(
    offers: PendingOfferAction[]
): Promise<void> {
    try {
        await db.saveRetailerProductRequestPendingOffers(offers);
    } catch (err) {
        warn('writePendingOffersToStorage', err);
    }
}

/* =========================================================
 * Schema versioning
 * ======================================================= */

export async function ensureSchema(): Promise<void> {
    try {
        if (isWeb) {
            const stored =
                typeof window !== 'undefined'
                    ? window.localStorage.getItem(
                        NATIVE_SCHEMA_KEY
                    )
                    : null;
            if (
                stored &&
                Number(stored) === CACHE_SCHEMA_VERSION
            )
                return;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(
                    NATIVE_SCHEMA_KEY,
                    String(CACHE_SCHEMA_VERSION)
                );
            }
        } else {
            const stored = await AsyncStorage.getItem(
                NATIVE_SCHEMA_KEY
            );
            if (
                stored &&
                Number(stored) === CACHE_SCHEMA_VERSION
            )
                return;
            await AsyncStorage.removeItem(
                NATIVE_REQUESTS_SYNCED_AT
            );
            await AsyncStorage.setItem(
                NATIVE_SCHEMA_KEY,
                String(CACHE_SCHEMA_VERSION)
            );
        }
    } catch (e) {
        warn('ensureSchema', e);
    }
}