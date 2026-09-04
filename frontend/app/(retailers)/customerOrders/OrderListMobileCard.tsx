import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { OrderRecord } from './types';

interface MobileCardProps {
    order: OrderRecord;
    onOpenInvoice: () => void;
    statusConfig: { bg: string; text: string; dot: string };
    totalItemsCount: number;
}

export default function OrderListMobileCard({ order, onOpenInvoice, statusConfig, totalItemsCount }: MobileCardProps) {
    const { theme } = useAuth();
    const totalAmount = order.order_items?.reduce((acc, item) => acc + (Number(item.purchased_quantity || 0) * Number(item.item_final_price || 0)), 0) || 0;

    return (
        <View className="p-4 border rounded-2xl shadow-sm flex-col bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/80">
            <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{order.order_number || "UNSPECIFIED"}</Text>
                    <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">{order.created}</Text>
                </View>
                <View className={`px-2 py-0.5 rounded-md border flex-row items-center space-x-1 ${statusConfig.bg} ${statusConfig.text.replace('text-', 'border-')}`}>
                    <View className={`w-1 h-1 rounded-full ${statusConfig.dot}`} />
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className={`uppercase tracking-wide ${statusConfig.text}`}>{order.status}</Text>
                </View>
            </View>

            <View style={{ backgroundColor: theme.background }} className="mt-2.5 p-2 rounded-xl border border-slate-200/40 dark:border-slate-800/60 flex-col">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Customer Account</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5" numberOfLines={1}>{order.customer_name || "Walk-in Client"}</Text>
            </View>

            <View className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex-row justify-between items-center">
                <View>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Scope Summary</Text>
                    <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textDark }} className="mt-0.5">{totalItemsCount} total items</Text>
                </View>
                <View className="items-end">
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Value Total</Text>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-emerald-600 mt-0.5">KES {totalAmount.toFixed(2)}</Text>
                </View>
            </View>

            <TouchableOpacity onPress={onOpenInvoice} style={{ backgroundColor: theme.primary }} className="w-full h-9 rounded-xl items-center justify-center mt-3 active:opacity-90">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white uppercase tracking-wider">Inspect Invoice details</Text>
            </TouchableOpacity>
        </View>
    );
}
