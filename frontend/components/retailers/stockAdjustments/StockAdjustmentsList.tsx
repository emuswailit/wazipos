// components/retailers/stockAdjustments/StockAdjustmentsList.tsx
//
// Shell for the stock-adjustments screen — full CRUD.
//
// On every successful write (create / update / delete):
//   1. Re-fetch GetStockAdjustments immediately.
//   2. Ask useInventorySync to re-pull, so the receipt quantity
//      change the backend applied is reflected in pickers and
//      inventory views.

import { useAlert } from '@/components/common/AlertProvider';
import ApiResponseModal, {
    extractEnvelope,
    routeEnvelope,
    type ApiResponseEnvelope,
    type ResponseKind,
} from '@/components/common/ApiResponseModal';
import {
    PAGE_SIZE_OPTIONS,
    type PageSize,
} from '@/components/common/PaginationBar';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';
import { useInventorySync } from '@/context/InventorySyncContext';

import { StockAdjustmentDetailsSheet } from './StockAdjustmentDetailsSheet';
import { StockAdjustmentFormModal } from './StockAdjustmentFormModal';
import { StockAdjustmentsMobileView } from './StockAdjustmentsMobileView';
import { StockAdjustmentsWebView } from './StockAdjustmentsWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const FETCH_PAGE_SIZE = 500;

/* =========================================================
 * Types
 * ======================================================= */

export type StockAdjustmentDirection = 'INCREMENT' | 'DECREMENT';

export type StockAdjustmentReturnIntent =
    | 'NONE'
    | 'WHOLESALER_RETURN'
    | 'CUSTOMER_RETURN'
    | 'EXPIRY_WRITE_OFF'
    | 'DAMAGE_WRITE_OFF'
    | 'INTERNAL_CORRECTION';

export interface StockAdjustment {
    id: string;
    retailer_receipt: string | null;
    retailer_receipt_title: string | null;
    quantity: number | string;
    direction: StockAdjustmentDirection;
    direction_display?: string;
    justification: string;
    return_intent: StockAdjustmentReturnIntent;
    return_intent_display?: string;
    linked_return: string | null;
    linked_return_id?: string | null;
    linked_return_status?: string | null;
    owner: string | null;
    created: string;
    updated: string;
}

/* =========================================================
 * Local helpers
 * ======================================================= */

function matchesQuery(a: StockAdjustment, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
        String(a.id).toLowerCase().includes(needle) ||
        String(a.retailer_receipt_title || '')
            .toLowerCase()
            .includes(needle) ||
        String(a.justification || '').toLowerCase().includes(needle) ||
        String(a.direction || '').toLowerCase().includes(needle) ||
        String(a.return_intent || '').toLowerCase().includes(needle)
    );
}

/* =========================================================
 * Component
 * ======================================================= */

