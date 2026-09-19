import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
export function OrderTable({ orders, onSelect, getStatusStyle }: any) {
    const { theme } = useAuth();
    return (
        <View className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm mb-4 bg-white dark:bg-slate-900">
            <View className="flex-row items-center py-3 px-5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[20%] text-slate-400 uppercase tracking-wider">Order Ref & Date</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[25%] text-slate-400 uppercase tracking-wider">Wholesaler Supplier</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[10%] text-slate-400 uppercase tracking-wider text-center">Items Scope</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[13%] text-slate-400 uppercase tracking-wider text-right">Value Total</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[12%] text-slate-400 uppercase tracking-wider text-center">Payment</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[12%] text-slate-400 uppercase tracking-wider text-center">Status</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[8%] text-slate-400 uppercase tracking-wider text-center">Action</Text>
            </View>
            {orders.map((order: any, idx: number) => (
                <View key={order.id || String(idx)} className="flex-row items-center py-2.5 px-5 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0">
                    <View className="w-[20%] pr-2">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{order.document_number || "UNSPECIFIED"}</Text>
                        <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">{order.created}</Text>
                    </View>
                    <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text }} className="w-[25%] pr-2" numberOfLines={1}>{order.wholesaler_title}</Text>
                    <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.textDark }} className="w-[10%] text-center">{order.order_items?.length || 0} Lines</Text>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="w-[13%] text-right text-emerald-600 dark:text-emerald-400 pr-2">KES {Number(order.final_price_total || 0).toFixed(2)}</Text>
                    <View className="w-[12%] items-center justify-center">
                        <View className={`w-20 py-0.5 rounded border items-center justify-center ${order.is_paid === 'true' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'}`}>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase text-center">{order.is_paid === 'true' ? 'PAID ✓' : 'UNPAID'}</Text>
                        </View>
                    </View>
                    <View className="w-[12%] items-center justify-center">
                        <View className={`w-24 py-1 rounded-md border items-center justify-center ${getStatusStyle(order.status)}`}>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase tracking-wide text-center" numberOfLines={1}>{order.status}</Text>
                        </View>
                    </View>
                    <View className="w-[8%] items-end">
                        <TouchableOpacity onPress={() => onSelect(order)} className="px-3 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center active:scale-95">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-blue-600 dark:text-blue-400 whitespace-nowrap">View Details</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </View>
    );
}
export function OrderCardDeck({ orders, onSelect, getStatusStyle }: any) {
    const { theme } = useAuth();
    return (
        <View className="w-full flex-col">
            {orders.map((order: any, idx: number) => (
                <View key={order.id || String(idx)} className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl mb-3 flex-col shadow-sm bg-white dark:bg-slate-900">
                    <View className="flex-row justify-between items-start">
                        <View>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} className="font-black text-sm">{order.document_number}</Text>
                            <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">{order.created}</Text>
                        </View>
                        <View className="flex-row items-center space-x-1">
                            <View className={`px-2 py-0.5 rounded border ${order.is_paid === 'true' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-rose-500/10 border-rose-500/20 text-rose-600'}`}>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase tracking-wide">{order.is_paid === 'true' ? 'PAID' : 'UNPAID'}</Text>
                            </View>
                            <View className={`px-2 py-0.5 rounded border ${getStatusStyle(order.status)}`}>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase tracking-wide">{order.status}</Text>
                            </View>
                        </View>
                    </View>
                    <View className="mt-2.5 p-2 rounded-xl border bg-slate-50 dark:bg-slate-950 border-slate-200/40 dark:border-slate-800/60">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Vendor Supplier</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5">{order.wholesaler_title}</Text>
                    </View>
                    <View className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex-row justify-between items-center">
                        <View>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Value Total</Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-emerald-600 mt-0.5">KES {Number(order.final_price_total || 0).toFixed(2)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => onSelect(order)} className="px-3 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center active:scale-95">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-blue-600 dark:text-blue-400">Details</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </View>
    );
}
