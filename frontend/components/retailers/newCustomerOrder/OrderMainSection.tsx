// components/retailers/newCustomerOrder/OrderMainSection.tsx

import { RetailerReceipt } from '@/databases/types';
import { SaleUnit, partLabel, plural, sellsInParts, stockLabel, totalParts } from '@/utils/parts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, PackageSearch, Plus, ScanLine, Search, Trash2 } from 'lucide-react-native';
import { Dimensions, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ClearInputButton from '@/components/common/ClearInputButton';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {};
const money = (n: number) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            <View style={{ zIndex: 40, gap: 10 }} className="w-full">
                {lineItems.map((item: any, index: number) => (
                    <View key={item.id} style={{ zIndex: item.isDropdownOpen ? 100 : 1 }} onLayout={(e) => {
                        const y = e.nativeEvent.layout.y;
                        if (onRowLayout) onRowLayout(item.id, y);
                    }}>
                        <LineItemRow {...props} item={item} index={index} />
                    </View>
                ))}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, zIndex: 1 }} className="w-full">
                    <TouchableOpacity
                        disabled={isBlankRowPresent}
                        onPress={handleAddRow}
                        style={{
                            flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
                            borderColor: isBlankRowPresent ? theme.border : theme.primary,
                            backgroundColor: isBlankRowPresent ? 'transparent' : theme.primarySoft,
                            opacity: isBlankRowPresent ? 0.5 : 1,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    >
                        <Plus size={16} color={isBlankRowPresent ? theme.textMuted : theme.primary} strokeWidth={2.5} />
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: isBlankRowPresent ? theme.textMuted : theme.primary }}>
                            {isBlankRowPresent ? 'Pick a product above first' : 'Add product'}
                        </Text>
                    </TouchableOpacity>

                    {Platform.OS !== 'web' && (
                        <TouchableOpacity
                            onPress={() => setIsScannerOpen(true)}
                            style={{ minHeight: 46, paddingHorizontal: 18, borderRadius: 14, backgroundColor: theme.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            className="lg:hidden"
                        >
                            <ScanLine size={16} color="#fff" strokeWidth={2.4} />
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: '#fff' }}>Scan</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

// =====================================================================
// LineItemRow: one product line — search, whole/part, qty stepper, discount, line total
// =====================================================================
const LineItemRow: React.FC<OrderMainSectionProps & { item: any; index: number }> = ({
    item, index, theme, retailerReceipts, handleUpdateRow, handleDeleteRow, handleSelectProduct, handleSetSaleUnit, onSearchFocused
}) => {
    const qtyRef = useRef<TextInput>(null);
    const searchRef = useRef<View>(null);
    const [maxHeight, setMaxHeight] = useState(320);
    const [dropTop, setDropTop] = useState(40);
    const [focused, setFocused] = useState(false);

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
    const lineTotal = Math.max(0, Number(item.price || 0) * Number(item.quantity || 0) - Number(item.discount || 0));

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
    const step = (delta: number) => {
        const next = Math.max(0, Math.round((Number(item.quantity || 0) + delta) * 100) / 100);
        onQty(String(next));
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
            setDropTop(h + 6);
        });
    }, []);

    useEffect(() => {
        if (item.isDropdownOpen) { const raf = requestAnimationFrame(calcSpace); return () => cancelAnimationFrame(raf); }
    }, [item.isDropdownOpen, calcSpace]);

    const fieldBg = theme.surfaceAlt;
    const softShadow = { shadowColor: '#0b1733', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 };

    return (
        <View
            style={{ zIndex: item.isDropdownOpen ? 999 : 1, backgroundColor: theme.panel, borderColor: item.isDropdownOpen ? theme.primary : theme.border, borderWidth: 1, borderRadius: 16, ...softShadow }}
            className="p-3 flex-col lg:flex-row lg:items-center gap-3 relative"
        >
            {/* 1. Line number + remove (remove sits on the right on phones) */}
            <View className="flex-row lg:flex-col items-center justify-between w-full lg:w-auto" style={{ gap: 6 }}>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 12, color: theme.primary }}>{index + 1}</Text>
                </View>
                <TouchableOpacity
                    onPress={() => handleDeleteRow(item.id)}
                    accessibilityLabel={`Remove line ${index + 1}`}
                    hitSlop={8}
                    style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dangerSoft }}
                    className="lg:hidden"
                >
                    <Trash2 size={14} color={theme.danger} strokeWidth={2.2} />
                </TouchableOpacity>
            </View>

            {/* 2. Search + dropdown */}
            <View ref={searchRef} className="w-full lg:flex-1 min-w-0 relative" style={{ zIndex: 100 }} onLayout={calcSpace}>
                <View
                    style={{
                        height: 44, borderRadius: 12, backgroundColor: fieldBg, borderWidth: 1.5,
                        borderColor: focused ? theme.primary : 'transparent',
                        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8,
                    }}
                >
                    <Search size={16} color={focused ? theme.primary : theme.textMuted} strokeWidth={2.2} />
                    <TextInput
                        placeholder="Search product by name…"
                        placeholderTextColor={theme.textMuted}
                        value={item.searchQuery}
                        onChangeText={(t) => onUpdate({ searchQuery: t, isDropdownOpen: true })}
                        onFocus={() => {
                            setFocused(true);
                            onUpdate({ isDropdownOpen: true });
                            if (onSearchFocused) onSearchFocused(item.id);
                        }}
                        onBlur={() => setFocused(false)}
                        style={{ flex: 1, height: '100%', fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text, ...webNoOutline }}
                    />
                    <ClearInputButton value={item.searchQuery} onClear={() => onUpdate({ searchQuery: '' })} />
                    {receipt ? (
                        <Text numberOfLines={1} style={{ fontFamily: theme.font.medium, fontSize: 11, color: theme.textMuted }}>
                            @ KES {money(item.price)}{inParts ? ` / ${part}` : ''}
                        </Text>
                    ) : null}
                </View>

                {item.isDropdownOpen && filtered.length > 0 && (
                    <View
                        style={{
                            position: 'absolute', top: dropTop, left: 0, right: 0, maxHeight, zIndex: 9999,
                            backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden',
                            shadowColor: '#0b1733', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
                        }}
                    >
                        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 6 }}>
                            {filtered.map((p) => {
                                const units = Number((p as any).current_unit_quantity) || 0;
                                const low = units <= 0;
                                return (
                                    <TouchableOpacity
                                        key={p.remote_id || p.remote_key}
                                        onPress={() => {
                                            handleSelectProduct(item.id, p);
                                            onUpdate({ isDropdownOpen: false });
                                        }}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10 }}
                                        className="hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-100"
                                    >
                                        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: theme.primary }}>
                                                {String(p.title || '?').trim().charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text numberOfLines={1} style={{ fontFamily: theme.font.semibold, fontSize: theme.fontSize.sm, color: theme.text }}>{p.title}</Text>
                                            <Text numberOfLines={1} style={{ fontFamily: theme.font.regular, fontSize: 11, color: low ? theme.danger : theme.textMuted, marginTop: 1 }}>
                                                {stockLabel(p, 'unit')} in stock
                                                {sellsInParts(p) && Number((p as any).part_selling_price) > 0 ? ` · KES ${money((p as any).part_selling_price)} per ${partLabel(p)}` : ''}
                                            </Text>
                                        </View>
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>
                                            {money(p.unit_selling_price as any)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {item.isDropdownOpen && filtered.length === 0 && (
                    <View
                        style={{
                            position: 'absolute', top: dropTop, left: 0, right: 0, zIndex: 9999,
                            backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1, borderRadius: 14,
                            padding: 16, alignItems: 'center', gap: 6,
                            shadowColor: '#0b1733', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
                        }}
                    >
                        <PackageSearch size={20} color={theme.textMuted} />
                        <Text style={{ fontFamily: theme.font.medium, fontSize: 12, color: theme.textMuted }}>
                            {retailerReceipts?.length ? 'No products match your search.' : 'No products cached yet — pull down to sync.'}
                        </Text>
                    </View>
                )}
            </View>

            {/* 2b. Whole units or parts (products sold in parts) */}
            {canPart && handleSetSaleUnit ? (
                <View style={{ flexDirection: 'row', backgroundColor: fieldBg, borderRadius: 12, padding: 3 }} className="w-full lg:w-auto">
                    {([['FULL', 'Whole'], ['PART', `By ${part}`]] as [SaleUnit, string][]).map(([unit, label]) => {
                        const active = (item.saleUnit || 'FULL') === unit;
                        return (
                            <TouchableOpacity
                                key={unit}
                                onPress={() => handleSetSaleUnit(item.id, unit)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: active }}
                                style={{
                                    height: 38, paddingHorizontal: 12, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: active ? theme.panel : 'transparent',
                                    ...(active ? softShadow : null),
                                }}
                                className="flex-1 lg:flex-none"
                            >
                                <Text style={{ fontFamily: theme.font.bold, fontSize: 12, color: active ? theme.primary : theme.textMuted }}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ) : null}

            {/* 3. Quantity stepper + discount + line total */}
            <View className="flex-row items-end w-full lg:w-auto" style={{ gap: 10 }}>
                <View>
                    <Text style={{ fontFamily: theme.font.semibold, fontSize: 10, color: theme.textMuted, marginBottom: 4, letterSpacing: 0.4 }}>
                        {(inParts ? plural(part, 2) : 'Qty').toUpperCase()}
                    </Text>
                    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5, borderColor: overStock ? theme.danger : 'transparent', padding: 3 }}>
                        <TouchableOpacity onPress={() => step(-1)} accessibilityLabel="Decrease quantity" style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel }}>
                            <Minus size={14} color={theme.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <TextInput
                            ref={qtyRef}
                            keyboardType={inParts ? 'decimal-pad' : 'numeric'}
                            value={qtyText}
                            onChangeText={onQty}
                            selectTextOnFocus
                            style={{ width: 46, textAlign: 'center', fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: overStock ? theme.danger : theme.text, ...webNoOutline }}
                        />
                        <TouchableOpacity onPress={() => step(1)} accessibilityLabel="Increase quantity" style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary }}>
                            <Plus size={14} color="#fff" strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ flex: 1, minWidth: 96 }} className="lg:flex-none lg:w-[110px]">
                    <Text style={{ fontFamily: theme.font.semibold, fontSize: 10, color: theme.textMuted, marginBottom: 4, letterSpacing: 0.4 }}>DISCOUNT</Text>
                    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: fieldBg, borderRadius: 12, paddingHorizontal: 10, gap: 4 }}>
                        <Text style={{ fontFamily: theme.font.semibold, fontSize: 11, color: theme.textMuted }}>KES</Text>
                        <TextInput
                            keyboardType="numeric"
                            value={String(item.discount)}
                            onChangeText={(t) => onUpdate({ discount: t === '' ? 0 : parseFloat(t) || 0 })}
                            selectTextOnFocus
                            style={{ flex: 1, minWidth: 0, height: '100%', textAlign: 'right', fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: Number(item.discount) > 0 ? theme.danger : theme.text, ...webNoOutline }}
                        />
                    </View>
                </View>

                <View style={{ alignItems: 'flex-end', justifyContent: 'center', height: 44, minWidth: 84 }}>
                    <Text style={{ fontFamily: theme.font.semibold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.4 }}>LINE TOTAL</Text>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: receipt ? theme.text : theme.textMuted }}>
                        {money(lineTotal)}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => handleDeleteRow(item.id)}
                    accessibilityLabel={`Remove line ${index + 1}`}
                    style={{ width: 36, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                    className="hidden lg:flex hover:bg-rose-50 dark:hover:bg-rose-950"
                >
                    <Trash2 size={16} color={theme.danger} strokeWidth={2.2} />
                </TouchableOpacity>
            </View>

            {receipt && (canPart || overStock) ? (
                <Text style={{ color: overStock ? theme.danger : theme.textMuted, fontFamily: theme.font.medium, fontSize: 11 }} className="w-full lg:w-auto">
                    {overStock ? 'Only ' : 'In stock: '}{stockLabel(receipt, 'unit')}
                    {inParts ? ` · KES ${money(item.price)} per ${part}` : ''}
                </Text>
            ) : null}
        </View>
    );
};
