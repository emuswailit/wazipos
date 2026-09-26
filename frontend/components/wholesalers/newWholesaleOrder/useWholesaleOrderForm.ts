// components/wholesalers/newWholesaleOrder/useWholesaleOrderForm.ts

import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import type {
    EntityItem,
    RetailerOrder,
    WholesalerReceipt,
} from '@/databases/types';
import { useCallback, useMemo, useState } from 'react';

/* =========================================================
 * Row type
 * ======================================================= */
export interface WholesaleItemRow {
    id: string;
    selectedReceipt: WholesalerReceipt | null;
    wholesaler_receipt_id?: string;
    purchased_quantity: string;
    item_price_discount: string;
    item_price: number;
    item_price_total: number;
    available?: number;
}

/* =========================================================
 * Hook options
 * ======================================================= */
export interface UseWholesaleOrderFormOptions {
    onSubmitFinished?: (
        retailerId: string,
        notes: string,
        items: any[]
    ) => void;
    onRowsCountChange?: (count: number) => void;
}

/* =========================================================
 * Hook
 * ======================================================= */
export function useWholesaleOrderForm(
    options: UseWholesaleOrderFormOptions = {}
) {
    const { onSubmitFinished, onRowsCountChange } = options;

    /* -------- Entities context -------- */
    const { entitiesList, isEntitiesSyncing } =
        useEntitiesSync();

    /* -------- Retailer orders sync context -------- */
    const { addLocalOrder } = useRetailerOrdersSync();

    /* -------- Retailers -------- */
    const retailers = useMemo<EntityItem[]>(() => {
        return (entitiesList ?? []).filter(
            (e) =>
                e.entity_type === 'GeneralRetailer' ||
                e.entity_type === 'PharmaceuticalRetailer'
        );
    }, [entitiesList]);

    /* -------- Selected retailer -------- */
    const [selectedRetailer, setSelectedRetailer] =
        useState<EntityItem | null>(null);

    /* -------- Rows -------- */
    const [formRows, setFormRows] = useState<
        WholesaleItemRow[]
    >([
        {
            id: 'row-initial',
            selectedReceipt: null,
            wholesaler_receipt_id: undefined,
            purchased_quantity: '1',
            item_price_discount: '0.00',
            item_price: 0,
            item_price_total: 0,
            available: undefined,
        },
    ]);

    /* -------- Notes -------- */
    const [notes, setNotes] = useState('');

    /* -------- Payment -------- */
    const [selectedPaymentMethod, setSelectedPaymentMethod] =
        useState<any>(null);
    const [mpesaNumber, setMpesaNumber] = useState('');

    /* -------- Status -------- */
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSyncLoading, setIsSyncLoading] =
        useState(false);
    const [syncStatus, setSyncStatus] = useState<
        'idle' | 'syncing' | 'ok' | 'error'
    >('idle');
    const [submitToast, setSubmitToast] = useState<
        string | null
    >(null);

    /* ---------------------------------------------------------
     * Resolve receipt id
     * ------------------------------------------------------- */
    const resolveReceiptId = useCallback(
        (
            r: WholesalerReceipt | null | undefined
        ): string => {
            if (!r) return '';
            return String(
                (r as any).remote_id ||
                (r as any).remote_key ||
                (r as any).id ||
                ''
            );
        },
        []
    );

    /* ---------------------------------------------------------
     * Row helpers
     * ------------------------------------------------------- */
    const addFormRow = useCallback(() => {
        setFormRows((prev) => {
            const next: WholesaleItemRow[] = [
                ...prev,
                {
                    id: `row-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 6)}`,
                    selectedReceipt: null,
                    wholesaler_receipt_id: undefined,
                    purchased_quantity: '1',
                    item_price_discount: '0.00',
                    item_price: 0,
                    item_price_total: 0,
                    available: undefined,
                },
            ];
            onRowsCountChange?.(next.length);
            return next;
        });
    }, [onRowsCountChange]);

    const updateRowState = useCallback(
        (
            id: string,
            patch: Partial<WholesaleItemRow>
        ) => {
            setFormRows((prev) =>
                prev.map((row) => {
                    if (row.id !== id) return row;

                    const next = { ...row, ...patch };

                    if (
                        patch.selectedReceipt &&
                        !next.wholesaler_receipt_id
                    ) {
                        next.wholesaler_receipt_id =
                            resolveReceiptId(
                                patch.selectedReceipt
                            );
                    }

                    const q =
                        Number(
                            next.purchased_quantity
                        ) || 0;
                    const p = Number(next.item_price) || 0;
                    const d =
                        Number(
                            next.item_price_discount
                        ) || 0;
                    next.item_price_total = q * p - d;

                    return next;
                })
            );
        },
        [resolveReceiptId]
    );

    const removeFormRow = useCallback(
        (id: string) => {
            setFormRows((prev) => {
                if (prev.length <= 1) return prev;
                const next = prev.filter(
                    (r) => r.id !== id
                );
                onRowsCountChange?.(next.length);
                return next;
            });
        },
        [onRowsCountChange]
    );

    const clearActiveDraftSession = useCallback(
        async () => {
            setFormRows([
                {
                    id: 'row-initial',
                    selectedReceipt: null,
                    wholesaler_receipt_id: undefined,
                    purchased_quantity: '1',
                    item_price_discount: '0.00',
                    item_price: 0,
                    item_price_total: 0,
                    available: undefined,
                },
            ]);
            setSelectedRetailer(null);
            setNotes('');
            setMpesaNumber('');
            setSelectedPaymentMethod(null);
            onRowsCountChange?.(1);
        },
        [onRowsCountChange]
    );

    /* ---------------------------------------------------------
     * Totals
     * ------------------------------------------------------- */
    const grandTotalCost = useMemo(
        () =>
            formRows.reduce(
                (sum, r) =>
                    sum +
                    (Number(r.item_price_total) || 0),
                0
            ),
        [formRows]
    );

    /* ---------------------------------------------------------
     * commitOrder — builds and persists a RetailerOrder locally
     * ------------------------------------------------------- */
    const commitOrder = useCallback(
        async (opts: {
            retailerId: string;
            retailerTitle: string;
            paymentMethodId: string;
            paymentMethodTitle: string;
            mpesaNumber: string;
            notes: string;
            userId: string;
        }): Promise<RetailerOrder> => {
            const userId = opts.userId;
            const draftId = `${userId}:${Math.floor(
                Date.now() / 1000
            )}`;

            console.log(
                '[commitOrder] rows → items:',
                formRows.map((r) => ({
                    title: r.selectedReceipt?.title,
                    remote_id: (r.selectedReceipt as any)
                        ?.remote_id,
                    remote_key: (r.selectedReceipt as any)
                        ?.remote_key,
                    id: (r.selectedReceipt as any)?.id,
                    cached_id: r.wholesaler_receipt_id,
                    product: r.selectedReceipt?.product,
                    picked: !!r.selectedReceipt,
                }))
            );

            const order: RetailerOrder = {
                remote_id: '',
                draft_id: draftId,

                retailer: opts.retailerId,
                retailer_title: opts.retailerTitle,

                wholesaler: null,
                wholesaler_title: null,
                owner: userId,
                owner_title: '',
                employee: userId,

                title: opts.retailerTitle,

                payment_method: opts.paymentMethodId,
                payment_method_title:
                    opts.paymentMethodTitle,

                order_origin: 'STAFF',
                order_terms: 'CASH',

                document_number: null,
                document_number_display: 'N/A',
                reference_number: '',
                provider_reference_number: null,
                psp_reference_number: '',
                telco: '',

                status: 'DRAFT',

                shipping_amount: '0.00',
                order_discount_total: '0.00',
                order_gross_price_total: String(
                    grandTotalCost
                ),
                order_tax_total: '0.00',
                final_price: String(grandTotalCost),
                final_price_total: String(
                    grandTotalCost
                ),

                is_paid: 'false',
                is_delivered: 'false',
                is_processed: 'false',
                is_packed: 'false',
                is_received: 'false',
                is_approved: 'false',
                is_dispatched: 'false',
                is_committed: 'false',

                paid_at: null,
                delivered_at: null,
                delivered_by: null,
                processed_at: null,
                processed_by: null,
                packed_at: null,
                packed_by: null,
                received_at: null,
                received_by: null,
                approved_at: null,
                approved_by: null,
                dispatched_at: null,
                dispatched_by: null,
                committed_at: null,
                cancelled_at: null,

                commit_type: null,
                commit_type_display: null,
                committed_by_entity: null,
                committed_by_title: null,
                committed_by_user: null,
                commit_note: '',

                delivery_method: '',
                actual_lead_time_days: null,

                payment_summary: {
                    paid_total: 0,
                    balance_due: grandTotalCost,
                    is_paid: false,
                },

                description: opts.notes || null,

                order_items: formRows
                    .filter((r) => r.selectedReceipt)
                    .map((r, i) => {
                        const receipt = r
                            .selectedReceipt!;

                        const receiptId =
                            r.wholesaler_receipt_id ||
                            resolveReceiptId(receipt);

                        if (!receiptId) {
                            console.warn(
                                '[commitOrder] item has no receipt id',
                                {
                                    title: receipt.title,
                                    product:
                                        receipt.product,
                                    remote_id:
                                        (receipt as any)
                                            .remote_id,
                                    remote_key:
                                        (receipt as any)
                                            .remote_key,
                                    id: (receipt as any)
                                        .id,
                                }
                            );
                        }

                        return {
                            id: `local-${draftId}-${i}`,
                            entity: opts.retailerId,
                            title: receipt.title ?? '',
                            units_per_pack: 1,
                            retailer_order: draftId,
                            retailer_indent_item: null,
                            product_title:
                                receipt.title ?? '',
                            preparation_title: '',
                            wholesaler_receipt:
                                String(receiptId),
                            product:
                                receipt.product ?? '',
                            purchased_quantity: Number(
                                r.purchased_quantity
                            ),
                            discount_quantity: 0,
                            total_quantity: Number(
                                r.purchased_quantity
                            ),
                            unit_quantity: Number(
                                r.purchased_quantity
                            ),
                            item_price: String(
                                r.item_price
                            ),
                            item_price_total: String(
                                r.item_price_total
                            ),
                            item_net_price: String(
                                r.item_price
                            ),
                            item_net_price_total: null,
                            item_price_discount: String(
                                r.item_price_discount
                            ),
                            item_price_discount_total: null,
                            item_tax: null,
                            item_tax_total: null,
                            item_counter_price_discount: null,
                            item_counter_price_discount_amount:
                                null,
                            item_counter_price_discount_amount_total:
                                '0.00',
                            item_final_price: null,
                            item_final_price_total: null,
                            intended_retail_unit_price: null,
                            intended_retail_unit_price_source:
                                'markup',
                            line_margin: null,
                            pricing_source_label: 'Markup',
                            stakeholders: [],
                            is_received: 'false',
                            is_issued: 'false',
                            item_paid_amount: '0.00',
                            item_pending_amount: null,
                            batch: receipt.batch ?? null,
                            manufacture_date:
                                receipt.manufacture_date ??
                                null,
                            expiry_date:
                                receipt.expiry_date ??
                                null,
                            wholesaler:
                                (receipt as any).entity ??
                                '',
                            retailer: opts.retailerId,
                            facilitator: '',
                            images:
                                (receipt as any).images ??
                                [],
                            created:
                                new Date().toISOString(),
                            updated:
                                new Date().toISOString(),
                            owner: userId,
                        };
                    }),

                retailer_postal_town: null,
                retailer_postal_code: null,
                retailer_postal_address: null,
                retailer_phone: null,
                retailer_email: null,

                wholesaler_postal_town: null,
                wholesaler_postal_code: null,
                wholesaler_postal_address: null,
                wholesaler_phone: null,
                wholesaler_email: null,

                created: new Date().toISOString(),
                updated: new Date().toISOString(),

                cached_at: new Date().toISOString(),
                synced: false,
                sync_error: null,
            } as RetailerOrder;

            await addLocalOrder(order);

            console.log(
                '[commitOrder] local order saved',
                {
                    draft_id: order.draft_id,
                    itemCount:
                        order.order_items.length,
                    receiptIds: order.order_items.map(
                        (i) => i.wholesaler_receipt
                    ),
                }
            );

            return order;
        },
        [
            formRows,
            grandTotalCost,
            addLocalOrder,
            resolveReceiptId,
        ]
    );

    /* ---------------------------------------------------------
     * Legacy payload builder
     * ------------------------------------------------------- */
    const buildSubmitItems = useCallback(
        () =>
            formRows
                .filter((r) => r.selectedReceipt)
                .map((r) => {
                    const receipt = r.selectedReceipt!;
                    const receiptId =
                        r.wholesaler_receipt_id ||
                        resolveReceiptId(receipt);
                    return {
                        wholesaler_receipt: String(
                            receiptId
                        ),
                        product:
                            receipt.product ?? '',
                        barcode:
                            receipt.bar_code ?? '',
                        batch: receipt.batch ?? '',
                        quantity:
                            Number(r.purchased_quantity) ||
                            0,
                        unit_price:
                            Number(r.item_price) || 0,
                        discount:
                            Number(
                                r.item_price_discount
                            ) || 0,
                        total:
                            Number(r.item_price_total) ||
                            0,
                    };
                }),
        [formRows, resolveReceiptId]
    );

    /* ---------------------------------------------------------
     * Return
     * ------------------------------------------------------- */
    return {
        /* Rows */
        formRows,
        setFormRows,
        addFormRow,
        updateRowState,
        removeFormRow,
        clearActiveDraftSession,

        /* Retailer */
        retailers,
        selectedRetailer,
        setSelectedRetailer,

        /* Notes */
        notes,
        setNotes,

        /* Payment */
        selectedPaymentMethod,
        setSelectedPaymentMethod,
        mpesaNumber,
        setMpesaNumber,

        /* Status */
        isSubmitting,
        setIsSubmitting,
        isSyncLoading:
            isSyncLoading || isEntitiesSyncing,
        setIsSyncLoading,
        syncStatus,
        setSyncStatus,
        submitToast,
        setSubmitToast,

        /* Totals & payload */
        grandTotalCost,
        buildSubmitItems,
        commitOrder,

        /* Optional passthrough */
        onSubmitFinished,
    };
}