const StockAdjustmentsList: React.FC = () => {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Inventory sync (for post-write refresh) -------- */
    const { triggerManualFetch: refreshInventory } = useInventorySync();

    /* ---------------- Server data ---------------- */
    const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetchAdjustments = useCallback(async () => {
        try {
            const res = await retailersApi.getStockAdjustmentsAction({
                page: 1,
                page_size: FETCH_PAGE_SIZE,
            });
            const body = res.data as any;
            setAdjustments(body?.results ?? []);
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load stock adjustments');
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            await refetchAdjustments();
            if (!cancelled) setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [refetchAdjustments]);

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [directionFilter, setDirectionFilter] = useState<
        StockAdjustmentDirection | null
    >(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    /* ---------------- Form modal ---------------- */
    const [formOpen, setFormOpen] = useState(false);
    const [editingAdjustment, setEditingAdjustment] =
        useState<StockAdjustment | null>(null);
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [detailsTarget, setDetailsTarget] = useState<StockAdjustment | null>(null);

    /* ---------------- Response modal ---------------- */
    const [responseOpen, setResponseOpen] = useState(false);
    const [responseKind, setResponseKind] = useState<ResponseKind>('error');
    const [responseTitle, setResponseTitle] = useState<string | undefined>();
    const [responseEnvelope, setResponseEnvelope] =
        useState<ApiResponseEnvelope | null>(null);
    const [responseFallback, setResponseFallback] = useState<string | null>(
        null,
    );

    const closeResponse = useCallback(() => {
        setResponseOpen(false);
        setResponseEnvelope(null);
        setResponseFallback(null);
        setResponseTitle(undefined);
    }, []);

    /* ---------------- Pagination ---------------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    /* ---------------- Filtering ---------------- */
    const visible = useMemo(() => {
        let base = adjustments;

        if (directionFilter) {
            base = base.filter((a) => a.direction === directionFilter);
        }
        if (dateFrom) {
            base = base.filter(
                (a) => (a.created || '').slice(0, 10) >= dateFrom,
            );
        }
        if (dateTo) {
            base = base.filter(
                (a) => (a.created || '').slice(0, 10) <= dateTo,
            );
        }

        return base.filter((a) => matchesQuery(a, query));
    }, [adjustments, directionFilter, dateFrom, dateTo, query]);

    const counts = useMemo(() => {
        let increments = 0;
        let decrements = 0;
        for (const a of adjustments) {
            const n = parseFloat(String(a.quantity ?? '0'));
            if (!Number.isFinite(n)) continue;
            if (a.direction === 'INCREMENT') increments += n;
            else decrements += n;
        }
        return {
            all: adjustments.length,
            visible: visible.length,
            increments,
            decrements,
        };
    }, [adjustments, visible]);

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [query, directionFilter, dateFrom, dateTo, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => visible.slice(pageStart, pageEnd),
        [visible, pageStart, pageEnd],
    );

    const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages],
    );
    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
    }, []);

    /* ---------------- Handlers ---------------- */
    const onQueryChange = useCallback((q: string) => setQuery(q), []);
    const onDirectionFilterChange = useCallback(
        (d: StockAdjustmentDirection | null) => setDirectionFilter(d),
        [],
    );
    const onDateFromChange = useCallback((d: string) => setDateFrom(d), []);
    const onDateToChange = useCallback((d: string) => setDateTo(d), []);
    const onClearFilters = useCallback(() => {
        setDirectionFilter(null);
        setDateFrom('');
        setDateTo('');
    }, []);

    const onRefresh = useCallback(() => {
        void refetchAdjustments();
    }, [refetchAdjustments]);

    /* ---------------- Form open/close ---------------- */
    const onOpenCreate = useCallback(() => {
        setEditingAdjustment(null);
        setFormOpen(true);
    }, []);

    const onOpenEdit = useCallback((a: StockAdjustment) => {
        setEditingAdjustment(a);
        setFormOpen(true);
    }, []);

    const onCloseForm = useCallback(() => {
        if (formSubmitting) return;
        setFormOpen(false);
        setEditingAdjustment(null);
    }, [formSubmitting]);

    /* ---------------- Submit (create / update) ---------------- */
    const onSubmitForm = useCallback(
        async (values: Record<string, string>) => {
            setFormSubmitting(true);
            try {
                const isEdit = editingAdjustment !== null;
                const qty = parseInt(values.quantity || '0', 10);
                const direction = values.direction as StockAdjustmentDirection;
                const returnIntent = (values.return_intent ||
                    'NONE') as StockAdjustmentReturnIntent;

                let res;
                if (isEdit) {
                    res = await retailersApi.updateStockAdjustmentAction({
                        stock_adjustment: editingAdjustment!.id,
                        retailer_receipt:
                            values.retailer_receipt || undefined,
                        quantity: qty,
                        justification: values.justification || undefined,
                        direction,
                        return_intent: returnIntent,
                    });
                } else {
                    res = await retailersApi.createStockAdjustmentAction({
                        retailer_receipt: values.retailer_receipt,
                        quantity: qty,
                        justification: values.justification,
                        direction,
                        return_intent: returnIntent,
                    });
                }

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setFormOpen(false);
                    setEditingAdjustment(null);

                    await refetchAdjustments();

                    try {
                        await refreshInventory();
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            '[StockAdjustment] inventory refresh failed',
                            e,
                        );
                    }

                    setResponseKind('success');
                    setResponseTitle(
                        isEdit
                            ? 'Stock adjustment updated'
                            : 'Stock adjustment created',
                    );
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                setResponseKind('error');
                setResponseTitle(
                    isEdit
                        ? 'Could not update stock adjustment'
                        : 'Could not create stock adjustment',
                );
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);
                const isEdit = editingAdjustment !== null;

                setResponseKind('error');
                setResponseTitle(
                    isEdit
                        ? 'Could not update stock adjustment'
                        : 'Could not create stock adjustment',
                );
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            } finally {
                setFormSubmitting(false);
            }
        },
        [editingAdjustment, refetchAdjustments, refreshInventory],
    );

    /* ---------------- Delete ---------------- */
    const performDeleteAdjustment = useCallback(
        async (a: StockAdjustment) => {
            try {
                const res = await retailersApi.deleteStockAdjustmentAction({
                    stock_adjustment: a.id,
                });

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    await refetchAdjustments();

                    try {
                        await refreshInventory();
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            '[StockAdjustment] inventory refresh failed',
                            e,
                        );
                    }

                    setResponseKind('success');
                    setResponseTitle('Stock adjustment deleted');
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                setResponseKind('error');
                setResponseTitle('Could not delete stock adjustment');
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);

                setResponseKind('error');
                setResponseTitle('Could not delete stock adjustment');
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            }
        },
        [refetchAdjustments, refreshInventory],
    );

    const onDeleteAdjustment = useCallback(
        (a: StockAdjustment) => {
            alert(
                'Delete stock adjustment',
                `Delete this ${a.direction.toLowerCase()} of ${a.quantity
                } unit(s)? The receipt quantity will be adjusted back.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            void performDeleteAdjustment(a);
                        },
                    },
                ],
                'danger',
            );
        },
        [alert, performDeleteAdjustment],
    );

    /* ---------------- Shared props ---------------- */
    const common = {
        adjustments: paginated,
        allAdjustments: visible,
        counts,
        query,
        onQueryChange,
        directionFilter,
        onDirectionFilterChange,
        dateFrom,
        onDateFromChange,
        dateTo,
        onDateToChange,
        onClearFilters,
        loading,
        error,
        onRefresh,
        onNewAdjustment: onOpenCreate,
        onViewAdjustment: setDetailsTarget,
        onEditAdjustment: onOpenEdit,
        onDeleteAdjustment,

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

    return (
        <>
            {isLarge ? (
                <StockAdjustmentsWebView {...common} />
            ) : (
                <StockAdjustmentsMobileView {...common} />
            )}

            <StockAdjustmentFormModal
                visible={formOpen}
                title={
                    editingAdjustment
                        ? 'Edit stock adjustment'
                        : 'New stock adjustment'
                }
                subtitle={
                    editingAdjustment
                        ? 'Update the details of this adjustment.'
                        : 'Record a manual stock adjustment.'
                }
                submitLabel={editingAdjustment ? 'Save' : 'Create'}
                submitting={formSubmitting}
                initial={editingAdjustment}
                onClose={onCloseForm}
                onSubmit={onSubmitForm}
            />

            <StockAdjustmentDetailsSheet
                item={detailsTarget}
                onClose={() => setDetailsTarget(null)}
                onEdit={onOpenEdit}
                onDelete={onDeleteAdjustment}
            />

            <ApiResponseModal
                isOpen={responseOpen}
                variant={responseKind}
                title={responseTitle}
                envelope={responseEnvelope}
                fallbackMessage={responseFallback}
                onClose={closeResponse}
            />
        </>
    );
};

export default StockAdjustmentsList;