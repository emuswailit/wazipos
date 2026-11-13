// components/retailers/stockAdjustments/StockAdjustmentFormModal.tsx
//
// Create / edit a stock adjustment (shared list-screen form kit).
//
// - Retailer receipt → RetailerInventoryPicker.
// - Direction         → increase / decrease.
// - Quantity          → whole number, capped when decreasing by the
//                       receipt's current_unit_quantity.
// - Reason            → return intent (defaults to NONE).
// - Justification     → required free text.

import { RetailerInventoryPicker } from '@/components/common/RetailerInventoryPicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, ChoiceChips, FormSection, type ChoiceOption } from '@/components/common/listScreen';
import type { RetailerReceipt } from '@/databases/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { StockAdjustment, StockAdjustmentDirection, StockAdjustmentReturnIntent } from './StockAdjustmentsList';

/* =========================================================
 * Options
 * ======================================================= */

const DIRECTION_OPTIONS: ChoiceOption<StockAdjustmentDirection>[] = [
    { value: 'INCREMENT', label: 'Increase stock', icon: 'arrow-up-circle-outline', color: '#10b981' },
    { value: 'DECREMENT', label: 'Decrease stock', icon: 'arrow-down-circle-outline', color: '#f43f5e' },
];

const RETURN_INTENT_OPTIONS: ChoiceOption<StockAdjustmentReturnIntent>[] = [
    { value: 'NONE', label: 'None' },
    { value: 'WHOLESALER_RETURN', label: 'Wholesaler return' },
    { value: 'CUSTOMER_RETURN', label: 'Customer return' },
    { value: 'EXPIRY_WRITE_OFF', label: 'Expiry write-off' },
    { value: 'DAMAGE_WRITE_OFF', label: 'Damage write-off' },
    { value: 'INTERNAL_CORRECTION', label: 'Internal correction' },
];

/* =========================================================
 * Props
 * ======================================================= */

interface StockAdjustmentFormModalProps {
    visible: boolean;
    title: string;
    subtitle?: string;
    submitLabel?: string;
    submitting?: boolean;
    initial: StockAdjustment | null;
    onClose: () => void;
    onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

/* =========================================================
 * Component
 * ======================================================= */

export function StockAdjustmentFormModal({
    visible,
    title,
    subtitle,
    submitLabel = 'Save',
    submitting = false,
    initial,
    onClose,
    onSubmit,
}: StockAdjustmentFormModalProps) {
    // Full record so we can read current_unit_quantity for the decrease cap.
    const [selectedReceipt, setSelectedReceipt] = useState<RetailerReceipt | null>(null);

    const initialValues = useMemo<Record<string, string>>(
        () => ({
            retailer_receipt: initial?.retailer_receipt ?? '',
            retailer_receipt_title: initial?.retailer_receipt_title ?? '',
            quantity: initial?.quantity != null ? String(initial.quantity) : '',
            direction: initial?.direction ?? 'INCREMENT',
            return_intent: initial?.return_intent ?? 'NONE',
            justification: initial?.justification ?? '',
        }),
        [initial]
    );

    const [values, setValues] = useState<Record<string, string>>(initialValues);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!visible) return;
        setValues(initialValues);
        setErrors({});
        setSelectedReceipt(
            initial?.retailer_receipt ? ({ remote_id: initial.retailer_receipt, title: initial.retailer_receipt_title ?? '' } as RetailerReceipt) : null
        );
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

    const handleReceiptSelect = useCallback(
        (r: RetailerReceipt) => {
            setSelectedReceipt(r);
            setField('retailer_receipt', String(r.remote_id ?? ''));
            setValues((prev) => ({ ...prev, retailer_receipt_title: String(r.title ?? '') }));
        },
        [setField]
    );

    const handleReceiptClear = useCallback(() => {
        setSelectedReceipt(null);
        setValues((prev) => ({ ...prev, retailer_receipt: '', retailer_receipt_title: '' }));
    }, []);

