// components/retailers/retailerPrescriptions/StockBatchSelect.tsx
//
// Picks one of the pharmacy's in-stock batches (retailer receipts) to quote a
// prescription item from, soonest expiry first. Looks batches up by:
//   - prescriptionItemId: the item's product, or any product of its preparation
//   - productId: that product
// Formik mode (default): bound to `retailer_receipt` / `required_unit_quantity`.
// Controlled mode: pass `value` + `onChange` (+ `quantity` for the price line).
// Clears itself when the product / item changes.

import { pharmacyRxClient } from '@/api/retailerPrescriptionsApi';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useFormikContext } from 'formik';
import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface StockBatch {
    id: string;
    batch?: string | null;
    expiry_date?: string | null;
    current_unit_quantity: number;
    unit_selling_price?: string | number | null;
    final_unit_selling_price?: string | number | null;
    unit_of_receipt?: string | null;
    product_title?: string | null;
    product_details?: { title?: string } | null;
}

const money = (v: unknown) => `KES ${(Number(v ?? 0) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const shortDate = (raw?: string | null) => {
    if (!raw) return 'no expiry';
    const d = new Date(String(raw).replace(' ', 'T'));
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

export const unitPriceOf = (b: StockBatch) => {
    const final = Number(b.final_unit_selling_price);
    return Number.isFinite(final) && final > 0 ? final : Number(b.unit_selling_price ?? 0) || 0;
};

const productNameOf = (b: StockBatch) => b.product_title || b.product_details?.title || '';

export function StockBatchSelect({
    productId,
    prescriptionItemId,
    disabled,
    onBatchesChange,
    value,
    onChange,
    quantity,
    showProduct,
}: {
    productId?: string | null;
    prescriptionItemId?: string | null;
    disabled?: boolean;
    /** Reports the loaded batches so the form can check quantity against stock. */
    onBatchesChange?: (batches: StockBatch[]) => void;
    /** Controlled mode. */
    value?: string;
    onChange?: (id: string) => void;
    quantity?: number;
    /** Show the product name in each option (useful for preparation-only items). */
    showProduct?: boolean;
}) {
    const formik = useFormikContext<{ retailer_receipt: string; required_unit_quantity: string }>();
    const controlled = typeof onChange === 'function';
    const selectedId = controlled ? value ?? '' : formik?.values?.retailer_receipt ?? '';
    const setSelected = (id: string) => (controlled ? onChange!(id) : formik?.setFieldValue('retailer_receipt', id));

    const lookupKey = prescriptionItemId ? `item:${prescriptionItemId}` : productId ? `product:${productId}` : null;
    const [batches, setBatches] = useState<StockBatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastKey = useRef<string | null>(null);

    useEffect(() => {
        if (lastKey.current !== null && lastKey.current !== lookupKey && selectedId) setSelected('');
        lastKey.current = lookupKey;

        if (!lookupKey) {
            setBatches([]);
            onBatchesChange?.([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        pharmacyRxClient
            .post({
                action: 'GetRelatedEntityInventoryForProduct',
                ...(prescriptionItemId ? { prescription_item_id: prescriptionItemId } : { product_id: productId }),
            })
            .then((res) => {
                if (cancelled) return;
                const list: StockBatch[] = Array.isArray(res.data?.results) ? res.data.results : Array.isArray(res.data) ? res.data : [];
                const clean = list.filter((b) => b && b.id).map((b) => ({ ...b, id: String(b.id), current_unit_quantity: Number(b.current_unit_quantity) || 0 }));
                setBatches(clean);
                onBatchesChange?.(clean);
                if (!res.ok) setError("Couldn't load your stock for this medicine.");
            })
            .catch(() => !cancelled && setError("Couldn't load your stock for this medicine."))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lookupKey]);

    const options = useMemo(
        () =>
            batches.map((b) => ({
                value: b.id,
                label: [
                    showProduct && productNameOf(b) ? productNameOf(b) : '',
                    b.batch ? `Batch ${b.batch}` : 'No batch',
                    `exp ${shortDate(b.expiry_date)}`,
                    `${b.current_unit_quantity.toLocaleString()} in stock`,
                    money(unitPriceOf(b)),
                ]
                    .filter(Boolean)
                    .join(' · '),
            })),
        [batches, showProduct]
    );

    const selected = batches.find((b) => b.id === selectedId) ?? null;
    const qty = quantity ?? (parseInt(formik?.values?.required_unit_quantity || '0', 10) || 0);

    const helper = !lookupKey
        ? 'Select a product first.'
        : loading
            ? 'Loading your stock…'
            : error
                ? error
                : batches.length === 0
                    ? 'You have no stock of this medicine.'
                    : selected
                        ? qty > 0
                            ? `Quotes ${qty} × ${money(unitPriceOf(selected))} = ${money(qty * unitPriceOf(selected))}.`
                            : 'Enter a quantity to quote it.'
                        : 'Optional. Pick a batch to quote this medicine.';

    const common = {
        label: 'Your stock batch',
        options,
        placeholder: !lookupKey ? 'Select a product first' : loading ? 'Loading stock…' : batches.length ? 'Choose a batch…' : 'No stock available',
        helperText: helper,
        disabled: disabled || !lookupKey || loading || batches.length === 0,
    };

    return controlled ? <SelectDropdown {...common} value={selectedId} onChange={setSelected} /> : <SelectDropdown {...common} name="retailer_receipt" />;
}

