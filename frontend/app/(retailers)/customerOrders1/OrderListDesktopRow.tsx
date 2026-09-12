import { useAuth } from '@/context/AuthContext';
import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import RecordCustomerPaymentModal from './RecordCustomerPaymentModal';
interface DesktopRowProps { order: any; onOpenInvoice: () => void; statusConfig: { bg: string; text: string; dot: string }; totalItemsCount: number; theme: any; }
export default function OrderListDesktopRow({ order, onOpenInvoice, totalItemsCount, theme }: DesktopRowProps) {
    const { isDarkMode } = useAuth();
    const [payModalOpen, setPayModalOpen] = useState(false);
    const itemsList = useMemo(() => Array.isArray(order.customerOrderItems) ? order.customerOrderItems : (Array.isArray(order.order_items) ? order.order_items : []), [order]);
    const totalAmount = useMemo(() => itemsList.reduce((acc: number, item: any) => {
        const qty = Number(item.purchased_quantity || 0);
        const uprice = Number(item.unit_selling_price || item.item_final_price || item.price || 0); // 🚀 Unified Key
        return acc + (qty * uprice) - Number(item.item_discount || 0);
    }, 0), [itemsList]);
    const orderDisplayPrice = totalAmount + (Number(order.shippingCost || order.shipping_amount) || 0);
    const inferredPaymentMethodTitle = useMemo(() => {
        if (order.paymentAccountNumber?.trim().length > 0 || String(order.selectedPaymentMethodId || order.payment_method).toLowerCase().includes('money')) return "MOBILE MONEY";
        if (order.is_paid === false || order.is_paid === 'false') return "CREDIT LEDGER";
        return "CASH PAYMENT";
    }, [order]);
    const formattedDateTimeString = useMemo(() => {
        const ts = order.updatedAt || order.updated || order.created;
        if (!ts) return 'Pending';
        try { const dateObj = new Date(ts); return `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; } catch { return 'Pending'; }
    }, [order]);
    const needsSettlementAction = order.is_paid === false || order.is_paid === 'false' || order.status === 'PENDING' || order.status === 'OPEN';
    return (
        <View style={{ borderBottomColor: isDarkMode ? '#1e293b' : '#f1f5f9' }} className="flex-row items-center px-6 h-14 border-b last:border-b-0 bg-transparent">
            <View className="flex-[2.5] pr-2 flex-col justify-center">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} numberOfLines={1}>{order.order_number || order.draftId || "AWAITING SYNC"}</Text>
                <Text style={{ fontFamily: theme.font.regular, fontSize: 10, color: '#94a3b8' }} className="mt-0.5 truncate" numberOfLines={1}>{formattedDateTimeString}</Text>
            </View>
            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text }} className="flex- pr-2" numberOfLines={1}>{order.customerName || order.customer_name || "Walk-in Retail Client"}</Text>
            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.textDark }} className="flex-[1.2] text-center font-mono">{totalItemsCount} Pcs</Text>
            <Text style={{ fontFamily: theme.font.bold, fontSize: 11, color: theme.textDark }} className="flex-[1.5] text-center font-bold uppercase tracking-wider opacity-80">{inferredPaymentMethodTitle}</Text>
            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: isDarkMode ? '#10b981' : '#059669' }} className="flex-[1.5] text-right pr-4 font-bold">KES {orderDisplayPrice.toFixed(2)}</Text>
            <View className="flex-[1.5] items-center justify-center">
                <View className={`px-2.5 py-1 rounded-full items-center justify-center border ${order.synced ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: order.synced ? '#10b981' : '#f43f5e' }} className="font-bold uppercase tracking-wider text-center">{order.synced ? "Cloud Synced" : "Device Cache"}</Text>
                </View>
            </View>
            <View className="flex-[1.2] flex-row justify-end items-center gap-x-2">
                {needsSettlementAction && (
                    <TouchableOpacity onPress={() => setPayModalOpen(true)} style={{ backgroundColor: `${theme.primary}15` }} className="px-2 py-1 rounded-lg border border-transparent active:opacity-60">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.primary }} className="font-bold uppercase tracking-wide">💳 Pay</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onOpenInvoice} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 active:opacity-70"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.text }} className="font-bold">View</Text></TouchableOpacity>
            </View>
            {payModalOpen && <RecordCustomerPaymentModal isOpen={payModalOpen} orderId={order.draftId} orderRef={order.order_number || order.draftId} onClose={() => setPayModalOpen(false)} />}
        </View>
    );
}
