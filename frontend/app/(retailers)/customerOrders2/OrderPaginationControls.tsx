import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
interface OrderPaginationControlsProps { totalPages: number; currentPage: number; onPageChange: React.Dispatch<React.SetStateAction<number>>; filteredCount: number; theme: any; }
export const OrderPaginationControls: React.FC<OrderPaginationControlsProps> = ({ totalPages, currentPage, onPageChange, filteredCount, theme }) => {
    if (Platform.OS !== 'web' || totalPages <= 1) return null;
    return (
        <View className="hidden md:flex flex-row justify-between items-center mt-6 px-2">
            <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 14 }}>Showing page {currentPage} of {totalPages} ({filteredCount} orders total)</Text>
            <View className="flex-row space-x-2">
                <TouchableOpacity disabled={currentPage === 1} onPress={() => onPageChange(prev => Math.max(1, prev - 1))} style={{ borderColor: theme.textDark + '20' }} className={`px-4 py-2 rounded-xl border bg-white dark:bg-slate-900 ${currentPage === 1 ? 'opacity-40' : 'active:bg-slate-50'}`}><Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: theme.text }}>Previous</Text></TouchableOpacity>
                <TouchableOpacity disabled={currentPage === totalPages} onPress={() => onPageChange(prev => Math.min(totalPages, prev + 1))} style={{ borderColor: theme.textDark + '20' }} className={`px-4 py-2 rounded-xl border bg-white dark:bg-slate-900 ${currentPage === totalPages ? 'opacity-40' : 'active:bg-slate-50'}`}><Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: theme.text }}>Next</Text></TouchableOpacity>
            </View>
        </View>
    );
};
