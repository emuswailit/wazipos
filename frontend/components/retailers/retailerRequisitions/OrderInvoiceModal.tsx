import { useAuth } from '@/context/AuthContext';
import React, { useState } from 'react';
import { Alert, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import RecordPaymentModal from './RecordPaymentModal';

export default function OrderInvoiceModal({ order, visible, onClose, onRefreshParentLedger }: any) {
    const { theme } = useAuth();
    const [isPaymentGatewayOpen, setIsPaymentGatewayOpen] = useState(false);
    if (!order) return null;

    return (
        <>
            <Modal visible={visible && !isPaymentGatewayOpen} transparent animationType="fade" onRequestClose={onClose}>
                <View className="flex-1 bg-black/50 justify-center items-center p-4">
                    <View className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex-col max-h-[85vh] bg-white dark:bg-slate-900">
                        <View className="px-5 py-3.5 border-b flex-row justify-between items-center bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                            <View>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }}>Invoice Details</Text>
                                <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase mt-0.5">Ref: {order.document_number}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView className="p-5 flex-1" showsVerticalScrollIndicator={false}>
                            <View className="flex-row flex-wrap justify-between gap-4 mb-4">
                                <View className="w-[45%]"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Vendor Supplier</Text><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5">{order.wholesaler_title}</Text></View>
                                <View className="w-[45%]"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Retailer Client</Text><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5">{order.retailer_title}</Text></View>
                                <View className="w-[45%]"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Creation Timeline</Text><Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5">{order.created}</Text></View>
                                <View className="w-[45%]"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Settlement Condition</Text><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="mt-0.5 text-rose-500">{order.is_paid === "true" ? "Settled ✓" : "Unpaid Balance"}</Text></View>
                            </View>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">Itemized Line Entries Ledger</Text>
                            {order.order_items?.map((item: any, idx: number) => (
                                <View key={item.id || String(idx)} className="py-2 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0 flex-row justify-between items-center">
                                    <View className="flex-1 pr-2">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{item.product_title || "Line Entry"}</Text>
                                        <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">Batch: {item.batch || 'N/A'} | Expiry: {item.expiry_date || 'N/A'}</Text>
                                    </View>
                                    <View className="items-end pl-2">
                                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.text }} className="font-bold">Qty: {item.purchased_quantity} U</Text>
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-emerald-600 mt-0.5">Bonus: +{item.discount_quantity} U</Text>
                                    </View>
                                </View>
                            ))}
                            <View style={{ backgroundColor: theme.background }} className="mt-5 p-3 rounded-xl border border-slate-200/40 flex-col space-y-1.5">
                                <View className="flex-row justify-between"><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Order Base Price Total</Text><Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.text }} className="font-bold">KES {Number(order.order_price_total || 0).toFixed(2)}</Text></View>
                                <View className="flex-row justify-between"><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Order Discounts Apportioned</Text><Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className="font-bold text-rose-500">- KES {Number(order.order_discount_total || 0).toFixed(2)}</Text></View>
                                <View className="flex-row justify-between"><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Logistics Shipping Amount</Text><Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.text }} className="font-bold">KES {Number(order.shipping_amount || 0).toFixed(2)}</Text></View>
                                <View className="flex-row justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700/60"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-500">Net Invoice Final Total</Text><Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.base }} className="font-black text-emerald-600 dark:text-emerald-400">KES {Number(order.final_price_total || 0).toFixed(2)}</Text></View>
                            </View>
                        </ScrollView>
                        <View className="p-4 border-t flex-row items-center gap-2 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                            <TouchableOpacity onPress={() => Platform.OS === 'web' ? window.alert("Compiling Print Stream...") : Alert.alert("Print", "Compiling layout stream...")} className="flex-1 h-9 rounded-xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 flex items-center justify-center"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-blue-600 dark:text-blue-400">🖨️ Print PDF</Text></TouchableOpacity>
                            {order.is_paid !== "true" && (
                                <TouchableOpacity onPress={() => setIsPaymentGatewayOpen(true)} className="flex-1 h-9 rounded-xl flex items-center justify-center shadow-sm bg-blue-600 active:scale-95 shadow-blue-500/10"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white uppercase tracking-wider">Make Payment</Text></TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
            <RecordPaymentModal isOpen={isPaymentGatewayOpen} orderId={order.id} orderRef={order.document_number} onClose={() => { setIsPaymentGatewayOpen(false); onClose(); }} onRefreshParentLedger={onRefreshParentLedger} />
        </>
    );
}
