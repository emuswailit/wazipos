// components/retailers/requestDrafts/RetailerRequestDraftsList.tsx
//
// Retailer-side request draft composer — shell.
//
// Reads drafts from ForecastContext, adapts the product catalogue
// and wholesaler list, renders Mobile or Web view, and mounts the
// shared RequestDraftsFormModal.
//
// "Continue" submits the draft to the server via
// retailersApi.createProductRequestAction. The local draft is
// cleared only after the server confirms; on failure the drafts
// stay put so the user can retry.
//
// Error handling: DRF validation errors arrive as
// `{ errors: ["Please log in"] }` — extractError() knows about that
// shape. Auth failures get a distinct alert that tells the user to
// log in again rather than retrying blindly.

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

import retailersApi, {
    type CreateProductRequestPayload,
} from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useForecast } from '@/context/ForecastContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import type {
    EntityItem,
    ProductImage,
    ProductItem,
    RequestDraftItem,
} from '@/databases/types';

import RequestDraftsFormModal, {
    type PickableProduct,
    type PickableWholesaler,
} from './RequestDraftsFormModal';
import { RetailerRequestDraftsMobileView } from './RetailerRequestDraftsMobileView';
import { RetailerRequestDraftsWebView } from './RetailerRequestDraftsWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;

/* =========================================================
 * Logging
 * ======================================================= */

const LOG_TAG = '[RetailerRequestDrafts]';

const log = (...args: any[]) => {
    if (__DEV__) console.log(LOG_TAG, ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn(LOG_TAG, ...args);
};
const errorLog = (...args: any[]) => {
    if (__DEV__) console.error(LOG_TAG, ...args);
};

/* =========================================================
 * Id helpers
 * ======================================================= */

function isUsableId(id: unknown): boolean {
    if (id === undefined || id === null) return false;
    const s = String(id).trim().toLowerCase();
    return s !== '' && s !== 'undefined' && s !== 'null';
}

function entityId(e: EntityItem): string {
    if (isUsableId(e.remote_id)) return String(e.remote_id);
    if (isUsableId(e.id)) return String(e.id);
    return '';
}

function productId(p: ProductItem): string {
    if (isUsableId(p.remote_id)) return String(p.remote_id);
    if (isUsableId(p.id)) return String(p.id);
    return '';
}

/* =========================================================
 * Draft id
 *
 * Offline-first idempotency key. Same format the out-of-stock
 * queue uses: `<user_id>:<uuid>:<ms_timestamp>`.
 * ======================================================= */

function makeDraftId(userId: string): string {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        }
    );
    return `${userId || 'anon'}:${uuid}:${Date.now()}`;
}

/* =========================================================
 * Image resolution
 * ======================================================= */

function pickProductImage(p: ProductItem): string | undefined {
    const first: ProductImage | undefined = p.images?.[0];
    if (!first) return undefined;

    const thumb = (first.thumbnail || '').trim();
    if (thumb) return thumb;

    const full = (first.image || '').trim();
    if (full) return full;

    return undefined;
}

/* =========================================================
 * Response helpers
 *
 * The API client may or may not unwrap `response.data` depending
 * on how `api/client.ts` is configured. Accept both shapes so the
 * success/failure check is stable regardless.
 * ======================================================= */

function isResponseOk(res: any): boolean {
    if (!res) return false;
    if (res.ok === true) return true;
    if (res.data?.response_code === 0) return true;
    if (res.response_code === 0) return true;
    return false;
}

function responseMessage(res: any): string {
    return (
        res?.data?.message ??
        res?.data?.response_message ??
        res?.message ??
        res?.response_message ??
        'The server rejected the request.'
    );
}

function responseRequest(res: any): any {
    return res?.data?.request ?? res?.request ?? null;
}

/**
 * Pull a human-readable error string out of whatever shape the
 * failure took — Axios error, timeout, abort, plain Error, or an
 * arbitrary thrown object.
 *
 * Handles DRF validation envelopes:
 *   { errors: ["Please log in"] }
 *   { errors: { field: ["msg"] } }
 *   { detail: "…" }
 *   { message: "…" }
 */
