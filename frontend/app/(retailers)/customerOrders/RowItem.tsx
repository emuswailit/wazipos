import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CustomerOrder } from './types';

interface RowItemProps {
    order: CustomerOrder;
    isLarge: boolean;
    onSelect: (order: CustomerOrder) => void;
}

export const RowItem: React.FC<RowItemProps> = ({ order, isLarge, onSelect }) => {
    // Safeguards the rendering stack against malformed data rows or calculations (NaN)
    const formattedPrice = useMemo(() => {
        const rawPrice = parseFloat(order.order_price_total);
        return isNaN(rawPrice) ? "0.00" : rawPrice.toFixed(2);
    }, [order.order_price_total]);

    // Derived properties from the WebSocket message schema
    const isPaid = order.is_paid === 'true';
    const payMethod = order.selected_payment_method_title || "N/A";
    const providerRef = order.provider_reference_number || "None";
    const customerDisplay = order.customer_name || "Walk-in Customer";

    // Large Screens Presentation Layer (Desktop Table Row Layout)
    if (isLarge) return (
        <View className="flex-row p-3 items-center border-b border-gray-100 bg-white">
            {/* 1. Order Number Column (2/12 Width) */}
            <View className="w-2/12 pr-2">
                <Text className="text-sm text-gray-900 font-medium" numberOfLines={1}>
                    {order.order_number || "N/A"}
                </Text>
            </View>

            {/* 2. Customer Name Column (2/12 Width) */}
            <View className="w-2/12 pr-2">
                <Text className="text-sm text-gray-600" numberOfLines={1}>
                    {customerDisplay}
                </Text>
            </View>

            {/* 3. Payment Status Badge Column (2/12 Width) */}
            <View className="w-2/12 pr-2 flex-row">
                <View className={`px-2 py-0.5 rounded-full ${isPaid ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text className={`text-[11px] font-bold tracking-wide uppercase ${isPaid ? 'text-green-700' : 'text-red-700'}`}>
                        {isPaid ? 'PAID' : 'UNPAID'}
                    </Text>
                </View>
            </View>

            {/* 4. Payment Method Column (1.5/12 Width) */}
            <View className="w-[12.5%] pr-2">
                <Text className="text-sm font-semibold text-gray-700 uppercase" numberOfLines={1}>
                    {payMethod}
                </Text>
            </View>

            {/* 5. Provider Reference Code Column (1.5/12 Width) */}
            <View className="w-[12.5%] pr-2">
                <Text className="text-xs font-mono text-gray-500" numberOfLines={1}>
                    {providerRef}
                </Text>
            </View>

            {/* 6. Total Amount Column (1.5/12 Width) */}
            <View className="w-[12.5%] pr-2">
                <Text className="text-sm font-bold text-gray-900">
                    KES {formattedPrice}
                </Text>
            </View>

            {/* 7. Action Column (1.5/12 Width) */}
            <View className="w-[12.5%] items-end">
                <TouchableOpacity
                    className="bg-blue-600 py-1.5 px-3 rounded-lg items-center justify-center w-full max-w-[90px] shadow-sm active:bg-blue-700"
                    onPress={() => onSelect(order)}
                >
                    <Text className="text-white font-semibold text-xs">View</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Small Screens Presentation Layer (Mobile Responsive Cards Layout with clean static blue border)
    return (
        <View className="p-4 rounded-xl mb-3 border bg-white border-blue-500">
            <View className="flex-row justify-between items-center mb-2">
                <Text className="text-sm font-semibold text-gray-900">{order.order_number || "N/A"}</Text>
                <View className={`px-2 py-0.5 rounded ${isPaid ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text className={`text-[11px] font-bold ${isPaid ? 'text-green-800' : 'text-red-800'}`}>
                        {isPaid ? 'PAID' : 'UNPAID'}
                    </Text>
                </View>
            </View>

            {/* Sub-parameters descriptive payload rows */}
            <View className="mb-3">
                <Text className="text-gray-600 text-xs my-0.5">Client: <Text className="text-gray-900 font-medium">{customerDisplay}</Text></Text>
                <Text className="text-gray-600 text-xs my-0.5">Method: <Text className="text-gray-900 font-medium uppercase">{payMethod}</Text></Text>
                <Text className="text-gray-600 text-xs my-0.5">Ref ID: <Text className="text-gray-500 font-mono">{providerRef}</Text></Text>
            </View>

            <View className="flex-row justify-between items-center border-t border-gray-50 pt-2">
                <Text className="text-sm font-bold text-blue-600">KES {formattedPrice}</Text>
                <TouchableOpacity
                    className="bg-blue-600 py-1.5 px-4 rounded-lg items-center justify-center"
                    onPress={() => onSelect(order)}
                >
                    <Text className="text-white font-semibold text-xs">Details</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};
