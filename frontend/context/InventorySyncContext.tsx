// context/InventorySyncContext.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { RetailerReceipt } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import {
    backfillDraftIds,
    buildDraftId,
} from '@/services/inventoryMigration';
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

interface InventorySyncContextType {
    isSyncing: boolean;
    isManualRefreshing: boolean;
    isLiveConnected: boolean;
    isPushSyncing: boolean;
    isOnline: boolean;
    pendingCount: number;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    pushPending: () => Promise<void>;
    refreshLocal: () => Promise<void>;
    applyServerReceipt: (
        serverRecord: any,
        draftId?: string
    ) => Promise<void>;
    lastSyncedTime: string;
    retailerReceipts: RetailerReceipt[];
}

const InventorySyncContext = createContext<
    InventorySyncContextType | undefined
>(undefined);

/* =========================================================
 * Constants
 * ======================================================= */

const NATIVE_INVENTORY_KEY =
    'wazipos_async_inventory_registry';

const WS_RECONNECT_BASE_MS = 3000;
const WS_RECONNECT_MAX_MS = 60000;
const INVENTORY_POLL_INTERVAL_MS = 5 * 60 * 1000;

const WS_URL =
    'wss://api.wazipos.co.ke/ws/retailers/inventory/';

/* =========================================================
 * Logging
 * ======================================================= */