function extractError(err: any): string {
    if (!err) return 'Unknown error.';

    // Axios timeout
    if (err.code === 'ECONNABORTED') {
        return 'Request timed out. Check your connection and try again.';
    }

    // Abort
    if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return 'Request was cancelled.';
    }

    // Server response body — DRF validation shapes first.
    const body = err?.response?.data;

    if (body) {
        // { errors: ["Please log in"] }
        if (Array.isArray(body.errors) && body.errors.length > 0) {
            const first = body.errors[0];
            return typeof first === 'string'
                ? first
                : JSON.stringify(first);
        }

        // { errors: { field: ["msg"] } }
        if (body.errors && typeof body.errors === 'object') {
            const firstKey = Object.keys(body.errors)[0];
            if (firstKey) {
                const firstVal = body.errors[firstKey];
                const firstMsg = Array.isArray(firstVal)
                    ? firstVal[0]
                    : firstVal;
                if (typeof firstMsg === 'string') return firstMsg;
            }
        }

        // Fallback flat shapes.
        const flat =
            body.message ??
            body.response_message ??
            body.detail;
        if (typeof flat === 'string') return flat;
    }

    // Axios network failure (no response)
    if (
        err?.message === 'Network Error' ||
        err?.code === 'ERR_NETWORK'
    ) {
        return 'Could not reach the server. Check your connection.';
    }

    // Plain Error / thrown string
    if (typeof err === 'string') return err;
    if (err?.message) return String(err.message);

    return 'Unexpected error. Please try again.';
}

/**
 * Auth failures get a distinct alert: the fix is "log in again,"
 * not "retry the same request."
 */
function isAuthError(err: any): boolean {
    if (!err) return false;

    const status = err?.response?.status;
    if (status === 401 || status === 403) return true;

    const raw = JSON.stringify(err?.response?.data ?? '');
    const lower = raw.toLowerCase();
    return (
        lower.includes('please log in') ||
        lower.includes('not authenticated') ||
        lower.includes('authentication credentials') ||
        lower.includes('invalid token') ||
        lower.includes('token is invalid') ||
        lower.includes('token expired')
    );
}

/* =========================================================
 * Cross-platform alert helper
 * ======================================================= */

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(message);
        }
    } else {
        Alert.alert(title, message);
    }
}

/* =========================================================
 * Component
 * ======================================================= */

