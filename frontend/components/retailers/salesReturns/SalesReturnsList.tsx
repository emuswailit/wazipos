// components/retailers/salesReturns/SalesReturnsList.tsx
//
// Shell for the sales returns screen — full CRUD.
//
// On every successful write (create / update / delete):
//   1. Re-fetch GetSalesReturns immediately.
//   2. Ask useInventorySync to re-pull, so the receipt quantity
//      change the backend applied via create_stock_adjustment is
//      reflected in pickers and inventory views.

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

import { SalesReturnDetailsSheet } from './SalesReturnDetailsSheet';
import { SalesReturnFormModal } from './SalesReturnFormModal';
import { SalesReturnsMobileView } from './SalesReturnsMobileView';
import { SalesReturnsWebView } from './SalesReturnsWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const FETCH_PAGE_SIZE = 500;

/* =========================================================
 * Types
 * ======================================================= */

export interface SalesReturn {
    id: string;
    draft_id?: string | null;
    retailer_receipt?: string | null;
    retailer_receipt_title?: string | null;
    customer_order?: string | null;
    customer_order_number?: string | null;
    quantity?: number | string | null;
    justification?: string | null;
    owner?: string | null;
    created: string;
    updated: string;
}

/* =========================================================
 * Local helpers
 * ======================================================= */

function matchesQuery(r: SalesReturn, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
        String(r.id).toLowerCase().includes(needle) ||
        String(r.customer_order_number || '').toLowerCase().includes(needle) ||
        String(r.retailer_receipt_title || '').toLowerCase().includes(needle) ||
        String(r.justification || '').toLowerCase().includes(needle)
    );
}

/* =========================================================
 * Component
 * ======================================================= */

