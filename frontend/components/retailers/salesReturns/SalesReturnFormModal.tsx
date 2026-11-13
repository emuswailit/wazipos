// components/retailers/salesReturns/SalesReturnFormModal.tsx
//
// Create/edit modal for a sales return.
//
// - Retailer receipt → RetailerInventoryPicker (searchable, sourced
//   from the inventory sync context).
// - Customer order   → CustomerOrderSelect, local-first search with a
//   backend fallback, filtered to orders that contain the selected
//   receipt in their items. Required.
// - Quantity         → plain TextInput, auto-filled from the selected
//   order's purchased quantity for the selected receipt, capped at
//   that value with a live inline error.
// - Justification    → plain TextInput, required.

import { CustomerOrderSelect } from '@/components/common/CustomerOrderSelect';
import { RetailerInventoryPicker } from '@/components/common/RetailerInventoryPicker';
import { useCustomerOrdersSync } from '@/context/CustomerOrdersSyncContext';
import type {
    CustomerOrder,
    CustomerOrderItem,
    CustomerOrderOption,
    RetailerReceipt,
} from '@/databases/types';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, FormSection } from '@/components/common/listScreen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { SalesReturn } from './SalesReturnsList';

/* =========================================================
 * Props
 * ======================================================= */

interface SalesReturnFormModalProps {
    visible: boolean;
    title: string;
    subtitle?: string;
    submitLabel?: string;
    submitting?: boolean;
    initial: SalesReturn | null;
    onClose: () => void;
    onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

/* =========================================================
 * Helpers — tolerate both the WS-normalized shape and the
 * raw CustomerOrdersSerializer shape
 * ======================================================= */

/**
 * Collect every plausible receipt UUID on an order item. Handles:
 *   { retailer_receipt: "…uuid…" }
 *   { retailer_receipt_id: "…uuid…" }
 *   { receipt_details: { id: "…uuid…" } }
 */
function itemReceiptIds(item: any): string[] {
    if (!item) return [];
    const out: string[] = [];
    const push = (v: any) => {
        if (v === undefined || v === null) return;
        const s = String(v).trim();
        if (s) out.push(s);
    };

    push(item.retailer_receipt);
    push(item.retailer_receipt_id);
    push(item.receipt);
    push(item.receipt_id);

    const details = item.receipt_details;
    if (details && typeof details === 'object') {
        push(details.id);
        push(details.remote_id);
        push(details.retailer_receipt);
    }
    return out;
}

function findOrderLine(
    order: any,
    receiptId: string | null | undefined,
): CustomerOrderItem | null {
    if (!order || !receiptId) return null;
    const items = order.order_items ?? [];
    if (!Array.isArray(items) || items.length === 0) return null;
    const target = String(receiptId).trim();
    return (
        items.find((item: any) =>
            itemReceiptIds(item).includes(target),
        ) ?? null
    );
}

function lookupOrderedQuantity(
    order: any,
    receiptId: string | null | undefined,
): number | null {
    const line = findOrderLine(order, receiptId);
    if (!line) return null;
    const qty = Number((line as any).purchased_quantity ?? 0);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
}

function orderMatchesId(o: CustomerOrder, orderId: string): boolean {
    const anyO = o as any;
    return (
        String(anyO.remote_id ?? '') === orderId ||
        String(anyO.remote_key ?? '') === orderId ||
        String(anyO.id ?? '') === orderId ||
        String(anyO.draft_id ?? '') === orderId
    );
}

/* =========================================================
 * Component
 * ======================================================= */

export function SalesReturnFormModal({
    visible,
    title,
    subtitle,
    submitLabel = 'Save',
    submitting = false,
    initial,
    onClose,
    onSubmit,
}: SalesReturnFormModalProps) {
    const { customerOrders, localCustomerOrders } = useCustomerOrdersSync();


    /* -------- Selected receipt -------- */
    const [selectedReceipt, setSelectedReceipt] =
        useState<RetailerReceipt | null>(null);

    /**
     * Raw order record captured from the picker. Type is `any`
     * because the picker may return either a WS-normalized
     * `CustomerOrder` (from the local context) or a raw
     * `CustomerOrdersSerializer` payload (from server search).
     * `lookupOrderedQuantity` handles both.
     */
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    const initialValues = useMemo<Record<string, string>>(
        () => ({
            retailer_receipt: initial?.retailer_receipt ?? '',
            retailer_receipt_title: initial?.retailer_receipt_title ?? '',
            customer_order: initial?.customer_order ?? '',
            customer_order_number: initial?.customer_order_number ?? '',
            quantity:
                initial?.quantity != null
                    ? String(initial.quantity)
                    : '',
            justification: initial?.justification ?? '',
            draft_id: initial?.draft_id ?? '',
        }),
        [initial],
    );

    const [values, setValues] = useState<Record<string, string>>(
        initialValues,
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (visible) {
            setValues(initialValues);
            setErrors({});
            setSelectedOrder(null);

            if (initial?.retailer_receipt) {
                setSelectedReceipt({
                    remote_id: initial.retailer_receipt,
                    title: initial.retailer_receipt_title ?? '',
                } as RetailerReceipt);
            } else {
                setSelectedReceipt(null);
            }
        }
    }, [visible, initialValues, initial]);

