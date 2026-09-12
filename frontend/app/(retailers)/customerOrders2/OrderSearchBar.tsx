import React from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
interface OrderSearchBarProps { searchQuery: string; onSearchChange: (text: string) => void; rowsPerPage: number; onRowsChange: (size: number) => void; theme: any; }
export const OrderSearchBar: React.FC<OrderSearchBarProps> = ({ searchQuery, onSearchChange, rowsPerPage, onRowsChange, theme }) => (
    <View className="w-full mb-6 flex-col md:flex-row gap-4 items-center">
        <TextInput placeholder="Search by order number or draft reference..." placeholderTextColor="#64748b" value={searchQuery} onChangeText={onSearchChange} style={{ fontFamily: theme.font.medium, fontSize: 16, color: theme.text, borderColor: theme.textDark + '20' }} className="flex-1 h-12 px-4 rounded-xl border bg-white dark:bg-slate-900 bg-slate-50 dark:bg-slate-950" />
        {Platform.OS === 'web' && (
            <View className="flex-row items-center space-x-2">
                <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 14 }}>Rows:</Text>
                <View style={{ borderColor: theme.textDark + '20' }} className="border rounded-xl bg-white dark:bg-slate-900 px-2 flex-row h-12 items-center">
                    {[10, 25, 50, 100].map((size) => (
                        <TouchableOpacity key={size} onPress={() => onRowsChange(size)} className={`px-3 h-8 items-center justify-center rounded-lg ${rowsPerPage === size ? 'bg-blue-500' : 'bg-transparent'}`}><Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: rowsPerPage === size ? '#ffffff' : theme.text }}>{size}</Text></TouchableOpacity>
                    ))}
                </View>
            </View>
        )}
    </View>
);
