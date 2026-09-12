import React, { useMemo } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { OrderLineItem } from './types';
interface OrderLineCardProps {
    item: OrderLineItem; theme: any; allLineItems: OrderLineItem[]; qtyInputRefs: React.MutableRefObject<{ [key: string]: any }>; inventoryPool: any[]; onUpdate: (updates: Partial<OrderLineItem>) => void; onDelete: () => void;
}
export default function OrderLineCard({ item, theme, allLineItems, qtyInputRefs, inventoryPool, onUpdate, onDelete }: OrderLineCardProps) {
    const filteredProducts = useMemo(() => {
        const q = String(item?.searchQuery || "").trim().toLowerCase();
        return inventoryPool.filter(p => String(p?.title || "").toLowerCase().includes(q) || String(p?.bar_code || "").includes(q));
    }, [inventoryPool, item?.searchQuery]);
    const handleProductSelection = (product: any) => {
        const dup = allLineItems.find(l => l.selectedProduct?.key === product.key && l.id !== item.id);
        if (dup) {
            const msg = `"${product.title}" is already loaded. Switch focus to adjust quantity?`;
            const ok = () => { onDelete(); setTimeout(() => { const r = qtyInputRefs.current[dup.id]; if (r) r.focus(); }, 500); };
            const cancel = () => onUpdate({ selectedProduct: null, isDropdownOpen: true, searchQuery: '' });
            if (Platform.OS === 'web') { if (window.confirm(`Item Added ⚠️\n\n${msg}`)) ok(); else cancel(); }
            else { Alert.alert("Item Added ⚠️", msg, [{ text: "Cancel", style: "cancel", onPress: cancel }, { text: "OK", style: "default", onPress: ok }]); }
            return;
        }
        const catalogPrice = Number(product.unit_selling_price || product.price || 0);
        onUpdate({ selectedProduct: product, selectedProductTitle: String(product.title || ""), isDropdownOpen: false, searchQuery: '', price: catalogPrice, unit_selling_price: String(catalogPrice.toFixed(2)), final_unit_selling_price: String(catalogPrice.toFixed(2)) });
    };
    const displayValue = useMemo(() => item?.selectedProduct?.title || item?.selectedProductTitle || item?.searchQuery || "", [item?.selectedProduct, item?.selectedProductTitle, item?.searchQuery]);
    const selectedItemPrice = useMemo(() => Number(item?.price || item?.selectedProduct?.unit_selling_price || item?.selectedProduct?.price || 0), [item]);
    return (
        <View className="p-4 border rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs flex-col relative z-10 w-full">
            <View className="flex-row justify-between items-center mb-2.5">
                <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 12 }} className="text-slate-400 uppercase tracking-wider">Line Product Config</Text>
                <TouchableOpacity onPress={onDelete} className="p-1 rounded-lg bg-rose-500/10 active:scale-95">
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 12 }} className="text-rose-500 px-1.5">Remove</Text>
                </TouchableOpacity>
            </View>
            <View className="flex-col md:flex-row w-full items-start md:items-center justify-between relative z-20">
                <View className="w-full md:w-[54%] mb-3 md:mb-0 relative">
                    <TextInput
                        value={displayValue}
                        onChangeText={(txt) => onUpdate({ searchQuery: txt, selectedProduct: null, selectedProductTitle: '', isDropdownOpen: true })}
                        onFocus={() => onUpdate({ isDropdownOpen: true })}
                        placeholder="Type barcode or name..."
                        placeholderTextColor="#94a3b8"
                        style={{ fontFamily: theme?.font?.regular || 'System', fontSize: theme?.fontSize?.sm || 14, color: theme?.text || '#0f172a', borderColor: '#e2e8f0' }}
                        className="h-12 px-3 rounded-xl border bg-slate-50/50 dark:bg-slate-950 w-full outline-none"
                    />
                    {item?.isDropdownOpen && !item?.selectedProduct && filteredProducts.length > 0 && (
                        <View pointerEvents="auto" style={{ borderStyle: 'solid', borderWidth: 1, height: Platform.OS === 'web' ? '45vh' : 480 }} className="absolute top-14 left-0 right-0 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden z-50 elevation-5">
                            <View className="px-3 py-2 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex-row justify-between items-center"><Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 12 }} className="text-slate-400 uppercase">Select Catalog Item</Text><TouchableOpacity onPress={() => onUpdate({ isDropdownOpen: false })} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 active:scale-95"><Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 12 }} className="text-slate-600 dark:text-slate-300">Close</Text></TouchableOpacity></View>
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" className="flex-1 bg-white dark:bg-slate-900">
                                {filteredProducts.map((p) => {
                                    const baseRate = Number(p.unit_selling_price || p.price || 0);
                                    return (
                                        <TouchableOpacity key={p.key || p.id} onPress={() => handleProductSelection(p)} className="p-3.5 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0 bg-white dark:bg-slate-900 active:bg-slate-50">
                                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 14, color: theme?.text || '#0f172a' }} numberOfLines={1}>{p.title}</Text>
                                            <Text style={{ fontFamily: theme?.font?.mono || 'System', fontSize: theme?.fontSize?.xs || 12 }} className="text-slate-400 mt-0.5">KES {baseRate.toFixed(2)} | Stock: {p.stock || p.available || p.current_unit_quantity || 0} U</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}
                </View>
                <View className="w-full md:w-[42%] flex-row justify-between items-center">
                    <View className="w-[42%]">
                        <TextInput
                            ref={(el) => { if (el) qtyInputRefs.current[item.id] = el; }}
                            keyboardType="numeric"
                            value={item?.quantity === 0 ? "" : String(item?.quantity || "")}
                            onChangeText={(v) => onUpdate({ quantity: Number(v) || 0 })}
                            onFocus={() => onUpdate({ quantity: 0 })}
                            placeholder="Qty"
                            placeholderTextColor="#94a3b8"
                            style={{ fontFamily: theme?.font?.mono || 'System', fontSize: theme?.fontSize?.sm || 14, color: theme?.text || '#0f172a', borderColor: '#e2e8f0' }}
                            className="h-12 px-2 rounded-xl border bg-slate-50/50 dark:bg-slate-950 text-center w-full outline-none"
                        />
                    </View>
                    <View className="w-[52%]">
                        <TextInput
                            keyboardType="numeric"
                            value={item?.discount === 0 ? "" : String(item?.discount || "")}
                            onChangeText={(v) => onUpdate({ discount: Number(v) || 0 })}
                            onFocus={() => onUpdate({ discount: 0 })}
                            placeholder="Disc"
                            placeholderTextColor="#94a3b8"
                            style={{ fontFamily: theme?.font?.mono || 'System', fontSize: theme?.fontSize?.sm || 14, color: theme?.text || '#0f172a', borderColor: '#e2e8f0' }}
                            className="h-12 px-2 rounded-xl border bg-slate-50/50 dark:bg-slate-950 text-center w-full outline-none"
                        />
                    </View>
                </View>
            </View>
            {(item?.selectedProduct || item?.selectedProductTitle) && !item?.isDropdownOpen && (
                <View className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex-row justify-between items-center">
                    <Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.xs || 12 }} className="text-slate-400">Unit Base Cost:</Text>
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 14, color: theme?.text || '#0f172a' }} className="font-bold">KES {selectedItemPrice.toFixed(2)}</Text>
                </View>
            )}
        </View>
    );
}
