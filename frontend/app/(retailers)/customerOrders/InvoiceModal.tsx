import { useAuth } from '@/context/AuthContext';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import RecordCustomerPaymentModal from './RecordCustomerPaymentModal';
import { CustomerOrder } from './types';

interface InvoiceModalProps {
    order: CustomerOrder | null;
    onClose: () => void;
    onRefresh?: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, onClose, onRefresh }) => {
    const { theme } = useAuth();
    const [isPayOpen, setIsPayOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // ✅ FIX 1: Auto-clear timer declared safely at the top level scope
    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => setStatusMessage(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    // ✅ FIX 2: Client name memo declared safely before the conditional guard block
    const derivedClientName = useMemo(() => {
        if (!order?.customer_name) return "Walk-in Customer";
        return order.customer_name
            .replace(/\d+/g, '')
            .trim()
            .split(/\s+/)
            .filter(w => w.toUpperCase() !== 'TEST')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ') || order.customer_name;
    }, [order?.customer_name]);

    // 🛡️ Safe Guard Clause: React hooks have all loaded successfully above this boundary line
    if (!order) return null;

    const isPaid = order.is_paid === 'true';

    return (
        <View className="absolute inset-0 bg-black/50 justify-center items-center p-4 z-40">
            <View
                style={{ backgroundColor: theme.panel, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }}
                className="w-full max-w-2xl rounded-2xl p-6 h-[80%] shadow-2xl border"
            >
                {/* Header Section */}
                <View
                    style={{ borderBottomColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }}
                    className="flex-row justify-between items-center pb-3 mb-4 border-b flex-none"
                >
                    <View>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }} className="uppercase font-bold">Invoice Details</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, color: theme.textDark }} className="font-mono mt-0.5">REF: {order.order_number}</Text>
                    </View>
                    <TouchableOpacity onPress={() => onClose()} className="p-1">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.textDark }} className="font-bold">✕</Text>
                    </TouchableOpacity>
                </View>

                {statusMessage && (
                    <View className="mb-4 bg-blue-50/10 border border-blue-500/30 rounded-xl p-3 flex-none">
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.primary }} className="text-center">{statusMessage}</Text>
                    </View>
                )}

                {/* Scrollable Summary Log */}
                <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                    <View style={{ backgroundColor: theme.isDarkMode ? '#0f172a' : '#f8fafc' }} className="p-4 rounded-xl mb-5 flex-row flex-wrap justify-between gap-y-3">
                        <View className="w-1/2">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }}>Vendor Store</Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>{order.entity_title}</Text>
                        </View>
                        <View className="w-1/2">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }}>Client</Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>{derivedClientName}</Text>
                        </View>
                        <View style={{ borderTopColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="w-1/2 border-t pt-2">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }} className="mb-0.5">Status</Text>
                            <View className="flex-row">
                                <View className={`px-2 py-0.5 rounded ${isPaid ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className={isPaid ? 'text-emerald-500' : 'text-rose-500'}>
                                        {isPaid ? 'PAID' : 'UNPAID'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View style={{ borderTopColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="w-1/2 border-t pt-2">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }}>Method</Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="uppercase font-bold">
                                {order.selected_payment_method_title || "N/A"}
                            </Text>
                        </View>
                    </View>

                    {/* Table Header Wrapper */}
                    <View style={{ backgroundColor: theme.isDarkMode ? '#1e293b' : '#e2e8f0' }} className="flex-row p-2 rounded-lg mb-2">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.text }} className="w-6/12 font-bold pl-1">Description</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.text }} className="w-2/12 font-bold text-center">Qty</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.text }} className="w-4/12 font-bold text-right pr-2">Total</Text>
                    </View>

                    {/* Line Items Map Loop */}
                    {order.order_items?.map((item: any, idx: number) => (
                        <View key={item.id || String(idx)} style={{ borderBottomColor: theme.isDarkMode ? '#1e293b' : '#f1f5f9' }} className="flex-row items-center py-3 border-b bg-white">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.text }} className="w-6/12 px-1" numberOfLines={2}>
                                {item.title || item.receipt_details?.product_title || "Product"}
                            </Text>
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }} className="w-2/12 text-center">
                                {item.purchased_quantity || 1}
                            </Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.text }} className="w-4/12 font-bold text-right pr-2">
                                KES {parseFloat(item.item_price_total || '0').toFixed(2)}
                            </Text>
                        </View>
                    ))}

                    {/* Aggregate Summary Block */}
                    <View style={{ borderTopColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="mt-6 pt-4 border-t items-end pr-2">
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textDark }}>Total Due</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xl, color: theme.primary }} className="font-black mt-0.5">
                            KES {parseFloat(order.order_price_total || '0').toFixed(2)}
                        </Text>
                    </View>
                </ScrollView>

                {/* Footer Actions Controls */}
                <View style={{ borderTopColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="flex-row justify-end gap-3 mt-4 pt-4 border-t flex-none">
                    <TouchableOpacity
                        style={{ backgroundColor: theme.isDarkMode ? '#0f172a' : '#f8fafc', borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }}
                        className="py-2.5 px-5 rounded-xl border"
                        onPress={() => setStatusMessage(`🖨️ Printing receipt document flow for Order #${order.order_number}...`)}
                    >
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.textDark }} className="font-bold uppercase">Print PDF</Text>
                    </TouchableOpacity>
                    {!isPaid && (
                        <TouchableOpacity
                            style={{ backgroundColor: theme.primary }}
                            className="py-2.5 px-5 rounded-xl shadow-md"
                            onPress={() => setIsPayOpen(true)}
                        >
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white font-bold uppercase">Make Payment</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Linked Hook-Driven Transaction Overlay Modal */}
            <RecordCustomerPaymentModal
                isOpen={isPayOpen}
                orderId={order.id}
                orderRef={order.order_number}
                onClose={() => {
                    setIsPayOpen(false);
                    onClose();
                }}
                onRefreshParentLedger={onRefresh}
            />
        </View>
    );
};
