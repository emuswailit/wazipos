import React from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface LogisticsFieldsProps {
    formik: any;
    onScanTrigger: () => void;
    isDarkMode: boolean;
    theme: any;
}

export default function LogisticsFields({ formik, onScanTrigger, isDarkMode, theme }: LogisticsFieldsProps) {
    return (
        <View className="gap-4">
            <View className="flex-row gap-3">
                <View className="flex-[1.5] gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Barcode Tracker</Text>
                    <View className="w-full relative justify-center">
                        <TextInput
                            className="w-full pl-3 pr-12 py-2.5 rounded-xl border text-sm font-medium"
                            style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#475569' : '#cbd5e1', color: theme.text }}
                            placeholder="Scan or Enter Code..."
                            placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                            value={formik.values.bar_code}
                            onChangeText={formik.handleChange('bar_code')}
                        />
                        <TouchableOpacity
                            onPress={onScanTrigger}
                            className="absolute right-2 px-2.5 py-1.5 rounded-md bg-blue-500/10 active:bg-blue-500/20"
                        >
                            <Text className="text-[10px] font-extrabold text-blue-500 uppercase">Scan</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Batch Ref No.</Text>
                    <TextInput
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#475569' : '#cbd5e1', color: theme.text }}
                        placeholder="Batch code..."
                        placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                        value={formik.values.batch}
                        onChangeText={formik.handleChange('batch')}
                    />
                </View>
            </View>

            <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Mfg Date</Text>
                    <TextInput
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#475569' : '#cbd5e1', color: theme.text }}
                        value={formik.values.manufacture_date}
                        onChangeText={formik.handleChange('manufacture_date')}
                    />
                </View>

                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Exp Date</Text>
                    <TextInput
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#475569' : '#cbd5e1', color: theme.text }}
                        value={formik.values.expiry_date}
                        onChangeText={formik.handleChange('expiry_date')}
                    />
                </View>
            </View>

            <View className="flex-row justify-between items-center py-2 border-t border-b" style={{ borderColor: isDarkMode ? '#334155' : '#f1f5f9' }}>
                <View>
                    <Text className="text-xs font-bold" style={{ color: theme.text }}>Bulky Package Freight</Text>
                    <Text className="text-[10px]" style={{ color: theme.textDark }}>Toggle if receipt is bulk wholesale package item.</Text>
                </View>
                <Switch
                    value={formik.values.is_bulky}
                    onValueChange={(val) => formik.setFieldValue('is_bulky', val)}
                    trackColor={{ false: '#767577', true: theme.primary }}
                />
            </View>
        </View>
    );
}
