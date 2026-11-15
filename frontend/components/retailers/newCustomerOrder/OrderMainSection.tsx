// components/retailers/newCustomerOrder/OrderMainSection.tsx

import { RetailerReceipt } from '@/databases/types';
import { SaleUnit, partLabel, plural, sellsInParts, stockLabel, totalParts } from '@/utils/parts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface OrderMainSectionProps {
    theme: any; lineItems: any[]; retailerReceipts: RetailerReceipt[]; isBlankRowPresent: boolean;
    handleUpdateRow: (id: string, updates: any) => void; handleDeleteRow: (id: string) => void;
    handleSelectProduct: (rowId: string, prod: any) => void; handleAddRow: () => void;
    /** Whole units or parts (tots, kg, pieces) for a line — products sold in parts only. */
    handleSetSaleUnit?: (rowId: string, unit: SaleUnit) => void;
    setIsScannerOpen: (open: boolean) => void; totals: any;
    onRowLayout?: (id: string, y: number) => void; onSearchFocused?: (rowId: string) => void;
}

export const OrderMainSection = (props: OrderMainSectionProps) => {
    const { theme, lineItems, isBlankRowPresent, handleAddRow, setIsScannerOpen, onRowLayout } = props;
    const [, setActiveDropdownId] = useState<string | null>(null);

    useEffect(() => {
        const openItem = lineItems.find((item: any) => item.isDropdownOpen);
        setActiveDropdownId(openItem ? openItem.id : null);
    }, [lineItems]);

    return (
        <View className="w-full">
            <View style={{ zIndex: 40 }} className="space-y-2 w-full">
                {lineItems.map((item: any, index: number) => (
                    <View key={item.id} style={{ zIndex: item.isDropdownOpen ? 100 : 1 }} onLayout={(e) => {
                        const y = e.nativeEvent.layout.y;
                        if (onRowLayout) onRowLayout(item.id, y);
                    }}>
                        <LineItemRow {...props} item={item} index={index} />
                    </View>
                ))}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, zIndex: 1 }} className="w-full">
                    <TouchableOpacity disabled={isBlankRowPresent} onPress={handleAddRow} style={{ minHeight: 40, borderColor: isBlankRowPresent ? '#cbd5e1' : theme.primary, marginRight: 8 }} className={`flex-1 border border-dashed rounded-xl items-center justify-center ${isBlankRowPresent ? 'opacity-40 bg-slate-100/50' : 'bg-transparent border-primary'}`}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: isBlankRowPresent ? theme.textDark : theme.primary }}>+ Add Product</Text>
                    </TouchableOpacity>

                    {Platform.OS !== 'web' && (
                        <TouchableOpacity onPress={() => setIsScannerOpen(true)} style={{ minHeight: 40, backgroundColor: theme.primary, marginLeft: 4 }} className="flex-1 rounded-xl lg:hidden items-center justify-center">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white">📷 Scan</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

// =====================================================================
// 🟢 LineItemRow - Fixed Overlaps
// =====================================================================
const LineItemRow: React.FC<OrderMainSectionProps & { item: any; index: number }> = ({
    item, index, theme, retailerReceipts, handleUpdateRow, handleDeleteRow, handleSelectProduct, handleSetSaleUnit, onSearchFocused
}) => {
    const qtyRef = useRef<TextInput>(null);
    const searchRef = useRef<View>(null);
    const [maxHeight, setMaxHeight] = useState(320);
    const [dropTop, setDropTop] = useState(40);

    const onUpdate = (updates: any) => handleUpdateRow(item.id, updates);

    // Sold in parts: this line's receipt, and whether it's selling whole units or parts.
    const receipt: any = useMemo(
        () => (item.selectedProduct ? retailerReceipts?.find((r: any) => String(r.remote_id ?? r.remote_key ?? '') === String(item.selectedProduct)) : null),
        [item.selectedProduct, retailerReceipts]
    );
    const canPart = !!receipt && sellsInParts(receipt);
    const inParts = item.saleUnit === 'PART';
    const part = canPart ? partLabel(receipt) : 'part';
    const inStock = receipt ? (inParts ? totalParts(receipt) : Number(receipt.current_unit_quantity) || 0) : null;
    const overStock = inStock !== null && Number(item.quantity) > inStock;

    // Quantity text (parts can be decimals, e.g. 2.5 kg — keep what's typed).
    const [qtyText, setQtyText] = useState(String(item.quantity));
    useEffect(() => {
        setQtyText((prev) => (Number(prev) === Number(item.quantity) ? prev : String(item.quantity)));
    }, [item.quantity]);
    const onQty = (t: string) => {
        const clean = inParts ? t.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') : t.replace(/[^0-9]/g, '');
        setQtyText(clean);
        onUpdate({ quantity: clean === '' ? 0 : (inParts ? parseFloat(clean) : parseInt(clean, 10)) || 0 });
    };

    const filtered = useMemo(() => {
        const q = (item.searchQuery || '').trim().toLowerCase();
        if (!retailerReceipts?.length) return [];
        if (!q) return retailerReceipts.slice(0, 8);
        return retailerReceipts.filter((p) => String(p.title || p.long_title || '').toLowerCase().includes(q)).slice(0, 8);
    }, [item.searchQuery, retailerReceipts]);

    const calcSpace = useCallback(() => {
        if (!searchRef.current) return;
        searchRef.current.measureInWindow((_x, y, _w, h) => {
            if (!h) return;
            setMaxHeight(Math.max(180, Math.min(500, Dimensions.get('window').height - y - h - 35)));
            setDropTop(h + 2);
        });
    }, []);

    useEffect(() => {
        if (item.isDropdownOpen) { const raf = requestAnimationFrame(calcSpace); return () => cancelAnimationFrame(raf); }
    }, [item.isDropdownOpen, calcSpace]);

    return (
        // 🟢 Increased gap to lg:gap-4 to ensure space between elements on desktop
        <View style={{ zIndex: item.isDropdownOpen ? 999 : 1 }} className="p-3 mb-2 rounded-xl bg-white border border-slate-200 shadow-sm flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 relative">

            {/* 1. Line Label + Remove */}
            <View className="flex-row lg:flex-col justify-between lg:justify-center items-center lg:items-start w-full lg:w-auto lg:min-w-[70px]">
                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Line #{index + 1}</Text>
                <TouchableOpacity onPress={() => handleDeleteRow(item.id)} className="lg:mt-1">
                    <Text className="text-[10px] text-rose-500 font-bold">Remove</Text>
                </TouchableOpacity>
            </View>

            {/* 2. Search + Dropdown */}
            {/* 🟢 Added min-w-0 to prevent the flex container from overflowing its boundaries */}
            <View ref={searchRef} className="w-full lg:flex-1 min-w-0 relative" style={{ zIndex: 100 }} onLayout={calcSpace}>
                <TextInput
                    placeholder="Search product..."
                    value={item.searchQuery}
                    onChangeText={(t) => onUpdate({ searchQuery: t, isDropdownOpen: true })}
                    onFocus={() => {
                        onUpdate({ isDropdownOpen: true });
                        if (onSearchFocused) onSearchFocused(item.id);
                    }}
                    className="w-full py-2 px-3 rounded-lg border bg-slate-50 text-sm h-[38px]"
                />

                {item.isDropdownOpen && filtered.length > 0 && (
                    <View style={{ position: 'absolute', top: dropTop, left: 0, right: 0, maxHeight, zIndex: 9999 }} className="bg-white border rounded-xl shadow-xl overflow-hidden">
                        <ScrollView nestedScrollEnabled>
                            {filtered.map((p) => (
                                <TouchableOpacity
                                    key={p.remote_id || p.remote_key}
                                    onPress={() => {
                                        handleSelectProduct(item.id, p);
                                        onUpdate({ isDropdownOpen: false });
                                    }}
                                    className="p-2 border-b hover:bg-slate-50"
                                >
                                    <Text className="text-xs font-bold">{p.title}</Text>
                                    <Text className="text-[10px] text-slate-500 mt-0.5">
                                        KES {Number(p.unit_selling_price || 0).toFixed(2)}
                                        {' • '}
                                        Available: {stockLabel(p, 'unit')}
                                        {sellsInParts(p) && Number((p as any).part_selling_price) > 0 ? ` • KES ${Number((p as any).part_selling_price).toFixed(2)} per ${partLabel(p)}` : ''}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {item.isDropdownOpen && filtered.length === 0 && (
                    <View style={{ position: 'absolute', top: dropTop, left: 0, right: 0, zIndex: 9999 }} className="bg-white border rounded-xl shadow-xl p-3 items-center">
                        <Text className="text-xs text-slate-400">
                            {retailerReceipts?.length ? 'No products match your search.' : 'No products cached.'}
                        </Text>
                    </View>
                )}
            </View>

            {/* 2b. Whole units or parts (products sold in parts) */}
            {canPart && handleSetSaleUnit ? (
                <View className="flex-row items-center gap-1.5 w-full lg:w-auto">
                    {([['FULL', 'Whole'], ['PART', `By ${part}`]] as [SaleUnit, string][]).map(([unit, label]) => {
                        const active = (item.saleUnit || 'FULL') === unit;
                        return (
                            <TouchableOpacity
                                key={unit}
                                onPress={() => handleSetSaleUnit(item.id, unit)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: active }}
                                style={{ backgroundColor: active ? theme.primary : 'transparent', borderColor: active ? theme.primary : '#cbd5e1' }}
                                className="flex-1 lg:flex-none h-[32px] px-3 rounded-full border items-center justify-center"
                            >
                                <Text style={{ fontFamily: theme.font.bold, fontSize: 11, color: active ? '#fff' : '#475569' }}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ) : null}

            {/* 3. Quantity + Discount */}
            <View className="flex-row items-center w-full lg:w-auto gap-3">
                <View className="flex-1 lg:w-[60px]">
                    <Text className="text-[10px] text-slate-500 text-center mb-0.5">{inParts ? plural(part, 2) : 'Qty'}</Text>
                    <TextInput
                        ref={qtyRef}
                        keyboardType={inParts ? 'decimal-pad' : 'numeric'}
                        value={qtyText}
                        onChangeText={onQty}
                        style={overStock ? { borderColor: '#ef4444' } : undefined}
                        className="h-[38px] border rounded-lg text-center text-sm w-full"
                    />
                </View>
                <View className="flex-1 lg:w-[70px]">
                    <Text className="text-[10px] text-slate-500 text-center mb-0.5">Discount</Text>
                    <TextInput
                        keyboardType="numeric"
                        value={String(item.discount)}
                        onChangeText={(t) => onUpdate({ discount: t === '' ? 0 : parseFloat(t) || 0 })}
                        className="h-[38px] border rounded-lg text-center text-sm w-full"
                    />
                </View>
            </View>

            {receipt && (canPart || overStock) ? (
                <Text style={{ color: overStock ? '#ef4444' : '#64748b', fontFamily: theme.font.medium, fontSize: 10 }} className="w-full lg:w-auto">
                    {overStock ? 'Only ' : 'In stock: '}{stockLabel(receipt, 'unit')}
                    {inParts ? ` · KES ${Number(item.price || 0).toFixed(2)} per ${part}` : ''}
                </Text>
            ) : null}
        </View>
    );
};