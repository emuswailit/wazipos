// components/common/BarcodeScannerInput.tsx
//
// Formik text field with a scan button: type the code, use a handheld scanner, or
// tap the scan icon to read it with the camera (the app-wide BarcodeScanner).

import { useAuth } from '@/context/AuthContext';
import { useFormikContext } from 'formik';
import { ScanLine } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { BarcodeScanner } from './scanner/BarcodeScanner';

interface BarcodeScannerInputProps {
    name: string;
    label?: string;
    placeholder?: string;
    hint?: string;
    required?: boolean;
}

export function BarcodeScannerInput({ name, label, placeholder = 'Scan or type the barcode', hint, required }: BarcodeScannerInputProps) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const formik = useFormikContext<any>();
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const value = formik?.values?.[name] || '';
    const error = formik?.touched?.[name] ? (formik?.errors?.[name] as string | undefined) : undefined;
    const fontSize = Platform.OS === 'web' && width >= 768 ? 14 : 16;

    const borderColor = error ? theme.danger : focused ? theme.primary : isDarkMode ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)';

    return (
        <View style={{ width: '100%', gap: 4 }}>
            {label ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 2 }}>
                    {label}
                    {required ? <Text style={{ color: theme.danger }}> *</Text> : null}
                </Text>
            ) : null}
            <View
                style={{
                    flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1.5, borderColor, borderRadius: 12,
                    backgroundColor: focused ? theme.panel : isDarkMode ? 'rgba(148,163,184,0.08)' : '#f4f7fc',
                    paddingLeft: 14, paddingRight: 4, gap: 6,
                }}
            >
                <TextInput
                    value={value}
                    onChangeText={(text) => formik.setFieldValue(name, text)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        setFocused(false);
                        formik.setFieldTouched(name, true);
                    }}
                    placeholder={placeholder}
                    placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ flex: 1, height: '100%', color: theme.text, fontFamily: theme.font.medium, fontSize, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) }}
                />
                <Pressable
                    onPress={() => setOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Scan with camera"
                    style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySoft, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
                >
                    <ScanLine size={18} color={theme.primary} strokeWidth={2.3} />
                </Pressable>
            </View>
            {error ? (
                <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12, paddingHorizontal: 2 }}>{error}</Text>
            ) : hint ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: 12, paddingHorizontal: 2 }}>{hint}</Text>
            ) : null}

            <BarcodeScanner
                visible={open}
                onClose={() => setOpen(false)}
                mode="single"
                title={label ? `Scan ${label.toLowerCase()}` : 'Scan a barcode'}
                onScan={(code) => {
                    formik.setFieldValue(name, code);
                    formik.setFieldTouched(name, true, false);
                    return { ok: true, label: code };
                }}
            />
        </View>
    );
}