    /* -------- Max decrementable -------- */
    const maxDecrementable = useMemo<number | null>(() => {
        if (values.direction !== 'DECREMENT' || !selectedReceipt) return null;
        const n = Number((selectedReceipt as any).current_unit_quantity);
        return Number.isFinite(n) ? Math.max(0, n) : null;
    }, [values.direction, selectedReceipt]);

    const liveQuantityError = useMemo<string | null>(() => {
        const raw = values.quantity?.trim();
        if (!raw || maxDecrementable == null) return null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n > maxDecrementable ? `Only ${maxDecrementable} unit(s) available to decrease` : null;
    }, [values.quantity, maxDecrementable]);

    const quantityError = errors.quantity ?? liveQuantityError ?? undefined;

    /* -------- Validation -------- */
    const validate = useCallback((): boolean => {
        const next: Record<string, string> = {};
        if (!values.retailer_receipt?.trim()) next.retailer_receipt = 'Pick the stock item to adjust';
        if (!values.direction?.trim()) next.direction = 'Choose increase or decrease';
        if (!values.quantity?.trim()) {
            next.quantity = 'Enter the quantity';
        } else {
            const n = Number(values.quantity);
            if (!Number.isFinite(n) || n <= 0) next.quantity = 'Enter a quantity above 0';
            else if (maxDecrementable != null && n > maxDecrementable) next.quantity = `Only ${maxDecrementable} unit(s) available to decrease`;
        }
        if (!values.justification?.trim()) next.justification = 'Explain why stock is being adjusted';
        setErrors(next);
        return Object.keys(next).length === 0;
    }, [values, maxDecrementable]);

    const handleSubmit = useCallback(async () => {
        if (liveQuantityError || !validate()) return;
        await onSubmit(values);
    }, [liveQuantityError, validate, onSubmit, values]);

    const quantityHint = maxDecrementable != null ? `Up to ${maxDecrementable} unit(s) can be removed from this item.` : undefined;

    return (
        <AdminFormSheet
            visible={visible}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            icon="swap-vertical-outline"
            submitLabel={submitLabel}
            submitting={submitting}
            onSubmit={handleSubmit}
        >
            <FormSection title="Stock item" zIndex={50}>
                <View style={{ zIndex: 200 }}>
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

            <FormSection title="Adjustment">
                <ChoiceChips
                    label="Direction"
                    required
                    options={DIRECTION_OPTIONS}
                    value={values.direction as StockAdjustmentDirection}
                    onChange={(v) => setField('direction', v)}
                    error={errors.direction}
                    disabled={submitting}
                />
                <CustomTextField
                    label="Quantity"
                    required
                    value={values.quantity}
                    onChangeText={(t) => setField('quantity', t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 5"
                    error={quantityError}
                    hint={quantityError ? undefined : quantityHint}
                    editable={!submitting}
                />
            </FormSection>

            <FormSection title="Reason">
                <ChoiceChips
                    label="Return intent"
                    options={RETURN_INTENT_OPTIONS}
                    value={values.return_intent as StockAdjustmentReturnIntent}
                    onChange={(v) => setField('return_intent', v)}
                    disabled={submitting}
                    hint={
                        values.return_intent === 'WHOLESALER_RETURN'
                            ? values.direction === 'DECREMENT'
                                ? 'This sends the stock back to the wholesaler — track it under Purchases returns.'
                                : 'Wholesaler returns take stock out: choose “Decrease stock” above.'
                            : undefined
                    }
                />
                <CustomTextField
                    label="Justification"
                    required
                    value={values.justification}
                    onChangeText={(t) => setField('justification', t)}
                    placeholder="e.g. Counted 3 extra packs during stock take"
                    multiline
                    numberOfLines={3}
                    error={errors.justification}
                    editable={!submitting}
                />
            </FormSection>
        </AdminFormSheet>
    );
}
