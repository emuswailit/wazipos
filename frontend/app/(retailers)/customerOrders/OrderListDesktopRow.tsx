import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { OrderRecord } from './types';

interface DesktopRowProps {
    order: OrderRecord;
    onOpenInvoice: () => void;
    onRetryPayment: (order: OrderRecord) => Promise<void>;
    statusConfig: { bg: string; text: string; dot: string };
    totalItemsCount: number;
    isRetryingPayment: boolean;
}

export default function OrderListDesktopRow({ order, onOpenInvoice, onRetryPayment, statusConfig, totalItemsCount, isRetryingPayment }: DesktopRowProps) {
    const { theme } = useAuth();
    const totalAmount = order.order_items?.reduce((acc, item) => acc + (Number(item.purchased_quantity || 0) * Number(item.item_final_price || 0)), 0) || 0;

    return (
        <View className="flex-row items-center px-6 h-14 border-b border-neutral-100 dark:border-neutral-800/40 last:border-b-0 bg-white dark:bg-slate-900">
            <View className="flex-[1.2] pr-2">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{order.order_number || "UNSPECIFIED"}</Text>
                <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">{order.created}</Text>
            </View>
            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text }} className="flex-[1.5] pr-2" numberOfLines={1}>{order.customer_name || "Walk-in Client"}</Text>
            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.textDark }} className="flex-1 text-center">{totalItemsCount} U</Text>
            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="flex-1 text-right text-emerald-600 dark:text-emerald-400 pr-4">KES {totalAmount.toFixed(2)}</Text>

            <View className="flex-1 items-center justify-center">
                <View className={`w-24 py-1 rounded-md border flex-row items-center justify-center space-x-1.5 ${statusConfig.bg} ${statusConfig.text.replace('text-', 'border-')}`}>
                    <View className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className={`uppercase tracking-wide text-center ${statusConfig.text}`} numberOfLines={1}>{order.status}</Text>
                </View>
            </View>

            <View className="w-24 items-end flex-row justify-end space-x-1">
                <TouchableOpacity onPress={onOpenInvoice} className="px-2 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-blue-600 dark:text-blue-400">View</Text>
                </TouchableOpacity>
                {order.payment_status !== 'SUCCESS' && order.payment_status !== 'COMPLETED' && (
                    <TouchableOpacity disabled={isRetryingPayment} onPress={() => onRetryPayment(order)} className="w-8 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                        {isRetryingPayment ? <ActivityIndicator size="small" className="text-orange-500" /> : <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-orange-500">🔄</Text>}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