const RetailerRequestDraftsList: React.FC = () => {
    const { user } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* -------- Drafts source of truth -------- */
    const {
        drafts: rawDrafts,
        addDraftItem,
        updateDraftItem,
        removeDraftItem,
        clearDraft,
    } = useForecast();

    /* -------- Products -------- */
    const { productsList, isProductsSyncing } = useProductsSync();

    /* -------- Entities (wholesalers) -------- */
    const { allWholesalers } = useEntitiesSync();

    /* ---------------------------------------------------------
     * Mount guard — prevents setState after unmount while a
     * submission is in flight.
     * ------------------------------------------------------- */
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    /* ---------------------------------------------------------
     * Debug — fires once per distinct product list length.
     * ------------------------------------------------------- */
    const lastLoggedRef = useRef<number>(-1);
    React.useEffect(() => {
        if (!__DEV__) return;
        if (!productsList || productsList.length === 0) return;
        if (lastLoggedRef.current === productsList.length) return;
        lastLoggedRef.current = productsList.length;

        const sample = productsList[0];
        log('products context — summary:', {
            total: productsList.length,
            sampleId: sample?.remote_id,
            sampleTitle: sample?.title,
            sampleImageCount: sample?.images?.length ?? 0,
            resolvedImage: pickProductImage(sample) ?? '(none)',
        });
    }, [productsList]);

    /* ---------------------------------------------------------
     * Drafts sanitizer
     * ------------------------------------------------------- */
    const drafts: RequestDraftItem[] = useMemo(() => {
        let cleaned = 0;

        const next = (rawDrafts ?? []).map((d) => {
            const ids = d.target_wholesaler_ids ?? [];
            const good = ids.filter(isUsableId);
            if (good.length !== ids.length)
                cleaned += ids.length - good.length;

            const survivors = new Set(good);
            const wholesalers = (d.wholesalers ?? []).filter((w) =>
                survivors.has(w.id)
            );
            const titles = good
                .map((id) => d.wholesalers?.find((w) => w.id === id)?.title)
                .filter((t): t is string => !!t);

            return {
                ...d,
                target_wholesaler_ids: good,
                target_wholesaler_titles: titles,
                wholesalers,
            };
        });

        if (__DEV__ && cleaned > 0) {
            warn(
                `stripped ${cleaned} invalid wholesaler id(s) ` +
                `across ${next.length} draft(s)`
            );
        }

        return next;
    }, [rawDrafts]);

    const draftCount = drafts.length;
    const draftTotalQuantity = useMemo(
        () =>
            drafts.reduce(
                (s, d) => s + (Number(d.quantity) || 0),
                0
            ),
        [drafts]
    );

    /* ---------------------------------------------------------
     * Products adapter
     * ------------------------------------------------------- */
    const products: PickableProduct[] = useMemo(() => {
        const seen = new Set<string>();

        return (productsList ?? [])
            .filter((p: ProductItem) => p.active !== false)
            .map((p: ProductItem) => ({
                id: productId(p),
                title: String(p.title || p.product_name || '—'),
                bar_code: p.bar_code || undefined,
                units_per_pack: Number(p.units_per_pack) || 1,
                thumbnail_url: pickProductImage(p),
            }))
            .filter((p) => {
                if (!isUsableId(p.id) || !p.title) return false;
                if (seen.has(p.id)) return false;
                seen.add(p.id);
                return true;
            });
    }, [productsList]);

    /* ---------------------------------------------------------
     * Wholesalers adapter
     * ------------------------------------------------------- */
    const wholesalers: PickableWholesaler[] = useMemo(() => {
        const seen = new Set<string>();

        const mapped = (allWholesalers ?? [])
            .filter((e: EntityItem) => {
                const t = String(e.entity_type ?? '').toLowerCase();
                return (
                    t.includes('wholesal') ||
                    t.includes('distributor') ||
                    t.includes('manufactur')
                );
            })
            .map((e: EntityItem) => ({
                id: entityId(e),
                title: String(e.title || '—'),
            }))
            .filter((w) => {
                if (!isUsableId(w.id) || !w.title) return false;
                if (seen.has(w.id)) return false;
                seen.add(w.id);
                return true;
            });

        if (__DEV__) {
            const rawCount = (allWholesalers ?? []).length;
            const blankCount = (allWholesalers ?? []).filter(
                (e: EntityItem) => !entityId(e)
            ).length;

            if (blankCount > 0) {
                warn(
                    `${blankCount}/${rawCount} entities have no usable id ` +
                    `— dropped from the picker.`
                );
            }
        }

        return mapped;
    }, [allWholesalers]);

    /* -------- Modal state -------- */
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<RequestDraftItem | null>(null);

    /* -------- Submission state -------- */
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

    const onAddNew = useCallback(() => {
        setEditing(null);
        setModalOpen(true);
    }, []);

    const onEditItem = useCallback((item: RequestDraftItem) => {
        setEditing(item);
        setModalOpen(true);
    }, []);

    const onCloseModal = useCallback(() => {
        setModalOpen(false);
        setEditing(null);
    }, []);

    const onModalSubmit = useCallback(
        (draft: Omit<RequestDraftItem, 'added_at'>) => {
            const cleanIds = (draft.target_wholesaler_ids ?? []).filter(
                isUsableId
            );
            const survivors = new Set(cleanIds);
            const cleanWholesalers = (draft.wholesalers ?? []).filter((w) =>
                survivors.has(w.id)
            );

            const sanitized: Omit<RequestDraftItem, 'added_at'> = {
                ...draft,
                target_wholesaler_ids: cleanIds,
                target_wholesaler_titles: cleanIds
                    .map(
                        (id) =>
                            cleanWholesalers.find((w) => w.id === id)?.title
                    )
                    .filter((t): t is string => !!t),
                wholesalers: cleanWholesalers,
            };

            if (editing) {
                if (editing.product_id !== sanitized.product_id) {
                    log('product swapped on edit', {
                        from: editing.product_id,
                        to: sanitized.product_id,
                    });
                    removeDraftItem(editing.product_id);
                    addDraftItem(sanitized);
                } else {
                    updateDraftItem(editing.product_id, sanitized);
                }
            } else {
                addDraftItem(sanitized);
            }
        },
        [editing, addDraftItem, updateDraftItem, removeDraftItem]
    );

    const onRemoveItem = useCallback(
        (item: RequestDraftItem) => {
            log('remove item', item.product_id);
            removeDraftItem(item.product_id);
        },
        [removeDraftItem]
    );

    const onClearAll = useCallback(() => {
        log('clear all', { count: draftCount });
        clearDraft();
    }, [clearDraft, draftCount]);

    /* ---------------------------------------------------------
     * Continue — submit the draft to the server.
     * ------------------------------------------------------- */
    const onContinue = useCallback(async () => {
        if (draftCount === 0) return;
        if (isSubmittingRequest) return;

        setIsSubmittingRequest(true);

        const startedAt = Date.now();
        const draftId = makeDraftId(user?.id ?? '');

        try {
            const requestUrgency: 'low' | 'medium' | 'high' =
                drafts.some((d) => d.urgency === 'high')
                    ? 'high'
                    : drafts.some((d) => d.urgency === 'medium')
                        ? 'medium'
                        : 'low';

            const payload: CreateProductRequestPayload = {
                draft_id: draftId,
                urgency: requestUrgency,
                items: drafts.map((d) => ({
                    product_id: d.product_id,
                    requested_quantity: Number(d.quantity) || 1,
                    urgency: d.urgency,
                    note: d.note?.trim() ?? '',
                    target_wholesaler_ids: d.target_wholesaler_ids ?? [],
                })),
            };

            // Build the exact wire body — same spread the API
            // helper does internally — so the log matches what
            // hits the network.
            const wireBody = {
                action: 'CreateRequest' as const,
                ...payload,
            };

            log('========== CREATE REQUEST — WIRE BODY ==========');
            console.log(JSON.stringify(wireBody, null, 2));

            const res = await retailersApi.createProductRequestAction(
                payload
            );

            const elapsedMs = Date.now() - startedAt;

            log('========== CREATE REQUEST — RESPONSE ==========');
            log('elapsed ms:', elapsedMs);
            log('raw response:', res);
            log('isResponseOk:', isResponseOk(res));
            log('message:', responseMessage(res));
            log('request:', responseRequest(res));

            if (!isResponseOk(res)) {
                throw new Error(responseMessage(res));
            }

            const request = responseRequest(res);
            const requestNumber =
                request?.request_number ?? request?.request_id;

            log(
                '========== CREATE REQUEST — SUCCESS ==========',
                { requestNumber, elapsedMs }
            );

            if (!isMountedRef.current) return;

            clearDraft();

            notify(
                'Request submitted',
                requestNumber
                    ? `Request ${requestNumber} sent to the selected wholesalers.`
                    : 'Your request was sent to the selected wholesalers.'
            );
        } catch (e: any) {
            const elapsedMs = Date.now() - startedAt;
            const msg = extractError(e);
            const authFailure = isAuthError(e);

            errorLog(
                '========== CREATE REQUEST — ERROR =========='
            );
            errorLog('elapsed ms:', elapsedMs);
            errorLog('isAuthFailure:', authFailure);
            errorLog('error:', e);
            errorLog('extracted message:', msg);
            if (e?.response) {
                errorLog('e.response.status:', e.response.status);
                errorLog('e.response.data:', e.response.data);
            }

            if (!isMountedRef.current) return;

            if (authFailure) {
                notify(
                    'Session expired',
                    'Your session has expired. Please log in again ' +
                    'to submit this request.\n\n' +
                    'Your draft has been saved and will be here when ' +
                    'you return.'
                );
            } else {
                notify('Could not submit request', msg);
            }
        } finally {
            if (isMountedRef.current) {
                setIsSubmittingRequest(false);
            }
        }
    }, [
        drafts,
        draftCount,
        draftTotalQuantity,
        isSubmittingRequest,
        user,
        clearDraft,
    ]);

    /* -------- Shared props -------- */
    const common = {
        drafts,
        draftCount,
        draftTotalQuantity,
        isSubmittingRequest,
        onAddNew,
        onEditItem,
        onRemoveItem,
        onClearAll,
        onContinue,
    } as const;

    return (
        <>
            {isLarge ? (
                <RetailerRequestDraftsWebView {...common} />
            ) : (
                <RetailerRequestDraftsMobileView {...common} />
            )}

            <RequestDraftsFormModal
                visible={modalOpen}
                onClose={onCloseModal}
                onSubmit={onModalSubmit}
                initialItem={editing}
                products={products}
                wholesalers={wholesalers}
                loadingProducts={isProductsSyncing}
            />

            {/* Full-screen blocking overlay during submission. */}
            <Modal
                visible={isSubmittingRequest}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    // Intentionally not dismissable — submission is
                    // in flight. Swallow the Android back press.
                }}
            >
                <View className="flex-1 bg-black/55 items-center justify-center p-6">
                    <View
                        className="rounded-2xl px-6 py-5 items-center"
                        style={{
                            backgroundColor: '#ffffff',
                            minWidth: 220,
                        }}
                    >
                        <ActivityIndicator size="large" color="#0056b3" />
                        <Text
                            className="mt-3 text-[13px]"
                            style={{
                                fontFamily: 'Inter-Medium',
                                color: '#334155',
                                textAlign: 'center',
                            }}
                        >
                            Submitting request…
                        </Text>
                        <Text
                            className="mt-1 text-[11px]"
                            style={{
                                fontFamily: 'Inter-Regular',
                                color: '#64748b',
                                textAlign: 'center',
                            }}
                        >
                            {draftCount} item
                            {draftCount === 1 ? '' : 's'} ·{' '}
                            {draftTotalQuantity} unit
                            {draftTotalQuantity === 1 ? '' : 's'}
                        </Text>
                    </View>
                </View>
            </Modal>
        </>
    );
};

export default RetailerRequestDraftsList;