const log = (...args: any[]) => {
    if (__DEV__) console.log('[InventorySync]', ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[InventorySync]', ...args);
};

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

function isServerAssignedId(raw: any): boolean {
    if (raw === undefined || raw === null) return false;
    const s = String(raw).trim();
    if (!s) return false;
    if (s.startsWith('local-')) return false;
    if (s.startsWith('temp-')) return false;
    return true;
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

function resolveImageUrl(rawPath: any): string | null {
    let path: string | null = null;

    if (Array.isArray(rawPath) && rawPath.length > 0) {
        const first = rawPath[0];
        if (typeof first === 'string') {
            path = first;
        } else if (first && typeof first === 'object') {
            path =
                first.thumbnail ||
                first.image ||
                first.url ||
                null;
        }
    } else if (
        rawPath &&
        typeof rawPath === 'object' &&
        !Array.isArray(rawPath)
    ) {
        path =
            rawPath.thumbnail ||
            rawPath.image ||
            rawPath.url ||
            null;
    } else if (typeof rawPath === 'string') {
        path = rawPath;
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

    return `https://api.wazipos.co.ke/${cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
}

/* =========================================================
 * WS frame extraction
 * ======================================================= */

const FRAME_KEYS = [
    'inventory',
    'retailer_receipts',
    'receipts',
    'results',
    'items',
    'data',
];

function extractInventoryFromFrame(
    parsed: any
): any[] | null {
    if (!parsed) return null;
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object') return null;

    for (const k of FRAME_KEYS) {
        const v = (parsed as any)[k];
        if (Array.isArray(v)) return v;
    }

    for (const wrapper of ['data', 'payload', 'body']) {
        const w = (parsed as any)[wrapper];
        if (
            w &&
            typeof w === 'object' &&
            !Array.isArray(w)
        ) {
            for (const k of FRAME_KEYS) {
                const v = (w as any)[k];
                if (Array.isArray(v)) return v;
            }
        }
    }
    return null;
}

/* =========================================================
 * normalizeItem
 * ======================================================= */

function normalizeItem(
    item: any,
    ts: string
): RetailerReceipt {
    const uPrice = String(
        firstDefined(
            item.unit_selling_price,
            item.price,
            '0.00'
        )
    );

    const resolvedUrl = resolveImageUrl(item.images);

    const manufactureDate = item.manufacture_date ?? null;
    const expiryDate = item.expiry_date ?? null;
    const days = computeDaysToExpiry(expiryDate);

    const remoteId = String(
        firstDefined(item.id, item.key, '')
    );

    return {
        cached_at: String(
            firstDefined(item.cached_at, ts)
        ),

        remote_id: remoteId,
        remote_key: item.key ? String(item.key) : undefined,

        synced: !isPendingSync(item.synced),
        sync_error: item.sync_error ?? null,

        thumbnail_url: resolvedUrl,
        image_url: resolvedUrl,

        title: String(
            firstDefined(item.title, item.product_title, '')
        ),
        long_title: String(
            firstDefined(
                item.long_title,
                item.product_title,
                ''
            )
        ),
        product_title: String(
            firstDefined(item.product_title, item.title, '')
        ),
        product: String(item.product ?? ''),
        entity: String(item.entity ?? ''),
        entity_title: String(item.entity_title ?? ''),
        draft_id: item.draft_id ?? null,
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
        unit_of_receipt: String(item.unit_of_receipt ?? ''),
        retailer_order: item.retailer_order ?? null,
        retailer_order_item: item.retailer_order_item ?? null,
        batch: item.batch ?? null,

        bar_code: String(
            firstDefined(item.bar_code, item.barcode, '')
        ),

        manufacture_date: manufactureDate,
        expiry_date: expiryDate,
        days_to_expiry: days,
        expiry_status: computeExpiryStatus(days),

        unit_buying_price: item.unit_buying_price
            ? String(item.unit_buying_price)
            : null,
        unit_selling_price: uPrice,
        final_unit_selling_price: String(
            firstDefined(
                item.final_unit_selling_price,
                uPrice
            )
        ),
        unit_price_discount: String(
            item.unit_price_discount ?? '0.00'
        ),

        current_unit_quantity: Number(
            firstDefined(
                item.current_unit_quantity,
                item.available,
                0
            )
        ),
        received_unit_quantity: Number(
            firstDefined(
                item.received_unit_quantity,
                item.unit_quantity,
                0
            )
        ),

        in_placement: !!item.in_placement,
        is_active: String(item.is_active ?? 'true'),
        is_pom: !!item.is_pom,
        supplier_invoice: item.supplier_invoice ?? null,

        origin_country: String(item.origin_country ?? ''),
        origin_country_title: String(
            item.origin_country_title ?? ''
        ),

        manufacturer: String(item.manufacturer ?? ''),
        manufacturer_title: String(
            item.manufacturer_title ?? ''
        ),

        packaging: String(item.packaging ?? ''),
        units_per_pack: Number(
            firstDefined(item.units_per_pack, 1)
        ),

        images: Array.isArray(item.images) ? item.images : [],

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
    a: RetailerReceipt[],
    b: RetailerReceipt[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.remote_id !== y.remote_id ||
            x.current_unit_quantity !==
            y.current_unit_quantity ||
            x.received_unit_quantity !==
            y.received_unit_quantity ||
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
 * Provider
 * ======================================================= */

export const InventorySyncProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const { token, user } = useAuth();
    const currentUserId = String(user?.id ?? '');

    const { isOnline } = useNetworkStatus();

    const [retailerReceipts, setRetailerReceipts] = useState<
        RetailerReceipt[]
    >([]);
    const [lastSyncedTime, setLastSyncedTime] = useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isPushSyncing, setIsPushSyncing] = useState(false);

    const getInventoryReadApi = useApi(
        retailersApi.retailerReceiptsAction
    );
    const getInventoryWriteApi = useApi(
        retailersApi.retailerReceiptsAdminAction
    );

    const wsRef = useRef<WebSocket | null>(null);
    const receiptsStateRef = useRef<RetailerReceipt[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(
        null
    );
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pushGuardRef = useRef(false);
    const reconnectAttemptRef = useRef(0);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    useEffect(() => {
        receiptsStateRef.current = retailerReceipts;
    }, [retailerReceipts]);

    /* ---------------------------------------------------------
     * Storage
     * ------------------------------------------------------- */
    const commitToStorage = useCallback(
        async (data: RetailerReceipt[]) => {
            if (Platform.OS === 'web') {
                if (!dbInstance?.retailerReceipts) return;
                try {
                    await dbInstance.transaction(
                        'rw',
                        dbInstance.retailerReceipts,
                        async () => {
                            await dbInstance.retailerReceipts.clear();
                            if (data.length > 0) {
                                await dbInstance.retailerReceipts.bulkPut(
                                    data
                                );
                            }
                        }
                    );
                } catch (err) {
                    warn('Dexie write failed:', err);
                }
                return;
            }

            try {
                await AsyncStorage.setItem(
                    NATIVE_INVENTORY_KEY,
                    JSON.stringify(data)
                );
            } catch (err) {
                warn('AsyncStorage write failed:', err);
            }
        },
        []
    );

    const readLocalRecords = useCallback(
        async (): Promise<RetailerReceipt[]> => {
            if (Platform.OS === 'web') {
                try {
                    if (dbInstance?.retailerReceipts) {
                        return await dbInstance.retailerReceipts.toArray();
                    }
                } catch (err) {
                    warn('Dexie read failed:', err);
                }
                return [];
            }

            try {
                const raw = await AsyncStorage.getItem(
                    NATIVE_INVENTORY_KEY
                );
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                warn('AsyncStorage read failed:', err);
                return [];
            }
        },
        []
    );

    const refreshLocal = useCallback(async () => {
        try {
            const records = await readLocalRecords();
            if (!records || records.length === 0) return;

            const refreshed = records.map((r) => {
                const days = computeDaysToExpiry(r.expiry_date);
                return {
                    ...r,
                    days_to_expiry: days,
                    expiry_status: computeExpiryStatus(days),
                };
            });

            setRetailerReceipts((prev) =>
                areReceiptsEqual(prev, refreshed)
                    ? prev
                    : refreshed
            );
        } catch (e) {
            warn('refreshLocal threw:', e);
        }
    }, [readLocalRecords]);

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await readLocalRecords();

            if (cached?.length > 0) {
                const refreshed = cached.map((r) => {
                    const days = computeDaysToExpiry(
                        r.expiry_date
                    );
                    return {
                        ...r,
                        days_to_expiry: days,
                        expiry_status:
                            computeExpiryStatus(days),
                    };
                });

                setRetailerReceipts((prev) =>
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

    /* ---------------------------------------------------------
     * Migration
     * ------------------------------------------------------- */
    const runLocalMigration = useCallback(async () => {
        if (!currentUserId) return;
        try {
            await backfillDraftIds(currentUserId);
        } catch (e) {
            warn('runLocalMigration threw:', e);
        }
    }, [currentUserId]);

    /* ---------------------------------------------------------
     * Apply server response
     *
     * Called by the modal after a successful Create/Update.
     * Matches an existing local row by draft_id (preferred) or
     * remote_id, merges the server values in, and commits to
     * storage. Keeps the local numeric Dexie PK so the row
     * updates in place instead of inserting a duplicate.
     *
     * The WS broadcast that arrives later is idempotent — it
     * replaces the row with identical values.
     * ------------------------------------------------------- */
    const applyServerReceipt = useCallback(
        async (serverRecord: any, draftId?: string) => {
            if (!serverRecord) return;

            const now = new Date().toISOString();
            const normalized = normalizeItem(serverRecord, now);

            const effectiveDraftId =
                normalized.draft_id ?? draftId ?? null;

            const existing = receiptsStateRef.current;

            const idx = existing.findIndex((r) => {
                if (
                    effectiveDraftId &&
                    (r as any).draft_id === effectiveDraftId
                ) {
                    return true;
                }
                if (
                    normalized.remote_id &&
                    r.remote_id === normalized.remote_id
                ) {
                    return true;
                }
                return false;
            });

            let merged: RetailerReceipt[];

            if (idx >= 0) {
                const current = existing[idx];
                merged = [...existing];
                merged[idx] = {
                    ...current,
                    ...normalized,
                    // Preserve local numeric Dexie PK.
                    id: (current as any).id,
                    draft_id:
                        effectiveDraftId ??
                        (current as any).draft_id,
                    synced: true,
                    sync_error: null,
                    cached_at: now,
                };
                log(
                    'applied server receipt (update)',
                    normalized.remote_id
                );
            } else {
                merged = [
                    ...existing,
                    {
                        ...normalized,
                        draft_id: effectiveDraftId,
                        synced: true,
                        sync_error: null,
                        cached_at: now,
                    } as RetailerReceipt,
                ];
                log(
                    'applied server receipt (create)',
                    normalized.remote_id
                );
            }

            await commitToStorage(merged);
            setRetailerReceipts((prev) =>
                areReceiptsEqual(prev, merged)
                    ? prev
                    : merged
            );
            setLastSyncedTime(
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );
        },
        [commitToStorage]
    );

    /* ---------------------------------------------------------
     * Pull
     * ------------------------------------------------------- */
    const runRemoteInventorySynchronizer = useCallback(
        async () => {
            if (!token || !isOnlineRef.current) return;

            try {
                const res =
                    await getInventoryReadApi
                        .request({
                            action: 'GetRetailerReceipts',
                        })
                        .catch((e) => {
                            warn('pull request threw:', e);
                            return null;
                        });

                const raw = res?.data;
                const data = raw?.results || raw;

                if (res?.ok && Array.isArray(data)) {
                    const nowStr = new Date().toISOString();
                    const normalized = data.map((item: any) =>
                        normalizeItem(item, nowStr)
                    );

                    const existing = receiptsStateRef.current;
                    const pendingLocal = existing.filter((r) =>
                        isPendingSync(r.synced)
                    );
                    const serverIds = new Set(
                        normalized.map((r) => r.remote_id)
                    );
                    const localById = new Map(
                        existing.map((r) => [r.remote_id, r])
                    );

                    const merged: RetailerReceipt[] = [
                        ...pendingLocal.filter(
                            (r) => !serverIds.has(r.remote_id)
                        ),
                        ...normalized.map((serverRec) => {
                            const localRec = localById.get(
                                serverRec.remote_id
                            );

                            if (!localRec) {
                                return { ...serverRec, synced: true };
                            }

                            const localEditedAt = Date.parse(
                                String(
                                    (localRec as any).cached_at ??
                                    (localRec as any).updated ??
                                    ''
                                )
                            );
                            const serverUpdatedAt = Date.parse(
                                String(
                                    (serverRec as any).updated ??
                                    (serverRec as any).cached_at ??
                                    ''
                                )
                            );
                            const localIsNewer =
                                Number.isFinite(localEditedAt) &&
                                Number.isFinite(serverUpdatedAt) &&
                                localEditedAt > serverUpdatedAt;

                            if (
                                isPendingSync(localRec.synced) ||
                                localIsNewer
                            ) {
                                return {
                                    ...serverRec,
                                    ...localRec,
                                    synced: localRec.synced,
                                };
                            }

                            return {
                                ...serverRec,
                                id: (localRec as any).id,
                                draft_id:
                                    localRec.draft_id ??
                                    serverRec.draft_id,
                                synced: true,
                            };
                        }),
                    ];

                    await commitToStorage(merged);
                    setRetailerReceipts((prev) =>
                        areReceiptsEqual(prev, merged)
                            ? prev
                            : merged
                    );
                    setLastSyncedTime(
                        new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })
                    );
                }
            } catch (e) {
                warn('runRemoteInventorySynchronizer threw:', e);
            }
        },
        [token, getInventoryReadApi, commitToStorage]
    );

    /* ---------------------------------------------------------
     * Push (legacy pending records only)
     * ------------------------------------------------------- */
    const pushPending = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;
        if (pushGuardRef.current) return;

        pushGuardRef.current = true;
        setIsPushSyncing(true);

        let succeeded = 0;
        let failed = 0;

        try {
            const all = await readLocalRecords();
            const pending = all.filter((r) =>
                isPendingSync(r.synced)
            );

            if (pending.length === 0) return;

            let madeAChange = false;

            for (const record of pending) {
                if (!isOnlineRef.current) break;

                const draftId =
                    record.draft_id ||
                    buildDraftId(
                        currentUserId,
                        record.product || '',
                        null
                    );

                const isUpdate = isServerAssignedId(
                    record.remote_id
                );

                const details = {
                    bar_code: record.bar_code || '',
                    batch: record.batch || '',
                    bulk_buying_price: '',
                    unit_buying_price: String(
                        record.unit_buying_price || ''
                    ),
                    expiry_date: record.expiry_date || '',
                    manufacture_date:
                        record.manufacture_date || '',
                    product: record.product || '',
                    quantity_discount: '',
                    supplier_invoice: '',
                    received_from:
                        record.received_from || '',
                    unit_of_receipt: String(
                        record.unit_of_receipt || ''
                    ),
                    received_unit_quantity: Number(
                        record.received_unit_quantity || 0
                    ),
                    current_unit_quantity: Number(
                        record.current_unit_quantity || 0
                    ),
                    unit_selling_price: String(
                        record.unit_selling_price || ''
                    ),
                    unit_price_discount: String(
                        (record as any).unit_price_discount ??
                        '0.00'
                    ),
                    draft_id: draftId,
                };

                const body: any = {
                    action: isUpdate
                        ? 'UpdateRetailerReceipt'
                        : 'CreateRetailerReceipt',
                    user_id: currentUserId,
                    retailer_receipt_details: details,
                };

                if (isUpdate) {
                    body.retailer_receipt_id = String(
                        record.remote_id
                    );
                }

                let res: any = null;
                try {
                    res =
                        await getInventoryWriteApi.request(body);
                } catch (e: any) {
                    res = {
                        ok: false,
                        problem: 'exception',
                        data: {
                            message:
                                e?.message || 'Request threw',
                        },
                    };
                }

                const idx = all.findIndex(
                    (r) =>
                        (r as any).id === (record as any).id ||
                        (r as any).draft_id ===
                        (record as any).draft_id
                );

                if (res?.ok) {
                    succeeded++;
                    madeAChange = true;

                    const serverRecord =
                        res?.data?.retailer_receipt;

                    if (idx >= 0) {
                        all[idx] = {
                            ...all[idx],
                            synced: true,
                            sync_error: null,
                            remote_id: String(
                                serverRecord?.id ??
                                all[idx].remote_id
                            ),
                            draft_id: draftId,
                            cached_at:
                                new Date().toISOString(),
                        };
                    }
                } else {
                    failed++;
                    madeAChange = true;

                    if (idx >= 0) {
                        all[idx] = {
                            ...all[idx],
                            sync_error:
                                res?.data?.message ||
                                res?.problem ||
                                'Push failed',
                            draft_id: draftId,
                        };
                    }
                }
            }

            if (madeAChange) {
                await commitToStorage(all);
                const verify = await readLocalRecords();
                setRetailerReceipts((prev) =>
                    areReceiptsEqual(prev, verify)
                        ? prev
                        : verify
                );
            }

            if (succeeded > 0 && failed === 0) {
                notify(
                    'Sync Success',
                    `${succeeded} item${succeeded === 1 ? '' : 's'
                    } synced to server.`
                );
            } else if (succeeded > 0 && failed > 0) {
                notify(
                    'Sync Partial',
                    `${succeeded} succeeded · ${failed} failed.`
                );
            } else if (failed > 0) {
                notify(
                    'Sync Failed',
                    `${failed} item${failed === 1 ? '' : 's'
                    } could not be synced.`
                );
            }
        } catch (err: any) {
            warn('pushPending outer error:', err);
        } finally {
            pushGuardRef.current = false;
            setIsPushSyncing(false);
        }
    }, [
        token,
        getInventoryWriteApi,
        commitToStorage,
        readLocalRecords,
        currentUserId,
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
                return;
            }

            try {
                const url = `${WS_URL}?token=${encodeURIComponent(
                    currentToken
                )}`;
                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onopen = () => {
                    setIsLiveConnected(true);
                    reconnectAttemptRef.current = 0;
                    log('WebSocket — connected');
                };

                ws.onmessage = async (event) => {
                    try {
                        const parsed = JSON.parse(event.data);
                        const incoming =
                            extractInventoryFromFrame(parsed);

                        if (!incoming || incoming.length === 0) {
                            return;
                        }

                        const nowStr =
                            new Date().toISOString();
                        const currentMap = new Map<
                            string,
                            RetailerReceipt
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

                            if (existing) {
                                const localEditedAt = Date.parse(
                                    String(
                                        (existing as any).cached_at ??
                                        (existing as any).updated ??
                                        ''
                                    )
                                );
                                const incomingUpdatedAt = Date.parse(
                                    String(
                                        raw?.updated ??
                                        raw?.cached_at ??
                                        ''
                                    )
                                );
                                const localIsNewer =
                                    Number.isFinite(
                                        localEditedAt
                                    ) &&
                                    Number.isFinite(
                                        incomingUpdatedAt
                                    ) &&
                                    localEditedAt >
                                    incomingUpdatedAt;

                                if (
                                    isPendingSync(
                                        existing.synced
                                    ) ||
                                    localIsNewer
                                ) {
                                    return;
                                }
                            }

                            const normalized = normalizeItem(
                                raw,
                                nowStr
                            );
                            normalized.id = existing?.id;

                            currentMap.set(rid, {
                                ...normalized,
                                draft_id:
                                    existing?.draft_id ??
                                    normalized.draft_id,
                                synced: true,
                            });
                        });

                        const updated = Array.from(
                            currentMap.values()
                        );

                        await commitToStorage(updated);
                        setRetailerReceipts((prev) =>
                            areReceiptsEqual(prev, updated)
                                ? prev
                                : updated
                        );
                        setLastSyncedTime(
                            new Date().toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })
                        );
                    } catch (e) {
                        warn(
                            'WebSocket — message parse failed:',
                            e
                        );
                    }
                };

                ws.onclose = () => {
                    setIsLiveConnected(false);
                    wsRef.current = null;

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

                ws.onerror = (e) => {
                    warn('WebSocket — error', e);
                };
            } catch (err) {
                warn('WebSocket — establishment threw:', err);
            }
        },
        [commitToStorage]
    );

    /* ---------------------------------------------------------
     * Manual refresh — push + pull
     * ------------------------------------------------------- */
    const forceManualRefresh = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await refreshLocal();
            await pushPending();
            await runRemoteInventorySynchronizer();
        } catch (e) {
            warn('Manual refresh threw:', e);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        refreshLocal,
        runRemoteInventorySynchronizer,
        pushPending,
    ]);

    /* ---------------------------------------------------------
     * Stable refs for bootstrap
     * ------------------------------------------------------- */
    const actionsRef = useRef({
        hydrateFromLocalDB,
        runLocalMigration,
        runRemoteInventorySynchronizer,
        establishLiveWebSocketSync,
        pushPending,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            runLocalMigration,
            runRemoteInventorySynchronizer,
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

            await actionsRef.current.runLocalMigration();
            if (cancelled) return;

            if (token) {
                await actionsRef.current.pushPending();
                if (cancelled) return;

                await actionsRef.current.runRemoteInventorySynchronizer();
                if (cancelled) return;

                actionsRef.current.establishLiveWebSocketSync(
                    token
                );

                if (pollIntervalRef.current)
                    clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    actionsRef.current.pushPending();
                    actionsRef.current.runRemoteInventorySynchronizer();
                }, INVENTORY_POLL_INTERVAL_MS);
            }
        };

        init();

        return () => {
            cancelled = true;
            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);
            if (pollIntervalRef.current)
                clearInterval(pollIntervalRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
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
            reconnectAttemptRef.current = 0;
            (async () => {
                await actionsRef.current.pushPending();
                await actionsRef.current.runRemoteInventorySynchronizer();
                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
            })();
        } else {
            setIsLiveConnected(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Memoized value
     * ------------------------------------------------------- */
    const pendingCount = useMemo(
        () =>
            retailerReceipts.filter((r) =>
                isPendingSync(r.synced)
            ).length,
        [retailerReceipts]
    );

    const value = useMemo<InventorySyncContextType>(
        () => ({
            isSyncing: getInventoryReadApi.loading,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            isOnline,
            pendingCount,
            triggerManualFetch: runRemoteInventorySynchronizer,
            forceManualRefresh,
            pushPending,
            refreshLocal,
            applyServerReceipt,
            lastSyncedTime,
            retailerReceipts,
        }),
        [
            getInventoryReadApi.loading,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            isOnline,
            pendingCount,
            runRemoteInventorySynchronizer,
            forceManualRefresh,
            pushPending,
            refreshLocal,
            applyServerReceipt,
            lastSyncedTime,
            retailerReceipts,
        ]
    );

    return (
        <InventorySyncContext.Provider value={value}>
            {children}
        </InventorySyncContext.Provider>
    );
};

export const useInventorySync = () => {
    const context = useContext(InventorySyncContext);
    if (!context)
        throw new Error('useInventorySync missing Provider');
    return context;
};