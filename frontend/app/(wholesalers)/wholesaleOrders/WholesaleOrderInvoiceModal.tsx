import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import InvoiceLineItemsTable from './InvoiceLineItemsTable';
import RecordPaymentModal from './RecordPaymentModal';
import { generateAndPrintInvoice } from './UniversalPrintService';

interface InvoiceModalProps {
    isOpen: boolean;
    order: any;
    onClose: () => void;
}

export default function WholesaleOrderInvoiceModal({ isOpen, order, onClose }: InvoiceModalProps) {
    const { theme } = useAuth();
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);

    if (!order) return null;
    const isPaid = order.is_paid === 'true';

    const handlePrintStatementPayload = async () => {
        await generateAndPrintInvoice(order, theme);
    };

    const handleCreatePaymentTransaction = () => {
        setIsPaymentOpen(true);
    };

    return (
        <Modal visible={isOpen} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center p-4 bg-black/60 web:py-12">
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full max-w-4xl h-[90%] md:h-auto max-h-[85vh] rounded-2xl border shadow-2xl overflow-hidden flex-col">
                    <View style={{ borderBottomColor: theme.border, backgroundColor: theme.background }} className="px-6 py-4 border-b flex-row justify-between items-center">
                        <View className="flex-row items-center gap-x-2">
                            <Text style={{ color: theme.text }} className="text-base font-black tracking-wide">INVOICE STATEMENT</Text>
                            <View style={{ backgroundColor: isPaid ? '#22c55e15' : '#ef444415' }} className="px-2 py-0.5 rounded-md">
                                <Text style={{ color: isPaid ? '#22c55e' : '#ef4444' }} className="text-[10px] font-black tracking-widest uppercase">{isPaid ? 'PAID' : 'PENDING'}</Text>
                            </View>
                        </View>
                        <Pressable onPress={onClose} className="p-1 active:opacity-70">
                            <Text style={{ color: theme.primary }} className="text-sm font-black uppercase tracking-wider">✕ Close</Text>
                        </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 24 }} className="flex-1 w-full" keyboardShouldPersistTaps="handled">
                        <View className="flex-row flex-wrap justify-between gap-y-4 mb-6">
                            <View className="flex-1 min-w-[240px]">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-widest opacity-60">Wholesaler Broker Node</Text>
                                <Text style={{ color: theme.text }} className="text-base font-black mt-0.5">{order.wholesaler_title || 'N/A'}</Text>
                                <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-1">Origin: {order.order_origin || 'STAFF'}</Text>
                                <Text style={{ color: theme.textDark }} className="text-xs font-medium">Ref: {order.reference_number || 'N/A'}</Text>
                            </View>
                            <View className="flex-1 min-w-[240px] md:items-end">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-widest opacity-60">Retailer Customer Target</Text>
                                <Text style={{ color: theme.text }} className="text-base font-black mt-0.5">{order.retailer_title || 'N/A'}</Text>
                                <Text style={{ color: theme.textDark }} className="text-xs font-mono mt-1">Draft Token: {order.draft_id || 'N/A'}</Text>
                                <Text style={{ color: theme.textDark }} className="text-xs font-medium">Date: {order.created || 'N/A'}</Text>
                            </View>
                        </View>
                        <View style={{ backgroundColor: theme.background }} className="p-4 rounded-xl mb-6 flex-row flex-wrap justify-between gap-4">
                            <View className="flex-1 min-w-[120px]">
                                <Text style={{ color: theme.textDark }} className="text-[9px] uppercase font-black opacity-60">Settlement</Text>
                                <Text style={{ color: theme.text }} className="text-xs font-bold mt-0.5">{order.payment_method_title || order.order_terms || 'CASH'}</Text>
                            </View>
                            <View className="flex-1 min-w-[120px]">
                                <Text style={{ color: theme.textDark }} className="text-[9px] uppercase font-black opacity-60">Status</Text>
                                <Text style={{ color: theme.primary }} className="text-xs font-bold mt-0.5 uppercase tracking-wide">{order.status || 'SUBMITTED'}</Text>
                            </View>
                            <View className="flex-1 min-w-[120px]">
                                <Text style={{ color: theme.textDark }} className="text-[9px] uppercase font-black opacity-60">Dispatched</Text>
                                <Text style={{ color: theme.text }} className="text-xs font-bold mt-0.5">{order.is_dispatched === 'true' ? 'Yes' : 'No'}</Text>
                            </View>
                            <View className="flex-1 min-w-[120px]">
                                <Text style={{ color: theme.textDark }} className="text-[9px] uppercase font-black opacity-60">Delivered</Text>
                                <Text style={{ color: theme.text }} className="text-xs font-bold mt-0.5">{order.is_delivered === 'true' ? 'Yes' : 'No'}</Text>
                            </View>
                        </View>
                        <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider mb-3">Line Items Specification Ledger</Text>
                        <InvoiceLineItemsTable theme={theme} items={order.order_items} />
                        <View className="w-full flex-row flex-wrap md:justify-between items-start gap-4">
                            <View className="flex-1 min-w-[260px] flex-row items-center gap-x-3 mt-4">
                                <TouchableOpacity onPress={handlePrintStatementPayload} className="flex-1 py-3 px-4 rounded-xl border items-center justify-center" style={{ borderColor: theme.primary, backgroundColor: theme.panel }}>
                                    <Text style={{ color: theme.primary }} className="text-xs font-black uppercase">🖨️ Print Invoice</Text>
                                </TouchableOpacity>
                                {!isPaid && (
                                    <TouchableOpacity onPress={handleCreatePaymentTransaction} style={{ backgroundColor: theme.primary }} className="flex-1 py-3 px-4 rounded-xl items-center justify-center shadow-md">
                                        <Text className="text-white text-xs font-black uppercase">💵 Create Payment</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View className="w-full md:w-80 flex-col gap-y-2">
                                <View className="flex-row justify-between items-center">
                                    <Text style={{ color: theme.textDark }} className="text-xs font-semibold">Subtotal Items Total:</Text>
                                    <Text style={{ color: theme.text }} className="text-xs font-bold">KES {parseFloat(order.order_price_total || 0).toFixed(2)}</Text>
                                </View>
                                <View className="flex-row justify-between items-center">
                                    <Text style={{ color: theme.textDark }} className="text-xs font-semibold">Discounts Given:</Text>
                                    <Text className="text-xs font-bold text-red-500">- KES {parseFloat(order.order_discount_total || 0).toFixed(2)}</Text>
                                </View>
                                <View className="flex-row justify-between items-center">
                                    <Text style={{ color: theme.textDark }} className="text-xs font-semibold">Shipping Amount Matrix:</Text>
                                    <Text style={{ color: theme.text }} className="text-xs font-bold">KES {parseFloat(order.shipping_amount || 0).toFixed(2)}</Text>
                                </View>
                                <View style={{ borderTopColor: theme.border }} className="flex-row justify-between items-center pt-2.5 border-t mt-1">
                                    <Text style={{ color: theme.text }} className="text-sm font-black">Net Final Invoice Value:</Text>
                                    <Text style={{ color: theme.primary }} className="text-lg font-black">KES {parseFloat(order.final_price_total || order.order_price_total || 0).toFixed(2)}</Text>
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
            <RecordPaymentModal
                isOpen={isPaymentOpen}
                orderId={order.id}
                orderRef={order.reference_number}
                onClose={() => setIsPaymentOpen(false)}
                onRefreshParentLedger={() => alert('Refreshing ledger transactions history logs...')}
            />
        </Modal>
    );
}
