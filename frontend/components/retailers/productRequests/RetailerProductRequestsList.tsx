// components/retailers/productRequests/RetailerProductRequestsList.tsx

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

export type {
    ProductRequest,
    ProductRequestSummary
} from '@/databases/types';

/* =========================================================
 * Constants
 * ======================================================= */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const STATUS_FILTERS = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PUBLISHED', label: 'Published' },
    { value: 'ACKNOWLEDGED', label: 'With offers' },
    { value: 'PARTIALLY_FULFILLED', label: 'Partial' },
    { value: 'FULFILLED', label: 'Fulfilled' },
    { value: 'CANCELLED', label: 'Cancelled' },
] as const;

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

    const {
        requests: items,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        lastSyncedTime,
        dataSource,
        pendingRequestCount,
        pendingOfferCount,
        reconnectLiveSync,
        createRequest,
        queueOfferAction,
        flushAll,
        submitDrafts,

    } = useRetailerProductRequestsSync();

    /* ---------------- UI state ---------------- */
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<
        string | null
    >(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [createOpen, setCreateOpen] = useState(false);
    const [reviewTarget, setReviewTarget] =
        useState<ProductRequest | null>(null);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        let base = items;

        if (statusFilter) {
            base = base.filter((r) => r.status === statusFilter);
        }

        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((r) => {
            if (r.request_number?.toLowerCase().includes(q))
                return true;

            const first = r.items_preview?.[0];

            const title = first?.product_title;
            if (title?.toLowerCase().includes(q))
                return true;

            // Wholesaler search: check both the objects and the
            // legacy parallel array.
            const wholesalers = first?.wholesalers ?? [];
            if (
                wholesalers.some((w) =>
                    w.title.toLowerCase().includes(q)
                )
            )
                return true;

            const legacyTitles =
                first?.wholesaler_titles ?? [];
            return legacyTitles.some((w) =>
                w.toLowerCase().includes(q)
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
        }) => {
            await createRequest({
                items: payload.items.map((i) => ({
                    product_id: i.product_id,
                    requested_quantity: i.requested_quantity,
                    urgency: i.urgency,
                    note: i.note,
                    target_wholesaler_ids:
                        i.target_wholesaler_ids ?? [],
                })),
                note: payload.note,
            });
            setCreateOpen(false);
        },
        [createRequest]
    );

    /* ---------------- openReview — carry full wholesaler objects
     * through to the modal ------------------------------------- */

    const openReview = useCallback(
        (summary: ProductRequestSummary) => {
            const preview = summary.items_preview ?? [];

            const id =
                summary.remote_id ??
                summary.draft_id ??
                '';

            const asRequest: ProductRequest = {
                id,
                request_number: summary.request_number,
                entity: summary.entity,
                entity_title: summary.entity_title,
                urgency: summary.urgency,
                urgency_display: summary.urgency_display,
                status: summary.status,
                status_display: summary.status_display,
                total_line_count: summary.total_line_count,
                fulfilled_line_count:
                    summary.fulfilled_line_count,
                pending_line_count: summary.pending_line_count,
                expires_at: summary.expires_at,
                created: summary.created,
                items: preview.map((p, i) => ({
                    id: `${id}-line-${i}`,
                    product_id: p.product_id,
                    product_title: p.product_title ?? '',
                    requested_quantity:
                        p.requested_quantity ?? 0,
                    confirmed_quantity:
                        p.confirmed_quantity ?? 0,
                    urgency_display:
                        p.urgency ?? summary.urgency_display,
                    status: p.status ?? 'PENDING',
                    offers: [],

                    // Full objects, preferred.
                    wholesalers: p.wholesalers ?? [],

                    // Legacy parallel arrays, still forwarded for
                    // older code paths that read them.
                    wholesaler_titles:
                        p.wholesaler_titles ?? [],
                    target_wholesaler_ids:
                        p.target_wholesaler_ids ?? [],
                })),
            } as unknown as ProductRequest;

            setReviewTarget(asRequest);
            onRequestPress?.(summary);
        },
        [onRequestPress]
    );

    const closeReview = useCallback(
        () => setReviewTarget(null),
        []
    );

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
        }) => {
            for (const c of payload.confirmations) {
                await queueOfferAction(
                    payload.request_id,
                    c.offer_id,
                    'confirm',
                    c.response_note
                );
            }
            for (const d of payload.declinations) {
                await queueOfferAction(
                    payload.request_id,
                    d.offer_id,
                    'decline',
                    d.reason
                );
            }
            await flushAll();
            setReviewTarget(null);
            return true;
        },
        [queueOfferAction, flushAll]
    );

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
        statusFilters: STATUS_FILTERS,
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
        pendingRequestCount,
        pendingOfferCount,
        items: paginated,
        emptyComponent,
        onOpenCreate: openCreate,
        onPressRequest: openReview,
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
                <RetailerProductRequestsWebView {...sharedProps} />
            ) : (
                <RetailerProductRequestsMobileView {...sharedProps} />
            )}

            <CreateRequestModal
                visible={createOpen}
                onClose={closeCreate}
                onSubmit={handleCreateSubmit}
            />

            <OfferReviewModal
                visible={!!reviewTarget}
                request={reviewTarget}
                onClose={closeReview}
                onConfirm={handleConfirmOffers}
                onPublishDraft={submitDrafts}   // ← must be here
                isLoading={false}
            />
        </>
    );
}

export { STATUS_FILTERS };

