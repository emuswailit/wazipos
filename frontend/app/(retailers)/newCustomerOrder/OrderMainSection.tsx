import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Keyboard, Platform, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { LineItemRow } from './LineItemRow';

export const OrderMainSection = ({
    theme,
    lineItems,
    retailerReceipts,
    isBlankRowPresent,
    handleUpdateRow,
    handleDeleteRow,
    handleSelectProduct,
    handleAddRow,
    setIsScannerOpen,
    setIsBottomSheetVisible,
    totals,
    onRowLayout
}: any) => {
    const [focusedQuantityRowId, setFocusedQuantityRowId] = useState<string | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const rowPositions = useRef<{ [key: string]: number }>({});
    const prevLengthRef = useRef(lineItems.length);

    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

    useEffect(() => {
        const openItem = lineItems.find((item: any) => item.isDropdownOpen);
        setActiveDropdownId(openItem ? openItem.id : null);
    }, [lineItems]);

    useEffect(() => {
        if (lineItems.length > prevLengthRef.current && lineItems.length > 0) {
            const lastItem = lineItems[lineItems.length - 1];
            const checkAndScroll = setInterval(() => {
                const targetY = rowPositions.current[lastItem.id];
                if (targetY !== undefined) {
                    scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
                    clearInterval(checkAndScroll);
                }
            }, 30);
            setTimeout(() => clearInterval(checkAndScroll), 600);
        }
        prevLengthRef.current = lineItems.length;
    }, [lineItems]);

    const handleBackgroundTap = () => {
        if (Platform.OS !== 'web') { Keyboard.dismiss(); }
        lineItems.forEach((item: any) => {
            if (item.isDropdownOpen) {
                handleUpdateRow(item.id, { isDropdownOpen: false });
            }
        });
    };

    const universalAlert = (title: string, message: string, actions: any[]) => {
        if (Platform.OS === 'web') {
            const confirmChange = window.confirm(`${title}\n\n${message}`);
            if (confirmChange) { actions.onPress(); }
        } else {
            Alert.alert(title, message, actions);
        }
    };

    const interceptedSelectProduct = (currentRowId: string, selectedProd: any) => {
        const selectedProdIdStr = String(selectedProd.id || selectedProd.key);
        const duplicateIndex = lineItems.findIndex(
            (item: any) => item.selectedProduct === selectedProdIdStr && item.id !== currentRowId
        );

        if (duplicateIndex !== -1) {
            const duplicateRow = lineItems[duplicateIndex];
            universalAlert(
                "Product Already Added",
                `"${selectedProd.title}" is already listed on Item Line #${duplicateIndex + 1}. Adjust its quantity?`,
                [
                    {
                        text: "Cancel",
                        onPress: () => handleUpdateRow(currentRowId, { searchQuery: '', isDropdownOpen: false })
                    },
                    {
                        text: "Change Quantity",
                        onPress: () => {
                            handleDeleteRow(currentRowId);
                            setTimeout(() => {
                                setFocusedQuantityRowId(duplicateRow.id);
                                const yPos = rowPositions.current[duplicateRow.id];
                                if (yPos !== undefined) {
                                    scrollViewRef.current?.scrollTo({ y: yPos, animated: true });
                                }
                            }, 120);
                        }
                    }
                ]
            );
        } else {
            handleSelectProduct(currentRowId, selectedProd);
        }
    };

    return (
        <ScrollView
            ref={scrollViewRef}
            className="flex-1 w-full"
            contentContainerStyle={{ paddingBottom: Dimensions.get('window').height }}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={activeDropdownId === null}
            onTouchStart={(e) => {
                if (e.target === e.currentTarget) handleBackgroundTap();
            }}
        >
            <TouchableWithoutFeedback onPress={handleBackgroundTap}>
                <View style={{ zIndex: 40 }} className="space-y-3 w-full">
                    {lineItems.map((item: any, index: number) => (
                        <View
                            key={item.id}
                            style={{ zIndex: item.isDropdownOpen ? 100 : 1 }}
                            onLayout={(e) => {
                                const yPos = e.nativeEvent.layout.y;
                                rowPositions.current[item.id] = yPos;
                                if (onRowLayout) onRowLayout(item.id, yPos);
                            }}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <LineItemRow
                                item={item}
                                index={index}
                                retailerReceipts={retailerReceipts}
                                showDelete={lineItems.length > 1}
                                onUpdate={(updates: any) => handleUpdateRow(item.id, updates)}
                                onDelete={() => handleDeleteRow(item.id)}
                                onSelectProduct={(prod: any) => interceptedSelectProduct(item.id, prod)}
                                autoFocusQuantity={focusedQuantityRowId === item.id}
                                onQuantityFocusedHandled={() => setFocusedQuantityRowId(null)}
                            />
                        </View>
                    ))}

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, zIndex: 1 }} className="w-full" onTouchStart={(e) => e.stopPropagation()}>
                        <TouchableOpacity
                            disabled={isBlankRowPresent}
                            onPress={handleAddRow}
                            style={{ minHeight: 48, borderColor: isBlankRowPresent ? '#cbd5e1' : theme.primary, marginRight: 12 }}
                            className={`flex-1 border border-dashed rounded-2xl items-center justify-center transition-all ${isBlankRowPresent ? 'opacity-40 bg-slate-100/50 dark:bg-slate-800/20' : 'bg-transparent border-primary active:bg-slate-50 dark:active:bg-slate-900'}`}
                        >
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: isBlankRowPresent ? theme.textDark : theme.primary }}>+ Add Product</Text>
                        </TouchableOpacity>

                        {Platform.OS !== 'web' && (
                            <TouchableOpacity onPress={() => setIsScannerOpen(true)} style={{ minHeight: 48, backgroundColor: theme.primary, marginLeft: 4 }} className="flex-1 rounded-2xl lg:hidden items-center justify-center shadow-sm active:opacity-90">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white">📷 Scan Barcode</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </ScrollView>
    );
};
