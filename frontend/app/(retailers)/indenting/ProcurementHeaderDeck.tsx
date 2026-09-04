import React from 'react';
import { Platform, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ProcurementHeaderDeck({
    theme, isDarkMode, daysToOrder, setDaysToOrder, leadTimeDays, setLeadTimeDays, lookbackWindow, setLookbackWindow, maxShelfDays, setMaxShelfDays, budgetCap, setBudgetCap, onlyShowBacklog, setOnlyShowBacklog, onApplyParams, isBudgetBreached, hasSelections, onDiscardIndent, isLarge, itemsPerPage, setItemsPerPage
}: any) {
    const inputStyle = "h-7 px-2 rounded border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 w-full";
    const columnContainerStyle = "w-[48%] md:w-[13%]";

    return (
        <View className="w-full flex-col space-y-1 py-0.5">
            <View className="flex-row flex-wrap md:flex-nowrap gap-1.5 w-full items-end">
                <View className={columnContainerStyle}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-tight mb-0.5">Days Order</Text><TextInput value={daysToOrder} onChangeText={setDaysToOrder} keyboardType="numeric" style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className={inputStyle} /></View>
                <View className={columnContainerStyle}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-tight mb-0.5">Lead (Days)</Text><TextInput value={leadTimeDays} onChangeText={setLeadTimeDays} keyboardType="numeric" style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className={inputStyle} /></View>
                <View className={columnContainerStyle}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-tight mb-0.5">Lookback</Text><TextInput value={lookbackWindow} onChangeText={setLookbackWindow} keyboardType="numeric" style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className={inputStyle} /></View>
                <View className={columnContainerStyle}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-tight mb-0.5">Max Shelf</Text><TextInput value={maxShelfDays} onChangeText={setMaxShelfDays} keyboardType="numeric" style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className={inputStyle} /></View>
                <View className={columnContainerStyle}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-tight mb-0.5">Budget Cap</Text><TextInput value={budgetCap} onChangeText={setBudgetCap} keyboardType="numeric" style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className={`${inputStyle} ${isBudgetBreached ? 'text-rose-600 dark:text-rose-400 border-rose-500/50 bg-rose-500/5' : 'text-emerald-600 dark:text-emerald-400'}`} /></View>

                {isLarge && Platform.OS === 'web' && (
                    <View className="w-[8%]">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-tight mb-0.5">Rows</Text>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            style={{ height: 28, paddingLeft: 6, paddingRight: 6, fontSize: theme.fontSize.sm, fontFamily: theme.font.medium, borderRadius: 4, width: '100%', borderColor: isDarkMode ? '#334155' : '#e2e8f0', backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', color: isDarkMode ? '#f8fafc' : '#0f172a', borderWidth: 1, borderStyle: 'solid' }}
                        >
                            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                        </select>
                    </View>
                )}

                <View className="flex-row items-center space-x-1.5 ml-auto pt-1 md:pt-0">
                    <TouchableOpacity onPress={onDiscardIndent} className="px-3 h-7 rounded border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/10 flex items-center justify-center active:scale-95">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-rose-600 dark:text-rose-400 uppercase tracking-tight">Close Indent</Text>
                    </TouchableOpacity>
                    {isLarge && (
                        <TouchableOpacity onPress={onApplyParams} style={{ backgroundColor: theme.primary, height: 28 }} className="px-4 rounded items-center justify-center shadow-sm active:scale-95">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white uppercase tracking-tight">Recalculate</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View className="flex-row justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800/40 md:mt-0">
                <View className="flex-row items-center space-x-2">
                    <Switch value={onlyShowBacklog} onValueChange={setOnlyShowBacklog} trackColor={{ false: '#cbd5e1', true: theme.primary }} thumbColor={isDarkMode ? '#f8fafc' : '#ffffff'} style={{ transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }] }} />
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-600 dark:text-slate-400">Deficit Only</Text>
                </View>
                {!isLarge && (
                    <TouchableOpacity onPress={onApplyParams} style={{ backgroundColor: theme.primary }} className="px-3 h-7 rounded flex items-center justify-center active:scale-95">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white uppercase tracking-tight">Recalculate</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
