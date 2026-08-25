// app/(wholesalers)/wholesaleInventory/UnitOfReceiptPicker.tsx
import { Text, TouchableOpacity, View } from "react-native";

interface UnitOfReceiptPickerProps {
    theme: any;
    selectedValue: string;
    hasError: boolean;
    onSelect: (value: string) => void;
}

const unitOptions = [
    { value: 'MILLILITRE', label: 'ml' },
    { value: 'LITRE', label: 'Litre' },
    { value: 'GRAM', label: 'Gram' },
    { value: 'KILOGRAM', label: 'kg' },
    { value: 'PIECE', label: 'Pcs' },
    { value: 'PACK', label: 'Pack' },
];

export default function UnitOfReceiptPicker({ theme, selectedValue, hasError, onSelect }: UnitOfReceiptPickerProps) {
    const normalizedValue = (selectedValue || "").trim().toUpperCase();

    return (
        <View className="w-full items-start">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Unit Type *</Text>

            <View
                style={{ borderColor: hasError ? "#ef4444" : "transparent" }}
                className="flex-row flex-wrap gap-2 w-full p-1 border rounded-2xl"
            >
                {unitOptions.map((opt) => {
                    const isSelected = normalizedValue === opt.value;
                    return (
                        <TouchableOpacity
                            key={opt.value}
                            onPress={() => onSelect(opt.value)}
                            style={{
                                backgroundColor: isSelected ? theme.primary : theme.background,
                                borderColor: isSelected ? "transparent" : theme.border
                            }}
                            className="px-4 h-[38px] rounded-xl border flex-row items-center justify-center active:opacity-80"
                        >
                            <Text
                                style={{ color: isSelected ? "#ffffff" : theme.text }}
                                className={`text-xs ${isSelected ? 'font-black' : 'font-semibold'}`}
                            >
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}
