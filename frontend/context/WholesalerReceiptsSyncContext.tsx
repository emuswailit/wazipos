// context/WholesalerReceiptsSyncContext.tsx

import wholesalersApi from '@/api/wholesalersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { WholesalerReceipt } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import {
    backfillWholesalerDraftIds
} from '@/services/wholesalerInventoryMigration';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Alert, Platform } from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */

export interface SyncUiState {
    syncing: boolean;
    offline: boolean;
    hasPending: boolean;
    pendingCount: number;
    showOfflineWarning: boolean;
    showPendingChip: boolean;
    showSyncing: boolean;
    lastSyncedTime: string;
    syncStatus:
    | 'idle'
    | 'pushing'
    | 'live'
    | 'offline'
    | 'error';
}

interface WholesalerReceiptsSyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    isPushSyncing: boolean;
    pendingCount: number;
    syncStatus:
    | 'idle'
    | 'pushing'
    | 'live'
    | 'offline'
    | 'error';
    forceManualRefresh: () => Promise<void>;
    pushPending: () => Promise<void>;
    lastSyncedTime: string;
    wholesalerReceipts: WholesalerReceipt[];
    addLocalReceipt: (
        receipt: WholesalerReceipt
    ) => Promise<WholesalerReceipt>;
    updateLocalReceipt: (
        receipt: WholesalerReceipt
    ) => Promise<void>;
    syncUiState: SyncUiState;
}

const WholesalerReceiptsSyncContext = createContext<
    WholesalerReceiptsSyncContextType | undefined
>(undefined);

/* =========================================================
 * Constants
 * ======================================================= */

const NATIVE_WHOLESALER_RECEIPTS_KEY =
    'wazipos_async_wholesaler_receipts_registry';

const WHOLESALER_RECEIPTS_SYNCED_AT =
    'wazipos_async_wholesaler_receipts_synced_at';

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

const WS_URL =
    'wss://api.wazipos.co.ke/ws/inventory/wholesalers/';

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;

/** Push pending receipts every 2 minutes. */
const PENDING_PUSH_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Action string the server expects when the client wants a full
 * inventory snapshot over the socket.
 */
const WS_SNAPSHOT_ACTION = 'GetWholesalerReceipts';

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__)
        console.log('[WholesalerReceiptsSync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__)
        console.warn('[WholesalerReceiptsSync]', ...args);
};

/* =========================================================
 * Queue predicate
 * ======================================================= */

const hasDraftId = (
    record: Partial<WholesalerReceipt> | null | undefined
): boolean =>
    typeof record?.draft_id === 'string' &&
    (record.draft_id as string).trim() !== '';

const hasRemoteId = (
    record: Partial<WholesalerReceipt> | null | undefined
): boolean =>
    typeof record?.remote_id === 'string' &&
    (record.remote_id as string).trim() !== '';

const isSyncedFlag = (
    record: Partial<WholesalerReceipt> | null | undefined
): boolean =>
    record?.synced === true ||
    (record?.synced as any) === 'true';

const needsRemotePush = (
    record: WholesalerReceipt
): boolean => {
    if (!hasDraftId(record)) return false;
    if (isSyncedFlag(record)) return false;
    if (hasRemoteId(record)) return false;
    return true;
};

/* =========================================================
 * Draft id builder
 * ======================================================= */

export function buildDraftId(
    userId: string | number | undefined
): string {
    const uid = userId != null ? String(userId) : 'anon';
    const ts = String(Date.now());
    return `${uid}:${ts}`;
}

/* =========================================================
 * Helpers
 * ======================================================= */

const firstDefined = (...vals: any[]) =>
    vals.find((v) => v !== undefined && v !== null);

const isPendingSync = (raw: any): boolean =>
    raw === false ||
    raw === 'false' ||
    raw === 'FALSE' ||
    raw === 0 ||
    raw === '0';

const safeStr = (v: any): string => {
    if (v === undefined || v === null) return '';
    const s = String(v).trim();
    if (s === 'undefined' || s === 'null') return '';
    return s;
};

function resolveWireProductId(item: any): string {
    if (!item || typeof item !== 'object') return '';

    const candidates = [
        item.product_id,
        typeof item.product === 'string'
            ? item.product
            : undefined,
        item.product?.id,
        item.product_uuid,
        item.productId,
    ];

    for (const c of candidates) {
        const s = safeStr(c);
        if (s) return s;
    }
    return '';
}

function resolveWireProductTitle(item: any): string {
    if (!item || typeof item !== 'object') return '';

    const candidates = [
        item.product_title,
        item.product?.title,
        item.title,
        item.product_name,
        item.long_title,
    ];

    for (const c of candidates) {
        const s = safeStr(c);
        if (s) return s;
    }
    return '';
}

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

