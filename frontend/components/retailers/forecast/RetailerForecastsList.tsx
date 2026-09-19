// components/retailers/forecast/RetailerForecastsList.tsx

import { RequestWholesalerPickerModal } from '@/components/retailers/productRequests/RequestWholesalerPickerModal';
import { useForecast } from '@/context/ForecastContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { RetailerForecastNormalized } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';
import { ForecastDetailsModal } from './ForecastDetailsModal';
import {
    AcceptedForecastOfferPayload,
    ForecastOffersModal,
} from './ForecastOffersModal';
import { RetailerForecastsMobileView } from './RetailerForecastsMobileView';
import { RetailerForecastsWebView } from './RetailerForecastsWebView';

export type { AcceptedForecastOfferPayload };

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/* =========================================================
 * Props
 * ======================================================= */
export interface RetailerForecastsListProps {
    onAcceptOffer?: (payload: AcceptedForecastOfferPayload) => void;
    onItemPress?: (item: RetailerForecastNormalized) => void;
    emptyComponent?: React.ReactNode;
}

/* =========================================================
 * Component
 * ======================================================= */
export default function RetailerForecastsList({
    onAcceptOffer,
    onItemPress,
    emptyComponent,
}: RetailerForecastsListProps) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const {
        // Forecasts
        forecasts,
        isLoading,
        isStale,
        isOnline,
        lastSyncedAt,
        dataSource,
        refresh,

        // Draft basket — always defined by the ForecastContext contract
        drafts = [],
        addDraftItem,
        hasDraftItem,
        draftCount,
    } = useForecast();

    const {
        // Indent state + actions
        currentOpenIndent,
        addOfferToIndent,
        removeOfferFromIndent,
    } = useRetailerIndentsSync();

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [minAvgDaily, setMinAvgDaily] = useState(0);
    const [onlyWithOffers, setOnlyWithOffers] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    /* ---------------- Modal state ---------------- */
    const [offersTarget, setOffersTarget] =
        useState<RetailerForecastNormalized | null>(null);
    const [detailsTarget, setDetailsTarget] =
        useState<RetailerForecastNormalized | null>(null);
    const [requestTarget, setRequestTarget] =
        useState<RetailerForecastNormalized | null>(null);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        let base = forecasts;
        if (onlyWithOffers) base = base.filter((f) => f.has_offers);
        if (minAvgDaily > 0) {
            base = base.filter(
                (f) => f.avg_daily_forecast >= minAvgDaily
            );
        }

        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((f) => {
            const t = String(f.product_title || '').toLowerCase();
            if (t.includes(q)) return true;
            return (f.wholesaler_offers || []).some((o) =>
                String(o.wholesaler_title || '')
                    .toLowerCase()
                    .includes(q)
            );
        });
    }, [forecasts, onlyWithOffers, minAvgDaily, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [query, onlyWithOffers, minAvgDaily, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => filtered.slice(pageStart, pageEnd),
        [filtered, pageStart, pageEnd]
    );

    /* ---------------- Modal handlers ---------------- */
    const openOffers = useCallback(
        (fc: RetailerForecastNormalized) => {
            if (!fc.has_offers && !fc.has_campaigns) return;
            setOffersTarget(fc);
        },
        []
    );

    const closeOffers = useCallback(
        () => setOffersTarget(null),
        []
    );

    const openDetails = useCallback(
        (fc: RetailerForecastNormalized) => {
            setDetailsTarget(fc);
        },
        []
    );

    const closeDetails = useCallback(
        () => setDetailsTarget(null),
        []
    );

    const openRequest = useCallback(
        (fc: RetailerForecastNormalized) => {
            setRequestTarget(fc);
        },
        []
    );

    const closeRequest = useCallback(
        () => setRequestTarget(null),
        []
    );

    /* ---------------- Check helper for the offers modal -------- */

    const isForecastChecked = useCallback(
        (fc: RetailerForecastNormalized) => {
            const items =
                currentOpenIndent?.retailer_indent_items ?? [];
            if (items.length === 0) return false;
            const receiptIds = new Set(
                fc.wholesaler_offers.map((o) => o.receipt_id)
            );
            return items.some(
                (it) =>
                    it.wholesale_receipt != null &&
                    receiptIds.has(it.wholesale_receipt as any) &&
                    Number(it.total_quantity ?? 0) > 0
            );
        },
        [currentOpenIndent]
    );

    /* ---------------- Offer acceptance (→ indent) -------------- */

    const handleAcceptOffer = useCallback(
        (payload: AcceptedForecastOfferPayload) => {
            console.log('[Forecast] accept offer → indent', {
                product_id: payload.forecast.remote_id,
                product_title: payload.forecast.product_title,
                offer_id: payload.offer.receipt_id,
                wholesaler_id: (payload.offer as any)
                    .wholesaler_id,
                quantity: payload.quantity,
                indent_id:
                    currentOpenIndent?.remote_id ?? null,
            });

            if (onAcceptOffer) {
                onAcceptOffer(payload);
                return;
            }

            const indentId = currentOpenIndent?.remote_id;
            if (!indentId) {
                console.warn(
                    '[Forecast] accept offer — no open indent, ignored'
                );
                return;
            }

            void addOfferToIndent({
                indentId,
                wholesaleReceiptId: String(
                    payload.offer.receipt_id
                ),
                quantity: payload.quantity,
            });
        },
        [onAcceptOffer, currentOpenIndent, addOfferToIndent]
    );

    /* ---------------- Offer removal (→ indent) ---------------- */

    const handleRemoveForecast = useCallback(
        (fc: RetailerForecastNormalized) => {
            const indentId = currentOpenIndent?.remote_id;
            if (!indentId) {
                console.warn(
                    '[Forecast] remove — no open indent, ignored'
                );
                return;
            }

            const items =
                currentOpenIndent?.retailer_indent_items ?? [];
            const receiptIds = new Set(
                fc.wholesaler_offers.map((o) => o.receipt_id)
            );
            const target = items.find(
                (it) =>
                    it.wholesale_receipt != null &&
                    receiptIds.has(it.wholesale_receipt as any)
            );

            if (!target) {
                console.warn(
                    '[Forecast] remove — no matching indent item for',
                    fc.remote_id
                );
                return;
            }

            console.log('[Forecast] remove from indent', {
                product_id: fc.remote_id,
                item_id: target.id,
                indent_id: indentId,
            });

            void removeOfferFromIndent({
                indentId,
                itemId: target.id,
            });
        },
        [currentOpenIndent, removeOfferFromIndent]
    );

    /* ---------------- Picker submit (→ draft basket) ---------- */

    const handlePickerSubmit = useCallback(
        (payload: {
            product_id: string;
            requested_quantity: number;
            urgency: 'low' | 'medium' | 'high';
            note?: string;
            target_wholesaler_ids: string[];
            target_wholesaler_titles?: string[];
        }) => {
            console.log('[Forecast] request supply → draft', {
                product_id: payload.product_id,
                quantity: payload.requested_quantity,
                wholesalers: payload.target_wholesaler_ids,
                wholesaler_titles:
                    payload.target_wholesaler_titles,
            });

            console.log(
                '[Forecast] handlePickerSubmit received',
                JSON.stringify(
                    {
                        ids: payload.target_wholesaler_ids,
                        titles: payload.target_wholesaler_titles,
                        wholesalers: (payload as any).wholesalers,
                    },
                    null,
                    2
                )
            );

            addDraftItem({
                product_id: payload.product_id,
                product_title: requestTarget?.product_title ?? '',
                quantity: payload.requested_quantity,
                urgency: payload.urgency,
                note: payload.note ?? '',
                target_wholesaler_ids: payload.target_wholesaler_ids,
                target_wholesaler_titles: payload.target_wholesaler_titles ?? [],
                wholesalers: (payload as any).wholesalers ?? [],   // ← must be here
                best_forecast_quantity: requestTarget?.required_quantity ?? 1,
            });
            setRequestTarget(null);
        },
        [addDraftItem, requestTarget]
    );

    /* ---------------- Existing draft lookup ------------------- */

    /**
     * The draft (if any) currently containing the product the user
     * is editing. Safe against `drafts` being briefly empty during
     * provider hydration.
     */
    const existingDraft = useMemo(() => {
        if (!requestTarget) return null;
        if (!Array.isArray(drafts)) return null;
        return (
            drafts.find(
                (d) => d.product_id === requestTarget.remote_id
            ) ?? null
        );
    }, [drafts, requestTarget]);

    /* ---------------- Pagination handlers --------------------- */
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

    /* ---------------- Shared props for views ------------------ */
    const refreshing = isLoading;
    const sourceTone: 'server' | 'cache' | 'none' = dataSource;

    const sharedProps = {
        query,
        setQuery,
        minAvgDaily,
        setMinAvgDaily,
        onlyWithOffers,
        setOnlyWithOffers: (fn: (v: boolean) => boolean) =>
            setOnlyWithOffers((prev) => fn(prev)),
        onRefresh: refresh,
        refreshing,
        sourceLabel:
            sourceTone === 'server'
                ? 'Server · live'
                : sourceTone === 'cache'
                    ? 'Local cache'
                    : 'No data',
        sourceTone,
        isStale,
        isOnline,
        lastSyncedTime: lastSyncedAt
            ? new Date(lastSyncedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            })
            : '',
        items: paginated,
        emptyComponent,
        onViewOffers: openOffers,
        onViewDetails: openDetails,
        onRequestSupply: openRequest,
        onPressItem: onItemPress ?? (() => { }),
        hasDraftItem: (fc: RetailerForecastNormalized) =>
            typeof hasDraftItem === 'function'
                ? hasDraftItem(fc.remote_id)
                : false,
        draftCount: typeof draftCount === 'number' ? draftCount : 0,
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

    /* ---------------- Render ---------------------------------- */
    return (
        <>
            {isLarge ? (
                <RetailerForecastsWebView {...sharedProps} />
            ) : (
                <RetailerForecastsMobileView {...sharedProps} />
            )}

            <ForecastOffersModal
                forecast={offersTarget}
                onClose={closeOffers}
                onSelectOffer={handleAcceptOffer}
                onRemoveForecast={handleRemoveForecast}
                isForecastChecked={isForecastChecked}
            />

            <ForecastDetailsModal
                forecast={detailsTarget}
                onClose={closeDetails}
            />

            <RequestWholesalerPickerModal
                visible={!!requestTarget}
                productId={requestTarget?.remote_id ?? null}
                productTitle={
                    requestTarget?.product_title ?? ''
                }
                defaultQuantity={
                    requestTarget?.required_quantity ?? 1
                }
                mode={existingDraft ? 'update' : 'add'}
                initialWholesalerIds={
                    existingDraft?.target_wholesaler_ids
                }
                initialQuantity={existingDraft?.quantity}
                initialUrgency={existingDraft?.urgency}
                initialNote={existingDraft?.note}
                onClose={closeRequest}
                onSubmit={handlePickerSubmit}
            />
        </>
    );
}