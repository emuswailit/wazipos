import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
const UNITS = ["Gram", "Kilogram", "Litre", "Millilitre", "Piece", "Pack"];
export default function UnitOfReceiptDropdown({ formik, isDarkMode, theme }: { formik: any; isDarkMode: boolean; theme: any }) {
    const [showUnit, setShowUnit] = useState(false);
    const hasError = formik.errors.unit_of_receipt && formik.touched.unit_of_receipt;
    return (
        <View className="w-full md:flex-1 gap-y-1.5 relative">
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="text-[10px] font-bold uppercase tracking-wider">Select Unit *</Text>
            <TouchableOpacity onPress={() => setShowUnit(!showUnit)} className="w-full px-3.5 h-11 rounded-xl border shadow-xs flex-row justify-between items-center" style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: hasError ? '#ef4444' : (isDarkMode ? '#475569' : '#cbd5e1') }}>
                <Text style={{ color: formik.values.unit_of_receipt ? theme.text : '#94a3b8', fontFamily: theme.font.medium }} className="text-sm font-medium">{formik.values.unit_of_receipt || "Select Unit..."}</Text>
                <Text style={{ color: theme.textDark }} className="text-[10px]">▼</Text>
            </TouchableOpacity>
            {showUnit && (
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }} className="absolute top-[68px] left-0 right-0 max-h-40 rounded-xl border shadow-lg overflow-hidden z-50">
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {UNITS.map((u) => (
                            <TouchableOpacity key={u} onPress={() => { formik.setFieldValue('unit_of_receipt', u); setShowUnit(false); }} className="w-full p-2.5 border-b border-gray-100 dark:border-slate-800/60 last:border-b-0 active:bg-slate-50 dark:active:bg-slate-800/40">
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium }} className="text-xs font-semibold">{u}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
            {hasError && <Text className="text-red-500 text-[10px] pl-1 font-semibold">{formik.errors.unit_of_receipt}</Text>}
        </View>
    );
}
