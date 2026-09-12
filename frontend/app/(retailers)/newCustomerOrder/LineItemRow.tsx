import { CachedReceipt } from '@/databases/types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { OrderLineItem } from './types';

interface LineItemRowProps {
    item: OrderLineItem;
    index: number;
    retailerReceipts: CachedReceipt[];
    showDelete: boolean;
    onUpdate: (updates: Partial<OrderLineItem>) => void;
    onDelete: () => void;
    onSelectProduct: (prod: any) => void;
    autoFocusQuantity?: boolean;
    onQuantityFocusedHandled?: () => void;
}

export const LineItemRow: React.FC<LineItemRowProps> = ({
    item,
    index,
    retailerReceipts,
    showDelete,
    onUpdate,
    onDelete,
    onSelectProduct,
    autoFocusQuantity,
    onQuantityFocusedHandled
}) => {
    const qtyInputRef = useRef<TextInput>(null);
    const searchContainerRef = useRef<View>(null);

    // 🎯 Instant initialization with high capacity bounds (keeps UI from popping)
    const [maxDropdownHeight, setMaxDropdownHeight] = useState(320);

    const filteredProducts = useMemo(() => {
        const query = (item.searchQuery || '').trim().toLowerCase();
        if (!retailerReceipts || !retailerReceipts.length) return [];
        if (!query) return retailerReceipts.slice(0, 8);
        return retailerReceipts.filter((prod: any) => {
            const prodTitle = (prod.title || prod.long_title || '').toLowerCase();
            const prodBarcode = (prod.bar_code || prod.barcode || '').toLowerCase();
            return prodTitle.includes(query) || prodBarcode.includes(query);
        }).slice(0, 8);
    }, [item.searchQuery, retailerReceipts]);

    useEffect(() => {
        if (autoFocusQuantity && qtyInputRef.current) {
            setTimeout(() => {
                qtyInputRef.current?.focus();
                if (onQuantityFocusedHandled) onQuantityFocusedHandled();
            }, 150);
        }
    }, [autoFocusQuantity]);

    // 🚀 ABSOLUTE MAXIMUM SPACE CALCULATOR (Pre-cached during layout registration)
    const calculateAvailableSpace = () => {
        if (searchContainerRef.current) {
            searchContainerRef.current.measureInWindow((x, y, width, height) => {
                const windowHeight = Dimensions.get('window').height;
                const bottomSafetyBuffer = 35; // Prevents dropdown clipping screen edge control buttons

                // Calculates full space from bottom of text block down to viewport baseline
                const availableSpace = windowHeight - y - height - bottomSafetyBuffer;

                // Dynamically lock spacing between a healthy 180px and 500px range
                setMaxDropdownHeight(Math.max(180, Math.min(500, availableSpace)));
            });
        }
    };

    return (
        <View style={{ zIndex: item.isDropdownOpen ? 999 : 1, elevation: item.isDropdownOpen ? 10 : 0 }} className="p-4 mb-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex-col md:flex-row md:items-center md:space-x-4 relative">
            <View className="flex-row md:flex-col justify-between items-center mb-2 md:mb-0 md:items-start min-w-[80px]">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Line #{index + 1}</Text>
                {showDelete && (<TouchableOpacity onPress={onDelete} className="p-1 md:mt-1"><Text className="text-xs font-bold text-rose-500">Remove</Text></TouchableOpacity>)}
            </View>

            <View
                ref={searchContainerRef}
                className="flex-1 relative mb-3 md:mb-0"
                style={{ zIndex: 100 }}
                // Caches sizing parameters instantly whenever the view matrix handles standard updates
                onLayout={calculateAvailableSpace}
            >
                <TextInput
                    key={`${item.id}_search`}
                    placeholder="Search product name or barcode..."
                    placeholderTextColor="#64748b"
                    value={item.searchQuery}
                    onChangeText={(text) => {
                        onUpdate({ searchQuery: text, isDropdownOpen: true });
                        calculateAvailableSpace();
                    }}
                    onFocus={() => {
                        onUpdate({ isDropdownOpen: true });
                        calculateAvailableSpace();
                    }}
                    multiline={true}
                    numberOfLines={2}
                    blurOnSubmit={true}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm min-h-[44px] max-h-[64px]"
                    style={{ textAlignVertical: 'center' }}
                />

                {item.isDropdownOpen && filteredProducts.length > 0 && (
                    <View
                        style={{
                            zIndex: 9999,
                            elevation: 15,
                            position: 'absolute',
                            top: 52,
                            left: 0,
                            right: 0,
                            maxHeight: maxDropdownHeight, // Instant maximum sizing constraint assignment
                            ...Platform.select({
                                web: { overscrollBehavior: 'contain' } as any
                            })
                        }}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden"
                    >
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled={true}
                            bounces={false}
                            overScrollMode="never"
                        >
                            {filteredProducts.map((prod: any) => (
                                <TouchableOpacity key={prod.id || prod.key} onPress={() => onSelectProduct(prod)} className="p-3 border-b border-slate-100 dark:border-slate-800/60 active:bg-slate-50 dark:active:bg-slate-950 flex-col">
                                    <Text className="text-sm font-bold text-slate-800 dark:text-slate-200">{prod.title}</Text>
                                    <Text className="text-xs text-slate-400 mt-0.5">KES {Number(prod.unit_selling_price || prod.price || 0).toFixed(2)} • Available: {prod.available}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {item.isDropdownOpen && filteredProducts.length === 0 && (
                    <View style={{ zIndex: 9999, elevation: 15, position: 'absolute', top: 52, left: 0, right: 0 }} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl items-center"><Text className="text-xs font-medium text-slate-400">No items available in local database</Text></View>
                )}
            </View>

            <View className={`${item.selectedProduct ? 'flex-row' : 'hidden md:flex md:flex-row'} items-center space-x-4 gap-x-3 min-w-[200px] md:w-auto`}>
                <View className="flex-1 md:w-24 flex-col">
                    <Text className="text-xs text-slate-400 font-bold mb-1 uppercase tracking-wide text-center">Quantity</Text>
                    <TextInput ref={qtyInputRef} key={`${item.id}_qty`} placeholder="1" placeholderTextColor="#64748b" keyboardType="numeric" value={item.quantity === 0 ? '' : String(item.quantity)} onChangeText={(text) => onUpdate({ quantity: text === '' ? 0 : Math.max(0, parseInt(text) || 0) })} onFocus={() => onUpdate({ quantity: 0 })} selectTextOnFocus={true} className="h-12 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white font-mono text-sm text-center py-0" style={{ textAlignVertical: 'center', minHeight: 48 }} />
                </View>
                <View className="flex-1 md:w-28 flex-col">
                    <Text className="text-xs text-slate-400 font-bold mb-1 uppercase tracking-wide text-center">Discount</Text>
                    <TextInput placeholder="0.00" placeholderTextColor="#64748b" keyboardType="numeric" value={item.discount === 0 ? '' : String(item.discount)} onChangeText={(text) => onUpdate({ discount: text === '' ? 0 : Math.max(0, parseFloat(text) || 0) })} onFocus={() => onUpdate({ discount: 0 })} selectTextOnFocus={true} className="h-12 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white font-mono text-sm text-center py-0" style={{ textAlignVertical: 'center', minHeight: 48 }} />
                </View>
            </View>
        </View>
    );
};
