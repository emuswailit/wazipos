import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface OrderManifestFooterProps {
    theme: any;
    notes: string;
    onNotesChange: (text: string) => void;
    grandTotalCost: number;
    isButtonLoading: boolean;
    onSaveDraft: () => void;
    onSubmit: () => void;
}

export default function OrderManifestFooter({
    theme,
    notes,
    onNotesChange,
    grandTotalCost,
    isButtonLoading,
    onSaveDraft,
    onSubmit
}: OrderManifestFooterProps) {
    return (
        <View className="w-full">
            <View className="mb-5">
                <Text className="text-sm font-medium mb-2" style={{ color: theme.textDark }}>Order Notes</Text>
                <TextInput
                    className="border rounded-lg p-3 text-base h-20"
                    style={{ borderColor: theme.background, color: theme.text, backgroundColor: theme.background }}
                    placeholder="Add shipping instructions..."
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    value={notes}
                    onChangeText={onNotesChange}
                />
            </View>
            <View className="mt-3 pt-4 border-t-2" style={{ borderColor: theme.background }}>
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-lg font-bold" style={{ color: theme.text }}>Manifest Subtotal Summary:</Text>
                    <Text className="text-2xl font-black" style={{ color: theme.primary }}>KES {grandTotalCost.toFixed(2)}</Text>
                </View>
            </View>
            <View className="flex-row items-center gap-x-4 mt-6">
                <TouchableOpacity
                    className="flex-1 py-4 px-4 rounded-xl flex-row items-center justify-center border shadow-sm bg-white"
                    style={{ borderColor: theme.primary }}
                    onPress={onSaveDraft}
                    disabled={isButtonLoading}
                >
                    <Text style={{ color: theme.primary }} className="text-base font-bold">💾 Save Draft</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-4 px-4 rounded-xl flex-row items-center justify-center shadow-md ${isButtonLoading ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: theme.primary }}
                    onPress={onSubmit}
                    disabled={isButtonLoading}
                    activeOpacity={0.8}
                >
                    {isButtonLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-base font-semibold">Submit Order</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}
