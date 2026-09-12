import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Theme } from './types';

interface PaginationProps { theme: Theme; currentPage: number; totalPages: number; totalEntries: number; itemsPerPage: number; onPageChange: (page: number) => void; }

export default function ProcurementListPagination({ theme, currentPage, totalPages, totalEntries, itemsPerPage, onPageChange }: PaginationProps) {
    return (
        <View className="mt-2 mb-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex-row items-center justify-between">
            <TouchableOpacity disabled={currentPage === 1} onPress={() => onPageChange(currentPage - 1)} className={`px-4 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center ${currentPage === 1 ? 'opacity-30' : 'active:scale-95'}`}><Text style={{ color: theme.textDark }} className="text-xs font-bold">◀ Prev</Text></TouchableOpacity>
            <View className="items-center flex-1 px-2">
                <Text style={{ color: theme.text }} className="text-xs font-extrabold">Page {currentPage} of {totalPages}</Text>
                <Text className="text-[10px] text-slate-400 mt-0.5 text-center font-medium">Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalEntries)} of {totalEntries}</Text>
            </View>
            <TouchableOpacity disabled={currentPage === totalPages} onPress={() => onPageChange(currentPage + 1)} className={`px-4 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center ${currentPage === totalPages ? 'opacity-30' : 'active:scale-95'}`}><Text style={{ color: theme.textDark }} className="text-xs font-bold">Next ▶</Text></TouchableOpacity>
        </View>
    );
}
