import React, { useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { invoiceService } from './invoiceService';
interface OrderInvoiceDetailsModalProps { visible: boolean; order: any | null; onClose: () => void; isDarkMode: boolean; theme: any; }
export const OrderInvoiceDetailsModal: React.FC<OrderInvoiceDetailsModalProps> = ({ visible, order, onClose, isDarkMode, theme }) => {
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    if (!order) return null;
    const handleShare = async () => {
        setIsGeneratingPdf(true);
        try { await invoiceService.shareReceipt(order); }
        catch (error) { console.error(error); }
        finally { setIsGeneratingPdf(false); }
    };
    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const result = await invoiceService.downloadPdf(order);
            if (result && result !== 'web_success') { alert(result === 'android_success' ? 'Saved to storage folder!' : `Saved:\n${result}`); }
        } catch { alert('Could not save PDF file onto local filesystem.'); }
        finally { setIsDownloading(false); }
    };
    const itemsList = Array.isArray(order.customerOrderItems) ? order.customerOrderItems : (Array.isArray(order.order_items) ? order.order_items : []);
    const totalCalculatedValue = itemsList.reduce((acc: number, item: any) => acc + (Number(item.purchased_quantity || 0) * Number(item.final_unit_selling_price || item.item_final_price || item.unit_selling_price || item.price || 0)) - Number(item.item_discount || 0), 0) || 0;
    const isOrderSettled = order.is_paid === true || order.is_paid === 'true' || order.status === 'SUCCESS' || order.status === 'COMPLETED';
    const inferredPaymentMethodTitle = () => {
        if (order.paymentAccountNumber?.trim().length > 0 || String(order.selectedPaymentMethodId || order.payment_method).toLowerCase().includes('money')) return "MOBILE MONEY";
        if (order.is_paid === false || order.is_paid === 'false') return "CREDIT LEDGER";
        return "CASH PAYMENT";
    };
    return (
        <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center px-4 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs">
                <View style={{ backgroundColor: theme?.panel || '#ffffff', width: Dimensions.get('window').width > 640 ? 540 : '100%' }} className="rounded-3xl shadow-xl overflow-hidden max-h-[85vh] flex-col bg-white dark:bg-slate-900">
                    <View style={{ borderBottomColor: isDarkMode ? '#334155' : '#e2e8f0' }} className="p-5 border-b flex-row justify-between items-center bg-slate-50 dark:bg-slate-950">
                        <View className="flex-col pr-1 flex-1">
                            <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.lg, color: theme?.text }} className="tracking-tight" numberOfLines={1}>Invoice {order.order_number || order.draftId || 'Local Draft'}</Text>
                            <Text style={{ fontFamily: theme?.font?.regular, fontSize: theme?.fontSize?.xs, color: theme?.textDark }} className="mt-0.5">{order.updatedAt || order.created ? new Date(order.updatedAt || order.created).toLocaleString() : 'Pending'}</Text>
                        </View>
                        <TouchableOpacity className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 items-center justify-center" onPress={onClose}><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: theme?.text }}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView className="p-6 flex-col" showsVerticalScrollIndicator={false}>
                        <View style={{ backgroundColor: theme?.background || '#f8fafc' }} className="rounded-2xl p-4 flex-col mb-4 space-y-2">
                            <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.sm, color: theme?.textDark }}>Customer Name</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: theme?.text }}>{order.customerName || order.customer_name || 'Walk-in Retail Customer'}</Text></View>
                            <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.sm, color: theme?.textDark }}>Contact Phone</Text><Text style={{ fontFamily: theme?.font?.mono, fontSize: theme?.fontSize?.sm, color: theme?.text }}>{order.customerPhone || order.phone || 'N/A'}</Text></View>
                            <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.sm, color: theme?.textDark }}>Fulfilment Type</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: theme?.text }} className="uppercase tracking-wide">{order.deliveryMethod || order.delivery_method || 'WALK_IN'}</Text></View>
                            <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.sm, color: theme?.textDark }}>Payment Method</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: theme?.text }} className="uppercase tracking-wide">{inferredPaymentMethodTitle()}</Text></View>
                            <View className="flex-row justify-between"><Text style={{ fontFamily: theme?.font?.medium, fontSize: theme?.fontSize?.sm, color: theme?.textDark }}>Payment Status</Text><Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: isOrderSettled ? '#10b981' : '#f43f5e' }} className="uppercase tracking-wider">{isOrderSettled ? 'SETTLED ✓' : 'UNPAID / CREDIT'}</Text></View>
                        </View>
                        <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.xs, color: theme?.text }} className="uppercase tracking-widest mb-3">Invoice Items</Text>
                        <View className="flex-col space-y-3 mb-6">
                            {itemsList.map((item: any, idx: number) => {
                                const rate = Number(item.final_unit_selling_price || item.item_final_price || item.unit_selling_price || item.price || 0);
                                const qty = Number(item.purchased_quantity || 0);
                                return (
                                    <View key={item.retailer_receipt || idx} className="flex-row justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/40">
                                        <View className="flex-col flex-1 min-w-0 pr-3">
                                            <Text style={{ fontFamily: theme?.font?.bold, color: theme?.text, fontSize: theme?.fontSize?.sm }} className="truncate" numberOfLines={1}>{item.product_name || 'Stock Item'}</Text>
                                            <Text style={{ fontFamily: theme?.font?.medium, color: theme?.textDark, fontSize: 12 }} className="mt-0.5">{qty} pcs × KES {rate.toFixed(2)}</Text>
                                        </View>
                                        <Text style={{ fontFamily: theme?.font?.mono, color: theme?.text, fontSize: theme?.fontSize?.sm }} className="font-bold">KES {((qty * rate) - Number(item.item_discount || 0)).toFixed(2)}</Text>
                                    </View>
                                );
                            })}
                        </View>
                        <View style={{ backgroundColor: theme?.background || '#f8fafc' }} className="p-4 rounded-2xl flex-col mb-4">
                            <View className="flex-row justify-between pt-1">
                                <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: theme?.text }}>Total Invoiced Amount</Text>
                                <Text style={{ fontFamily: theme?.font?.mono, fontSize: theme?.fontSize?.base }} className="font-black text-emerald-600 dark:text-emerald-400">KES {(totalCalculatedValue + (Number(order.shippingCost || order.shipping_amount) || 0)).toFixed(2)}</Text>
                            </View>
                        </View>
                    </ScrollView>
                    <View className="p-4 border-t flex-row items-center gap-2 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                        <TouchableOpacity disabled={isDownloading} onPress={handleDownload} className="flex-1 h-11 rounded-xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 flex flex-row items-center justify-center active:scale-95">
                            {isDownloading ? <ActivityIndicator size="small" color="#3b82f6" /> : <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: '#3b82f6' }} className="font-bold uppercase tracking-wide">⬇️ Download</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity disabled={isGeneratingPdf} onPress={handleShare} style={{ backgroundColor: theme?.primary }} className="flex-1 h-11 rounded-xl flex flex-row items-center justify-center active:scale-95">
                            {isGeneratingPdf ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={{ fontFamily: theme?.font?.bold, fontSize: theme?.fontSize?.sm, color: '#ffffff' }} className="font-bold uppercase tracking-wider">📤 Share Receipt</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};
