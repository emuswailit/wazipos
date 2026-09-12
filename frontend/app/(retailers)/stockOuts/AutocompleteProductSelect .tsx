// frontend/app/(retailers)/stockOuts/AutocompleteProductSelect.tsx
import { ProductItem } from '@/databases/types';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Theme } from './types';

interface AutocompleteProps {
    theme: Theme; isDarkMode: boolean; options: ProductItem[];
    selectedValue: ProductItem | null; onChange: (value: ProductItem | null) => void;
    error?: string; touched?: boolean;
}

export default function AutocompleteProductSelect({
    theme, isDarkMode, options, selectedValue, onChange, error, touched
}: AutocompleteProps) {
    const [query, setQuery] = useState(selectedValue ? selectedValue.title : '');
    const [isOpen, setIsOpen] = useState(false);

    const filteredOptions = useMemo(() => {
        const safePool = Array.isArray(options) ? options : [];
        const norm = query.toLowerCase().trim();
        if (!norm) return safePool.slice(0, 15);
        return safePool.filter(o =>
            (o.title?.toLowerCase().includes(norm)) || (o.product_name?.toLowerCase().includes(norm)) ||
            (o.manufacturer_title?.toLowerCase().includes(norm)) || (o.bar_code?.includes(norm))
        ).slice(0, 15);
    }, [query, options]);

    return (
        <View className="flex-col w-full relative z-50 mb-4">
            <Text className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Select Product Identifier <Text className="text-rose-500">*</Text></Text>
            <View className="w-full relative">
                <TextInput
                    style={{ backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', color: theme.text, borderColor: touched && error ? '#ef4444' : (isDarkMode ? '#334155' : '#cbd5e1') }}
                    className="w-full px-3.5 py-2.5 border rounded-xl text-sm font-bold shadow-sm"
                    placeholder="Search cached catalog or scan barcode..." placeholderTextColor={isDarkMode ? '#475569' : '#94a3b8'}
                    value={query} onFocus={() => setIsOpen(true)}
                    onChangeText={(txt) => { setQuery(txt); if (selectedValue && selectedValue.title !== txt) onChange(null); setIsOpen(true); }}
                />
                {selectedValue && (
                    <TouchableOpacity onPress={() => { setQuery(''); onChange(null); setIsOpen(false); }} className="absolute right-3 top-3.5 bg-slate-200 dark:bg-slate-800 rounded-full w-4 h-4 flex items-center justify-center"><Text className="text-[9px] font-black text-slate-500">✕</Text></TouchableOpacity>
                )}
            </View>
            {touched && error && <Text className="text-xs font-bold text-rose-500 mt-1 pl-1">{error}</Text>}

            {isOpen && filteredOptions.length > 0 && (
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} className="absolute top-[68px] left-0 w-full rounded-xl border shadow-2xl z-50 max-h-[220px] overflow-hidden">
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {filteredOptions.map((opt) => (
                            <TouchableOpacity key={opt.id} onPress={() => { setQuery(opt.title); onChange(opt); setIsOpen(false); }} className="px-4 py-3 border-b last:border-b-0 border-slate-100 dark:border-slate-800 active:bg-slate-50 dark:active:bg-slate-800/50 flex-col">
                                <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">{opt.title}</Text>
                                <Text className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">{opt.preparation_title || 'N/A'} • {opt.manufacturer_title || 'Generic'}</Text>
                                <Text className="text-[10px] font-mono text-blue-500 dark:text-blue-400 mt-0.5">EAN: {opt.bar_code || 'N/A'}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}
