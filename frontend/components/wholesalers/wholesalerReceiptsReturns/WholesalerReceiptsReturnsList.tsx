// components/wholesalers/wholesalerReceiptsReturns/WholesalerReceiptsReturnsList.tsx
//
// Shell for the wholesaler purchases-returns screen — read + decide.
//
// Wholesalers don't create returns; retailers do. This screen exists so
// the receiving wholesaler can see what's queued and either accept the
// goods back, reject them, or (pre-decision) cancel.
//
// On every successful write (accept / reject / cancel):
//   1. Re-fetch ListReturns immediately.
//   2. Surface the envelope via ApiResponseModal.

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

import type {
    WholesalerReturnReason,
    WholesalerReturnRecord,
    WholesalerReturnStatus,
} from '@/api/wholesalersApi';
import wholesalersApi from '@/api/wholesalersApi';

import {
    WholesalerReceiptReturnDecisionModal,
    type DecisionStatus,
} from './WholesalerReceiptDecisionModal';

/** Which decision button opened the modal. The modal lets the user switch. */
type DecisionMode = 'accept' | 'reject' | 'cancel';

const MODE_TO_STATUS: Record<DecisionMode, DecisionStatus> = {
    accept: 'ACCEPTED',
    reject: 'REJECTED',
    cancel: 'CANCELLED',
};

const STATUS_TO_MODE: Record<string, DecisionMode> = {
    ACCEPTED: 'accept',
    REJECTED: 'reject',
    CANCELLED: 'cancel',
};
import { WholesalerReceiptsReturnsMobileView } from './WholesalerReceiptsReturnsMobileView';
import { WholesalerReceiptsReturnsWebView } from './WholesalerReceiptsReturnsWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const FETCH_PAGE_SIZE = 500;

/* =========================================================
 * Types
 * ======================================================= */

interface ReceiptReturnCounts {
    all: number;
    visible: number;
    pending: number;
    accepted: number;
    rejected: number;
    cancelled: number;
    totalQuantity: number;
}

/* =========================================================
 * Local helpers
 * ======================================================= */

function matchesQuery(r: WholesalerReturnRecord, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
        String(r.id).toLowerCase().includes(needle) ||
        String(r.product_title ?? '').toLowerCase().includes(needle) ||
        String(r.reason ?? '').toLowerCase().includes(needle) ||
        String(r.justification ?? '').toLowerCase().includes(needle) ||
        String(r.reference_number ?? '').toLowerCase().includes(needle)
    );
}

/* =========================================================
 * Component
 * ======================================================= */

