import React, { useMemo } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { FrontendLocalIndentDocument, Theme } from './types';

interface FooterProps { theme: Theme; isDarkMode: boolean; submitting: boolean; indentDocument: FrontendLocalIndentDocument | null; budgetCap: string; onCommit: () => void; onPrintPdf: () => void; }

export default function IndentSummaryFooter({ theme, isDarkMode, submitting, indentDocument, budgetCap, onCommit, onPrintPdf }: FooterProps) {
    const summary = useMemo(() => {
        if (!indentDocument?.items?.length) return { count: 0, cost: 0, isOverBudget: false };
        const runningTotal = indentDocument.items.reduce((acc, i) => acc + i.total, 0);
        return { count: indentDocument.items.length, cost: runningTotal, isOverBudget: (parseFloat(budgetCap.replace(/[^0-9.]/g, '')) || 0) > 0 && runningTotal > (parseFloat(budgetCap.replace(/[^0-9.]/g, '')) || 0) };
    }, [indentDocument, budgetCap]);

    if (summary.count === 0) return null;

    return (
        <View className="flex-col w-full">
            {summary.isOverBudget && (<View className="w-full bg-rose-500/10 border-t border-rose-500/30 px-5 py-2"><Text className="text-[11px] font-black text-rose-600 dark:text-rose-400 tracking-wide uppercase text-center">⚠️ Budget Overrun Alert: Value breaks thresholds!</Text></View>)}
            <View className={`p-4 border-t flex-col md:flex-row justify-between items-center gap-4 shadow-2xl z-20 ${isDarkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'}`}>
                <View className="items-center md:items-start flex-col">
                    <Text className="text-sm font-black text-slate-900 dark:text-slate-50">Active Local Indent Draft Compiled</Text>
                    <Text className="text-xs font-semibold text-slate-500 mt-1 text-center md:text-left">{summary.count} unique lines | Total: <Text className={`font-black ${summary.isOverBudget ? 'text-rose-600' : 'text-emerald-600'}`}>KES {summary.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text></Text>
                </View>
                <View className="flex-row items-center gap-3 w-full md:w-auto">
                    <TouchableOpacity onPress={onPrintPdf} className="flex-1 md:flex-initial px-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 items-center justify-center"><Text className="text-xs font-bold text-blue-600 dark:text-blue-400">🖨️ Export PDF</Text></TouchableOpacity>
                    <TouchableOpacity onPress={onCommit} disabled={submitting} className={`flex-2 md:flex-initial px-6 py-3 rounded-xl shadow-md items-center justify-center ${summary.isOverBudget ? 'bg-rose-600' : 'bg-emerald-600'} ${submitting ? 'opacity-60' : ''}`}>{submitting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text className="text-xs font-black text-white uppercase tracking-wider">Generate Orders & Close</Text>}</TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
