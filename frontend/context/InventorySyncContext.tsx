// context/InventorySyncContext.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { dbInstance } from '@/databases/db';
import { CachedReceipt } from '@/databases/types';
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
    pendingCount: number;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    pushPending: () => Promise<void>;
    lastSyncedTime: string;
    retailerReceipts: CachedReceipt[];
}

const InventorySyncContext = createContext<
    InventorySyncContextType | undefined
>(undefined);

/* =========================================================
 * Constants
 * ======================================================= */

const NATIVE_INVENTORY_KEY =
    'wazipos_async_inventory_registry';

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

const WS_RECONNECT_DELAY_MS = 5 * 60 * 1000;
const INVENTORY_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DRAFT_RECONCILE_COOLDOWN_MS = 5 * 60 * 1000;

/* =========================================================
 * Alert helper
 * ======================================================= */

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            /* eslint-disable-next-line no-alert */
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
 * normalizeItem
 *
 * Handles every shape the server has returned:
 *
 *   API       → absolute URLs  (https://api.wazipos.co.ke/media/...)
 *   WebSocket → relative paths (/media/...)
 *
 * Both are converted into a single absolute URL stored on
 * `thumbnail_url` / `image_url` so CardView and TableView
 * can render identically regardless of transport.
 * ======================================================= */

function normalizeItem(
    item: any,
    ts: string
): CachedReceipt {
    const uPrice = String(
        item.unit_selling_price || item.price || '0.00'
    );

    /* ---------------------------------------------------------
     * Resolve image URL
     * ------------------------------------------------------- */
    let rawPath: string | null = null;

    if (
        Array.isArray(item.images) &&
        item.images.length > 0
    ) {
        const first = item.images[0];

        if (typeof first === 'string') {
            rawPath = first;
        } else if (first && typeof first === 'object') {
            rawPath =
                first.thumbnail ||
                first.image ||
                first.url ||
                null;
        }
    } else if (
        item.images &&
        typeof item.images === 'object'
    ) {
        rawPath =
            item.images.thumbnail ||
            item.images.image ||
            item.images.url ||
            null;
    } else if (typeof item.image === 'string') {
        rawPath = item.image;
    } else if (typeof item.thumbnail === 'string') {
        rawPath = item.thumbnail;
    }

    let resolvedUrl: string | null = null;

    if (rawPath && typeof rawPath === 'string') {
        const trimmed = rawPath.trim();

        if (trimmed) {
            if (
                trimmed.startsWith('http://') ||
                trimmed.startsWith('https://')
            ) {
                /* Already absolute */
                resolvedUrl = trimmed;
            } else {
                /* Relative — prefix with API base */
                const cleanPath = trimmed.startsWith('/')
                    ? trimmed.substring(1)
                    : trimmed;

                resolvedUrl = `${IMAGE_BASE_URL}/${cleanPath
                    .split('/')
                    .map((seg) =>
                        encodeURIComponent(seg)
                    )
                    .join('/')}`;
            }
        }
    }

    const manufactureDate =
        item.manufacture_date || '';
    const expiryDate = item.expiry_date || '';
    const days = computeDaysToExpiry(expiryDate);

    return {
        id: String(item.id || item.key || ''),
        key: String(item.key || item.id || ''),

        title: item.title || item.product_title || '',
        long_title:
            item.long_title || item.product_title || '',
        product_name:
            item.product_name || item.title || '',

        unit_buying_price: String(
            item.unit_buying_price || '0.00'
        ),
        unit_selling_price: uPrice,
        final_unit_selling_price: String(
            item.final_unit_selling_price || uPrice
        ),
        unit_price_discount: String(
            item.unit_price_discount || '0.00'
        ),

        current_unit_quantity: Number(
            item.current_unit_quantity ||
            item.available ||
            0
        ),
        received_unit_quantity: Number(
            item.received_unit_quantity ||
            item.unit_quantity ||
            0
        ),

        bar_code: item.bar_code || item.barcode || '',

        manufacture_date: manufactureDate,
        expiry_date: expiryDate,
        days_to_expiry: days ?? 0,
        expiry_status: computeExpiryStatus(days),

        manufacturer_title:
            item.manufacturer_title || '',
        origin_country_title:
            item.origin_country_title || '',

        images: Array.isArray(item.images)
            ? item.images
            : [],
        thumbnail_url: resolvedUrl,
        image_url: resolvedUrl,
        cached_at: item.cached_at || ts,

        synced: true,
        server_id: String(item.id || item.key || ''),
        draft_id: item.draft_id ?? null,
        created: item.created,
        updated: item.updated,
        batch: item.batch || '',
        product: item.product || '',
        unit_of_receipt: item.unit_of_receipt || '',
    } as CachedReceipt;
}

/* =========================================================
 * Array equality
 * ======================================================= */

function areReceiptsEqual(
    a: CachedReceipt[],
    b: CachedReceipt[]
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];

        if (
            x.id !== y.id ||
            x.current_unit_quantity !==
            y.current_unit_quantity ||
            x.received_unit_quantity !==
            y.received_unit_quantity ||
            x.unit_selling_price !==
            y.unit_selling_price ||
            x.final_unit_selling_price !==
            y.final_unit_selling_price ||
            x.days_to_expiry !== y.days_to_expiry ||
            x.expiry_status !== y.expiry_status ||
            x.title !== y.title ||
            x.bar_code !== y.bar_code ||
            x.synced !== y.synced ||
            x.server_id !== y.server_id ||
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

    const [retailerReceipts, setRetailerReceipts] =
        useState<CachedReceipt[]>([]);
    const [lastSyncedTime, setLastSyncedTime] =
        useState('');
    const [isManualRefreshing, setIsManualRefreshing] =
        useState(false);
    const [isLiveConnected, setIsLiveConnected] =
        useState(false);
    const [isPushSyncing, setIsPushSyncing] =
        useState(false);

    /* -------- Two API hooks -------- */
    const getInventoryReadApi = useApi(
        retailersApi.retailerReceiptsAction
    );
    const getInventoryWriteApi = useApi(
        retailersApi.retailerReceiptsAdminAction
    );

    const wsRef = useRef<WebSocket | null>(null);
    const receiptsStateRef = useRef<CachedReceipt[]>([]);
    const reconnectTimeoutRef =
        useRef<NodeJS.Timeout | null>(null);
    const pollIntervalRef =
        useRef<NodeJS.Timeout | null>(null);
    const pushGuardRef = useRef(false);
    const draftReconcileGuardRef = useRef(false);
    const lastReconcileAtRef = useRef(0);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    useEffect(() => {
        receiptsStateRef.current = retailerReceipts;
    }, [retailerReceipts]);

    /* ---------------------------------------------------------
     * Storage — writes to BOTH stores
     * ------------------------------------------------------- */

    const commitToStorage = useCallback(
        async (data: CachedReceipt[]) => {
            const tasks: Promise<any>[] = [];

            tasks.push(
                AsyncStorage.setItem(
                    NATIVE_INVENTORY_KEY,
                    JSON.stringify(data)
                ).catch((err) =>
                    console.warn(
                        '[InventorySync] AsyncStorage write failed:',
                        err
                    )
                )
            );

            if (dbInstance?.retailerReceipts) {
                tasks.push(
                    (async () => {
                        try {
                            await dbInstance.transaction(
                                'rw',
                                dbInstance.retailerReceipts,
                                async () => {
                                    await dbInstance.retailerReceipts.clear();
                                    await dbInstance.retailerReceipts.bulkPut(
                                        data
                                    );
                                }
                            );
                        } catch (err) {
                            console.warn(
                                '[InventorySync] Dexie write failed:',
                                err
                            );
                        }
                    })()
                );
            }

            await Promise.allSettled(tasks);
        },
        []
    );

    const readLocalRecords = useCallback(
        async (): Promise<CachedReceipt[]> => {
            const [asyncData, dexieData] =
                await Promise.all([
                    AsyncStorage.getItem(
                        NATIVE_INVENTORY_KEY
                    )
                        .then((raw) =>
                            raw ? JSON.parse(raw) : []
                        )
                        .catch(() => []),
                    (async () => {
                        try {
                            if (
                                dbInstance?.retailerReceipts
                            ) {
                                return await dbInstance.retailerReceipts.toArray();
                            }
                        } catch { }
                        return [];
                    })(),
                ]);

            return asyncData.length >= dexieData.length
                ? asyncData
                : dexieData;
        },
        []
    );

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            const cached = await readLocalRecords();

            if (cached?.length > 0) {
                const refreshed = cached.map(
                    (r: CachedReceipt) => {
                        const days = computeDaysToExpiry(
                            r.expiry_date
                        );
                        return {
                            ...r,
                            days_to_expiry: days ?? 0,
                            expiry_status:
                                computeExpiryStatus(days),
                        };
                    }
                );

                setRetailerReceipts((prev) =>
                    areReceiptsEqual(prev, refreshed)
                        ? prev
                        : refreshed
                );

                if (cached?.cached_at) {
                    setLastSyncedTime(
                        new Date(
                            cached.cached_at
                        ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })
                    );
                }

                return refreshed;
            }

            return cached;
        } catch (e) {
            return [];
        }
    }, [readLocalRecords]);

    /* ---------------------------------------------------------
     * Local migration — backfill draft_ids
     * ------------------------------------------------------- */

    const runLocalMigration = useCallback(async () => {
        if (!currentUserId) return;
        try {
            await backfillDraftIds(currentUserId);
        } catch (e) {
            console.warn(
                '[InventorySync] Local migration failed:',
                e
            );
        }
    }, [currentUserId]);

    /* ---------------------------------------------------------
     * Remote GET — uses READ hook
     * ------------------------------------------------------- */

    const runRemoteInventorySynchronizer =
        useCallback(async () => {
            if (!token) return;
            if (!isOnlineRef.current) return;

            try {
                const res = await getInventoryReadApi
                    .request({
                        action: 'GetRetailerReceipts',
                    })
                    .catch(() => null);

                const raw = res?.data;
                const data = raw?.results || raw;

                console.log(
                    '[InventorySync] API raw shape:',
                    {
                        isArray: Array.isArray(raw),
                        hasResults: Array.isArray(
                            raw?.results
                        ),
                        count: raw?.count,
                    }
                );

                if (res?.ok && Array.isArray(data)) {
                    const nowStr =
                        new Date().toISOString();

                    const normalized = data.map(
                        (item: any) =>
                            normalizeItem(item, nowStr)
                    );

                    const existing =
                        receiptsStateRef.current;
                    const pendingLocal =
                        existing.filter(
                            (r) => r.synced === false
                        );

                    const serverIds = new Set(
                        normalized.map((r) => r.id)
                    );

                    const localById = new Map(
                        existing.map((r) => [r.id, r])
                    );

                    const merged = [
                        ...pendingLocal.filter(
                            (r) => !serverIds.has(r.id)
                        ),
                        ...normalized.map((serverRec) => {
                            const localRec =
                                localById.get(
                                    serverRec.id
                                );
                            return {
                                ...serverRec,
                                draft_id:
                                    localRec?.draft_id ??
                                    serverRec.draft_id,
                                synced: true,
                                server_id:
                                    localRec?.server_id ??
                                    serverRec.server_id ??
                                    serverRec.id,
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
                // silent
            }
        }, [
            token,
            getInventoryReadApi,
            commitToStorage,
        ]);

    /* ---------------------------------------------------------
     * Push pending — uses WRITE (admin) hook
     * ------------------------------------------------------- */

    const pushPending = useCallback(async () => {
        if (!token) return;
        if (!isOnlineRef.current) return;
        if (pushGuardRef.current) return;

        pushGuardRef.current = true;
        setIsPushSyncing(true);

        let succeeded = 0;
        let failed = 0;
        let firstFailure: any = null;

        try {
            const all = await readLocalRecords();

            const pending = all.filter(
                (r) => r.synced === false
            );

            console.log(
                '[pushPending] state:',
                JSON.stringify(
                    {
                        totalRecords: all.length,
                        pendingCount: pending.length,
                        pendingIds: pending.map(
                            (r) => r.id
                        ),
                    },
                    null,
                    2
                )
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

                const details = {
                    bar_code: record.bar_code || '',
                    batch: record.batch || '',
                    bulk_buying_price: '',
                    unit_buying_price: String(
                        record.unit_buying_price || ''
                    ),
                    expiry_date:
                        record.expiry_date || '',
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
                    draft_id: draftId,
                };

                const body = {
                    action: 'CreateRetailerReceipt',
                    user_id: currentUserId,
                    retailer_receipt_details: details,
                };

                console.log(
                    '\n[pushPending] REQUEST body (raw JSON):\n' +
                    JSON.stringify(body, null, 2)
                );

                let res: any = null;
                try {
                    res = await getInventoryWriteApi.request(
                        body
                    );
                } catch (e: any) {
                    console.warn(
                        '[pushPending] request threw:',
                        e
                    );
                    res = {
                        ok: false,
                        problem: 'exception',
                        data: {
                            message:
                                e?.message ||
                                'Request threw',
                        },
                    };
                }

                console.log(
                    '\n[pushPending] RESPONSE (raw JSON):\n' +
                    JSON.stringify(res, null, 2)
                );

                const idx = all.findIndex(
                    (r) => r.id === record.id
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
                            server_id:
                                serverRecord?.id ??
                                all[idx].server_id ??
                                null,
                            draft_id: draftId,
                            ...(serverRecord
                                ? {
                                    current_unit_quantity:
                                        Number(
                                            serverRecord.current_unit_quantity ??
                                            all[
                                                idx
                                            ]
                                                .current_unit_quantity ??
                                            0
                                        ),
                                    received_unit_quantity:
                                        Number(
                                            serverRecord.received_unit_quantity ??
                                            all[
                                                idx
                                            ]
                                                .received_unit_quantity ??
                                            0
                                        ),
                                    unit_selling_price:
                                        String(
                                            serverRecord.unit_selling_price ??
                                            all[
                                                idx
                                            ]
                                                .unit_selling_price ??
                                            ''
                                        ),
                                    final_unit_selling_price:
                                        String(
                                            serverRecord.final_unit_selling_price ??
                                            all[
                                                idx
                                            ]
                                                .final_unit_selling_price ??
                                            ''
                                        ),
                                    days_to_expiry:
                                        Number(
                                            serverRecord.days_to_expiry ??
                                            all[
                                                idx
                                            ]
                                                .days_to_expiry ??
                                            0
                                        ),
                                    expiry_status:
                                        String(
                                            serverRecord.expiry_status ??
                                            all[
                                                idx
                                            ]
                                                .expiry_status ??
                                            'UNKNOWN'
                                        ),
                                    updated:
                                        serverRecord.updated ??
                                        all[idx].updated,
                                    cached_at:
                                        new Date().toISOString(),
                                }
                                : {}),
                        };
                    }
                    console.log(
                        '[pushPending] push OK:',
                        record.id
                    );
                } else {
                    failed++;
                    madeAChange = true;

                    if (!firstFailure) {
                        firstFailure = {
                            id: record.id,
                            response: res,
                        };
                    }

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

            /* ---------- Alerts ---------- */

            if (succeeded > 0 && failed === 0) {
                notify(
                    'Sync Success',
                    `${succeeded} item${succeeded === 1 ? '' : 's'
                    } synced to server.`
                );
            } else if (succeeded > 0 && failed > 0) {
                notify(
                    'Sync Partial',
                    `${succeeded} succeeded · ${failed} failed.\n\nLast error:\n${JSON.stringify(
                        firstFailure?.response?.data ??
                        firstFailure?.response,
                        null,
                        2
                    ).slice(0, 800)}`
                );
            } else if (failed > 0) {
                notify(
                    'Sync Failed',
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
            console.warn(
                '[pushPending] outer error:',
                err
            );
            notify(
                'Sync Error',
                err?.message ||
                'Unexpected error during sync.'
            );
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
     * Draft ID reconciliation
     * ------------------------------------------------------- */

    const reconcileServerDraftIds = useCallback(async () => {
        const now = Date.now();

        if (
            now - lastReconcileAtRef.current <
            DRAFT_RECONCILE_COOLDOWN_MS
        ) {
            return;
        }
        if (!token) return;
        if (!isOnlineRef.current) return;
        if (draftReconcileGuardRef.current) return;

        draftReconcileGuardRef.current = true;
        lastReconcileAtRef.current = now;

        try {
            const res = await getInventoryReadApi
                .request({
                    action:
                        'GetRetailerReceiptsMissingDraftId',
                })
                .catch(() => null);

            const missing: any[] = Array.isArray(
                res?.data?.results
            )
                ? res.data.results
                : [];

            if (missing.length === 0) {
                console.log(
                    '[draftReconcile] nothing to do'
                );
                return;
            }

            console.log(
                `[draftReconcile] reconciling ${missing.length} record(s)`
            );

            for (const serverRec of missing) {
                if (!isOnlineRef.current) break;

                const productId = String(
                    serverRec.product ||
                    serverRec.id ||
                    ''
                );

                const createdMs = (() => {
                    const c = serverRec.created;
                    if (!c) return Date.now();
                    const n = Date.parse(String(c));
                    return isNaN(n) ? Date.now() : n;
                })();

                const draftId = buildDraftId(
                    currentUserId,
                    productId,
                    createdMs
                );

                const body = {
                    action: 'UpdateRetailerReceipt',
                    retailer_receipt: serverRec.id,
                    retailer_receipt_details: {
                        batch: serverRec.batch || '',
                        id: Number(serverRec.id) || 0,
                        current_unit_quantity: Number(
                            serverRec.current_unit_quantity
                        ) || 0,
                        draft_id: draftId,
                    },
                };

                console.log(
                    '[draftReconcile] PATCH draft_id:',
                    serverRec.id,
                    '→',
                    draftId
                );

                const updateRes =
                    await getInventoryWriteApi
                        .request(body)
                        .catch(() => null);

                if (!updateRes?.ok) {
                    console.warn(
                        '[draftReconcile] update failed:',
                        serverRec.id,
                        updateRes?.data
                    );
                }
            }
        } catch (e) {
            console.warn(
                '[draftReconcile] threw:',
                e
            );
        } finally {
            draftReconcileGuardRef.current = false;
        }
    }, [
        token,
        currentUserId,
        getInventoryReadApi,
        getInventoryWriteApi,
    ]);

    /* ---------------------------------------------------------
     * WebSocket — with image URL resolution
     * ------------------------------------------------------- */

    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);

            if (wsRef.current) wsRef.current.close();

            if (!currentToken || !isOnlineRef.current) {
                setIsLiveConnected(false);
                return;
            }

            try {
                const ws = new WebSocket(
                    `wss://api.wazipos.co.ke/ws/retailers/inventory/?token=${currentToken}`
                );

                wsRef.current = ws;

                ws.onopen = () =>
                    setIsLiveConnected(true);

                ws.onmessage = async (event) => {
                    try {
                        const incoming =
                            JSON.parse(event.data)
                                ?.inventory;

                        if (
                            !incoming ||
                            !Array.isArray(incoming)
                        ) {
                            return;
                        }

                        const nowStr =
                            new Date().toISOString();

                        /* Diagnostic — sample the raw thumbnail path */
                        console.log(
                            '[InventorySync] WS incoming sample:',
                            {
                                id: incoming[0]?.id,
                                rawThumb:
                                    incoming[0]?.images?.[0]
                                        ?.thumbnail,
                            }
                        );

                        const currentMap = new Map(
                            receiptsStateRef.current.map(
                                (item) => [item.id, item]
                            )
                        );

                        incoming.forEach((raw: any) => {
                            const id = String(
                                raw.id || raw.key || ''
                            );
                            if (!id) return;

                            const existing =
                                currentMap.get(id);

                            /* Never overwrite a pending
                             * local record */
                            if (
                                existing &&
                                existing.synced === false
                            ) {
                                return;
                            }

                            /* Normalize — this resolves
                             * relative paths into absolute
                             * URLs. */
                            const normalized =
                                normalizeItem(
                                    raw,
                                    nowStr
                                );

                            /* Diagnostic — confirm the
                             * resolved URL */
                            console.log(
                                '[InventorySync] WS image resolved:',
                                normalized.id,
                                '→',
                                normalized.thumbnail_url
                            );

                            currentMap.set(id, {
                                ...normalized,
                                draft_id:
                                    existing?.draft_id ??
                                    normalized.draft_id,
                                server_id:
                                    existing?.server_id ??
                                    normalized.server_id ??
                                    normalized.id,
                                synced: true,
                            });
                        });

                        const updated = Array.from(
                            currentMap.values()
                        );

                        setRetailerReceipts((prev) =>
                            areReceiptsEqual(prev, updated)
                                ? prev
                                : updated
                        );

                        await commitToStorage(updated);
                    } catch (e) {
                        console.warn(
                            '[InventorySync] WS merge failed:',
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
                        reconnectTimeoutRef.current =
                            setTimeout(
                                () =>
                                    establishLiveWebSocketSync(
                                        currentToken
                                    ),
                                WS_RECONNECT_DELAY_MS
                            );
                    }
                };

                ws.onerror = () => { };
            } catch (err) { }
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
            await runRemoteInventorySynchronizer();
            await reconcileServerDraftIds();
        } catch (e) {
            // silent
        } finally {
            setIsManualRefreshing(false);
        }
    }, [
        runRemoteInventorySynchronizer,
        pushPending,
        reconcileServerDraftIds,
    ]);

    /* ---------------------------------------------------------
     * Stable refs
     * ------------------------------------------------------- */

    const actionsRef = useRef({
        hydrateFromLocalDB,
        runLocalMigration,
        runRemoteInventorySynchronizer,
        establishLiveWebSocketSync,
        pushPending,
        reconcileServerDraftIds,
    });

    useEffect(() => {
        actionsRef.current = {
            hydrateFromLocalDB,
            runLocalMigration,
            runRemoteInventorySynchronizer,
            establishLiveWebSocketSync,
            pushPending,
            reconcileServerDraftIds,
        };
    });

    /* ---------------------------------------------------------
     * Bootstrap — one run per token
     * ------------------------------------------------------- */

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await actionsRef.current.hydrateFromLocalDB();

            await actionsRef.current.runLocalMigration();

            if (cancelled) return;

            if (token) {
                /* 1. Flush pending */
                await actionsRef.current.pushPending();
                if (cancelled) return;

                /* 2. Pull server changes */
                await actionsRef.current.runRemoteInventorySynchronizer();
                if (cancelled) return;

                /* 3. Attach WebSocket */
                actionsRef.current.establishLiveWebSocketSync(
                    token
                );

                /* 4. Draft-ID reconciliation */
                await actionsRef.current.reconcileServerDraftIds();

                if (cancelled) return;

                /* 5. Poll every 5 min */
                if (pollIntervalRef.current)
                    clearInterval(pollIntervalRef.current);

                pollIntervalRef.current = setInterval(
                    async () => {
                        await actionsRef.current.pushPending();
                        await actionsRef.current.runRemoteInventorySynchronizer();
                    },
                    INVENTORY_POLL_INTERVAL_MS
                );
            } else {
                setRetailerReceipts([]);
                if (wsRef.current) wsRef.current.close();
                if (pollIntervalRef.current)
                    clearInterval(pollIntervalRef.current);
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
     * Online / offline transition
     * ------------------------------------------------------- */

    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            console.log(
                '[InventorySync] Back online — running full sync'
            );

            (async () => {
                await actionsRef.current.pushPending();
                await actionsRef.current.runRemoteInventorySynchronizer();
                actionsRef.current.establishLiveWebSocketSync(
                    token
                );
                await actionsRef.current.reconcileServerDraftIds();
            })();
        } else {
            console.log(
                '[InventorySync] Went offline — pausing sync'
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, token]);

    /* ---------------------------------------------------------
     * Memoized value
     * ------------------------------------------------------- */

    const pendingCount = useMemo(
        () =>
            retailerReceipts.filter(
                (r) => r.synced === false
            ).length,
        [retailerReceipts]
    );

    const value = useMemo<InventorySyncContextType>(
        () => ({
            isSyncing: getInventoryReadApi.loading,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            pendingCount,
            triggerManualFetch:
                runRemoteInventorySynchronizer,
            forceManualRefresh,
            pushPending,
            lastSyncedTime,
            retailerReceipts,
        }),
        [
            getInventoryReadApi.loading,
            isManualRefreshing,
            isLiveConnected,
            isPushSyncing,
            pendingCount,
            runRemoteInventorySynchronizer,
            forceManualRefresh,
            pushPending,
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
        throw new Error(
            'useInventorySync missing Provider'
        );
    return context;
};