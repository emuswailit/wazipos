// components/retailers/retailerPrescriptions/QuoteItemSheet.tsx
//
// Pharmacy staff quote one prescription item from their own stock: choose a
// batch (matching the item's product, or any product of its preparation) and the
// quantity. Items that don't allow partial purchase are quoted for the full
// prescribed quantity. Lines go on the pharmacy's own quotation order.

import { pharmacyRxClient } from '@/api/retailerPrescriptionsApi';
import { AdminFormSheet, FormSection, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { allowsPartial, itemTitle, kes, type QuoteLine } from './prescriptionsConfig';
import { StockBatchSelect, unitPriceOf, type StockBatch } from './StockBatchSelect';

interface Props {
    visible: boolean;
    item: any | null;
    /** This pharmacy's current quote line for the item, if any. */
    line: QuoteLine | null;
    onClose: () => void;
    onSaved: () => void;
}

export function QuoteItemSheet({ visible, item, line, onClose, onSaved }: Props) {
    const { theme, chipBg } = useListTokens();
    const [receipt, setReceipt] = useState('');
    const [qtyText, setQtyText] = useState('');
    const [batches, setBatches] = useState<StockBatch[]>([]);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const required = Number(item?.required_unit_quantity) || 0;
    const partial = allowsPartial(item);
    const fixedQty = !partial && required > 0;

    useEffect(() => {
        if (!visible) return;
        setReceipt('');
        setError(null);
        setQtyText(String(line?.quantity || required || ''));
    }, [visible, item?.id, line?.id, line?.quantity, required]);

    const qty = fixedQty ? required : parseInt(qtyText || '0', 10) || 0;
    const batch = useMemo(() => batches.find((b) => b.id === receipt) ?? null, [batches, receipt]);

    const save = async () => {
        if (!item) return;
        if (!receipt) return setError('Choose one of your stock batches.');
        if (qty < 1) return setError('Enter the quantity you can supply.');
        if (required && qty > required) return setError(`You can't quote more than the prescribed ${required}.`);
        if (batch && qty > batch.current_unit_quantity) return setError(`Only ${batch.current_unit_quantity} in stock for this batch.`);
        setSaving(true);
        setError(null);
        try {
            const res = await pharmacyRxClient.post({
                action: 'UpdateRetailPrescriptionItem',
                prescription_item_id: String(item.id),
                retailer_receipt: receipt,
                quote_quantity: qty,
            });
            if (res.ok && res.data?.response_code === 0) {
                onSaved();
                onClose();
            } else {
                const detail = Array.isArray(res.data?.errors) ? res.data.errors.join(' ') : '';
                setError([res.data?.response_message || "Couldn't save the quote.", detail].filter(Boolean).join(' '));
            }
        } catch {
            setError("Couldn't reach the server. Check your connection.");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!item) return;
        setRemoving(true);
        setError(null);
        try {
            const res = await pharmacyRxClient.post({ action: 'RemovePrescriptionQuoteLine', prescription_item_id: String(item.id) });
            if (res.ok && res.data?.response_code === 0) {
                onSaved();
                onClose();
            } else {
                setError(res.data?.response_message || "Couldn't remove the quote.");
            }
        } catch {
            setError("Couldn't reach the server. Check your connection.");
        } finally {
            setRemoving(false);
        }
    };

    return (
        <AdminFormSheet
            visible={visible}
            onClose={saving || removing ? () => { } : onClose}
            title={line ? 'Edit your quote' : 'Quote this medicine'}
            subtitle={item ? itemTitle(item) : null}
            icon="pricetag-outline"
            submitLabel={line ? 'Update quote' : 'Add to quotation'}
            submitting={saving}
            onSubmit={save}
            error={error}
            width={560}
        >
            <View style={{ borderRadius: 16, padding: 12, gap: 2, backgroundColor: chipBg }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{item ? itemTitle(item) : ''}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    {required ? `Prescribed: ${required}` : 'Prescribed quantity not set'} ·{' '}
                    {partial ? 'partial purchase allowed' : 'must be bought in full'}
                </Text>
                {line ? (
                    <Text style={{ color: '#059669', fontFamily: theme.font.bold, fontSize: 12.5, marginTop: 4 }}>
                        Currently quoted: {line.quantity} × {kes(line.unit_price)} = {kes(line.total)}
                    </Text>
                ) : null}
            </View>

            <FormSection title="Your stock" zIndex={20}>
                <StockBatchSelect
                    prescriptionItemId={item ? String(item.id) : null}
                    value={receipt}
                    onChange={setReceipt}
                    quantity={qty}
                    onBatchesChange={setBatches}
                    showProduct={!item?.product}
                    disabled={saving}
                />
            </FormSection>

            <FormSection title="Quantity">
                {fixedQty ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        This medicine can't be bought partially, so you quote the full {required}.
                    </Text>
                ) : (
                    <CustomTextField
                        label="Quantity you can supply"
                        value={qtyText}
                        onChangeText={(t) => setQtyText(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder={required ? String(required) : 'e.g. 14'}
                        hint={required ? `Up to ${required}.` : undefined}
                        editable={!saving}
                    />
                )}
                {batch && qty > 0 ? (
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                        Quote total: {kes(qty * unitPriceOf(batch))}
                    </Text>
                ) : null}
            </FormSection>

            {line ? <SheetButton label="Remove from my quotation" variant="danger" icon="trash-outline" onPress={remove} loading={removing} loadingLabel="Removing…" /> : null}
        </AdminFormSheet>
    );
}

