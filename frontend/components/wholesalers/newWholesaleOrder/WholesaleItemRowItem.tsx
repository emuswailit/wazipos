// components/wholesalers/newWholesaleOrder/WholesaleItemRowItem.tsx

import {
    useFocusClear,
    WholesaleInventoryPicker,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import type { WholesalerReceipt } from '@/databases/types';
import React from 'react';
import {
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
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
    const isDark = (theme as any).isDarkMode;

    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const inputBg = isDark ? '#0f172a' : '#f1f5f9';
    const subBg = isDark ? '#0f172a' : '#f8fafc';

    /* -------- Derived -------- */
    const qty = Number(row.purchased_quantity) || 0;
    const price = Number(row.item_price) || 0;
    const disc = Number(row.item_price_discount) || 0;
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

        onUpdateRow(row.id, {
            selectedReceipt: r,
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
            wholesaler_receipt_id: undefined,
            item_price: 0,
            available: undefined,
        });
    };

    return (
        <View
            className="rounded-xl border mb-2"
            style={{ borderColor, backgroundColor: theme.panel }}
        >
            {/* =============================================
             * Row 1: index + picker + scan + remove
             * ============================================= */}
            <View className="flex-row items-start px-3 pt-2.5 pb-2 gap-2">
                <Text
                    className="text-[10px] font-bold uppercase tracking-widest mt-3"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                    }}
                >
                    #{index + 1}
                </Text>

                <View className="flex-1">
                    <WholesaleInventoryPicker
                        value={row.selectedReceipt}
                        onSelect={handleSelect}
                        onClear={handleClear}
                        inStockOnly
                        filter={(r) => !!r.remote_id}
                        placeholder="Click to browse or type to filter…"
                    />
                </View>

                <TouchableOpacity
                    onPress={onScanTrigger}
                    activeOpacity={0.6}
                    className="mt-0.5 rounded-lg items-center justify-center"
                    style={{
                        width: 34,
                        height: 34,
                        backgroundColor: `${theme.primary}15`,
                        borderWidth: 1,
                        borderColor: `${theme.primary}40`,
                    }}
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontSize: 14,
                        }}
                    >
                        📷
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => onRemoveRow(row.id)}
                    activeOpacity={0.6}
                    className="mt-0.5 px-1.5 py-1 rounded-md"
                >
                    <Text
                        style={{ color: '#ef4444', fontSize: 14 }}
                    >
                        🗑
                    </Text>
                </TouchableOpacity>
            </View>

            {/* =============================================
             * Row 2a: qty | price | disc
             * ============================================= */}
            <View
                className="px-3 pb-2 flex-col gap-2"
            >
                <View
                    className="flex-row items-stretch gap-2"
                    style={{ width: '100%' }}
                >
                    {/* Quantity stepper */}
                    <View
                        className="flex-row items-center rounded-lg border overflow-hidden h-[34px]"
                        style={{
                            borderColor,
                            flexGrow: 1,
                            flexShrink: 0,
                            flexBasis: 0,
                            minWidth: 96,
                        }}
                    >
                        <TouchableOpacity
                            onPress={() => bump(-1)}
                            hitSlop={4}
                            className="items-center justify-center"
                            style={{
                                width: 30,
                                height: '100%',
                                backgroundColor: subBg,
                                flexShrink: 0,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontSize: 15,
                                }}
                            >
                                −
                            </Text>
                        </TouchableOpacity>

                        <TextInput
                            value={qtyFocus.displayValue}
                            onChangeText={qtyFocus.onChange}
                            onFocus={qtyFocus.onFocus}
                            onBlur={qtyFocus.onBlur}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#94a3b8"
                            className="flex-1 h-full"
                            style={{
                                color: theme.text,
                                fontFamily:
                                    theme.font.bold,
                                fontSize: 13,
                                backgroundColor: inputBg,
                                textAlign: 'center',
                                paddingVertical: 0,
                                paddingHorizontal: 0,
                                minWidth: 32,
                                ...(Platform.OS === 'web'
                                    ? ({
                                        outlineStyle:
                                            'none',
                                        textAlign: 'center',
                                        lineHeight: 32,
                                    } as any)
                                    : {
                                        textAlignVertical:
                                            'center',
                                    }),
                            }}
                        />

                        <TouchableOpacity
                            onPress={() => bump(1)}
                            hitSlop={4}
                            className="items-center justify-center"
                            style={{
                                width: 30,
                                height: '100%',
                                backgroundColor: subBg,
                                flexShrink: 0,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontSize: 15,
                                }}
                            >
                                +
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Unit price */}
                    <View
                        className="flex-row items-center justify-center rounded-lg border px-2 h-[34px]"
                        style={{
                            borderColor,
                            backgroundColor: inputBg,
                            flexGrow: 1,
                            flexShrink: 0,
                            flexBasis: 0,
                            minWidth: 88,
                        }}
                    >
                        <Text
                            className="text-[10px] mr-1"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            KES
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 12,
                            }}
                        >
                            {price.toFixed(2)}
                        </Text>
                    </View>

                    {/* Discount */}
                    <View
                        className="flex-row items-center justify-center rounded-lg border px-2 h-[34px]"
                        style={{
                            borderColor,
                            backgroundColor: inputBg,
                            flexGrow: 1,
                            flexShrink: 0,
                            flexBasis: 0,
                            minWidth: 88,
                        }}
                    >
                        <Text
                            className="text-[10px] mr-1"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Disc
                        </Text>
                        <TextInput
                            value={discFocus.displayValue}
                            onChangeText={discFocus.onChange}
                            onFocus={discFocus.onFocus}
                            onBlur={() => {
                                discFocus.onBlur();
                                const v =
                                    parseFloat(
                                        row.item_price_discount
                                    ) || 0;
                                onUpdateRow(row.id, {
                                    item_price_discount:
                                        v.toFixed(2),
                                });
                            }}
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            className="flex-1"
                            style={{
                                color: theme.text,
                                fontFamily:
                                    theme.font.bold,
                                fontSize: 12,
                                minWidth: 36,
                                textAlign: 'right',
                                paddingVertical: 0,
                                ...(Platform.OS === 'web'
                                    ? ({
                                        outlineStyle:
                                            'none',
                                    } as any)
                                    : null),
                            }}
                        />
                    </View>
                </View>

                {/* =============================================
                 * Row 2b: stock + total
                 * ============================================= */}
                <View className="flex-row items-center justify-between gap-2">
                    {Number.isFinite(stock) ? (
                        <View
                            className="flex-row items-center rounded-lg px-2 h-[34px]"
                            style={{
                                backgroundColor:
                                    stock <= 0
                                        ? 'rgba(239,68,68,0.12)'
                                        : stock <= 5
                                            ? 'rgba(251,191,36,0.15)'
                                            : 'rgba(16,185,129,0.12)',
                            }}
                        >
                            <Text
                                className="text-[10px] mr-1"
                                style={{
                                    color:
                                        stock <= 0
                                            ? '#ef4444'
                                            : stock <= 5
                                                ? '#f59e0b'
                                                : '#10b981',
                                    fontFamily:
                                        theme.font.bold,
                                }}
                            >
                                Stock
                            </Text>
                            <Text
                                style={{
                                    color:
                                        stock <= 0
                                            ? '#ef4444'
                                            : stock <= 5
                                                ? '#f59e0b'
                                                : '#10b981',
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                {stock}
                            </Text>
                        </View>
                    ) : (
                        <View />
                    )}

                    <View
                        className="flex-row items-center rounded-lg px-2.5 h-[34px]"
                        style={{
                            backgroundColor:
                                'rgba(16,185,129,0.12)',
                            borderWidth: 1,
                            borderColor:
                                'rgba(16,185,129,0.35)',
                        }}
                    >
                        <Text
                            className="text-[10px] mr-1"
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                            }}
                        >
                            KES
                        </Text>
                        <Text
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 13,
                            }}
                        >
                            {total.toFixed(2)}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
}