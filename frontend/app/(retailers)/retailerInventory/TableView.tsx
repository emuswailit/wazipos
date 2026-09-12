// app/(retailers)/retailerInventory/TableView.tsx

import React from 'react';
import { Image, Text, View } from 'react-native';

export default function TableView({
    data,
    isDarkMode,
    theme,
}: {
    data?: any[];
    isDarkMode: boolean;
    theme: any;
}) {
    /* Defensive: never crash if data is undefined */
    const dataList = Array.isArray(data) ? data : [];

    return (
        <View
            style={{
                backgroundColor: theme.panel,
                borderColor: isDarkMode
                    ? '#334155'
                    : '#e2e8f0',
            }}
            className="w-full border rounded-xl overflow-hidden shadow-xs"
        >
            {/* Header */}
            <View className="flex-row items-center border-b border-gray-200 dark:border-slate-700 bg-slate-50 py-2.5 px-4">
                <Text
                    style={{
                        color: theme.textDark,
                        flexBasis: '35%',
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                >
                    Asset Details
                </Text>
                <Text
                    style={{
                        color: theme.textDark,
                        flexBasis: '20%',
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider pl-2 flex-shrink-0"
                >
                    Barcode / SKU
                </Text>
                <Text
                    style={{
                        color: theme.textDark,
                        flexBasis: '10%',
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-right flex-shrink-0"
                >
                    Stock Qty
                </Text>
                <Text
                    style={{
                        color: theme.textDark,
                        flexBasis: '15%',
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-right flex-shrink-0"
                >
                    Pricing Base
                </Text>
                <Text
                    style={{
                        color: theme.textDark,
                        flexBasis: '20%',
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-center flex-shrink-0"
                >
                    Tracking Status
                </Text>
            </View>

            {/* Rows */}
            {dataList.map((i, idx) => {
                const exp =
                    (typeof i.days_to_expiry ===
                        'number' &&
                        i.days_to_expiry <= 0) ||
                    i.expiry_status === 'EXPIRED';

                const url =
                    i.thumbnail_url ||
                    i.image_url ||
                    null;

                const bp = parseFloat(
                    i.unit_selling_price || '0'
                );
                const fp = parseFloat(
                    i.final_unit_selling_price || '0'
                );

                return (
                    <View
                        key={i.key || i.id || idx}
                        className={`flex-row items-center py-2.5 px-4 border-b border-gray-100 dark:border-slate-800 last:border-b-0 ${idx % 2 === 1
                                ? 'bg-slate-50/20'
                                : ''
                            }`}
                    >
                        {/* Asset details */}
                        <View
                            style={{ flexBasis: '35%' }}
                            className="flex-row items-center gap-3 pr-2 flex-shrink-0 min-w-0"
                        >
                            <View
                                style={{
                                    width: 36,
                                    height: 36,
                                }}
                                className="rounded bg-slate-100 border border-slate-200/60 flex-shrink-0 overflow-hidden"
                            >
                                {url ? (
                                    <Image
                                        source={{ uri: url }}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                        }}
                                    />
                                ) : (
                                    <View className="w-full h-full items-center justify-center bg-slate-200">
                                        <Text className="text-xs">
                                            📦
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <View className="flex-1 min-w-0">
                                <Text
                                    style={{
                                        color: theme.text,
                                    }}
                                    className="text-xs font-bold truncate"
                                    numberOfLines={1}
                                >
                                    {i.title ||
                                        i.product_title ||
                                        'Unnamed Asset'}
                                </Text>
                                <Text
                                    style={{
                                        color: theme.textDark,
                                    }}
                                    className="text-[9px] text-slate-400 mt-0.5 truncate"
                                    numberOfLines={1}
                                >
                                    {i.manufacturer_title ||
                                        'Unknown Manufacturer'}
                                </Text>
                            </View>
                        </View>

                        {/* Barcode */}
                        <Text
                            style={{
                                color: theme.text,
                                flexBasis: '20%',
                            }}
                            className="text-xs font-medium pl-2 truncate flex-shrink-0"
                            numberOfLines={1}
                        >
                            {i.bar_code || '---'}
                        </Text>

                        {/* Stock qty */}
                        <Text
                            style={{
                                color:
                                    i.current_unit_quantity <=
                                        5
                                        ? '#f43f5e'
                                        : theme.text,
                                flexBasis: '10%',
                            }}
                            className="text-xs font-bold text-right truncate flex-shrink-0"
                            numberOfLines={1}
                        >
                            {i.current_unit_quantity ?? 0}
                        </Text>

                        {/* Pricing */}
                        <View
                            style={{ flexBasis: '15%' }}
                            className="items-end justify-center pr-1 flex-shrink-0 min-w-0"
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                }}
                                className="text-xs font-black truncate"
                                numberOfLines={1}
                            >
                                KES {fp.toFixed(2)}
                            </Text>
                            {fp < bp && (
                                <Text
                                    style={{
                                        color: '#94a3b8',
                                        textDecorationLine:
                                            'line-through',
                                    }}
                                    className="text-[9px] mt-0.5 truncate"
                                    numberOfLines={1}
                                >
                                    KES {bp.toFixed(2)}
                                </Text>
                            )}
                        </View>

                        {/* Status */}
                        <View
                            style={{ flexBasis: '20%' }}
                            className="items-center justify-center pl-2 flex-shrink-0 min-w-0"
                        >
                            <Text
                                style={{
                                    color: exp
                                        ? '#f43f5e'
                                        : '#10b981',
                                }}
                                className="text-[10px] font-extrabold uppercase tracking-wide truncate w-full text-center"
                                numberOfLines={1}
                            >
                                {i.expiry_status ===
                                    'UNKNOWN'
                                    ? exp
                                        ? 'EXPIRED'
                                        : 'ACTIVE'
                                    : i.expiry_status ||
                                    'ACTIVE'}
                            </Text>
                        </View>
                    </View>
                );
            })}

            {/* Empty state */}
            {dataList.length === 0 && (
                <View className="w-full py-10 items-center justify-center">
                    <Text
                        style={{ color: theme.textDark }}
                        className="text-xs"
                    >
                        No items to display
                    </Text>
                </View>
            )}
        </View>
    );
}