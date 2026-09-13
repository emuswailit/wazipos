// app/(retailers)/newCustomerOrder/LineItemRow.tsx

import { RetailerReceipt } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Dimensions,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { OrderLineItem } from './types';

interface LineItemRowProps {
    item: OrderLineItem;
    index: number;
    retailerReceipts: RetailerReceipt[];
    showDelete: boolean;
    onUpdate: (updates: Partial<OrderLineItem>) => void;
    onDelete: () => void;
    onSelectProduct: (prod: any) => void;
    onSearchFocused?: () => void;
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
    onSearchFocused,
    autoFocusQuantity,
    onQuantityFocusedHandled,
}) => {
    const qtyInputRef = useRef<TextInput>(null);
    const searchContainerRef = useRef<View>(null);

    const [maxDropdownHeight, setMaxDropdownHeight] =
        useState(320);
    const [dropdownTop, setDropdownTop] = useState(52);

    // ---- Filter ----
    const filteredProducts = useMemo(() => {
        const query = (item.searchQuery || '')
            .trim()
            .toLowerCase();

        if (!retailerReceipts || !retailerReceipts.length) {
            return [];
        }

        if (!query) {
            return retailerReceipts.slice(0, 8);
        }

        return retailerReceipts
            .filter((prod) => {
                const prodTitle = String(
                    prod.title || prod.long_title || ''
                ).toLowerCase();
                const prodBarcode = String(
                    prod.bar_code ?? ''
                ).toLowerCase();
                return (
                    prodTitle.includes(query) ||
                    prodBarcode.includes(query)
                );
            })
            .slice(0, 8);
    }, [item.searchQuery, retailerReceipts]);

    const hasCatalog =
        !!retailerReceipts && retailerReceipts.length > 0;

    // ---- Autofocus on quantity when needed ----
    useEffect(() => {
        if (autoFocusQuantity && qtyInputRef.current) {
            const t = setTimeout(() => {
                qtyInputRef.current?.focus();
                onQuantityFocusedHandled?.();
            }, 150);
            return () => clearTimeout(t);
        }
    }, [autoFocusQuantity, onQuantityFocusedHandled]);

    // ---- Measure available space below the input ----
    const calculateAvailableSpace = useCallback(() => {
        if (!searchContainerRef.current) return;

        searchContainerRef.current.measureInWindow(
            (_x, y, _width, height) => {
                if (!height) return;
                const windowHeight =
                    Dimensions.get('window').height;
                const bottomSafetyBuffer = 35;

                const availableSpace =
                    windowHeight -
                    y -
                    height -
                    bottomSafetyBuffer;

                setMaxDropdownHeight(
                    Math.max(
                        180,
                        Math.min(500, availableSpace)
                    )
                );
                setDropdownTop(height + 4);
            }
        );
    }, []);

    // ---- Measure whenever the dropdown opens ----
    useEffect(() => {
        if (item.isDropdownOpen) {
            const raf = requestAnimationFrame(() => {
                calculateAvailableSpace();
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [item.isDropdownOpen, calculateAvailableSpace]);

    // ---- Open dropdown helper ----
    const openDropdown = useCallback(() => {
        if (!item.isDropdownOpen) {
            onUpdate({ isDropdownOpen: true });
        }
        onSearchFocused?.();
    }, [item.isDropdownOpen, onUpdate, onSearchFocused]);

    // ---- Select a product and close ----
    const handleSelect = useCallback(
        (prod: RetailerReceipt) => {
            onSelectProduct(prod);
            onUpdate({ isDropdownOpen: false });
        },
        [onSelectProduct, onUpdate]
    );

    // ---- Explicit close ----
    const closeDropdown = useCallback(() => {
        onUpdate({ isDropdownOpen: false });
    }, [onUpdate]);

    // ---- Barcode / Enter submit: prefer an exact match ----
    const handleSubmitEditing = useCallback(
        (e: any) => {
            const submitted = String(
                e?.nativeEvent?.text ?? item.searchQuery ?? ''
            )
                .trim()
                .toLowerCase();

            if (!submitted) return;

            const exact = (retailerReceipts || []).find(
                (p) => {
                    const bc = String(
                        p.bar_code ?? ''
                    ).toLowerCase();
                    const title = String(
                        p.title || p.long_title || ''
                    ).toLowerCase();
                    return (
                        bc === submitted ||
                        title === submitted
                    );
                }
            );

            const chosen = exact ?? filteredProducts[0];
            if (chosen) handleSelect(chosen);
        },
        [
            item.searchQuery,
            retailerReceipts,
            filteredProducts,
            handleSelect,
        ]
    );

    const showDropdown =
        item.isDropdownOpen && filteredProducts.length > 0;

    const showEmpty =
        item.isDropdownOpen &&
        filteredProducts.length === 0;

    const emptyMessage = !hasCatalog
        ? 'No products cached. Pull to refresh.'
        : `No products match "${item.searchQuery ?? ''}"`;

    return (
        <View
            style={{
                zIndex: item.isDropdownOpen ? 999 : 1,
                elevation: item.isDropdownOpen ? 10 : 0,
            }}
            className="p-4 mb-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex-col md:flex-row md:items-center md:space-x-4 relative"
        >
            {/* Line label + remove */}
            <View className="flex-row md:flex-col justify-between items-center mb-2 md:mb-0 md:items-start min-w-[80px]">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Line #{index + 1}
                </Text>

                {showDelete && (
                    <TouchableOpacity
                        onPress={onDelete}
                        className="p-1 md:mt-1"
                        accessibilityRole="button"
                        accessibilityLabel={`Remove line ${index + 1}`}
                    >
                        <Text className="text-xs font-bold text-rose-500">
                            Remove
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Search + dropdown */}
            <View
                ref={searchContainerRef}
                className="flex-1 relative mb-3 md:mb-0"
                style={{ zIndex: 100 }}
                onLayout={calculateAvailableSpace}
            >
                <TextInput
                    key={`${item.id}_search`}
                    placeholder="Search product name or barcode..."
                    placeholderTextColor="#64748b"
                    value={item.searchQuery}
                    onChangeText={(text) => {
                        onUpdate({
                            searchQuery: text,
                            isDropdownOpen: true,
                        });
                    }}
                    onFocus={openDropdown}
                    returnKeyType="search"
                    blurOnSubmit={true}
                    onSubmitEditing={handleSubmitEditing}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm min-h-[44px]"
                    style={{ textAlignVertical: 'center' }}
                />

                {/* ----- Dropdown ----- */}
                {showDropdown && (
                    <View
                        style={{
                            zIndex: 9999,
                            elevation: 15,
                            position: 'absolute',
                            top: dropdownTop,
                            left: 0,
                            right: 0,
                            maxHeight: maxDropdownHeight,
                            ...Platform.select({
                                web: {
                                    overscrollBehavior:
                                        'contain',
                                } as any,
                            }),
                        }}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden"
                    >
                        <View className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 flex-row items-center justify-between bg-slate-50 dark:bg-slate-950">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {filteredProducts.length} match
                                {filteredProducts.length === 1
                                    ? ''
                                    : 'es'}
                            </Text>

                            <TouchableOpacity
                                onPress={closeDropdown}
                                className="px-2 py-1 rounded-md active:opacity-60"
                                accessibilityRole="button"
                                accessibilityLabel="Close product list"
                            >
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Close ✕
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled={true}
                            bounces={false}
                            overScrollMode="never"
                        >
                            {filteredProducts.map((prod) => (
                                <TouchableOpacity
                                    key={
                                        prod.remote_id ||
                                        prod.remote_key
                                    }
                                    onPress={() =>
                                        handleSelect(prod)
                                    }
                                    className="p-3 border-b border-slate-100 dark:border-slate-800/60 active:bg-slate-50 dark:active:bg-slate-950 flex-col"
                                >
                                    <Text className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                        {prod.title}
                                    </Text>

                                    <Text className="text-xs text-slate-400 mt-0.5">
                                        KES{' '}
                                        {Number(
                                            prod.unit_selling_price ??
                                            0
                                        ).toFixed(2)}
                                        {' • '}
                                        Available:{' '}
                                        {prod.current_unit_quantity ??
                                            0}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ----- Empty state ----- */}
                {showEmpty && (
                    <View
                        style={{
                            zIndex: 9999,
                            elevation: 15,
                            position: 'absolute',
                            top: dropdownTop,
                            left: 0,
                            right: 0,
                        }}
                        className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl items-center"
                    >
                        <Text className="text-xs font-medium text-slate-400 text-center">
                            {emptyMessage}
                        </Text>
                    </View>
                )}
            </View>

            {/* Quantity + discount */}
            <View
                className={`${item.selectedProduct
                        ? 'flex-row'
                        : 'hidden md:flex md:flex-row'
                    } items-center space-x-4 gap-x-3 min-w-[200px] md:w-auto`}
            >
                <View className="flex-1 md:w-24 flex-col">
                    <Text className="text-xs text-slate-400 font-bold mb-1 uppercase tracking-wide text-center">
                        Quantity
                    </Text>
                    <TextInput
                        ref={qtyInputRef}
                        key={`${item.id}_qty`}
                        placeholder="1"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={
                            item.quantity === 0
                                ? ''
                                : String(item.quantity)
                        }
                        onChangeText={(text) =>
                            onUpdate({
                                quantity:
                                    text === ''
                                        ? 0
                                        : Math.max(
                                            0,
                                            parseInt(text) || 0
                                        ),
                            })
                        }
                        onFocus={() => {
                            if (
                                item.quantity === 1 ||
                                item.quantity === 0
                            ) {
                                onUpdate({ quantity: 0 });
                            }
                        }}
                        selectTextOnFocus={true}
                        className="h-12 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white font-mono text-sm text-center py-0"
                        style={{
                            textAlignVertical: 'center',
                            minHeight: 48,
                        }}
                    />
                </View>

                <View className="flex-1 md:w-28 flex-col">
                    <Text className="text-xs text-slate-400 font-bold mb-1 uppercase tracking-wide text-center">
                        Discount
                    </Text>
                    <TextInput
                        placeholder="0.00"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={
                            item.discount === 0
                                ? ''
                                : String(item.discount)
                        }
                        onChangeText={(text) =>
                            onUpdate({
                                discount:
                                    text === ''
                                        ? 0
                                        : Math.max(
                                            0,
                                            parseFloat(text) || 0
                                        ),
                            })
                        }
                        selectTextOnFocus={true}
                        className="h-12 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white font-mono text-sm text-center py-0"
                        style={{
                            textAlignVertical: 'center',
                            minHeight: 48,
                        }}
                    />
                </View>
            </View>
        </View>
    );
};