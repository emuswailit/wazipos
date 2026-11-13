// components/wholesalers/newWholesaleOrder/useWholesaleOrderForm.ts

import wholesalersApi, {
    type CreateStaffRetailerOrderPayload,
    type CreateStaffRetailerOrderResponse,
} from '@/api/wholesalersApi';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useRetailerOrdersSync } from '@/context/RetailerOrdersSyncContext';
import { useWholesalerReceiptsSync } from '@/context/WholesalerReceiptsSyncContext';
import type {
    EntityItem,
    WholesalerReceipt,
} from '@/databases/types';
import { useCallback, useMemo, useRef, useState } from 'react';

function newDraftId(userId: string): string {
    return `${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/** Flattens the backend's `errors` (list or field map) into one message. */
function describeErrors(data: CreateStaffRetailerOrderResponse | undefined): string {
    const errs = data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join('\n');
    if (errs && typeof errs === 'object') {
        const parts = Object.values(errs).flat().map(String);
        if (parts.length) return parts.join('\n');
    }
    return data?.response_message || 'The order could not be created.';
}

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
interface UseWholesaleOrderFormOptions {
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

    /* -------- Retailer orders list (refreshed after a successful submit) -------- */
    const { forceManualRefresh } = useRetailerOrdersSync();

    /* -------- Wholesaler inventory (scanner lookups) -------- */
    const { wholesalerReceipts } = useWholesalerReceiptsSync();

    /* -------- Idempotency key, stable until a successful submit or reset -------- */
    const draftIdRef = useRef<string | null>(null);

    /* -------- Scanner -------- */
    const [isScannerOpen, setIsScanningOpen] = useState(false);

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
            draftIdRef.current = null;
            onRowsCountChange?.(1);
        },
        [onRowsCountChange]
    );

    /* ---------------------------------------------------------
     * Scanner — adds the matching receipt as a row, or bumps its quantity
     * ------------------------------------------------------- */
    const processBarcodeScanResult = useCallback(
        (barcode: string) => {
            const code = barcode.trim();
            if (!code) return;
            const receipt = (wholesalerReceipts ?? []).find(
                (r) => r.bar_code === code
            );
            if (!receipt) return;
            const receiptId = resolveReceiptId(receipt);
            if (!receiptId) return;
            const price = Number(
                receipt.final_unit_selling_price ??
                receipt.unit_selling_price ??
                0
            );
            const available = Number(receipt.current_unit_quantity ?? 0);
            const withTotal = (row: WholesaleItemRow): WholesaleItemRow => ({
                ...row,
                item_price_total:
                    (Number(row.purchased_quantity) || 0) * (Number(row.item_price) || 0) -
                    (Number(row.item_price_discount) || 0),
            });

            setFormRows((prev) => {
                const existing = prev.findIndex(
                    (r) => r.wholesaler_receipt_id === receiptId
                );
                if (existing !== -1) {
                    return prev.map((r, i) =>
                        i === existing
                            ? withTotal({ ...r, purchased_quantity: String((Number(r.purchased_quantity) || 0) + 1) })
                            : r
                    );
                }
                const filled = withTotal({
                    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    selectedReceipt: receipt,
                    wholesaler_receipt_id: receiptId,
                    purchased_quantity: '1',
                    item_price_discount: '0.00',
                    item_price: price,
                    item_price_total: 0,
                    available,
                });
                const blank = prev.findIndex((r) => !r.selectedReceipt);
                const next =
                    blank !== -1
                        ? prev.map((r, i) => (i === blank ? { ...filled, id: r.id } : r))
                        : [...prev, filled];
                if (next.length !== prev.length) onRowsCountChange?.(next.length);
                return next;
            });
        },
        [wholesalerReceipts, resolveReceiptId, onRowsCountChange]
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
     * submitOrder — sends CreateStaffRetailerOrder straight to the backend
     * ------------------------------------------------------- */
    const submitOrder = useCallback(
        async (opts: {
            retailerId: string;
            paymentMethodId?: string;
            mobileMoneyPhone?: string | null;
            userId: string;
        }): Promise<{ ok: true; orderId: string; reference?: string } | { ok: false; message: string }> => {
            if (!draftIdRef.current) draftIdRef.current = newDraftId(opts.userId);

            const lines = formRows.filter((r) => r.selectedReceipt);
            const order_items = lines.map((r) => {
                const qty = Number(r.purchased_quantity) || 0;
                const price = Number(r.item_price) || 0;
                const discount = Number(r.item_price_discount) || 0;
                return {
                    wholesaler_receipt: String(r.wholesaler_receipt_id || resolveReceiptId(r.selectedReceipt)),
                    purchased_quantity: qty,
                    discount_quantity: 0,
                    total_quantity: qty,
                    item_price: price,
                    item_price_discount: discount,
                    item_net_price: price,
                    item_price_total: qty * price - discount,
                };
            });
            const gross = order_items.reduce((s, i) => s + i.purchased_quantity * i.item_price, 0);
            const discountTotal = order_items.reduce((s, i) => s + i.item_price_discount, 0);

            const payload: CreateStaffRetailerOrderPayload = {
                action: 'CreateStaffRetailerOrder',
                retailer_order_details: {
                    retailer_id: opts.retailerId,
                    draft_id: draftIdRef.current,
                    order_terms: 'CASH',
                    payment_method_id: opts.paymentMethodId,
                    mobile_money_phone: opts.mobileMoneyPhone ?? null,
                    order_gross_price_total: gross,
                    order_discount_total: discountTotal,
                    final_price_total: gross - discountTotal,
                    order_items,
                },
            };

            const res = await wholesalersApi.wholesaleRetailerOrdersStaffAction(payload);
            if (!res.ok) {
                return { ok: false, message: describeErrors(res.data) || res.problem || 'Network error.' };
            }
            if (String(res.data?.response_code) !== '0' || !res.data?.retailer_order?.id) {
                return { ok: false, message: describeErrors(res.data) };
            }

            draftIdRef.current = null;
            void forceManualRefresh();
            return {
                ok: true,
                orderId: res.data.retailer_order.id,
                reference: res.data.retailer_order.reference_number,
            };
        },
        [formRows, resolveReceiptId, forceManualRefresh]
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

        /* Totals & submit */
        grandTotalCost,

        submitOrder,

        /* Scanner */
        isScannerOpen,
        setIsScanningOpen,
        processBarcodeScanResult,
        wholesalerReceipts,

        /* Optional passthrough */
        onSubmitFinished,
    };
}