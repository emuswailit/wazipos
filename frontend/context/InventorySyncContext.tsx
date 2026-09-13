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
    pendingCount: number;
    triggerManualFetch: () => Promise<void>;
    forceManualRefresh: () => Promise<void>;
    pushPending: () => Promise<void>;
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

const IMAGE_BASE_URL = 'https://api.wazipos.co.ke';

const WS_RECONNECT_DELAY_MS = 5 * 60 * 1000;
const INVENTORY_POLL_INTERVAL_MS = 5 * 60 * 1000;

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

/**
 * Normalizes the `synced` flag which may appear as:
 *   false (boolean), 'false' (string), 'FALSE' (string), 0
 */
const isPendingSync = (raw: any): boolean =>
    raw === false ||
    raw === 'false' ||
    raw === 'FALSE' ||
    raw === 0 ||
    raw === '0';

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

    return `${IMAGE_BASE_URL}/${cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
}

/* =========================================================
 * normalizeItem — wire receipt → RetailerReceipt
 *
 * RULE: the server's `id` (or `key`) goes into `remote_id`.
 * `id` is left undefined so Dexie assigns `++id`.
 * ======================================================= */

function normalizeItem(
    item: any,
    ts: string
): RetailerReceipt {
    const uPrice = String(
        firstDefined(item.unit_selling_price, item.price, '0.00')
    );

    const resolvedUrl = resolveImageUrl(item.images);

    const manufactureDate = item.manufacture_date ?? null;
    const expiryDate = item.expiry_date ?? null;
    const days = computeDaysToExpiry(expiryDate);

    const remoteId = String(
        firstDefined(item.id, item.key, '')
    );

    return {
        cached_at: String(firstDefined(item.cached_at, ts)),

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
            firstDefined(item.long_title, item.product_title, '')
        ),
        product_title: String(
            firstDefined(item.product_title, item.title, '')
        ),
        product: String(item.product ?? ''),
        entity: String(item.entity ?? ''),
        entity_title: String(item.entity_title ?? ''),
        draft_id: item.draft_id ?? null,
        preparation_title: String(item.preparation_title ?? ''),
        formulation_title: String(item.formulation_title ?? ''),
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
            firstDefined(item.final_unit_selling_price, uPrice)
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
        manufacturer_title: String(item.manufacturer_title ?? ''),

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
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pushGuardRef = useRef(false);

    const isOnlineRef = useRef(isOnline);
    useEffect(() => {
        isOnlineRef.current = isOnline;
        log('Network state changed — isOnline:', isOnline);
    }, [isOnline]);

    useEffect(() => {
        receiptsStateRef.current = retailerReceipts;
    }, [retailerReceipts]);

    /* ---------------------------------------------------------
     * Storage — writes to BOTH stores
     * ------------------------------------------------------- */
    const commitToStorage = useCallback(
        async (data: RetailerReceipt[]) => {
            log(`commitToStorage — ${data.length} rows`);

            const tasks: Promise<any>[] = [];

            tasks.push(
                AsyncStorage.setItem(
                    NATIVE_INVENTORY_KEY,
                    JSON.stringify(data)
                ).catch((err) =>
                    warn('AsyncStorage write failed:', err)
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
                            warn('Dexie write failed:', err);
                        }
                    })()
                );
            }

            await Promise.allSettled(tasks);
            log('commitToStorage done');
        },
        []
    );

    const readLocalRecords = useCallback(
        async (): Promise<RetailerReceipt[]> => {
            const [asyncData, dexieData] = await Promise.all([
                AsyncStorage.getItem(NATIVE_INVENTORY_KEY)
                    .then((raw) => (raw ? JSON.parse(raw) : []))
                    .catch(() => []),
                (async () => {
                    try {
                        if (dbInstance?.retailerReceipts) {
                            return await dbInstance.retailerReceipts.toArray();
                        }
                    } catch { }
                    return [];
                })(),
            ]);

            const chosen =
                asyncData.length >= dexieData.length
                    ? asyncData
                    : dexieData;

            log(
                `readLocalRecords — async: ${asyncData.length}, dexie: ${dexieData.length}, using: ${chosen.length}`
            );
            return chosen;
        },
        []
    );

    const hydrateFromLocalDB = useCallback(async () => {
        try {
            log('hydrateFromLocalDB — starting');
            const cached = await readLocalRecords();

            if (cached?.length > 0) {
                const refreshed = cached.map(
                    (r: RetailerReceipt) => {
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

                setRetailerReceipts((prev) =>
                    areReceiptsEqual(prev, refreshed)
                        ? prev
                        : refreshed
                );

                log(`hydrateFromLocalDB — loaded ${refreshed.length}`);
                return refreshed;
            }

            log('hydrateFromLocalDB — no cached rows');
            return cached;
        } catch (e) {
            warn('hydrateFromLocalDB threw:', e);
            return [];
        }
    }, [readLocalRecords]);

    /* ---------------------------------------------------------
     * Local migration
     * ------------------------------------------------------- */
    const runLocalMigration = useCallback(async () => {
        if (!currentUserId) {
            log('runLocalMigration — skipped (no userId)');
            return;
        }
        try {
            log('runLocalMigration — running');
            await backfillDraftIds(currentUserId);
            log('runLocalMigration — done');
        } catch (e) {
            warn('runLocalMigration threw:', e);
        }
    }, [currentUserId]);

    /* ---------------------------------------------------------
     * Pull — remote GET
     * ------------------------------------------------------- */
    const runRemoteInventorySynchronizer = useCallback(
        async () => {
            log('=== Pull starting ===');
            log('  token:', !!token);
            log('  isOnline:', isOnlineRef.current);

            if (!token) {
                warn('  pull skipped — no token');
                return;
            }
            if (!isOnlineRef.current) {
                warn('  pull skipped — offline');
                return;
            }

            try {
                const res = await getInventoryReadApi
                    .request({ action: 'GetRetailerReceipts' })
                    .catch((e) => {
                        warn('  request threw:', e);
                        return null;
                    });

                log('  response ok:', res?.ok);
                log('  response status:', res?.status);
                log('  response problem:', res?.problem);
                log(
                    '  response data type:',
                    Array.isArray(res?.data)
                        ? 'array'
                        : typeof res?.data
                );

                const raw = res?.data;
                const data = raw?.results || raw;
                log(
                    '  resolved item count:',
                    Array.isArray(data) ? data.length : 0
                );

                if (res?.ok && Array.isArray(data)) {
                    const nowStr = new Date().toISOString();

                    const normalized = data.map((item: any) =>
                        normalizeItem(item, nowStr)
                    );

                    log('  normalized count:', normalized.length);
                    log(
                        '  first normalized:',
                        normalized[0]
                            ? {
                                remote_id: normalized[0].remote_id,
                                title: normalized[0].title,
                                qty: normalized[0]
                                    .current_unit_quantity,
                            }
                            : null
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
                            return {
                                ...serverRec,
                                id: localRec?.id,
                                draft_id:
                                    localRec?.draft_id ??
                                    serverRec.draft_id,
                                synced: true,
                            };
                        }),
                    ];

                    log(`  merged count: ${merged.length}`);

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

                    log('Pull complete');
                } else {
                    warn(
                        '  pull aborted — response not ok or data not array'
                    );
                }
            } catch (e) {
                warn('runRemoteInventorySynchronizer threw:', e);
            }
        },
        [
            token,
            getInventoryReadApi,
            commitToStorage,
        ]
    );

    /* ---------------------------------------------------------
     * Push — local → remote
     * ------------------------------------------------------- */
    const pushPending = useCallback(async () => {
        log('=== Push starting ===');
        log('  token:', !!token);
        log('  isOnline:', isOnlineRef.current);
        log('  pushGuard:', pushGuardRef.current);

        if (!token) {
            warn('  push skipped — no token');
            return;
        }
        if (!isOnlineRef.current) {
            warn('  push skipped — offline');
            return;
        }
        if (pushGuardRef.current) {
            warn('  push skipped — already in flight');
            return;
        }

        pushGuardRef.current = true;
        setIsPushSyncing(true);

        let succeeded = 0;
        let failed = 0;
        let firstFailure: any = null;

        try {
            const all = await readLocalRecords();
            const pending = all.filter((r) =>
                isPendingSync(r.synced)
            );

            log(
                `  local rows: ${all.length}, pending: ${pending.length}`
            );

            if (pending.length > 0) {
                log(
                    '  pending synced values:',
                    pending.map((p) => ({
                        draft_id: p.draft_id,
                        synced: p.synced,
                        type: typeof p.synced,
                    }))
                );
            }

            if (pending.length === 0) {
                log('  nothing to push');
                return;
            }

            let madeAChange = false;

            for (const record of pending) {
                if (!isOnlineRef.current) {
                    warn('  went offline mid-loop — stopping');
                    break;
                }

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
                    expiry_date: record.expiry_date || '',
                    manufacture_date:
                        record.manufacture_date || '',
                    product: record.product || '',
                    quantity_discount: '',
                    supplier_invoice: '',
                    received_from: record.received_from || '',
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

                log(`  → pushing draft=${draftId}`);

                let res: any = null;
                try {
                    res = await getInventoryWriteApi.request(body);
                } catch (e: any) {
                    warn('  request threw:', e);
                    res = {
                        ok: false,
                        problem: 'exception',
                        data: {
                            message:
                                e?.message || 'Request threw',
                        },
                    };
                }

                log(
                    `  ← response ok=${res?.ok} status=${res?.status}`
                );

                const idx = all.findIndex(
                    (r) => r.remote_id === record.remote_id
                );

                if (res?.ok) {
                    succeeded++;
                    madeAChange = true;

                    const serverRecord =
                        res?.data?.retailer_receipt;

                    log(
                        `  ✓ ${draftId} → server id: ${serverRecord?.id}`
                    );

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

                    if (!firstFailure) {
                        firstFailure = {
                            id: record.remote_id,
                            response: res,
                        };
                    }

                    warn(
                        `  ✗ ${draftId} — ${res?.data?.message ||
                        res?.problem ||
                        'unknown'
                        }`
                    );

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
                log('  queue updated after push');
            }

            log(
                `Push complete — ${succeeded} ok, ${failed} failed`
            );

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
            warn('pushPending outer error:', err);
            notify(
                'Sync Error',
                err?.message || 'Unexpected error during sync.'
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
     * WebSocket
     * ------------------------------------------------------- */
    const establishLiveWebSocketSync = useCallback(
        (currentToken: string) => {
            log('WebSocket — establishing');

            if (reconnectTimeoutRef.current)
                clearTimeout(reconnectTimeoutRef.current);

            if (wsRef.current) {
                try {
                    wsRef.current.onclose = null;
                    wsRef.current.close();
                } catch { }
                wsRef.current = null;
            }

            if (!currentToken || !isOnlineRef.current) {
                warn('WebSocket — skipped (no token or offline)');
                setIsLiveConnected(false);
                return;
            }

            try {
                const url = `wss://api.wazipos.co.ke/ws/retailers/inventory/?token=${currentToken}`;
                log('WebSocket — connecting to', url.slice(0, 80) + '…');

                const ws = new WebSocket(url);
                wsRef.current = ws;

                ws.onopen = () => {
                    log('WebSocket — connected');
                    setIsLiveConnected(true);
                };

                ws.onmessage = async (event) => {
                    log('WebSocket — message received');
                    try {
                        const parsed = JSON.parse(event.data);
                        const incoming = parsed?.inventory;
                        log(
                            '  incoming inventory count:',
                            Array.isArray(incoming)
                                ? incoming.length
                                : 0
                        );

                        if (
                            !incoming ||
                            !Array.isArray(incoming)
                        )
                            return;

                        const nowStr = new Date().toISOString();
                        const currentMap = new Map<
                            string,
                            RetailerReceipt
                        >(
                            receiptsStateRef.current.map(
                                (item) => [item.remote_id, item]
                            )
                        );

                        incoming.forEach((raw: any) => {
                            const rid = String(
                                firstDefined(raw.id, raw.key, '')
                            );
                            if (!rid) return;

                            const existing = currentMap.get(rid);
                            if (
                                existing &&
                                isPendingSync(existing.synced)
                            ) {
                                return;
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

                        setRetailerReceipts((prev) =>
                            areReceiptsEqual(prev, updated)
                                ? prev
                                : updated
                        );

                        await commitToStorage(updated);
                        log(
                            `WebSocket — merged, total now ${updated.length}`
                        );
                    } catch (e) {
                        warn('WebSocket — message parse failed:', e);
                    }
                };

                ws.onclose = () => {
                    log('WebSocket — closed');
                    setIsLiveConnected(false);
                    wsRef.current = null;

                    if (
                        currentToken &&
                        isOnlineRef.current
                    ) {
                        log(
                            `WebSocket — reconnecting in ${WS_RECONNECT_DELAY_MS}ms`
                        );
                        reconnectTimeoutRef.current = setTimeout(
                            () =>
                                establishLiveWebSocketSync(
                                    currentToken
                                ),
                            WS_RECONNECT_DELAY_MS
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
     * Manual refresh
     * ------------------------------------------------------- */
    const forceManualRefresh = useCallback(async () => {
        log('=== Manual refresh ===');
        setIsManualRefreshing(true);
        try {
            await pushPending();
            await runRemoteInventorySynchronizer();
        } catch (e) {
            warn('Manual refresh threw:', e);
        } finally {
            setIsManualRefreshing(false);
            log('Manual refresh done');
        }
    }, [runRemoteInventorySynchronizer, pushPending]);

    /* ---------------------------------------------------------
     * Stable refs
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
            log('=== Bootstrap ===');
            log('  token present:', !!token);
            log('  token length:', token ? String(token).length : 0);
            log('  platform:', Platform.OS);
            log('  userId:', currentUserId || '(empty)');

            await actionsRef.current.hydrateFromLocalDB();
            if (cancelled) return;

            await actionsRef.current.runLocalMigration();
            if (cancelled) return;

            if (token) {
                log('Bootstrap — pushing pending');
                await actionsRef.current.pushPending();
                if (cancelled) return;

                log('Bootstrap — pulling remote');
                await actionsRef.current.runRemoteInventorySynchronizer();
                if (cancelled) return;

                log('Bootstrap — opening WebSocket');
                actionsRef.current.establishLiveWebSocketSync(token);

                log(
                    `Bootstrap — arming poll every ${INVENTORY_POLL_INTERVAL_MS}ms`
                );
                if (pollIntervalRef.current)
                    clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(() => {
                    log('Poll tick');
                    actionsRef.current.pushPending();
                    actionsRef.current.runRemoteInventorySynchronizer();
                }, INVENTORY_POLL_INTERVAL_MS);

                log('Bootstrap complete');
            } else {
                warn(
                    'Bootstrap — no token yet, waiting for auth to hydrate'
                );
            }
        };

        init();

        return () => {
            cancelled = true;
            log('Bootstrap cleanup — closing ws + poll');
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
     * Online/offline transition
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!token) return;

        if (isOnline) {
            log('Back online — running full sync');
            (async () => {
                await actionsRef.current.pushPending();
                await actionsRef.current.runRemoteInventorySynchronizer();
                actionsRef.current.establishLiveWebSocketSync(token);
            })();
        } else {
            log('Went offline — pausing');
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
            pendingCount,
            triggerManualFetch: runRemoteInventorySynchronizer,
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