function formatSyncTime() {
    return new Date().toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/* =========================================================
 * Expiry helpers
 * ======================================================= */

export function computeDaysToExpiry(
    expiryDate?: string | null
): number | null {
    if (!expiryDate) return null;
    const parts = String(expiryDate).split('-');
    if (parts.length !== 3) return null;

    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);

    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
    ) {
        return null;
    }

    const expiry = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round(
        (expiry.getTime() - today.getTime()) / msPerDay
    );
}

export function computeExpiryStatus(
    days: number | null
): string {
    if (days === null) return 'UNKNOWN';
    if (days < 0) return 'EXPIRED';
    if (days <= 7) return 'EXPIRING_SOON';
    if (days <= 30) return 'EXPIRING';
    return 'FRESH';
}

/* =========================================================
 * Image URL resolver
 * ======================================================= */

function resolveImageUrl(rawImages: any): string | null {
    if (!Array.isArray(rawImages) || rawImages.length === 0) {
        return null;
    }

    const first = rawImages[0];
    let path: string | null = null;

    if (typeof first === 'string') {
        path = first;
    } else if (first && typeof first === 'object') {
        path =
            first.thumbnail ||
            first.image ||
            first.url ||
            null;
    }

    if (!path || typeof path !== 'string') return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://')
    ) {
        return trimmed;
    }

    const cleanPath = trimmed.startsWith('/')
        ? trimmed.substring(1)
        : trimmed;

    return `${IMAGE_BASE_URL}/${cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
}

/* =========================================================
 * Discount normalizers
 *
 * The wire may deliver discounts under several key names depending
 * on the serializer version. Normalise them here so downstream
 * consumers (the campaign builder, discount pickers, etc.) always
 * see a consistent shape:
 *
 *   - price_discount     → object | null
 *   - quantity_discounts → array  | null
 *
 * `price_discount` shapes handled:
 *   - { ... }                          (object from WS payload)
 *   - [{ ... }]                        (reverse FK array)
 *   - "uuid-string"                    (bare id)
 *
 * `quantity_discounts` shapes handled:
 *   - [{ ... }, { ... }]               (canonical array)
 *   - { ... }                          (single object)
 *   - "uuid-string"                    (bare id)
 *   - the same shapes under the
 *     `wholesaler_quantity_discount_receipt` reverse-FK name
 * ======================================================= */

function normalizePriceDiscount(raw: any): any {
    // Prefer the canonical field, fall back to the reverse FK.
    let candidate = raw?.price_discount;
    if (candidate === undefined) {
        candidate = raw?.wholesaler_price_discount_receipt;
    }

    if (candidate === undefined || candidate === null) return null;

    // Reverse FK is a list — take the most recent (first item if the
    // serializer orders by -created, otherwise just the first).
    if (Array.isArray(candidate)) {
        return candidate.length > 0 ? candidate[0] : null;
    }

    // Bare id string — wrap so callers always get an object.
    if (typeof candidate === 'string') {
        const s = candidate.trim();
        return s ? { id: s } : null;
    }

    if (typeof candidate === 'object') return candidate;

    return null;
}

function normalizeQuantityDiscounts(raw: any): any[] | null {
    let candidate = raw?.quantity_discounts;
    if (candidate === undefined) {
        candidate = raw?.wholesaler_quantity_discount_receipt;
    }
    if (candidate === undefined) {
        candidate = raw?.quantity_discount;
    }

    if (candidate === undefined || candidate === null) return null;

    if (Array.isArray(candidate)) {
        return candidate.length > 0 ? candidate : null;
    }

    if (typeof candidate === 'string') {
        const s = candidate.trim();
        return s ? [{ id: s }] : null;
    }

    if (typeof candidate === 'object') return [candidate];

    return null;
}

/* =========================================================
 * normalizeReceipt — wire → WholesalerReceipt
 * ======================================================= */

function normalizeReceipt(
    item: any,
    ts: string
): WholesalerReceipt {
    const resolvedUrl = resolveImageUrl(item.images);

    const remoteId = String(
        firstDefined(item.id, item.key, '')
    );

    const productId = resolveWireProductId(item);
    const productTitle = resolveWireProductTitle(item);

    if (__DEV__ && !productId) {
        warn(
            'normalizeReceipt — could not resolve product id. ' +
            'Raw keys:',
            Object.keys(item ?? {})
        );
    }

    return {
        cached_at: String(firstDefined(item.cached_at, ts)),
        synced: !isPendingSync(item.synced),
        sync_error: item.sync_error ?? null,
        thumbnail_url: resolvedUrl,
        image_url: resolvedUrl,

        remote_id: remoteId,
        remote_key: item.key ? String(item.key) : undefined,
        draft_id: item.draft_id ?? null,

        title: String(item.title ?? ''),
        long_title: String(item.long_title ?? ''),
        product_title: productTitle,
        product_id: productId,

        entity: String(item.entity ?? ''),
        entity_title: String(item.entity_title ?? ''),
        preparation_title: String(
            item.preparation_title ?? ''
        ),
        formulation_title: String(
            item.formulation_title ?? ''
        ),

        received_from: item.received_from ?? null,
        received_from_title: String(
            item.received_from_title ?? ''
        ),
        manufacturer: String(item.manufacturer ?? ''),
        manufacturer_title: String(
            item.manufacturer_title ?? ''
        ),
        origin_country: String(item.origin_country ?? ''),
        origin_country_title: String(
            item.origin_country_title ?? ''
        ),

        unit_of_receipt: String(item.unit_of_receipt ?? ''),
        retailer_order: item.retailer_order ?? null,
        retailer_order_item:
            item.retailer_order_item ?? null,
        wholesaler_order: item.wholesaler_order ?? null,
        wholesaler_order_item:
            item.wholesaler_order_item ?? null,

        batch: item.batch ?? null,
        bar_code: String(item.bar_code ?? ''),

        manufacture_date: item.manufacture_date ?? null,
        expiry_date: item.expiry_date ?? null,
        days_to_expiry:
            item.days_to_expiry ??
            computeDaysToExpiry(item.expiry_date),
        expiry_status:
            item.expiry_status ??
            computeExpiryStatus(
                item.days_to_expiry ??
                computeDaysToExpiry(item.expiry_date)
            ),

        unit_buying_price: item.unit_buying_price
            ? String(item.unit_buying_price)
            : null,
        unit_selling_price: String(
            item.unit_selling_price ?? '0.00'
        ),
        final_unit_selling_price: String(
            item.final_unit_selling_price ??
            item.unit_selling_price ??
            '0.00'
        ),
        discount_unit_selling_price: String(
            item.discount_unit_selling_price ?? '0.00'
        ),
        recommended_retail_price:
            item.recommended_retail_price
                ? String(item.recommended_retail_price)
                : null,
        unit_price_discount: String(
            item.unit_price_discount ?? '0.00'
        ),

        current_unit_quantity: Number(
            item.current_unit_quantity ?? 0
        ),
        received_unit_quantity: Number(
            item.received_unit_quantity ?? 0
        ),
        received_pack_quantity: Number(
            item.received_pack_quantity ?? 0
        ),

        in_placement:
            item.in_placement === true ||
            item.in_placement === 'true' ||
            item.in_placement === 1 ||
            item.in_placement === '1',

        is_active: String(item.is_active ?? 'true'),
        is_pom: !!item.is_pom,
        supplier_invoice: item.supplier_invoice ?? null,

        // Discounts — normalised to canonical shapes so downstream
        // consumers don't need to know about every possible key.
        quantity_discounts: normalizeQuantityDiscounts(item),
        price_discount: normalizePriceDiscount(item),

        images: Array.isArray(item.images) ? item.images : [],

        description: String(item.description ?? ''),

        created: String(firstDefined(item.created, ts)),
        updated: String(firstDefined(item.updated, ts)),
        employee: String(item.employee ?? ''),
        owner: String(item.owner ?? ''),
    };
}

/* =========================================================
 * Array equality
 * ======================================================= */

function areReceiptsEqual(
    a: WholesalerReceipt[],
    b: WholesalerReceipt[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.remote_id !== y.remote_id ||
            x.product_id !== y.product_id ||
            x.product_title !== y.product_title ||
            x.current_unit_quantity !== y.current_unit_quantity ||
            x.received_unit_quantity !== y.received_unit_quantity ||
            x.unit_selling_price !== y.unit_selling_price ||
            x.final_unit_selling_price !==
            y.final_unit_selling_price ||
            x.days_to_expiry !== y.days_to_expiry ||
            x.expiry_status !== y.expiry_status ||
            x.title !== y.title ||
            x.bar_code !== y.bar_code ||
            x.synced !== y.synced ||
            x.batch !== y.batch ||
            x.draft_id !== y.draft_id ||
            x.thumbnail_url !== y.thumbnail_url
        ) {
            return false;
        }
    }
    return true;
}

/* =========================================================
 * Payload builder — matches CreateWholesalerReceipt
 * ======================================================= */

function buildReceiptDetails(
    record: WholesalerReceipt,
    currentUserId: string
) {
    const productId = String(record.product_id ?? '');

    const receivedQty = String(
        record.received_unit_quantity ??
        record.current_unit_quantity ??
        0
    );

    const draftId =
        record.draft_id || buildDraftId(currentUserId);

    return {
        draft_id: draftId,

        product: productId,
        unit_quantity: receivedQty,
        received_unit_quantity: receivedQty,

        unit_buying_price: String(
            record.unit_buying_price ?? ''
        ),
        unit_selling_price: String(
            record.unit_selling_price ??
            record.final_unit_selling_price ??
            ''
        ),

        manufacture_date: String(
            record.manufacture_date ?? ''
        ),
        expiry_date: String(record.expiry_date ?? ''),

        unit_of_receipt: String(
            record.unit_of_receipt ?? ''
        ),
        batch: String(record.batch ?? ''),

        received_from: String(record.received_from ?? ''),
        wholesaler_order_item: String(
            record.wholesaler_order_item ?? ''
        ),

        quantity_discounts: Array.isArray(
            record.quantity_discounts
        )
            ? record.quantity_discounts
            : [],
        wholesaler_price_discount: String(
            (record as any).wholesaler_price_discount ?? ''
        ),
    };
}

/* =========================================================
 * Provider
 * ======================================================= */

export const WholesalerReceiptsSyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();
    const currentUserId = String(user?.id ?? '');
    const { isOnline } = useNetworkStatus();

    /* -------- State -------- */
    const [wholesalerReceipts, setWholesalerReceipts] = useState<
        WholesalerReceipt[]
    >([]);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isPushSyncing, setIsPushSyncing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<
        'idle' | 'pushing' | 'live' | 'offline' | 'error'
    >('idle');

    const getReceiptsWriteApi = useApi(
        wholesalersApi.wholesaleStaffAction
    );

    /* -------- Refs -------- */
    const wsRef = useRef<WebSocket | null>(null);
    const receiptsStateRef = useRef<WholesalerReceipt[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const reconnectAttemptRef = useRef(0);
    const wsGenerationRef = useRef(0);
    const pushGuardRef = useRef(false);
    const pushIntervalRef =
        useRef<ReturnType<typeof setInterval> | null>(null);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    useEffect(() => {
        receiptsStateRef.current = wholesalerReceipts;
    }, [wholesalerReceipts]);

    /* ---------------------------------------------------------
     * Storage commit / read
     * ------------------------------------------------------- */
    const commitToStorage = useCallback(
        async (data: WholesalerReceipt[]) => {
            const tasks: Promise<any>[] = [];

            tasks.push(
                AsyncStorage.setItem(
                    NATIVE_WHOLESALER_RECEIPTS_KEY,
                    JSON.stringify(data)
                ).catch((err) =>
                    warn('AsyncStorage write failed:', err)
                )
            );

            tasks.push(
                AsyncStorage.setItem(
                    WHOLESALER_RECEIPTS_SYNCED_AT,
                    new Date().toISOString()
                ).catch(() => null)
            );

            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                try {
                    window.localStorage.setItem(
                        NATIVE_WHOLESALER_RECEIPTS_KEY,
                        JSON.stringify(data)
                    );
                    window.localStorage.setItem(
                        WHOLESALER_RECEIPTS_SYNCED_AT,
                        new Date().toISOString()
                    );
                } catch (err) {
                    warn('localStorage write failed:', err);
                }
            }

            if (dbInstance?.wholesalerReceipts) {
                tasks.push(
                    (async () => {
                        try {
                            await dbInstance.transaction(
                                'rw',
                                dbInstance.wholesalerReceipts,
                                async () => {
                                    await dbInstance.wholesalerReceipts.clear();
                                    if (data.length === 0) return;

                                    const rows = data.map(
                                        (row) => {
                                            if (
                                                row.id ===
                                                undefined ||
                                                row.id === null
                                            ) {
                                                const {
                                                    id,
                                                    ...rest
                                                } = row;
                                                return rest;
                                            }
                                            return row;
                                        }
                                    );

                                    await dbInstance.wholesalerReceipts.bulkPut(
                                        rows
                                    );
                                }
                            );
                        } catch (err) {
                            warn('Dexie write failed:', err);
                        }
                    })()
                );
            }

            await Promise.allSettled(tasks);
        },
        []
    );

    const readLocalRecords = useCallback(
        async (): Promise<WholesalerReceipt[]> => {
            const [asyncData, dexieData] = await Promise.all(
                [
                    AsyncStorage.getItem(
                        NATIVE_WHOLESALER_RECEIPTS_KEY
                    )
                        .then((raw) =>
                            raw ? JSON.parse(raw) : []
                        )
                        .catch(() => []),
                    (async () => {
                        try {
                            if (
                                dbInstance?.wholesalerReceipts
                            ) {
                                return await dbInstance.wholesalerReceipts.toArray();
                            }
                        } catch { }
                        return [];
                    })(),
                ]
            );

            let webData: WholesalerReceipt[] = [];
            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                try {
                    const raw =
                        window.localStorage.getItem(
                            NATIVE_WHOLESALER_RECEIPTS_KEY
                        );
                    webData = raw ? JSON.parse(raw) : [];
                } catch { }
            }

            const candidates = [
                { name: 'async', rows: asyncData },
                { name: 'web', rows: webData },
                { name: 'dexie', rows: dexieData },
            ];

            const chosen = candidates.reduce((best, current) =>
                current.rows.length > best.rows.length ||
                    (current.rows.length === best.rows.length &&
                        current.name === 'dexie')
                    ? current
                    : best
            );

            return chosen.rows;
        },
        []
    );

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await readLocalRecords();

            if (cached?.length > 0) {
                const refreshed = cached.map(
                    (r: WholesalerReceipt) => {
                        const days = computeDaysToExpiry(
                            r.expiry_date
                        );
                        return {
                            ...r,
                            days_to_expiry: days,
                            expiry_status:
                                computeExpiryStatus(days),
                        };
                    }
                );

                receiptsStateRef.current = refreshed;
                setWholesalerReceipts((prev) =>
                    areReceiptsEqual(prev, refreshed)
                        ? prev
                        : refreshed
                );
                return refreshed;
            }
            return cached;
        } catch (e) {
            warn('hydrateFromLocalDB threw:', e);
            return [];
        }
    }, [readLocalRecords]);

    const runLocalMigration = useCallback(async () => {
        if (!currentUserId) return;
        try {
            await backfillWholesalerDraftIds(currentUserId);
        } catch (e) {
            warn('runLocalMigration threw:', e);
        }
    }, [currentUserId]);

    const hydrateSyncedAt = useCallback(async () => {
        try {
            let raw: string | null = null;
            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                raw = window.localStorage.getItem(
                    WHOLESALER_RECEIPTS_SYNCED_AT
                );
            }
            if (!raw) {
                raw = await AsyncStorage.getItem(
                    WHOLESALER_RECEIPTS_SYNCED_AT
                );
            }
            if (raw) {
                setLastSyncedTime(
                    new Date(raw).toLocaleString([], {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                );
            }
        } catch { }
    }, []);

    /* ---------------------------------------------------------
     * Local mutations
     * ------------------------------------------------------- */
    const addLocalReceipt = useCallback(
        async (
            receipt: WholesalerReceipt
        ): Promise<WholesalerReceipt> => {
            const nowIso = new Date().toISOString();

            const row: WholesalerReceipt = {
                ...receipt,
                cached_at: receipt.cached_at ?? nowIso,
                synced: false,
                sync_error: null,
            };

            const next = [row, ...receiptsStateRef.current];

            await commitToStorage(next);
            receiptsStateRef.current = next;
            setWholesalerReceipts((prev) =>
                areReceiptsEqual(prev, next) ? prev : next
            );
            setLastSyncedTime(formatSyncTime());

            return row;
        },
        [commitToStorage]
    );

    const updateLocalReceipt = useCallback(
        async (receipt: WholesalerReceipt): Promise<void> => {
            const nowIso = new Date().toISOString();
            const idx = receiptsStateRef.current.findIndex(
                (r) =>
                    (receipt.remote_id &&
                        r.remote_id === receipt.remote_id) ||
                    (receipt.draft_id &&
                        r.draft_id === receipt.draft_id)
            );
            if (idx < 0) {
                warn(
                    'updateLocalReceipt: no matching row',
                    receipt.remote_id,
                    receipt.draft_id
                );
                return;
            }

            const next = [...receiptsStateRef.current];
            next[idx] = {
                ...next[idx],
                ...receipt,
                id: next[idx].id,
                cached_at: nowIso,
                synced: false,
                sync_error: null,
            };

            await commitToStorage(next);
            receiptsStateRef.current = next;
            setWholesalerReceipts((prev) =>
                areReceiptsEqual(prev, next) ? prev : next
            );
            setLastSyncedTime(formatSyncTime());
        },
        [commitToStorage]
    );

    /* ---------------------------------------------------------
     * Push pending → remote
     * ------------------------------------------------------- */
    const pushPending = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;
        if (pushGuardRef.current) return;

        pushGuardRef.current = true;
        setIsPushSyncing(true);
        setIsSyncing(true);
        setSyncStatus('pushing');

        let succeeded = 0;
        let failed = 0;
        let firstFailure: any = null;
        let firstSuccess: any = null;

        try {
            const all = await readLocalRecords();
            const pending = all.filter(needsRemotePush);

            log('pushPending — candidates', {
                total: all.length,
                pending: pending.length,
                skipped: all
                    .filter((r) => !needsRemotePush(r))
                    .map((r) => ({
                        draft_id: r.draft_id,
                        remote_id: r.remote_id,
                        synced: r.synced,
                        title: r.title,
                    })),
            });

            if (pending.length === 0) return;

            let madeAChange = false;

            for (const record of pending) {
                if (!isOnlineRef.current) break;

                const draftId =
                    record.draft_id ||
                    buildDraftId(currentUserId);

                const body = {
                    action: 'CreateWholesalerReceipt' as const,
                    wholesaler_receipt_details:
                        buildReceiptDetails(
                            record,
                            currentUserId
                        ),
                };

                console.log(
                    '================================================'
                );
                console.log(
                    '[WholesalerReceiptsSync] → REQUEST',
                    {
                        draft_id: draftId,
                        title: record.title,
                    }
                );
                console.log(
                    '[WholesalerReceiptsSync] → REQUEST BODY',
                    body
                );
                console.log(
                    '================================================'
                );

                let result: any = null;
                const startedAt = Date.now();
                try {
                    result =
                        await getReceiptsWriteApi.request(
                            body
                        );
                } catch (e: any) {
                    result = {
                        status: 'error',
                        problem: 'exception',
                        data: {
                            message:
                                e?.message ||
                                'Request threw',
                        },
                    };
                }
                const elapsed = Date.now() - startedAt;

                console.log(
                    '================================================'
                );
                console.log(
                    '[WholesalerReceiptsSync] ← RESPONSE',
                    result
                );
                console.log(
                    '[WholesalerReceiptsSync] ← META',
                    {
                        draft_id: draftId,
                        elapsed_ms: elapsed,
                        status: result?.status,
                        ok: result?.ok,
                        problem: result?.problem,
                        response_code:
                            result?.data?.response_code,
                        response_message:
                            result?.data?.response_message,
                    }
                );
                console.log(
                    '================================================'
                );

                const isOk =
                    result?.ok &&
                    String(
                        result?.data?.response_code ?? ''
                    ) === '0';

                if (isOk) {
                    succeeded++;
                    madeAChange = true;

                    if (!firstSuccess) {
                        firstSuccess = {
                            draft_id: draftId,
                            response_message:
                                result?.data
                                    ?.response_message,
                            response: result,
                        };
                    }

                    const createdReceipt =
                        result?.data?.wholesaler_receipt ??
                        null;

                    const serverRemoteId =
                        createdReceipt?.id != null
                            ? String(createdReceipt.id)
                            : '';

                    if (!serverRemoteId) {
                        warn(
                            'success response has no wholesaler_receipt.id',
                            {
                                draft_id: draftId,
                                response_data:
                                    result?.data,
                            }
                        );
                    }

                    const idx = all.findIndex(
                        (r) => r.draft_id === draftId
                    );

                    if (idx >= 0) {
                        const nowIso =
                            new Date().toISOString();
                        const finalRemoteId =
                            serverRemoteId ||
                            all[idx].remote_id ||
                            '';

                        all[idx] = {
                            ...all[idx],
                            remote_id: finalRemoteId,
                            draft_id: draftId,
                            synced: true,
                            sync_error: null,
                            cached_at: nowIso,
                            updated: nowIso,
                        };

                        console.log(
                            '[WholesalerReceiptsSync] local row updated',
                            {
                                draft_id: draftId,
                                remote_id: finalRemoteId,
                                synced: true,
                                title: all[idx].title,
                            }
                        );
                    } else {
                        warn(
                            'pushPending — no local row for draft_id',
                            draftId
                        );
                    }
                } else {
                    failed++;
                    madeAChange = true;

                    const failureMessage =
                        result?.data?.response_message ||
                        result?.data?.message ||
                        result?.problem ||
                        `Server rejected (response_code=${result?.data?.response_code})`;

                    if (!firstFailure) {
                        firstFailure = {
                            draft_id: draftId,
                            response_message:
                                result?.data
                                    ?.response_message,
                            response: result,
                        };
                    }

                    const idx = all.findIndex(
                        (r) => r.draft_id === draftId
                    );

                    if (idx >= 0) {
                        all[idx] = {
                            ...all[idx],
                            draft_id: draftId,
                            sync_error: failureMessage,
                        };
                    }
                }
            }

            if (madeAChange) {
                await commitToStorage(all);
                const verify =
                    await readLocalRecords();
                receiptsStateRef.current = verify;
                setWholesalerReceipts((prev) =>
                    areReceiptsEqual(prev, verify)
                        ? prev
                        : verify
                );
                setLastSyncedTime(formatSyncTime());
            }

            const successMessage =
                firstSuccess?.response_message;
            const failureMessageAlert =
                firstFailure?.response_message;

            if (succeeded > 0 && failed === 0) {
                notify(
                    'Sync Success',
                    successMessage ||
                    `${succeeded} item${succeeded === 1 ? '' : 's'
                    } synced to server.`
                );
            } else if (succeeded > 0 && failed > 0) {
                notify(
                    'Sync Partial',
                    `${succeeded} succeeded · ${failed} failed.\n\n` +
                    (failureMessageAlert
                        ? `Last error: ${failureMessageAlert}\n\n`
                        : '') +
                    JSON.stringify(
                        firstFailure?.response?.data ??
                        firstFailure?.response,
                        null,
                        2
                    ).slice(0, 800)
                );
            } else if (failed > 0) {
                notify(
                    'Sync Failed',
                    failureMessageAlert ||
                    `${failed} item${failed === 1 ? '' : 's'
                    } could not be synced.\n\nServer response:\n${JSON.stringify(
                        firstFailure?.response?.data ??
                        firstFailure?.response,
                        null,
                        2
                    ).slice(0, 800)}`
                );
            }
        } catch (err: any) {
            warn('pushPending outer error:', err);
            notify(
                'Sync Error',
                err?.message ||
                'Unexpected error during sync.'
            );
        } finally {
            pushGuardRef.current = false;
            setIsPushSyncing(false);
            setIsSyncing(false);
            setSyncStatus(
                isOnlineRef.current
                    ? isLiveConnected
                        ? 'live'
                        : 'idle'
                    : 'offline'
            );
        }
    }, [
        token,
        getReceiptsWriteApi,
        commitToStorage,
        readLocalRecords,
        currentUserId,
        isLiveConnected,
    ]);

    /* ---------------------------------------------------------
     * WebSocket
     * ------------------------------------------------------- */
    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }

            if (!currentToken || !isOnlineRef.current) {
                setIsLiveConnected(false);
                setSyncStatus(
                    isOnlineRef.current
                        ? 'idle'
                        : 'offline'
                );
                return;
            }

            const generation = ++wsGenerationRef.current;

            try {
                const url = `${WS_URL}?token=${encodeURIComponent(
                    currentToken
                )}`;
                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onopen = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    setIsLiveConnected(true);
                    setSyncStatus('live');
                    reconnectAttemptRef.current = 0;
                    log('WebSocket — connected');

                    try {
                        ws.send(
                            JSON.stringify({
                                action: WS_SNAPSHOT_ACTION,
                            })
                        );
                        log(
                            'WebSocket — sent snapshot request',
                            { action: WS_SNAPSHOT_ACTION }
                        );
                    } catch (err) {
                        warn(
                            'WebSocket — snapshot request failed',
                            err
                        );
                    }
                };

                ws.onmessage = async (event) => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;

                    try {
                        const parsed = JSON.parse(
                            event.data
                        );

                        const incoming =
                            parsed?.inventory ??
                            parsed?.wholesaler_receipts ??
                            parsed?.receipts ??
                            parsed?.payload?.inventory ??
                            parsed?.payload?.wholesaler_receipts ??
                            parsed?.payload?.receipts ??
                            parsed?.data?.inventory ??
                            parsed?.data?.wholesaler_receipts ??
                            parsed?.data?.receipts;

                        if (
                            !Array.isArray(incoming) ||
                            incoming.length === 0
                        ) {
                            log(
                                '  frame has no receipts — ignoring',
                                {
                                    keys: Object.keys(
                                        parsed ?? {}
                                    ),
                                }
                            );
                            return;
                        }

                        // Dev-only: print the discount keys on the
                        // first receipt so we can verify the wire
                        // shape matches what normalizeReceipt expects.
                        if (__DEV__ && incoming[0]) {
                            const s = incoming[0];
                            console.log(
                                '[WS] sample receipt discount keys:',
                                {
                                    price_discount:
                                        s.price_discount,
                                    quantity_discounts:
                                        s.quantity_discounts,
                                    quantity_discount:
                                        s.quantity_discount,
                                    wholesaler_price_discount_receipt:
                                        s.wholesaler_price_discount_receipt,
                                    wholesaler_quantity_discount_receipt:
                                        s.wholesaler_quantity_discount_receipt,
                                }
                            );
                        }

                        setIsSyncing(true);

                        const nowStr =
                            new Date().toISOString();

                        const currentMap = new Map<
                            string,
                            WholesalerReceipt
                        >(
                            receiptsStateRef.current.map(
                                (item) => [
                                    item.remote_id,
                                    item,
                                ]
                            )
                        );

                        incoming.forEach((raw: any) => {
                            const rid = String(
                                firstDefined(
                                    raw.id,
                                    raw.key,
                                    ''
                                )
                            );
                            if (!rid) return;

                            const existing =
                                currentMap.get(rid);

                            if (
                                existing &&
                                needsRemotePush(existing)
                            ) {
                                return;
                            }

                            const normalized =
                                normalizeReceipt(
                                    raw,
                                    nowStr
                                );

                            normalized.id = existing?.id;
                            normalized.draft_id =
                                existing?.draft_id ??
                                normalized.draft_id;

                            currentMap.set(rid, {
                                ...normalized,
                                synced: true,
                            });
                        });

                        const updated = Array.from(
                            currentMap.values()
                        );

                        await commitToStorage(updated);

                        receiptsStateRef.current = updated;
                        setWholesalerReceipts((prev) =>
                            areReceiptsEqual(prev, updated)
                                ? prev
                                : updated
                        );

                        setLastSyncedTime(formatSyncTime());

                        log('WebSocket — merged frame', {
                            incoming: incoming.length,
                            total: updated.length,
                        });
                    } catch (e) {
                        warn(
                            'WebSocket — message parse failed:',
                            e
                        );
                    } finally {
                        setIsSyncing(false);
                    }
                };

                ws.onclose = () => {
                    if (
                        generation !==
                        wsGenerationRef.current
                    )
                        return;
                    setIsLiveConnected(false);
                    wsRef.current = null;
                    setSyncStatus(
                        isOnlineRef.current
                            ? 'idle'
                            : 'offline'
                    );

                    if (
                        currentToken &&
                        isOnlineRef.current
                    ) {
                        const attempt =
                            reconnectAttemptRef.current++;
                        const delay = Math.min(
                            WS_RECONNECT_BASE_MS *
                            2 ** attempt,
                            WS_RECONNECT_MAX_MS
                        );
                        reconnectTimeoutRef.current =
                            setTimeout(
                                () =>
                                    establishLiveWebSocketSync(
                                        currentToken
                                    ),
                                delay
                            );
                    }
                };

                ws.onerror = () => { };
            } catch (err) {
                warn(
                    'WebSocket — establishment threw:',
                    err
                );
            }
        },
        [commitToStorage]
    );

    /* ---------------------------------------------------------
     * Manual refresh
     * ------------------------------------------------------- */
    const forceManualRefresh = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await pushPending();
            if (token) {
                reconnectAttemptRef.current = 0;
                establishLiveWebSocketSync(token);
            }
        } catch (e) {
            warn('Manual refresh threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        token,
        pushPending,
        establishLiveWebSocketSync,
    ]);

    /* ---------------------------------------------------------
     * Stable refs for bootstrap
     * ------------------------------------------------------- */
    const actionsRef = useRef({
        hydrateFromLocalDB,
        runLocalMigration,
        hydrateSyncedAt,
        establishLiveWebSocketSync,
        pushPending,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            runLocalMigration,
            hydrateSyncedAt,
            establishLiveWebSocketSync,
            pushPending,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap
     * ------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            await actionsRef.current.hydrateSyncedAt();
            if (cancelled) return;

            await actionsRef.current.runLocalMigration();
            if (cancelled) return;

            if (token) {
                await actionsRef.current.pushPending();
                if (cancelled) return;

                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
            }
        };

        init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (pushIntervalRef.current) {
                clearInterval(pushIntervalRef.current);
                pushIntervalRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /* ---------------------------------------------------------
     * Online / offline transitions
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            (async () => {
                await actionsRef.current.pushPending();
                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
            })();
        } else {
            setSyncStatus('offline');
            setIsLiveConnected(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * 2-minute poll
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;

        if (pushIntervalRef.current) {
            clearInterval(pushIntervalRef.current);
            pushIntervalRef.current = null;
        }

        const tick = async () => {
            if (!isOnlineRef.current) {
                log('Poll tick — offline, skipping');
                return;
            }

            const pending =
                receiptsStateRef.current.filter(
                    needsRemotePush
                );

            if (pending.length === 0) {
                log('Poll tick — nothing pending');
                return;
            }

            log(
                `Poll tick — pushing ${pending.length} pending row(s)`
            );

            try {
                await actionsRef.current.pushPending();
            } catch (e) {
                warn('Poll tick — pushPending threw:', e);
            }
        };

        log(
            `Arming pending-push poll every ${PENDING_PUSH_INTERVAL_MS / 1000
            }s`
        );
        pushIntervalRef.current = setInterval(
            tick,
            PENDING_PUSH_INTERVAL_MS
        );

        return () => {
            if (pushIntervalRef.current) {
                clearInterval(pushIntervalRef.current);
                pushIntervalRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /* ---------------------------------------------------------
     * Derived — pending count + sync UI state
     * ------------------------------------------------------- */
    const pendingCount = useMemo(
        () =>
            wholesalerReceipts.filter(needsRemotePush)
                .length,
        [wholesalerReceipts]
    );

    const syncUiState: SyncUiState = useMemo(() => {
        const syncing =
            isSyncing ||
            isPushSyncing ||
            isManualRefreshing;

        const offline = !isOnline;
        const hasPending = pendingCount > 0;

        return {
            syncing,
            offline,
            hasPending,
            pendingCount,
            showOfflineWarning: offline && hasPending,
            showPendingChip:
                !offline && hasPending && !syncing,
            showSyncing: syncing,
            lastSyncedTime,
            syncStatus,
        };
    }, [
        isSyncing,
        isPushSyncing,
        isManualRefreshing,
        isOnline,
        pendingCount,
        lastSyncedTime,
        syncStatus,
    ]);

    /* ---------------------------------------------------------
     * Memoized context value
     * ------------------------------------------------------- */
    const value = useMemo<WholesalerReceiptsSyncContextType>(
        () => ({
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            pendingCount,
            syncStatus,
            forceManualRefresh,
            pushPending,
            lastSyncedTime,
            wholesalerReceipts,
            addLocalReceipt,
            updateLocalReceipt,
            syncUiState,
        }),
        [
            isSyncing,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            pendingCount,
            syncStatus,
            forceManualRefresh,
            pushPending,
            lastSyncedTime,
            wholesalerReceipts,
            addLocalReceipt,
            updateLocalReceipt,
            syncUiState,
        ]
    );

    return (
        <WholesalerReceiptsSyncContext.Provider value={value}>
            {children}
        </WholesalerReceiptsSyncContext.Provider>
    );
};

/* =========================================================
 * Hook
 * ======================================================= */

export const useWholesalerReceiptsSync = () => {
    const context = useContext(
        WholesalerReceiptsSyncContext
    );
    if (!context) {
        throw new Error(
            'useWholesalerReceiptsSync missing Provider'
        );
    }
    return context;
};