    const setField = useCallback((key: string, value: string) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    /* -------- Receipt picker handlers -------- */
    const handleReceiptSelect = useCallback((r: RetailerReceipt) => {
        setSelectedReceipt(r);
        setSelectedOrder(null);
        setValues((prev) => ({
            ...prev,
            retailer_receipt: String(r.remote_id ?? ''),
            retailer_receipt_title: String(r.title ?? ''),
            customer_order: '',
            customer_order_number: '',
            quantity: '',
        }));
        setErrors((prev) => {
            if (!prev.retailer_receipt) return prev;
            const next = { ...prev };
            delete next.retailer_receipt;
            return next;
        });
    }, []);

    const handleReceiptClear = useCallback(() => {
        setSelectedReceipt(null);
        setSelectedOrder(null);
        setValues((prev) => ({
            ...prev,
            retailer_receipt: '',
            retailer_receipt_title: '',
            customer_order: '',
            customer_order_number: '',
            quantity: '',
        }));
    }, []);

    /* -------- Order picker handlers -------- */
    // onChange fires with the UUID; onAfterSelect fires with the
    // normalized option. We keep the raw record so the max-qty
    // lookup can walk order_items.
    const handleOrderChange = useCallback(
        (orderId: string) => {
            setField('customer_order', orderId);
            if (!orderId) setSelectedOrder(null);
        },
        [setField],
    );

    const handleOrderSelected = useCallback(
        (option: CustomerOrderOption) => {
            setSelectedOrder(option.raw);
            setField('customer_order_number', option.label);

            // Auto-fill quantity with the purchased units for the
            // currently selected receipt.
            const receiptId = values.retailer_receipt;
            if (!receiptId) return;

            const qty = lookupOrderedQuantity(option.raw, receiptId);
            if (qty != null) setField('quantity', String(qty));
        },
        [values.retailer_receipt, setField],
    );

    /* -------- Resolve current order for max-qty checks -------- */
    // Prefer the freshly-picked record; fall back to the WS cache
    // (useful in edit mode where the picker never fired).
    const resolvedOrder = useMemo<any>(() => {
        if (selectedOrder) return selectedOrder;
        if (!values.customer_order) return null;

        const match = (o: CustomerOrder) =>
            orderMatchesId(o, values.customer_order);

        return (
            customerOrders.find(match) ??
            localCustomerOrders.find(match) ??
            null
        );
    }, [
        selectedOrder,
        values.customer_order,
        customerOrders,
        localCustomerOrders,
    ]);

    const maxReturnableQuantity = useMemo<number | null>(() => {
        if (!selectedReceipt?.remote_id) return null;
        if (!resolvedOrder) return null;
        return lookupOrderedQuantity(
            resolvedOrder,
            selectedReceipt.remote_id,
        );
    }, [resolvedOrder, selectedReceipt?.remote_id]);

    /* -------- Live quantity error -------- */
    const liveQuantityError = useMemo<string | null>(() => {
        const raw = values.quantity?.trim();
        if (!raw) return null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return null;
        if (maxReturnableQuantity == null) return null;
        if (n > maxReturnableQuantity) {
            return `Quantity cannot exceed ${maxReturnableQuantity}`;
        }
        return null;
    }, [values.quantity, maxReturnableQuantity]);

    const quantityError: string | undefined =
        errors.quantity ?? liveQuantityError ?? undefined;

    /* -------- Validation -------- */
    const validate = useCallback((): boolean => {
        const next: Record<string, string> = {};

        if (!values.retailer_receipt?.trim()) {
            next.retailer_receipt = 'Retailer receipt is required';
        }
        if (!values.customer_order?.trim()) {
            next.customer_order = 'Customer order is required';
        }

        if (!values.quantity?.trim()) {
            next.quantity = 'Quantity is required';
        } else {
            const n = Number(values.quantity);
            if (!Number.isFinite(n) || n <= 0) {
                next.quantity = 'Quantity must be a positive number';
            } else if (
                maxReturnableQuantity != null &&
                n > maxReturnableQuantity
            ) {
                next.quantity = `Quantity cannot exceed ${maxReturnableQuantity}`;
            }
        }

        if (!values.justification?.trim()) {
            next.justification = 'Justification is required';
        }

        setErrors(next);
        return Object.keys(next).length === 0;
    }, [values, maxReturnableQuantity]);

    const handleSubmit = useCallback(async () => {
        if (!validate()) return;
        await onSubmit(values);
    }, [validate, onSubmit, values]);

    const quantityHint = maxReturnableQuantity != null ? `Up to ${maxReturnableQuantity} unit(s) were bought on this order.` : undefined;

    return (
        <AdminFormSheet
            visible={visible}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            icon="return-up-back-outline"
            submitLabel={submitLabel}
            submitting={submitting}
            onSubmit={() => {
                if (!liveQuantityError) void handleSubmit();
            }}
        >
            <FormSection title="Returned item" zIndex={60}>
                <View style={{ zIndex: 300 }}>
                    <RetailerInventoryPicker
                        label="Item"
                        required
                        value={selectedReceipt}
                        onSelect={handleReceiptSelect}
                        onClear={handleReceiptClear}
                        error={errors.retailer_receipt}
                        placeholder="Search your inventory…"
                    />
                </View>
            </FormSection>

            <FormSection title="Customer order" hint="Only orders that include this item are listed." zIndex={50}>
                <View style={{ zIndex: 200 }}>
                    <CustomerOrderSelect
                        label="Order"
                        required
                        error={errors.customer_order}
                        placeholder={selectedReceipt ? 'Type order #, name or phone…' : 'Pick the item first'}
                        value={values.customer_order}
                        selectedLabel={values.customer_order_number}
                        onChange={handleOrderChange}
                        onAfterSelect={handleOrderSelected}
                        receiptId={selectedReceipt?.remote_id ?? null}
                        maxDropdownHeight={320}
                        minSearchLength={2}
                    />
                </View>
            </FormSection>

            <FormSection title="Return">
                <CustomTextField
                    label="Quantity returned"
                    required
                    value={values.quantity}
                    onChangeText={(t) => setField('quantity', t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 1"
                    error={quantityError}
                    hint={quantityError ? undefined : quantityHint}
                    editable={!submitting}
                />
                <CustomTextField
                    label="Justification"
                    required
                    value={values.justification}
                    onChangeText={(t) => setField('justification', t)}
                    placeholder="e.g. Customer returned an unopened pack"
                    multiline
                    numberOfLines={3}
                    error={errors.justification}
                    editable={!submitting}
                />
            </FormSection>
        </AdminFormSheet>
    );
}
