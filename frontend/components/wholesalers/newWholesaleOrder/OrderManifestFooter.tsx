// components/wholesalers/newWholesaleOrder/OrderManifestFooter.tsx

import {
    ActivityIndicator,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface OrderManifestFooterProps {
    theme: any;
    notes: string;
    onNotesChange: (text: string) => void;
    grandTotalCost: number;
    /** Delivery fee of the chosen option (0 for pickup). */
    deliveryFee?: number;
    isButtonLoading: boolean;
    onSubmit: () => void;
}

export default function OrderManifestFooter({
    theme,
    notes,
    onNotesChange,
    grandTotalCost,
    deliveryFee = 0,
    isButtonLoading,
    onSubmit,
}: OrderManifestFooterProps) {
    const total = (Number(grandTotalCost) || 0) + (Number(deliveryFee) || 0);
    const isDark = (theme as any).isDarkMode;

    const borderColor = isDark ? '#334155' : '#cbd5e1';
    const inputBg = isDark ? '#0f172a' : '#f1f5f9';
    const placeholderColor = isDark
        ? '#64748b'
        : '#94a3b8';

    return (
        <View className="w-full">
            {/* -------- Notes -------- */}
            <View className="mb-3">
                <Text
                    className="text-xs font-medium mb-1.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font?.medium,
                    }}
                >
                    Order Notes
                </Text>
                <TextInput
                    className="border rounded-lg px-3 py-2 text-sm"
                    style={{
                        borderColor,
                        color: theme.text,
                        backgroundColor: inputBg,
                        fontFamily: theme.font?.medium,
                        minHeight: 44,
                    }}
                    placeholder="Add shipping instructions…"
                    placeholderTextColor={placeholderColor}
                    multiline
                    textAlignVertical="top"
                    value={notes}
                    onChangeText={onNotesChange}
                />
            </View>

            {/* -------- Subtotal row -------- */}
            <View
                className="flex-row justify-between items-center py-2.5 border-t"
                style={{ borderTopColor: borderColor }}
            >
                <Text
                    className="text-sm font-bold"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font?.bold,
                    }}
                >
                    {deliveryFee > 0 ? `Items ${(Number(grandTotalCost) || 0).toFixed(2)} + delivery ${Number(deliveryFee).toFixed(2)}` : 'Order total'}:
                </Text>
                <Text
                    className="text-xl font-black"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font?.bold,
                    }}
                >
                    KES{' '}
                    {total.toFixed(2)}
                </Text>
            </View>

            {/* -------- Actions -------- */}
            <View className="flex-row items-center gap-3 mt-2">
                <TouchableOpacity
                    className={`flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center ${isButtonLoading ? 'opacity-50' : ''
                        }`}
                    style={{ backgroundColor: theme.primary }}
                    onPress={onSubmit}
                    disabled={isButtonLoading}
                    activeOpacity={0.8}
                >
                    {isButtonLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text
                            className="text-white text-sm font-semibold"
                            style={{
                                fontFamily: theme.font?.bold,
                            }}
                        >
                            Create order & take payment
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}