// components/retailers/productRequests/RetailerProductRequestsList.tsx
//
// Retailer-side product requests list — shell.
//
// Owns the request list state, filter/pagination UI, and routes
// row presses to one of two modals based on the request's status:
//
//   DRAFT               → OfferReviewModal (publish view)
//   ACKNOWLEDGED        → OfferReviewModal (accept / decline offers)
//   PARTIALLY_FULFILLED → OfferReviewModal (still has decisions to make)
//   PUBLISHED           → ViewRequestDetailsModal (nothing to act on)
//   FULFILLED / CANCELLED / EXPIRED → ViewRequestDetailsModal
//
// Both modals derive their input from the live `requestsById` map
// so a WS update while a modal is open re-renders with fresh data.
//
// Create-request submissions carry a `draft_id` idempotency key
// in the form `<user_id>:<entity_id>:<ms_timestamp>`.

import { useAuth } from '@/context/AuthContext';
import { useRetailerProductRequestsSync } from '@/context/RetailerProductRequestsSyncContext';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import type {
    ProductRequest,
    ProductRequestSummary,
} from '@/databases/types';
import { CreateRequestModal } from './CreateRequestModal';
import { OfferReviewModal } from './OfferReviewModal';
import { RetailerProductRequestsMobileView } from './RetailerProductRequestsMobileView';
import { RetailerProductRequestsWebView } from './RetailerProductRequestsWebView';
import {
    STATUS_OPTIONS,
    computeStatusCounts
} from './statusPrimitives';
import { ViewRequestDetailsModal } from './ViewRequestDetailsModal';

/* =========================================================
 * Re-exports
 *
 * STATUS_FILTERS and STATUS_OPTIONS live in statusPrimitives
 * and are re-exported here so existing importers of this shell
 * keep working. No further export of these symbols should appear
 * anywhere else in this file — a second export throws at module
 * evaluation ("can't redefine non-configurable property").
 * ======================================================= */

export type {
    ProductRequest,
    ProductRequestSummary
} from '@/databases/types';

export {
    STATUS_FILTERS,
    STATUS_OPTIONS
} from './statusPrimitives';

/* =========================================================
 * Constants
 * ======================================================= */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/* =========================================================
 * Status routing
 * ======================================================= */

const ACTION_STATUSES = new Set<string>([
    'DRAFT',
    'ACKNOWLEDGED',
    'PARTIALLY_FULFILLED',
]);

function isActionStatus(status: string | undefined | null): boolean {
    return ACTION_STATUSES.has(
        String(status ?? '').trim().toUpperCase()
    );
}

/* =========================================================
 * Draft id
 *
 * Offline-first idempotency key. Format:
 *
 *   <user_id>:<entity_id>:<ms_timestamp>
 *
 * The backend enforces uniqueness on this. A retry that carries
 * the same draft_id is treated as a replay of the same logical
 * submission, not as a new request.
 * ======================================================= */

function makeDraftId(
    userId: string,
    entityId: string
): string {
    return `${userId || 'anon'}:${entityId || 'noentity'
        }:${Date.now()}`;
}

/* =========================================================
 * Summary → ProductRequest reshape
 * ======================================================= */

function summaryToProductRequest(
    summary: ProductRequestSummary
): ProductRequest {
    const preview = summary.items ?? [];
    const id = summary.remote_id ?? summary.draft_id ?? '';

    return {
        id,
        request_number: summary.request_number,
        entity: summary.entity,
        entity_title: summary.entity_title,
        urgency: summary.urgency,
        urgency_display: summary.urgency_display,
        note: summary.note,
        status: summary.status,
        status_display: summary.status_display,
        total_line_count: summary.total_line_count,
        fulfilled_line_count: summary.fulfilled_line_count,
        pending_line_count: summary.pending_line_count,
        expires_at: summary.expires_at,
        fulfilled_at: summary.fulfilled_at,
        cancelled_at: summary.cancelled_at,
        created: summary.created,
        updated: summary.updated ?? '',
        responses: [],

        items: preview.map((p, i) => ({
            id: p.id ?? `${id}-line-${i}`,
            request: p.request ?? id,
            product: p.product_id,
            product_title: p.product_title ?? '',
            product_bar_code: '',
            requested_quantity: p.requested_quantity ?? 0,
            urgency: p.urgency ?? 'medium',
            urgency_display: p.urgency_display ?? '',
            note: p.note ?? '',
            status: p.status ?? 'PENDING',
            status_display: p.status_display ?? '',
            offer_count: p.offer_count ?? 0,
            total_offered_quantity:
                p.total_offered_quantity ?? 0,
            confirmed_quantity: p.confirmed_quantity ?? 0,
            offers: p.offers ?? [],
            target_wholesalers:
                p.target_wholesalers ?? [],
            target_wholesaler_ids:
                p.target_wholesaler_ids ?? [],
            created: p.created ?? '',
            updated: p.updated ?? '',
        })),
    } as unknown as ProductRequest;
}

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    onCreatePress?: () => void;
    onRequestPress?: (req: ProductRequestSummary) => void;
    emptyComponent?: React.ReactNode;
}

