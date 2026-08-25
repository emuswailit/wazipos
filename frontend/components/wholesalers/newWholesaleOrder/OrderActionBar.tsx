import { Text, TouchableOpacity, View } from 'react-native';

interface OrderActionBarProps {
    theme: any;
    onScanTrigger: () => void;
    onAddRowTrigger: () => void;
}

export default function OrderActionBar({
    theme,
    onScanTrigger,
    onAddRowTrigger
}: OrderActionBarProps) {
    return (
        <View className="flex-row items-center justify-start gap-3 mt-1 mb-6 w-full max-w-md">
            <TouchableOpacity className="flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center border shadow-sm bg-white" style={{ borderColor: theme.primary }} onPress={onScanTrigger}>
                <Text style={{ color: theme.primary }} className="text-sm font-bold">📷 Scan Item</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center shadow-sm" style={{ backgroundColor: theme.primary }} onPress={onAddRowTrigger}>
                <Text className="text-white text-sm font-bold">+ Add Item Row</Text>
            </TouchableOpacity>
        </View>
    );
}
