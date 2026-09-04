import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface FormModalHeaderProps {
    onClose: () => void;
    isDarkMode: boolean;
    theme: {
        text: string;
        textDark: string;
        font: {
            regular: string;
            medium: string;
            bold: string;
            mono: string;
        };
    };
}

export default function FormModalHeader({ onClose, isDarkMode, theme }: FormModalHeaderProps) {
    return (
        <View
            className="p-4 border-b flex-row justify-between items-center"
            style={{ borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}
        >
            <View>
                <Text className="text-lg font-black" style={{ color: theme.text, fontFamily: theme.font.bold }}>
                    New Inventory Form
                </Text>
                <Text className="text-[11px]" style={{ color: theme.textDark, fontFamily: theme.font.regular }}>
                    Register newly arrived inventory assets.
                </Text>
            </View>
            <TouchableOpacity
                onPress={onClose}
                className="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg"
            >
                <Text className="text-xs font-bold" style={{ color: theme.text, fontFamily: theme.font.bold }}>✕</Text>
            </TouchableOpacity>
        </View>
    );
}
