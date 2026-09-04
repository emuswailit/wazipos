import React from 'react';
import { Text, TextInput, View } from 'react-native';

interface PricingFieldsProps {
    formik: any;
    marginMetrics: { netProfit: number; marginPercentage: number; isLoss: boolean };
    isDarkMode: boolean;
    theme: any;
}

export default function PricingFields({ formik, marginMetrics, isDarkMode, theme }: PricingFieldsProps) {
    return (
        <View className="gap-4">
            <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Selling Price *</Text>
                    <TextInput
                        keyboardType="numeric"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{
                            backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                            borderColor: formik.errors.unit_selling_price && formik.touched.unit_selling_price ? '#ef4444' : (isDarkMode ? '#475569' : '#cbd5e1'),
                            color: theme.text
                        }}
                        placeholder="0.00"
                        placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                        value={formik.values.unit_selling_price}
                        onChangeText={formik.handleChange('unit_selling_price')}
                        onBlur={formik.handleBlur('unit_selling_price')}
                    />
                    {formik.errors.unit_selling_price && formik.touched.unit_selling_price && (
                        <Text className="text-red-500 text-[10px] font-bold mt-0.5">{formik.errors.unit_selling_price}</Text>
                    )}
                </View>

                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Price Discount</Text>
                    <TextInput
                        keyboardType="numeric"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#475569' : '#cbd5e1', color: theme.text }}
                        placeholder="0.00"
                        placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                        value={formik.values.unit_price_discount}
                        onChangeText={formik.handleChange('unit_price_discount')}
                    />
                </View>
            </View>

            <View className={`p-3 rounded-xl flex-row justify-between items-center ${marginMetrics.isLoss ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                <Text className="text-xs font-bold" style={{ color: theme.text }}>Yield Forecast:</Text>
                <Text className={`text-xs font-extrabold ${marginMetrics.isLoss ? 'text-red-500' : 'text-emerald-500'}`}>
                    KES {marginMetrics.netProfit.toFixed(2)} ({marginMetrics.marginPercentage.toFixed(1)}%)
                </Text>
            </View>
        </View>
    );
}
