// components/wholesalers/newWholesaleOrder/OrderActionBar.tsx

import { useAuth } from '@/context/AuthContext';
import {
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface OrderActionBarProps {
    theme: any;
    onScanTrigger: () => void;
    onAddRowTrigger: () => void;
}

export default function OrderActionBar({
    theme,
    onScanTrigger,
    onAddRowTrigger,
}: OrderActionBarProps) {
    const { isDarkMode } = useAuth();

    const borderColor = isDarkMode ? '#334155' : '#cbd5e1';
    const cardBg = isDarkMode ? '#0f172a' : '#ffffff';

    return (
        <View className="w-full my-3 flex-row items-stretch gap-3">
            {/* -------- Scan Item -------- */}
            <TouchableOpacity
                onPress={onScanTrigger}
                activeOpacity={0.8}
                className="flex-1 flex-row items-center justify-center gap-x-2 rounded-xl border h-12"
                style={{
                    borderColor: theme.primary,
                    backgroundColor: cardBg,
                }}
            >
                <Text
                    className="text-sm font-bold"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font?.bold,
                    }}
                >
                    📷 Scan Item
                </Text>
            </TouchableOpacity>

            {/* -------- Add Item Row -------- */}
            <TouchableOpacity
                onPress={onAddRowTrigger}
                activeOpacity={0.8}
                className="flex-1 flex-row items-center justify-center rounded-xl h-12"
                style={{ backgroundColor: theme.primary }}
            >
                <Text
                    className="text-sm font-bold text-white"
                    style={{ fontFamily: theme.font?.bold }}
                >
                    + Add Item Row
                </Text>
            </TouchableOpacity>
        </View>
    );
}