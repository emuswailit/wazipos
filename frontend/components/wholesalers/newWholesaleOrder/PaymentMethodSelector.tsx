import { Text, TextInput, TouchableOpacity, View } from 'react-native';

interface PaymentMethodSelectorProps {
    theme: any;
    paymentMethods: any[];
    selectedPaymentMethod: any;
    onSelectPaymentMethod: (method: any) => void;
    mpesaNumber: string;
    onMpesaNumberChange: (text: string) => void;
}

export default function PaymentMethodSelector({
    theme,
    paymentMethods = [],
    selectedPaymentMethod,
    onSelectPaymentMethod,
    mpesaNumber,
    onMpesaNumberChange
}: PaymentMethodSelectorProps) {
    const activeCollectionList = paymentMethods.length > 0 ? paymentMethods : [

    ];

    return (
        <View className="mb-5 pb-5 border-b border-gray-200/60">
            <Text className="text-sm font-bold mb-2.5" style={{ color: theme.text }}>2. Select Payment Settlement Method</Text>
            <View className="flex-row flex-wrap gap-2.5">
                {activeCollectionList.map((method) => {
                    const isSelected = selectedPaymentMethod?.id === method.id;
                    return (
                        <TouchableOpacity
                            key={method.id}
                            onPress={() => onSelectPaymentMethod(method)}
                            className="px-4 py-2.5 rounded-xl border flex-row items-center gap-x-2 shadow-sm"
                            style={{
                                backgroundColor: isSelected ? theme.primary : 'transparent',
                                borderColor: isSelected ? theme.primary : theme.border
                            }}
                        >
                            <View className="w-3.5 h-3.5 rounded-full border items-center justify-center" style={{ borderColor: isSelected ? '#fff' : theme.textDark }}>
                                {isSelected && <View className="w-2 h-2 rounded-full bg-white" />}
                            </View>
                            <Text className="text-xs font-black uppercase tracking-wide" style={{ color: isSelected ? '#fff' : theme.text }}>
                                {method.title}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {selectedPaymentMethod?.title === "MOBILE MONEY" && (
                <View className="mt-4 max-w-sm">
                    <Text className="text-xxs font-black uppercase mb-1" style={{ color: theme.textDark }}>M-Pesa Mobile Subscriber Phone *</Text>
                    <TextInput
                        keyboardType="phone-pad"
                        value={mpesaNumber}
                        onChangeText={onMpesaNumberChange}
                        placeholder="e.g. 07XXXXXXXX"
                        placeholderTextColor="#94a3b8"
                        style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
                        className="w-full border rounded-xl px-3.5 h-11 text-sm font-semibold outline-none shadow-sm"
                    />
                </View>
            )}
        </View>
    );
}