const SalesReturnsList: React.FC = () => {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Inventory sync (for post-write refresh) ---------------- */
    const { triggerManualFetch: refreshInventory } = useInventorySync();

    /* ---------------- Server data ---------------- */
    const [returns, setReturns] = useState<SalesReturn[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /* ---------------- Fetch helper ----------------
     * Named so both the mount effect and every successful write
     * funnel through the same code path. `page_size` covers the
     * whole list — the API paginates but the shell treats the
     * response as a single window, then paginates locally.
     * ---------------------------------------------- */
    const refetchReturns = useCallback(async () => {
        try {
            const res = await retailersApi.getSalesReturnsAction({
                page: 1,
                page_size: FETCH_PAGE_SIZE,
            });
            const body = res.data as any;
            setReturns(body?.results ?? []);
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load sales returns');
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            await refetchReturns();
            if (!cancelled) setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [refetchReturns]);

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    /* ---------------- Form modal ---------------- */
    const [formOpen, setFormOpen] = useState(false);
    const [editingReturn, setEditingReturn] = useState<SalesReturn | null>(null);
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [detailsTarget, setDetailsTarget] = useState<SalesReturn | null>(null);

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
        let base = returns;

        if (dateFrom) {
            base = base.filter(
                (r) => (r.created || '').slice(0, 10) >= dateFrom,
            );
        }
        if (dateTo) {
            base = base.filter(
                (r) => (r.created || '').slice(0, 10) <= dateTo,
            );
        }

        return base.filter((r) => matchesQuery(r, query));
    }, [returns, dateFrom, dateTo, query]);

    const counts = useMemo(() => {
        let totalQty = 0;
        for (const r of returns) {
            const n = parseFloat(String(r.quantity ?? '0'));
            if (Number.isFinite(n)) totalQty += n;
        }
        return {
            all: returns.length,
            visible: visible.length,
            totalQuantity: totalQty,
        };
    }, [returns, visible]);

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [query, dateFrom, dateTo, pageSize]);

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
    const onDateFromChange = useCallback((d: string) => setDateFrom(d), []);
    const onDateToChange = useCallback((d: string) => setDateTo(d), []);
    const onClearFilters = useCallback(() => {
        setDateFrom('');
        setDateTo('');
    }, []);

    const onRefresh = useCallback(() => {
        void refetchReturns();
    }, [refetchReturns]);

    /* ---------------- Form open/close ---------------- */
    const onOpenCreate = useCallback(() => {
        setEditingReturn(null);
        setFormOpen(true);
    }, []);

    const onOpenEdit = useCallback((r: SalesReturn) => {
        setEditingReturn(r);
        setFormOpen(true);
    }, []);

    const onCloseForm = useCallback(() => {
        if (formSubmitting) return;
        setFormOpen(false);
        setEditingReturn(null);
    }, [formSubmitting]);

    /* ---------------- Submit ---------------- */
    const onSubmitForm = useCallback(
        async (values: Record<string, string>) => {
            setFormSubmitting(true);
            try {
                const isEdit = editingReturn !== null;
                const qty = parseInt(values.quantity || '0', 10);

                let res;
                if (isEdit) {
                    res = await retailersApi.updateSalesReturnAction({
                        sales_return: editingReturn!.id,
                        retailer_receipt: values.retailer_receipt || undefined,
                        customer_order: values.customer_order || null,
                        quantity: qty,
                        justification: values.justification || undefined,
                    });
                } else {
                    res = await retailersApi.createSalesReturnAction({
                        retailer_receipt: values.retailer_receipt,
                        customer_order: values.customer_order || null,
                        quantity: qty,
                        justification: values.justification,
                        draft_id: values.draft_id || undefined,
                    });
                }

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setFormOpen(false);
                    setEditingReturn(null);

                    // ---- Refresh the sales-returns list immediately ----
                    await refetchReturns();

                    // ---- Refresh inventory: the backend created a
                    //      StockAdjustments row and bumped
                    //      retailer_receipt.current_unit_quantity. ----
                    try {
                        await refreshInventory();
                    } catch (e) {
                        // Non-fatal — the list refetch already
                        // succeeded, so the modal can still show
                        // the success envelope.
                        // eslint-disable-next-line no-console
                        console.warn(
                            '[SalesReturn] inventory refresh failed',
                            e,
                        );
                    }

                    setResponseKind('success');
                    setResponseTitle(
                        isEdit ? 'Sales return updated' : 'Sales return created',
                    );
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                setResponseKind('error');
                setResponseTitle(
                    isEdit
                        ? 'Could not update sales return'
                        : 'Could not create sales return',
                );
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);
                const isEdit = editingReturn !== null;

                setResponseKind('error');
                setResponseTitle(
                    isEdit
                        ? 'Could not update sales return'
                        : 'Could not create sales return',
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
        [editingReturn, refetchReturns, refreshInventory],
    );

    /* ---------------- Delete ---------------- */
    const performDeleteReturn = useCallback(
        async (r: SalesReturn) => {
            try {
                const res = await retailersApi.deleteSalesReturnAction({
                    sales_return: r.id,
                });

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    // ---- Refresh the list immediately ----
                    await refetchReturns();

                    // ---- Delete reverses the adjustment on the
                    //      backend, so inventory also changes. ----
                    try {
                        await refreshInventory();
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            '[SalesReturn] inventory refresh failed',
                            e,
                        );
                    }

                    setResponseKind('success');
                    setResponseTitle('Sales return deleted');
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                setResponseKind('error');
                setResponseTitle('Could not delete sales return');
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);

                setResponseKind('error');
                setResponseTitle('Could not delete sales return');
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            }
        },
        [refetchReturns, refreshInventory],
    );

    const onDeleteReturn = useCallback(
        (r: SalesReturn) => {
            alert(
                'Delete sales return',
                `Delete this sales return of ${r.quantity ?? 0} unit(s)? This cannot be undone.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            void performDeleteReturn(r);
                        },
                    },
                ],
                'danger',
            );
        },
        [alert, performDeleteReturn],
    );

    /* ---------------- Shared props ---------------- */
    const common = {
        returns: paginated,
        allReturns: visible,
        counts,
        query,
        onQueryChange,
        dateFrom,
        onDateFromChange,
        dateTo,
        onDateToChange,
        onClearFilters,
        loading,
        error,
        onRefresh,
        onNewReturn: onOpenCreate,
        onViewReturn: setDetailsTarget,
        onEditReturn: onOpenEdit,
        onDeleteReturn,

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
                <SalesReturnsWebView {...common} />
            ) : (
                <SalesReturnsMobileView {...common} />
            )}

            <SalesReturnFormModal
                visible={formOpen}
                title={editingReturn ? 'Edit sales return' : 'New sales return'}
                subtitle={
                    editingReturn
                        ? 'Update the details of this sales return.'
                        : 'Record a new sales return.'
                }
                submitLabel={editingReturn ? 'Save' : 'Create'}
                submitting={formSubmitting}
                initial={editingReturn}
                onClose={onCloseForm}
                onSubmit={onSubmitForm}
            />

            <SalesReturnDetailsSheet
                item={detailsTarget}
                onClose={() => setDetailsTarget(null)}
                onEdit={onOpenEdit}
                onDelete={onDeleteReturn}
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

export default SalesReturnsList;