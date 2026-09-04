import React, { useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import InvoiceItemRow from './InvoiceItemRow';
import { invoiceService } from './invoiceService';
import RecordCustomerPaymentModal from './RecordCustomerPaymentModal';
import { OrderRecord } from './types';

interface OrderInvoiceModalProps {
    order: OrderRecord | null;
    onClose: () => void;
    isDarkMode: boolean;
    isRetryingPayment: boolean;
    onRetryPayment: (order: OrderRecord) => Promise<void>;
    theme: any;
    onRefreshParentLedger: () => void;
}

export default function OrderInvoiceModal({ order, onClose, isDarkMode, isRetryingPayment, onRetryPayment, theme, onRefreshParentLedger }: OrderInvoiceModalProps) {
    const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [isPaymentGatewayOpen, setIsPaymentGatewayOpen] = useState<boolean>(false);

    if (!order) return null;

    const handleShare = async () => {
        setIsGeneratingPdf(true);
        try { await invoiceService.shareReceipt(order); }
        catch (error) { console.error("Receipt sharing routine faulted:", error); }
        finally { setIsGeneratingPdf(false); }
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const result = await invoiceService.downloadPdf(order);
            if (result && result !== 'web_success') {
                alert(result === 'android_success' ? 'Saved to storage folder!' : `Saved to app directory:\n${result}`);
            }
        } catch (error) {
            console.error("Direct file save routine faulted:", error);
            alert('Could not save PDF file onto local filesystem.');
        } finally {
            setIsDownloading(false);
        }
    };

    const totalCalculatedValue = order.order_items?.reduce((acc, item) => {
        return acc + (Number(item.purchased_quantity || 0) * Number(item.item_final_price || 0));
    }, 0) || 0;

    const isOrderSettled = order.payment_status === 'SUCCESS' || order.payment_status === 'COMPLETED' || order.is_paid === 'true';

    return (
        <>
            <Modal visible={!!order && !isPaymentGatewayOpen} animationType="fade" transparent={true} onRequestClose={onClose}>
                <View className="flex-1 justify-center items-center px-4 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs">
                    <View style={{ backgroundColor: theme?.panel || '#ffffff', width: Dimensions.get('window').width > 640 ? 540 : '100%' }} className="rounded-3xl shadow-xl overflow-hidden max-h-[85vh] flex-col bg-white dark:bg-slate-900">
                        <View style={{ borderBottomColor: `${theme?.textDark || '#334155'}10` }} className="p-5 border-b flex-row justify-between items-center bg-slate-50 dark:bg-slate-950">
                            <View className="flex-col pr-1 flex-1">
                                <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.lg || 16, color: theme?.text || '#0f172a' }} className="tracking-tight" numberOfLines={1}>Invoice {order.order_number}</Text>
                                <Text style={{ fontFamily: theme?.font?.regular || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.textDark || '#334155' }} className="mt-0.5">{order.created}</Text>
                            </View>
                            <TouchableOpacity className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 items-center justify-center" onPress={onClose}>
                                <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.text || '#0f172a' }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView className="p-6 flex-col" showsVerticalScrollIndicator={false}>
                            <View style={{ backgroundColor: theme?.background || '#f8fafc' }} className="rounded-2xl p-4 flex-col mb-4 space-y-2">
                                <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.textDark || '#334155' }}>Customer Name</Text><Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.text || '#0f172a' }}>{order.customer_name}</Text></View>
                                <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.textDark || '#334155' }}>Contact Phone</Text><Text style={{ fontFamily: theme?.font?.mono || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.text || '#0f172a' }}>{order.phone || 'N/A'}</Text></View>
                                <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.textDark || '#334155' }}>Payment Method</Text><Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.text || '#0f172a' }} className="uppercase tracking-wide">{order.selected_payment_method_title || 'N/A'}</Text></View>
                                <View className="flex-row justify-between">
                                    <Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.textDark || '#334155' }}>Payment Status</Text>
                                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10 }} className={`uppercase ${isOrderSettled ? 'text-emerald-500' : 'text-rose-500'}`}>{isOrderSettled ? 'SETTLED ✓' : 'UNPAID'}</Text>
                                </View>
                            </View>
                            <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.xs || 10, color: theme?.text || '#0f172a' }} className="uppercase tracking-widest mb-3">Invoice Items</Text>
                            <View className="flex-col space-y-3 mb-6">
                                {order.order_items?.map((item, idx) => (
                                    <InvoiceItemRow key={item.id || idx} item={item} theme={theme} />
                                ))}
                            </View>
                            <View style={{ backgroundColor: theme?.background || '#f8fafc' }} className="p-4 rounded-2xl flex-col mb-4 space-y-2">
                                <View className="flex-row justify-between pt-1 border-t border-slate-200/40 dark:border-slate-800/40">
                                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 12, color: theme?.text || '#0f172a' }}>Total Invoiced Amount</Text>
                                    <Text style={{ fontFamily: theme?.font?.mono || 'System', fontSize: theme?.fontSize?.base || 14 }} className="font-black text-emerald-600 dark:text-emerald-400">KES {totalCalculatedValue.toFixed(2)}</Text>
                                </View>
                            </View>
                        </ScrollView>
                        <View className="p-4 border-t flex-row items-center gap-2 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                            <TouchableOpacity disabled={isDownloading} onPress={handleDownload} className="flex-1 h-10 rounded-xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 flex items-center justify-center active:scale-95">
                                {isDownloading ? <ActivityIndicator size="small" className="text-blue-600" /> : <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 12 }} className="text-blue-600 dark:text-blue-400 font-bold">🖨️ Print PDF</Text>}
                            </TouchableOpacity>
                            {!isOrderSettled && (
                                <TouchableOpacity onPress={() => setIsPaymentGatewayOpen(true)} className="flex-1 h-10 rounded-xl flex items-center justify-center shadow-sm bg-blue-600 active:scale-95 shadow-blue-500/10">
                                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: theme?.fontSize?.sm || 12 }} className="text-white uppercase tracking-wider font-black">💳 Make Payment</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
            <RecordCustomerPaymentModal isOpen={isPaymentGatewayOpen} orderId={order.id} orderRef={order.order_number} onClose={() => { setIsPaymentGatewayOpen(false); onClose(); }} onRefreshParentLedger={onRefreshParentLedger} />
        </>
    );
}
