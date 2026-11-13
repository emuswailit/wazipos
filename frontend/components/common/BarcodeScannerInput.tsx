// components/common/BarcodeScannerInput.tsx

import { useAuth } from '@/context/AuthContext';
import { useFormikContext } from 'formik';
import React from 'react';
import {
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

interface BarcodeScannerInputProps {
    name: string;
    label?: string;
    placeholder?: string;
}

export function BarcodeScannerInput({ name, label, placeholder = 'Scan or type...' }: BarcodeScannerInputProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const value = formik?.values?.[name] || '';
    const hasError = formik?.touched?.[name] && formik?.errors?.[name];

    const borderColor = hasError
        ? '#ef4444'
        : isDarkMode
            ? 'rgba(148,163,184,0.18)'
            : 'rgba(15,23,42,0.10)';

    const handleScan = () => {
        // Hook up your actual barcode scanner logic here
        console.log('Trigger Barcode Scanner');
    };

    return (
        <View style={{ width: '100%', gap: 4 }}>
        {label ? (
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    paddingHorizontal: 2,
                }}
            >
                {label}
            </Text>
        ) : null}
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                backgroundColor: isDarkMode ? '#0f172a' : theme.surface,
                height: 38, // 🌟 Forced compact height
                overflow: 'hidden',
            }}
        >
            <TextInput
                value={value}
                onChangeText={(text) => formik.setFieldValue(name, text)}
                onBlur={() => formik.setFieldTouched(name, true)}
                placeholder={placeholder}
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                style={{
                    flex: 1,
                    height: '100%',
                    paddingHorizontal: 10,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: 12,
                    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                }}
            />

            <Pressable
                onPress={handleScan}
                style={({ pressed }) => ({
                    height: '100%',
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: pressed ? `${theme.primary}20` : `${theme.primary}10`,
                    borderLeftWidth: 1,
                    borderLeftColor: borderColor,
                })}
            >
                {/* Replace with your actual Icon component if you have one */}
                <Text style={{ fontSize: 16, color: theme.primary }}>🔲</Text>
            </Pressable>
        </View>
        </View>
    );
}
