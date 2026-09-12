import React from 'react';
import { Text, TextInput, View } from 'react-native';

interface MobileMoneyFormProps {
    paymentAccountNumber: string;
    setPaymentAccountNumber: (val: string) => void;
    customerName: string;
    setCustomerName: (val: string) => void;
    theme: any;
}

export default function MobileMoneyForm({
    paymentAccountNumber,
    setPaymentAccountNumber,
    customerName,
    setCustomerName,
    theme,
}: MobileMoneyFormProps) {
    return (
        <View className="mb-6 w-full flex-col border-b border-black/5 pb-6 animate-fade-in">
            <Text className="text-xs font-extrabold uppercase tracking-wider mb-3 text-emerald-600">
                📲 Mobile Money Verification Details
            </Text>
            <View className="flex-col md:flex-row gap-4 w-full">
                <View className="flex-1">
                    <Text className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textDark }}>Payment Account / Phone Number</Text>
                    <TextInput
                        keyboardType="phone-pad"
                        placeholder="e.g. 07XXXXXXXX or Reference String"
                        placeholderTextColor={`${theme.textDark}50`}
                        value={paymentAccountNumber}
                        onChangeText={setPaymentAccountNumber}
                        className="border rounded-xl px-3.5 h-11 text-xs w-full"
                        style={{ color: theme.text, backgroundColor: theme.background, borderColor: `${theme.textDark}30` }}
                    />
                </View>
                <View className="flex-1">
                    <Text className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textDark }}>Payer Name (Optional)</Text>
                    <TextInput
                        placeholder="Customer Name"
                        placeholderTextColor={`${theme.textDark}50`}
                        value={customerName}
                        onChangeText={setCustomerName}
                        className="border rounded-xl px-3.5 h-11 text-xs w-full"
                        style={{ color: theme.text, backgroundColor: theme.background, borderColor: `${theme.textDark}30` }}
                    />
                </View>
            </View>
        </View>
    );
}
