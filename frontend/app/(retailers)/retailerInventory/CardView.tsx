// app/(retailers)/retailerInventory/CardView.tsx

import React from 'react';
import { Image, Text, View } from 'react-native';

interface CardViewProps {
    item: any;
    theme: any;
    isDarkMode: boolean;
}

export default function CardView({
    item,
    theme,
    isDarkMode,
}: CardViewProps) {
    const exp =
        (typeof item.days_to_expiry === 'number' &&
            item.days_to_expiry <= 0) ||
        item.expiry_status === 'EXPIRED';

    const url =
        item.thumbnail_url || item.image_url || null;

    const bp = parseFloat(
        item.unit_selling_price || '0'
    );
    const fp = parseFloat(
        item.final_unit_selling_price || '0'
    );
    const hasDiscount = fp < bp;

    const qty = Number(item.current_unit_quantity ?? 0);
    const unitPrice = Number.isFinite(fp) ? fp : 0;
    const totalValue = qty * unitPrice;

    /* Shared font helpers */
    const fRegular = theme?.font?.regular;
    const fMedium = theme?.font?.medium;
    const fBold = theme?.font?.bold;

    /* Shared colors */
    const cText = theme?.text;
    const cMuted = theme?.textDark;
    const cAccent = theme?.primary;

    return (
        <View
            style={{
                backgroundColor: theme?.panel,
                borderColor: cAccent,
            }}
            className="w-full border rounded-xl p-3 flex-col mb-1"
        >
            {/* Title row */}
            <View className="w-full flex-row items-center gap-3">
                <View
                    style={{
                        width: 48,
                        height: 48,
                        backgroundColor: theme?.background,
                        borderColor: cAccent,
                    }}
                    className="rounded-lg overflow-hidden border flex-shrink-0"
                >
                    {url ? (
                        <Image
                            source={{ uri: url }}
                            style={{
                                width: '100%',
                                height: '100%',
                            }}
                            resizeMode="cover"
                        />
                    ) : (
                        <View
                            style={{
                                backgroundColor:
                                    theme?.background,
                            }}
                            className="w-full h-full items-center justify-center"
                        >
                            <Text className="text-base">
                                📦
                            </Text>
                        </View>
                    )}
                </View>

                <View className="flex-1 min-w-0">
                    <Text
                        style={{
                            color: cText,
                            fontFamily: fBold,
                            lineHeight: 18,
                        }}
                        className="text-sm"
                        numberOfLines={2}
                    >
                        {item.title ||
                            item.product_title ||
                            'Unnamed'}
                    </Text>
                    <Text
                        style={{
                            color: cMuted,
                            fontFamily: fMedium,
                        }}
                        className="text-[11px] mt-0.5"
                        numberOfLines={1}
                    >
                        {item.manufacturer_title ||
                            'Unknown Manufacturer'}
                    </Text>
                </View>
            </View>

            {/* Divider */}
            <View
                style={{ backgroundColor: cAccent }}
                className="w-full h-[1px] my-2 opacity-20"
            />

            {/* Barcode / Qty / Unit Price */}
            <View className="w-full flex-row justify-between items-center">
                <View className="flex-col">
                    <Text
                        style={{
                            color: cMuted,
                            fontFamily: fBold,
                        }}
                        className="text-[9px] uppercase tracking-wider"
                    >
                        Barcode
                    </Text>
                    <Text
                        style={{
                            color: cText,
                            fontFamily: fMedium,
                        }}
                        className="text-xs mt-0.5"
                    >
                        {item.bar_code || '---'}
                    </Text>
                </View>

                <View className="items-center">
                    <Text
                        style={{
                            color: cMuted,
                            fontFamily: fBold,
                        }}
                        className="text-[9px] uppercase tracking-wider"
                    >
                        Qty
                    </Text>
                    <Text
                        style={{
                            color:
                                qty <= 5
                                    ? cAccent
                                    : cText,
                            fontFamily: fBold,
                        }}
                        className="text-xs mt-0.5"
                    >
                        {qty}
                    </Text>
                </View>

                <View className="items-end">
                    <Text
                        style={{
                            color: cMuted,
                            fontFamily: fBold,
                        }}
                        className="text-[9px] uppercase tracking-wider"
                    >
                        Unit Price
                    </Text>
                    <View className="items-end mt-0.5">
                        <Text
                            style={{
                                color: cText,
                                fontFamily: fMedium,
                            }}
                            className="text-xs"
                        >
                            KES {unitPrice.toFixed(2)}
                        </Text>
                        {hasDiscount && (
                            <Text
                                style={{
                                    color: cMuted,
                                    fontFamily: fRegular,
                                    textDecorationLine:
                                        'line-through',
                                }}
                                className="text-[9px] mt-0.5"
                            >
                                KES {bp.toFixed(2)}
                            </Text>
                        )}
                    </View>
                </View>
            </View>

            {/* Divider */}
            <View
                style={{ backgroundColor: cAccent }}
                className="w-full h-[1px] my-2 opacity-20"
            />

            {/* Total Value + Status */}
            <View className="w-full flex-row justify-between items-center">
                <View className="flex-col">
                    <Text
                        style={{
                            color: cMuted,
                            fontFamily: fBold,
                        }}
                        className="text-[9px] uppercase tracking-wider"
                    >
                        Total Value
                    </Text>
                    <Text
                        style={{
                            color: cAccent,
                            fontFamily: fBold,
                        }}
                        className="text-sm mt-0.5"
                    >
                        KES {totalValue.toFixed(2)}
                    </Text>
                </View>

                <View className="items-end">
                    <Text
                        style={{
                            color: cMuted,
                            fontFamily: fBold,
                        }}
                        className="text-[9px] uppercase tracking-wider"
                    >
                        Status
                    </Text>
                    <Text
                        style={{
                            color: exp ? cAccent : cText,
                            fontFamily: fBold,
                        }}
                        className="text-xs uppercase mt-0.5"
                    >
                        {item.expiry_status === 'UNKNOWN'
                            ? exp
                                ? 'EXPIRED'
                                : 'ACTIVE'
                            : item.expiry_status ||
                            'ACTIVE'}
                    </Text>
                </View>
            </View>
        </View>
    );
}