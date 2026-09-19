// app/(retailers)/client/orders/RowItem.tsx

import { CustomerOrder } from '@/databases/types';
import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface RowItemProps {
    order: CustomerOrder;
    isLarge: boolean;
    onSelect: (order: CustomerOrder) => void;
}

export const RowItem: React.FC<RowItemProps> = ({
    order,
    isLarge,
    onSelect,
}) => {
    // Prefer the normalized `total_amount`; fall back through the
    // server's own total columns. Guard against NaN.
    const formattedPrice = useMemo(() => {
        const raw =
            order.total_amount ||
            order.order_price_total ||
            order.order_net_price_total ||
            '0';
        const val = parseFloat(String(raw));
        return isNaN(val) ? '0.00' : val.toFixed(2);
    }, [
        order.total_amount,
        order.order_price_total,
        order.order_net_price_total,
    ]);

    // Derived display values
    const isPaid = order.is_paid === 'true';
    const payMethod =
        order.selected_payment_method_title || 'N/A';
    const providerRef = order.provider_reference_number || 'None';
    const customerDisplay =
        order.customer_name || 'Walk-in Customer';

    /* ---------- Large screens (desktop table row) ---------- */
    if (isLarge) {
        return (
            <View className="flex-row p-3 items-center border-b border-gray-100 bg-white">
                <View className="w-2/12 pr-2">
                    <Text
                        className="text-sm text-gray-900 font-medium"
                        numberOfLines={1}
                    >
                        {order.order_number || 'N/A'}
                    </Text>
                </View>

                <View className="w-2/12 pr-2">
                    <Text
                        className="text-sm text-gray-600"
                        numberOfLines={1}
                    >
                        {customerDisplay}
                    </Text>
                </View>

                <View className="w-2/12 pr-2 flex-row">
                    <View
                        className={`px-2 py-0.5 rounded-full ${isPaid ? 'bg-green-100' : 'bg-red-100'
                            }`}
                    >
                        <Text
                            className={`text-[11px] font-bold tracking-wide uppercase ${isPaid
                                    ? 'text-green-700'
                                    : 'text-red-700'
                                }`}
                        >
                            {isPaid ? 'PAID' : 'UNPAID'}
                        </Text>
                    </View>
                </View>

                <View className="w-[12.5%] pr-2">
                    <Text
                        className="text-sm font-semibold text-gray-700 uppercase"
                        numberOfLines={1}
                    >
                        {payMethod}
                    </Text>
                </View>

                <View className="w-[12.5%] pr-2">
                    <Text
                        className="text-xs font-mono text-gray-500"
                        numberOfLines={1}
                    >
                        {providerRef}
                    </Text>
                </View>

                <View className="w-[12.5%] pr-2">
                    <Text className="text-sm font-bold text-gray-900">
                        KES {formattedPrice}
                    </Text>
                </View>

                <View className="w-[12.5%] items-end">
                    <TouchableOpacity
                        className="bg-blue-600 py-1.5 px-3 rounded-lg items-center justify-center w-full max-w-[90px] shadow-sm active:bg-blue-700"
                        onPress={() => onSelect(order)}
                        accessibilityRole="button"
                        accessibilityLabel={`View order ${order.order_number}`}
                    >
                        <Text className="text-white font-semibold text-xs">
                            View
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    /* ---------- Small screens (mobile card) ---------- */
    return (
        <View className="p-4 rounded-xl mb-3 border bg-white border-blue-500">
            <View className="flex-row justify-between items-center mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                    {order.order_number || 'N/A'}
                </Text>
                <View
                    className={`px-2 py-0.5 rounded ${isPaid ? 'bg-green-100' : 'bg-red-100'
                        }`}
                >
                    <Text
                        className={`text-[11px] font-bold ${isPaid
                                ? 'text-green-800'
                                : 'text-red-800'
                            }`}
                    >
                        {isPaid ? 'PAID' : 'UNPAID'}
                    </Text>
                </View>
            </View>

            <View className="mb-3">
                <Text className="text-gray-600 text-xs my-0.5">
                    Client:{' '}
                    <Text className="text-gray-900 font-medium">
                        {customerDisplay}
                    </Text>
                </Text>
                <Text className="text-gray-600 text-xs my-0.5">
                    Method:{' '}
                    <Text className="text-gray-900 font-medium uppercase">
                        {payMethod}
                    </Text>
                </Text>
                <Text className="text-gray-600 text-xs my-0.5">
                    Ref ID:{' '}
                    <Text className="text-gray-500 font-mono">
                        {providerRef}
                    </Text>
                </Text>
            </View>

            <View className="flex-row justify-between items-center border-t border-gray-50 pt-2">
                <Text className="text-sm font-bold text-blue-600">
                    KES {formattedPrice}
                </Text>
                <TouchableOpacity
                    className="bg-blue-600 py-1.5 px-4 rounded-lg items-center justify-center"
                    onPress={() => onSelect(order)}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for order ${order.order_number}`}
                >
                    <Text className="text-white font-semibold text-xs">
                        Details
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};