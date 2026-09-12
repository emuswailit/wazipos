import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
interface FooterProps { currentPage: number; totalPages: number; itemsPerPage: number; totalItems: number; onPageChange: (page: number) => void; onLimitChange: (limit: number) => void; theme: any; isDarkMode: boolean; }
export default function OrderPaginationFooter({ currentPage, totalPages, itemsPerPage, totalItems, onPageChange, onLimitChange, theme, isDarkMode }: FooterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const limitOptions = [10, 25, 50, 100]; // ✅ Fixed incomplete syntax array token
    const startItem = Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1);
    const endItem = Math.min(totalItems, currentPage * itemsPerPage);
    return (
        <View style={{ borderTopColor: isDarkMode ? '#334155' : '#e2e8f0' }} className="w-full flex-row justify-between items-center py-4 mt-2 border-t relative z-50 bg-transparent">
            <View className="flex-row items-center space-x-2 relative">
                <Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.xs, color: theme?.textDark }}>Show rows:</Text>
                <TouchableOpacity onPress={() => setIsOpen(!isOpen)} style={{ backgroundColor: theme?.panel, borderColor: isDarkMode ? '#475569' : '#cbd5e1' }} className="px-3 h-8 border rounded-lg flex-row items-center justify-between min-w-[64px]">
                    <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.text }} className="font-bold">{itemsPerPage}</Text>
                    <Text style={{ color: theme?.textDark, fontSize: 10 }} className="ml-1 opacity-70">▼</Text>
                </TouchableOpacity>
                {isOpen && (
                    <View style={{ backgroundColor: theme?.panel, borderColor: isDarkMode ? '#475569' : '#cbd5e1' }} className="absolute bottom-9 left-16 border rounded-lg shadow-xl z-50 w-16 overflow-hidden">
                        {limitOptions.map(opt => (
                            <TouchableOpacity key={opt} onPress={() => { onLimitChange(opt); setIsOpen(false); }} className="w-full py-2 items-center active:bg-slate-100 dark:active:bg-slate-800">
                                <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.text }}>{opt}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
                <Text style={{ fontFamily: theme?.font?.regular, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="ml-4 opacity-60">Showing {startItem}-{endItem} of {totalItems}</Text>
            </View>
            <View className="flex-row items-center space-x-1 gap-x-1">
                <TouchableOpacity disabled={currentPage === 1} onPress={() => onPageChange(currentPage - 1)} style={{ borderColor: currentPage === 1 ? 'transparent' : (isDarkMode ? '#475569' : '#cbd5e1') }} className={`px-3 h-8 border rounded-lg items-center justify-center ${currentPage === 1 ? 'opacity-30' : 'active:bg-slate-100 dark:active:bg-slate-800'}`}>
                    <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.text }}>Previous</Text>
                </TouchableOpacity>
                <View className="px-3 h-8 items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.text }} className="font-bold">Page {currentPage} of {totalPages}</Text>
                </View>
                <TouchableOpacity disabled={currentPage === totalPages} onPress={() => onPageChange(currentPage + 1)} style={{ borderColor: currentPage === totalPages ? 'transparent' : (isDarkMode ? '#475569' : '#cbd5e1') }} className={`px-3 h-8 border rounded-lg items-center justify-center ${currentPage === totalPages ? 'opacity-30' : 'active:bg-slate-100 dark:active:bg-slate-800'}`}>
                    <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.text }}>Next</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