const WholesalerReceiptsReturnsList: React.FC = () => {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Server data ---------------- */
    const [returns, setReturns] = useState<WholesalerReturnRecord[]>([]);
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
            const res = await wholesalersApi.listReturnsAction({
                page: 1,
                page_size: FETCH_PAGE_SIZE,
            } as any);
            const body = res.data as any;
            setReturns(body?.results ?? []);
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load receipt returns');
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
    const [statusFilter, setStatusFilter] = useState<
        WholesalerReturnStatus | 'ALL'
    >('ALL');
    const [reasonFilter, setReasonFilter] = useState<
        WholesalerReturnReason | 'ALL'
    >('ALL');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    /* ---------------- Decision modal ---------------- */
    const [decisionOpen, setDecisionOpen] = useState(false);
    const [openedMode, setOpenedMode] = useState<DecisionMode>('accept');
    const [decisionTarget, setDecisionTarget] =
        useState<WholesalerReturnRecord | null>(null);
    const [decisionSubmitting, setDecisionSubmitting] = useState(false);

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

        if (statusFilter !== 'ALL') {
            base = base.filter((r) => r.status === statusFilter);
        }
        if (reasonFilter !== 'ALL') {
            base = base.filter((r) => r.reason === reasonFilter);
        }
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
    }, [returns, statusFilter, reasonFilter, dateFrom, dateTo, query]);

    const counts = useMemo<ReceiptReturnCounts>(() => {
        let totalQty = 0;
        let pending = 0;
        let accepted = 0;
        let rejected = 0;
        let cancelled = 0;

        for (const r of returns) {
            const n = parseFloat(String(r.quantity ?? '0'));
            if (Number.isFinite(n)) totalQty += n;

            switch (r.status) {
                case 'PENDING': pending += 1; break;
                case 'ACCEPTED': accepted += 1; break;
                case 'REJECTED': rejected += 1; break;
                case 'CANCELLED': cancelled += 1; break;
            }
        }

        return {
            all: returns.length,
            visible: visible.length,
            pending,
            accepted,
            rejected,
            cancelled,
            totalQuantity: totalQty,
        };
    }, [returns, visible]);

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [query, statusFilter, reasonFilter, dateFrom, dateTo, pageSize]);

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
    const onStatusChange = useCallback(
        (s: WholesalerReturnStatus | 'ALL') => setStatusFilter(s),
        [],
    );
    const onReasonChange = useCallback(
        (r: WholesalerReturnReason | 'ALL') => setReasonFilter(r),
        [],
    );
    const onDateFromChange = useCallback((d: string) => setDateFrom(d), []);
    const onDateToChange = useCallback((d: string) => setDateTo(d), []);
    const onClearFilters = useCallback(() => {
        setStatusFilter('ALL');
        setReasonFilter('ALL');
        setDateFrom('');
        setDateTo('');
    }, []);

    const onRefresh = useCallback(() => {
        void refetchReturns();
    }, [refetchReturns]);

    /* ---------------- Decision open/close ---------------- */
    const openDecision = useCallback(
        (mode: DecisionMode, r: WholesalerReturnRecord) => {
            setOpenedMode(mode);
            setDecisionTarget(r);
            setDecisionOpen(true);
        },
        [],
    );

    const onCloseDecision = useCallback(() => {
        if (decisionSubmitting) return;
        setDecisionOpen(false);
        setDecisionTarget(null);
    }, [decisionSubmitting]);

    /* ---------------- Decision submit ---------------- */
    const onSubmitDecision = useCallback(
        async (values: Record<string, string>) => {
            if (!decisionTarget) return;
            // The modal's own Accept / Reject / Cancel picker has the final say.
            const decisionMode: DecisionMode = STATUS_TO_MODE[values.status] ?? openedMode;
            setDecisionSubmitting(true);
            try {
                let res;
                if (decisionMode === 'accept') {
                    res = await wholesalersApi.acceptReturnAction({
                        return_id: decisionTarget.id,
                        unit_price_refunded:
                            values.unit_price_refunded || undefined,
                        restocking_fee_percent:
                            values.restocking_fee_percent || undefined,
                        notes: values.notes || undefined,
                    });
                } else if (decisionMode === 'reject') {
                    res = await wholesalersApi.rejectReturnAction({
                        return_id: decisionTarget.id,
                        reason: values.reason || undefined,
                    });
                } else {
                    res = await wholesalersApi.cancelReturnAction({
                        return_id: decisionTarget.id,
                        reason: values.reason || undefined,
                    });
                }

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setDecisionOpen(false);
                    setDecisionTarget(null);

                    // ---- Refresh the returns list immediately ----
                    await refetchReturns();

                    setResponseKind('success');
                    setResponseTitle(
                        decisionMode === 'accept'
                            ? 'Return accepted'
                            : decisionMode === 'reject'
                                ? 'Return rejected'
                                : 'Return cancelled',
                    );
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                setResponseKind('error');
                setResponseTitle(
                    decisionMode === 'accept'
                        ? 'Could not accept return'
                        : decisionMode === 'reject'
                            ? 'Could not reject return'
                            : 'Could not cancel return',
                );
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);

                setResponseKind('error');
                setResponseTitle(
                    decisionMode === 'accept'
                        ? 'Could not accept return'
                        : decisionMode === 'reject'
                            ? 'Could not reject return'
                            : 'Could not cancel return',
                );
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            } finally {
                setDecisionSubmitting(false);
            }
        },
        [openedMode, decisionTarget, refetchReturns],
    );

    /* ---------------- Accept / Reject / Cancel entry points ---------------- */
    const onAccept = useCallback(
        (r: WholesalerReturnRecord) => openDecision('accept', r),
        [openDecision],
    );

    const onReject = useCallback(
        (r: WholesalerReturnRecord) => openDecision('reject', r),
        [openDecision],
    );

    const onCancel = useCallback(
        (r: WholesalerReturnRecord) => {
            alert(
                'Cancel return',
                `Cancel this return of ${r.quantity ?? 0} unit(s)? The retailer's stock adjustment will be reversed.`,
                [
                    { text: 'Keep', style: 'cancel' },
                    {
                        text: 'Cancel return',
                        style: 'destructive',
                        onPress: () => openDecision('cancel', r),
                    },
                ],
                'danger',
            );
        },
        [alert, openDecision],
    );

    /* ---------------- Shared props ---------------- */
    const common = {
        returns: paginated,
        counts,
        query,
        onQueryChange,
        statusFilter,
        onStatusChange,
        reasonFilter,
        onReasonChange,
        dateFrom,
        onDateFromChange,
        dateTo,
        onDateToChange,
        onClearFilters,
        loading,
        error,
        onRefresh,
        onAccept,
        onReject,
        onCancel,

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
                <WholesalerReceiptsReturnsWebView {...common} />
            ) : (
                <WholesalerReceiptsReturnsMobileView {...common} />
            )}

            <WholesalerReceiptReturnDecisionModal
                visible={decisionOpen}
                initialStatus={MODE_TO_STATUS[openedMode]}
                target={decisionTarget}
                submitting={decisionSubmitting}
                onClose={onCloseDecision}
                onSubmit={onSubmitDecision}
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

export default WholesalerReceiptsReturnsList;