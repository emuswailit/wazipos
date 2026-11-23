// components/wholesalers/newWholesaleOrder/WholesaleItemRowItem.tsx

import {
    useFocusClear,
    WholesaleInventoryPicker,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import type { WholesalerReceipt } from '@/databases/types';
import { AmountField, money, PosCard, QtyStepper, Segmented, ValueTile } from '@/components/ui/pos';
import { ScanLine, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;
import { type SaleUnit, partLabel, plural, sellsInParts, stockLabel, totalParts } from '@/utils/parts';
import type { WholesaleItemRow } from './useWholesaleOrderForm';

interface WholesaleItemRowItemProps {
    row: WholesaleItemRow;
    index: number;
    onUpdateRow: (
        id: string,
        updatedFields: Partial<WholesaleItemRow>
    ) => void;
    onRemoveRow: (id: string) => void;
    onScanTrigger: () => void;
}

export default function WholesaleItemRowItem({
    row,
    index,
    onUpdateRow,
    onRemoveRow,
    onScanTrigger,
}: WholesaleItemRowItemProps) {
    const { theme } = useAuth();

    /* -------- Derived -------- */
    const qty = Number(row.purchased_quantity) || 0;
    const price = Number(row.item_price) || 0;
    const total = Number(row.item_price_total) || 0;
    const stock = Number(row.available);

    /* -------- Focus-clear -------- */
    const qtyFocus = useFocusClear({
        value: String(row.purchased_quantity ?? ''),
        setValue: (next) =>
            onUpdateRow(row.id, {
                purchased_quantity: next,
            }),
    });

    const discFocus = useFocusClear({
        value: String(row.item_price_discount ?? ''),
        setValue: (next) =>
            onUpdateRow(row.id, {
                item_price_discount: next,
            }),
    });

    /* -------- Whole units or parts (products sold in parts) -------- */
    const receipt: any = row.selectedReceipt;
    const canPart = !!receipt && sellsInParts(receipt);
    const inParts = row.sale_unit === 'PART';
    const part = canPart ? partLabel(receipt) : 'part';
    const [partsNote, setPartsNote] = React.useState<string | null>(null);

    const setSaleUnit = (unit: SaleUnit) => {
        if (!receipt) return;
        if (unit === 'PART') {
            const partPrice = Number(receipt.part_selling_price) || 0;
            if (partPrice <= 0) {
                setPartsNote(`Set a price per ${part} in Inventory first.`);
                return;
            }
            setPartsNote(null);
            onUpdateRow(row.id, { sale_unit: 'PART', item_price: partPrice, purchased_quantity: '1', item_price_discount: '0.00', available: totalParts(receipt) });
        } else {
            setPartsNote(null);
            onUpdateRow(row.id, {
                sale_unit: 'FULL',
                item_price: Number(receipt.final_unit_selling_price ?? receipt.unit_selling_price ?? 0),
                purchased_quantity: '1',
                item_price_discount: '0.00',
                available: Number(receipt.current_unit_quantity ?? 0),
            });
        }
    };

    /* -------- Stepper -------- */
    const bump = (delta: number) => {
        const next = Math.max(0, qty + delta);
        onUpdateRow(row.id, {
            purchased_quantity: String(next),
        });
    };

    /* -------- Picker -------- */
    const handleSelect = (r: WholesalerReceipt) => {
        const resolvedId = String(
            (r as any).remote_id ||
            (r as any).remote_key ||
            (r as any).id ||
            ''
        );

        if (!resolvedId) {
            console.warn(
                '[WholesaleItemRowItem] picked receipt has no id',
                r
            );
        }

        setPartsNote(null);
        onUpdateRow(row.id, {
            selectedReceipt: r,
            sale_unit: 'FULL',
            wholesaler_receipt_id: resolvedId,
            item_price: Number(
                r.final_unit_selling_price ??
                r.unit_selling_price ??
                0
            ),
            available: Number(
                r.current_unit_quantity ?? 0
            ),
        });
    };

    const handleClear = () => {
        onUpdateRow(row.id, {
            selectedReceipt: null,
            sale_unit: 'FULL',
            wholesaler_receipt_id: undefined,
            item_price: 0,
            available: undefined,
        });
    };

    const stockTone = !Number.isFinite(stock) ? 'muted' : stock <= 0 ? 'danger' : stock <= 5 ? 'warning' : 'success';
    const overStock = Number.isFinite(stock) && qty > stock;

    return (
        <PosCard style={{ gap: 12 }}>
            {/* Number · product picker · scan · remove */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 12, color: theme.primary }}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <WholesaleInventoryPicker
                        value={row.selectedReceipt}
                        onSelect={handleSelect}
                        onClear={handleClear}
                        inStockOnly
                        filter={(r) => !!r.remote_id}
                        placeholder="Search your stock…"
                    />
                </View>
                <Pressable onPress={onScanTrigger} accessibilityRole="button" accessibilityLabel="Scan a barcode" style={{ width: 40, height: 40, marginTop: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySoft, ...pointer }}>
                    <ScanLine size={17} color={theme.primary} strokeWidth={2.3} />
                </Pressable>
                <Pressable onPress={() => onRemoveRow(row.id)} accessibilityRole="button" accessibilityLabel={`Remove item ${index + 1}`} style={{ width: 40, height: 40, marginTop: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dangerSoft, ...pointer }}>
                    <Trash2 size={16} color={theme.danger} strokeWidth={2.2} />
                </Pressable>
            </View>

            {/* Whole units or parts */}
            {canPart ? (
                <View style={{ gap: 6 }}>
                    <Segmented<SaleUnit> options={[['FULL', 'Whole units'], ['PART', `By the ${part}`]]} value={(row.sale_unit || 'FULL') as SaleUnit} onChange={setSaleUnit} />
                    <Text style={{ color: partsNote ? theme.danger : theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        {partsNote ?? `${stockLabel(receipt)}${inParts ? ` · quantity in ${plural(part, 2)}` : ''}`}
                    </Text>
                </View>
            ) : null}

            {/* Qty · price · discount · total */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
                <QtyStepper
                    label={inParts ? plural(part, 2) : 'Qty'}
                    value={qtyFocus.displayValue}
                    onChangeText={qtyFocus.onChange}
                    onFocus={qtyFocus.onFocus}
                    onBlur={qtyFocus.onBlur}
                    onStep={bump}
                    decimal={inParts}
                    danger={overStock}
                />
                <AmountField
                    label="Discount"
                    style={{ flex: 1, minWidth: 104 }}
                    value={discFocus.displayValue}
                    onChangeText={discFocus.onChange}
                    onFocus={discFocus.onFocus}
                    onBlur={() => {
                        discFocus.onBlur();
                        const v = parseFloat(row.item_price_discount) || 0;
                        onUpdateRow(row.id, { item_price_discount: v.toFixed(2) });
                    }}
                    placeholder="0.00"
                    tone={(parseFloat(row.item_price_discount) || 0) > 0 ? 'danger' : 'default'}
                />
                <View style={{ flexDirection: 'row', gap: 14, marginLeft: 'auto' }}>
                    <ValueTile label={inParts ? `Per ${part}` : 'Unit price'} value={money(price)} tone="muted" />
                    <ValueTile label="Line total" value={money(total)} strong />
                </View>
            </View>

            {row.selectedReceipt && Number.isFinite(stock) ? (
                <Text style={{ fontFamily: theme.font.medium, fontSize: 11.5, color: stockTone === 'danger' ? theme.danger : stockTone === 'warning' ? theme.warning : theme.textMuted }}>
                    {overStock ? `Only ${stock} in stock` : `${stock} ${inParts ? plural(part, 2) : 'in stock'}`}
                </Text>
            ) : null}
        </PosCard>
    );
}
