import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

interface DeliveryMethodSelectorProps {
    selectedMethod: string;
    onSelectMethod: (method: string) => void;
    shippingCost: string;
    onChangeShippingCost: (cost: string) => void;
    theme: any;
}

export default function DeliveryMethodSelector({
    selectedMethod,
    onSelectMethod,
    shippingCost,
    onChangeShippingCost,
    theme,
}: DeliveryMethodSelectorProps) {
    const options = ['PICKUP', 'DELIVERY'];

    const handleShippingTextChange = (val: string) => {
        // 🌟 BLOCK NEGATIVE CHARACTERS NATIVELY
        const sanitized = val.replace(/[^0-9.]/g, '');
        onChangeShippingCost(sanitized);
    };

    const handleInputBlurValidation = () => {
        // 🌟 ENFORCE DEFAULT ZERO ON EMPTIED FIELDS
        if (!shippingCost.trim() || parseFloat(shippingCost) === 0) {
            onChangeShippingCost('0.00');
        } else {
            const parsed = parseFloat(shippingCost);
            onChangeShippingCost(parsed.toFixed(2));
        }
    };

    return (
        <View className="mb-6 w-full flex-col border-b border-black/5 pb-5 animate-fade-in">
            <Text className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: theme.textDark }}>
                Select Delivery Method:
            </Text>
            <View className="flex-col md:flex-row gap-4 items-stretch md:items-center w-full">
                <View className="flex-row gap-3 items-center">
                    {options.map((method) => {
                        const isSelected = selectedMethod === method;
                        return (
                            <TouchableOpacity
                                key={method}
                                activeOpacity={0.8}
                                onPress={() => onSelectMethod(method)}
                                className="flex-row items-center px-4 h-11 border rounded-xl"
                                style={{
                                    borderColor: isSelected ? theme.primary : `${theme.textDark}30`,
                                    backgroundColor: isSelected ? `${theme.primary}08` : theme.background,
                                }}
                            >
                                <View
                                    className="w-4 h-4 rounded-full border items-center justify-center mr-2.5"
                                    style={{ borderColor: isSelected ? theme.primary : `${theme.textDark}50` }}
                                >
                                    {isSelected && (
                                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary }} />
                                    )}
                                </View>
                                <Text
                                    className="text-xs font-bold uppercase tracking-wider"
                                    style={{ color: isSelected ? theme.text : theme.textDark }}
                                >
                                    {method}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {selectedMethod === 'DELIVERY' && (
                    <View className="flex-1 md:max-w-xs animate-fade-in">
                        <TextInput
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor={`${theme.textDark}50`}
                            value={shippingCost}
                            onChangeText={handleShippingTextChange}
                            onBlur={handleInputBlurValidation}
                            className="border rounded-xl px-3.5 h-11 text-xs w-full"
                            style={{ color: theme.text, backgroundColor: theme.background, borderColor: `${theme.textDark}30` }}
                        />
                    </View>
                )}
            </View>
        </View>
    );
}