/* =========================================================
 * Component
 * ======================================================= */

export default function RetailerProductRequestsList({
    onCreatePress,
    onRequestPress,
    emptyComponent,
}: Props) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const { user } = useAuth();

    const {
        requests: items,
        requestsById,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        lastSyncedTime,
        dataSource,
        pendingOfferCount,
        reconnectLiveSync,
        flushAll,
    } = useRetailerProductRequestsSync();

    /* ---------------- Dev diagnostic ---------------- */
    useEffect(() => {
        if (!__DEV__) return;
        console.log(
            '[RetailerProductRequestsList] items:',
            items.length,
            'source:',
            dataSource,
            'live:',
            isLiveConnected
        );
    }, [items.length, dataSource, isLiveConnected]);

    /* ---------------- UI state ---------------- */
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<
        string | null
    >(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [createOpen, setCreateOpen] = useState(false);
    const [reviewTargetId, setReviewTargetId] = useState<
        string | null
    >(null);
    const [detailsTargetId, setDetailsTargetId] = useState<
        string | null
    >(null);

    /* ---------------- Status counts ---------------- */
    const statusCounts = useMemo(
        () => computeStatusCounts(items),
        [items]
    );

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        let base = items;

        if (statusFilter) {
            base = base.filter(
                (r) => r.status === statusFilter
            );
        }

        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((r) => {
            if (
                r.request_number
                    ?.toLowerCase()
                    .includes(q)
            )
                return true;

            const first = r.items?.[0];
            if (!first) return false;

            const title = first.product_title;
            if (title?.toLowerCase().includes(q))
                return true;

            const targets =
                first.target_wholesalers ?? [];
            if (
                targets.some((w) =>
                    w.title.toLowerCase().includes(q)
                )
            )
                return true;

            const ids =
                first.target_wholesaler_ids ?? [];
            return ids.some((id) =>
                id.toLowerCase().includes(q)
            );
        });
    }, [items, query, statusFilter]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [query, statusFilter, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(
        pageStart + pageSize,
        totalItems
    );

    const paginated = useMemo(
        () => filtered.slice(pageStart, pageEnd),
        [filtered, pageStart, pageEnd]
    );

    /* ---------------- Derived modal inputs ---------------- */
    const reviewTarget = useMemo<ProductRequest | null>(() => {
        if (!reviewTargetId) return null;
        const summary = requestsById[reviewTargetId];
        if (!summary) return null;
        return summaryToProductRequest(summary);
    }, [reviewTargetId, requestsById]);

    const detailsTarget = useMemo<ProductRequest | null>(() => {
        if (!detailsTargetId) return null;
        const summary = requestsById[detailsTargetId];
        if (!summary) return null;
        return summaryToProductRequest(summary);
    }, [detailsTargetId, requestsById]);

    /* ---------------- Handlers ---------------- */
    const handleRefresh = useCallback(() => {
        void reconnectLiveSync();
    }, [reconnectLiveSync]);

    const openCreate = useCallback(() => {
        setCreateOpen(true);
        onCreatePress?.();
    }, [onCreatePress]);

    const closeCreate = useCallback(
        () => setCreateOpen(false),
        []
    );

    const openRequest = useCallback(
        (summary: ProductRequestSummary) => {
            const id =
                summary.remote_id ?? summary.draft_id ?? '';
            if (!id) return;

            if (isActionStatus(summary.status)) {
                setReviewTargetId(id);
            } else {
                setDetailsTargetId(id);
            }

            onRequestPress?.(summary);
        },
        [onRequestPress]
    );

    const closeReview = useCallback(
        () => setReviewTargetId(null),
        []
    );

    const closeDetails = useCallback(
        () => setDetailsTargetId(null),
        []
    );

    /* ---------------------------------------------------------
     * Confirm offers — dispatched from OfferReviewModal
     * ------------------------------------------------------- */
    const handleConfirmOffers = useCallback(
        async (payload: {
            request_id: string;
            confirmations: Array<{
                offer_id: string;
                response_note?: string;
            }>;
            declinations: Array<{
                offer_id: string;
                reason?: string;
            }>;
            note?: string;
        }): Promise<boolean> => {
            const retailersApi = (
                await import('@/api/retailersApi')
            ).default;

            const res =
                await retailersApi.confirmProductRequestOffersAction(
                    {
                        request_id: payload.request_id,
                        confirmations: payload.confirmations,
                        declinations: payload.declinations,
                        note: payload.note,
                    }
                );

            if (__DEV__) {
                console.log(
                    '[RetailerProductRequestsList] confirm offers — raw:',
                    res
                );
                console.log(
                    '[RetailerProductRequestsList] confirm offers — data:',
                    (res as any)?.data
                );
                console.log(
                    '[RetailerProductRequestsList] confirm offers — json:'
                );
                console.log(
                    JSON.stringify(
                        {
                            ok: (res as any)?.ok,
                            status: (res as any)?.status,
                            data: (res as any)?.data,
                        },
                        null,
                        2
                    )
                );
            }



            const ok =
                res?.ok === true ||
                String(
                    (res as any)?.data?.response_code ?? ''
                ) === '0';

            if (!ok) {
                const msg =
                    (res as any)?.data?.response_message ??
                    (res as any)?.data?.message ??
                    'Server rejected the response.';
                throw new Error(msg);
            }

            await flushAll();

            setReviewTargetId(null);
            return true;
        },
        [flushAll]
    );

    /* ---------------------------------------------------------
     * Create request
     *
     * Generates a fresh draft_id per submission. Returns a
     * structured result so the modal can alert the server's
     * response_message.
     * ------------------------------------------------------- */
    const handleCreateSubmit = useCallback(
        async (payload: {
            items: Array<{
                product_id: string;
                requested_quantity: number;
                urgency?: 'low' | 'medium' | 'high';
                note?: string;
                target_wholesaler_ids?: string[];
            }>;
            urgency?: 'low' | 'medium' | 'high';
            note?: string;
        }): Promise<{ ok: boolean; message?: string }> => {
            try {
                const retailersApi = (
                    await import('@/api/retailersApi')
                ).default;

                const draftId = makeDraftId(
                    String(user?.id ?? ''),
                    String(
                        user?.entity_id ?? user?.entity ?? ''
                    )
                );

                const wireBody = {
                    draft_id: draftId,
                    items: payload.items.map((i) => ({
                        product_id: i.product_id,
                        requested_quantity: i.requested_quantity,
                        urgency: i.urgency,
                        note: i.note,
                        target_wholesaler_ids:
                            i.target_wholesaler_ids ?? [],
                    })),
                    urgency: payload.urgency,
                    note: payload.note,
                };

                if (__DEV__) {
                    console.log(
                        '[RetailerProductRequestsList] create request — wire body:'
                    );
                    console.log(
                        JSON.stringify(wireBody, null, 2)
                    );
                }

                const res =
                    await retailersApi.createProductRequestAction(
                        wireBody
                    );

                const body = (res as any)?.data;
                const ok =
                    res?.ok === true ||
                    String(body?.response_code ?? '') === '0';

                if (__DEV__) {
                    console.log(
                        '[RetailerProductRequestsList] create response — raw:',
                        res
                    );
                    console.log(
                        '[RetailerProductRequestsList] create response — data:',
                        body
                    );
                    console.log(
                        '[RetailerProductRequestsList] create response — json:'
                    );
                    console.log(
                        JSON.stringify(
                            {
                                ok: (res as any)?.ok,
                                status: (res as any)?.status,
                                data: body,
                            },
                            null,
                            2
                        )
                    );
                }

                const message: string | undefined =
                    (typeof body?.response_message === 'string' &&
                        body.response_message.trim()) ||
                    (typeof body?.message === 'string' &&
                        body.message.trim()) ||
                    (Array.isArray(body?.errors) &&
                        typeof body.errors[0] === 'string' &&
                        body.errors[0].trim()) ||
                    undefined;

                if (!ok) {
                    return {
                        ok: false,
                        message:
                            message ??
                            'The server rejected the request.',
                    };
                }

                return {
                    ok: true,
                    message:
                        message ??
                        `${payload.items.length} line${payload.items.length === 1 ? '' : 's'
                        } sent to wholesalers.`,
                };
            } catch (e: any) {
                return {
                    ok: false,
                    message:
                        e?.response?.data?.response_message ??
                        e?.response?.data?.message ??
                        e?.message ??
                        'Could not reach the server. Check your connection.',
                };
            }
        },
        [user?.id, user?.entity_id, user?.entity]
    );

    /* ---------------------------------------------------------
     * Publish draft
     * ------------------------------------------------------- */
    const handlePublishDraft = useCallback(async () => {
        if (!reviewTargetId) return;
        const summary = requestsById[reviewTargetId];
        if (!summary) return;

        const retailersApi = (
            await import('@/api/retailersApi')
        ).default;

        const res =
            await retailersApi.productRequestsAction?.({
                action: 'PublishRequest',
                request_id:
                    summary.remote_id ?? summary.draft_id,
            });

        const ok =
            res?.ok === true ||
            String(
                (res as any)?.data?.response_code ?? ''
            ) === '0';

        if (!ok) {
            const msg =
                (res as any)?.data?.response_message ??
                (res as any)?.data?.message ??
                'Server rejected the publish.';
            throw new Error(msg);
        }

        setReviewTargetId(null);
    }, [reviewTargetId, requestsById]);

    /* ---------------- Pagination handlers ---------------- */
    const goPrev = useCallback(
        () => setPage((p) => Math.max(1, p - 1)),
        []
    );
    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages]
    );
    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
        setPage(1);
    }, []);

    /* ---------------- Shared props ---------------- */
    const refreshing = isSyncing || isManualRefreshing;
    const sourceTone: 'server' | 'cache' | 'none' = dataSource;

    const sharedProps = {
        query,
        setQuery,
        statusFilter,
        setStatusFilter,
        statusOptions: STATUS_OPTIONS,
        statusCounts,
        onRefresh: handleRefresh,
        refreshing,
        isLiveConnected,
        sourceLabel:
            sourceTone === 'server'
                ? 'Server · live'
                : sourceTone === 'cache'
                    ? 'Local cache'
                    : 'No data',
        sourceTone,
        lastSyncedTime,
        pendingRequestCount: 0,
        pendingOfferCount,
        items: paginated,
        emptyComponent,
        onOpenCreate: openCreate,
        onPressRequest: openRequest,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: goPrev,
        onNext: goNext,
        onPageSizeChange: changePageSize,
    };

    /* ---------------- Render ---------------- */
    return (
        <>
            {isLarge ? (
                <RetailerProductRequestsWebView
                    {...sharedProps}
                />
            ) : (
                <RetailerProductRequestsMobileView
                    {...sharedProps}
                />
            )}

            <CreateRequestModal
                visible={createOpen}
                onClose={closeCreate}
                onSubmit={handleCreateSubmit}
            />

            {reviewTarget ? (
                <OfferReviewModal
                    visible
                    request={reviewTarget}
                    onClose={closeReview}
                    onConfirm={handleConfirmOffers}
                    onPublishDraft={handlePublishDraft}
                    isLoading={false}
                />
            ) : null}

            {detailsTarget ? (
                <ViewRequestDetailsModal
                    visible
                    request={detailsTarget}
                    onClose={closeDetails}
                />
            ) : null}
        </>
    );
}