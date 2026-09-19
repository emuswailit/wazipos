// components/retailers/stockOuts/RetailerOutOfStocksList.tsx

import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { useRetailerOutOfStocksSync } from '@/context/RetailerOutOfStocksSyncContext';
import {
    RetailerIndentItem,
    RetailerOutOfStockNormalized,
    RetailerOutOfStockWholesalerOffer,
} from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';
import { OutOfStockDetailsModal } from './OutOfStockDetailsModal';
import { OutOfStockFormModal } from './OutOfStockFormModal';
import {
    AcceptedOfferPayload,
    OutOfStockOffersModal,
} from './OutOfStockOffersModal';
import { RetailerOutOfStocksMobileView } from './RetailerOutOfStocksMobileView';
import { RetailerOutOfStocksWebView } from './RetailerOutOfStocksWebView';

export type { AcceptedOfferPayload };

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface RetailerOutOfStocksListProps {
    onAcceptOffers?: (payload: AcceptedOfferPayload) => void;
    onItemPress?: (
        item: RetailerOutOfStockNormalized
    ) => void;
    emptyComponent?: React.ReactNode;
}

export default function RetailerOutOfStocksList({
    onAcceptOffers,
    onItemPress,
    emptyComponent,
}: RetailerOutOfStocksListProps) {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const {
        outOfStocks,
        isSyncing,
        isManualRefreshing,
        lastSyncedTime,
        dataSource,
        reconnectLiveSync,
    } = useRetailerOutOfStocksSync();

    const {
        currentOpenIndent,
        patchIndentLocally,
    } = useRetailerIndentsSync();

    const [query, setQuery] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [offersTarget, setOffersTarget] =
        useState<RetailerOutOfStockNormalized | null>(null);

    const [detailsTarget, setDetailsTarget] =
        useState<RetailerOutOfStockNormalized | null>(null);

    const [formState, setFormState] = useState<{
        mode: 'create' | 'edit';
        item: RetailerOutOfStockNormalized | null;
    } | null>(null);

    /* ---------------- Filter ---------------- */
    const filtered = useMemo(() => {
        const base = onlyPending
            ? outOfStocks.filter((i) => !i.is_ordered)
            : outOfStocks;

        const q = query.trim().toLowerCase();
        if (!q) return base;

        return base.filter((i) => {
            const title = String(
                i.product_title || ''
            ).toLowerCase();
            if (title.includes(q)) return true;

            const customer = String(
                i.customer_name || ''
            ).toLowerCase();
            if (customer.includes(q)) return true;

            const phone = String(
                i.customer_phone || ''
            ).toLowerCase();
            if (phone.includes(q)) return true;

            return (i.wholesaler_offers || []).some((o) => {
                const t = String(
                    o.title || o.product_title || ''
                ).toLowerCase();
                const m = String(
                    o.manufacturer_title || ''
                ).toLowerCase();
                return t.includes(q) || m.includes(q);
            });
        });
    }, [outOfStocks, onlyPending, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [query, onlyPending, pageSize]);

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

    /* ---------------- Callbacks ---------------- */
    const refreshing = isSyncing || isManualRefreshing;

    const handleRefresh = useCallback(() => {
        void reconnectLiveSync();
    }, [reconnectLiveSync]);

    const openOffers = useCallback(
        (item: RetailerOutOfStockNormalized) => {
            setOffersTarget(item);
        },
        []
    );

    const closeOffers = useCallback(() => {
        setOffersTarget(null);
    }, []);

    const closeDetails = useCallback(() => {
        setDetailsTarget(null);
    }, []);

    const openCreate = useCallback(() => {
        setFormState({ mode: 'create', item: null });
    }, []);

    const openEdit = useCallback(
        (item: RetailerOutOfStockNormalized) => {
            setFormState({ mode: 'edit', item });
        },
        []
    );

    const closeForm = useCallback(() => {
        setFormState(null);
    }, []);

    const goPrev = useCallback(
        () => setPage((p) => Math.max(1, p - 1)),
        []
    );

    const goNext = useCallback(
        () =>
            setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages]
    );

    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
        setPage(1);
    }, []);

    /* ---------------- Item builder (offers modal) ---------------- */
    const buildIndentItem = useCallback(
        (
            outOfStock: RetailerOutOfStockNormalized,
            offer: RetailerOutOfStockWholesalerOffer,
            quantity: number
        ): RetailerIndentItem => {
            const indentRemoteId =
                currentOpenIndent?.remote_id ?? '';

            const supplierUnit =
                offer.final_unit_selling_price ||
                offer.unit_selling_price ||
                '0.00';

            const qty = Math.max(0, Math.floor(quantity));
            const unitNum = Number(supplierUnit);
            const grossTotal = (
                Number.isFinite(unitNum)
                    ? unitNum * qty
                    : 0
            ).toFixed(2);

            const id = `oos-${outOfStock.remote_id}-${offer.id}-${Date.now()}`;

            const nowStr = new Date()
                .toISOString()
                .replace('T', ' ')
                .slice(0, 19);

            return {
                id,
                entity: outOfStock.entity,
                entity_title:
                    offer.manufacturer_title ?? '',
                source: 'OUT_OF_STOCK',
                source_label: 'From out-of-stock offer',
                retailer_indent: indentRemoteId,
                wholesale_receipt: offer.id,
                wholesale_receipt_title:
                    offer.title || offer.product_title || '',
                wholesaler: offer.received_from ?? null,
                wholesaler_title:
                    offer.manufacturer_title ?? '',
                wholesaler_price_discount: null,
                wholesaler_price_discount_title:
                    offer.price_discount?.title ?? '',
                wholesaler_quantity_discount: null,
                wholesaler_quantity_discount_title: '',
                campaign_item: null,
                campaign_item_details: null,
                required_quantity: qty,
                total_quantity: qty,
                bonus_quantity_earned: 0,
                bonus_blocks_earned: 0,
                bonus_rule_buy_quantity: null,
                bonus_rule_free_quantity: null,
                supplier_unit_selling_price: supplierUnit,
                final_supplier_unit_selling_price:
                    supplierUnit,
                recommended_retail_price:
                    offer.recommended_retail_price,
                markup_percentage_used: null,
                final_unit_price: supplierUnit,
                item_gross_total_amount: grossTotal,
                item_net_total_amount: grossTotal,
                profit_estimate: null,
                cost_per_unit: supplierUnit,
                sell_per_unit: supplierUnit,
                profit_per_unit: null,
                total_profit: null,
                total_revenue: null,
                margin_percent: null,
                pricing_source: 'out-of-stock-offer',
                lead_time_days: 0,
                lead_time_variance_days: 0,
                lead_time_source: 'default',
                manufacture_date: offer.manufacture_date,
                expiry_date: offer.expiry_date,
                images: offer.images ?? [],
                created: nowStr,
                updated: nowStr,
                owner: offer.owner ?? '',
            };
        },
        [currentOpenIndent]
    );

    const handleSelectOffer = useCallback(
        (payload: AcceptedOfferPayload) => {
            const { outOfStock, quantity, offer } = payload;
            if (!currentOpenIndent) return;

            const existingItems =
                currentOpenIndent.retailer_indent_items ?? [];

            const existing = existingItems.find(
                (it) => it.wholesale_receipt === offer.id
            );

            let nextItems: RetailerIndentItem[];

            if (existing) {
                const updated: RetailerIndentItem = {
                    ...existing,
                    required_quantity: Math.max(
                        0,
                        Math.floor(quantity)
                    ),
                    total_quantity: Math.max(
                        0,
                        Math.floor(quantity)
                    ),
                    updated: new Date()
                        .toISOString()
                        .replace('T', ' ')
                        .slice(0, 19),
                };
                nextItems = existingItems.map((it) =>
                    it.id === existing.id ? updated : it
                );
            } else {
                const item = buildIndentItem(
                    outOfStock,
                    offer,
                    quantity
                );
                nextItems = [...existingItems, item];
            }

            patchIndentLocally(currentOpenIndent.remote_id, {
                retailer_indent_items: nextItems,
                active_item_count: nextItems.length,
                has_items: nextItems.length > 0,
            });

            onAcceptOffers?.(payload);
        },
        [
            currentOpenIndent,
            buildIndentItem,
            patchIndentLocally,
            onAcceptOffers,
        ]
    );

    const handleRemoveItem = useCallback(
        (
            _outOfStock: RetailerOutOfStockNormalized,
            _offer: RetailerOutOfStockWholesalerOffer,
            existingItemId: string
        ) => {
            if (!currentOpenIndent) return;

            const nextItems = (
                currentOpenIndent.retailer_indent_items ?? []
            ).filter((it) => it.id !== existingItemId);

            patchIndentLocally(currentOpenIndent.remote_id, {
                retailer_indent_items: nextItems,
                active_item_count: nextItems.length,
                has_items: nextItems.length > 0,
            });
        },
        [currentOpenIndent, patchIndentLocally]
    );

    /* ---------------- Shared props for both views ---------------- */
    const sharedProps = {
        query,
        setQuery,
        onlyPending,
        setOnlyPending,
        onOpenCreate: openCreate,
        onRefresh: handleRefresh,
        refreshing,
        sourceLabel:
            dataSource === 'server'
                ? 'Server · live'
                : dataSource === 'cache'
                    ? 'Local cache'
                    : 'No data',
        sourceTone: dataSource,
        lastSyncedTime,
        items: paginated,
        emptyComponent,
        onViewOffers: openOffers,
        onPressItem: (item: RetailerOutOfStockNormalized) =>
            setDetailsTarget(item),
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
                <RetailerOutOfStocksWebView {...sharedProps} />
            ) : (
                <RetailerOutOfStocksMobileView
                    {...sharedProps}
                />
            )}

            {/* Offers modal */}
            <OutOfStockOffersModal
                item={offersTarget}
                onClose={closeOffers}
                onSelectOffer={handleSelectOffer}
                onRemoveItem={handleRemoveItem}
            />

            {/* Details modal */}
            <OutOfStockDetailsModal
                item={detailsTarget}
                onClose={closeDetails}
                onViewOffers={(target) => {
                    setDetailsTarget(null);
                    openOffers(target);
                }}
                onEdit={(target) => {
                    setDetailsTarget(null);
                    openEdit(target);
                }}
            />

            {/* Create / Edit modal */}
            <OutOfStockFormModal
                visible={!!formState}
                mode={formState?.mode ?? 'create'}
                item={formState?.item ?? null}
                onClose={closeForm}
                onSaved={(id) => {
                    if (__DEV__) {
                        console.log(
                            '[RetailerOutOfStocksList] form saved',
                            id
                        );
                    }
                }}
            />
        </>
    );
}