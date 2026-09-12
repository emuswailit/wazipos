import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
interface OrderInvoiceDetailsModalProps { visible: boolean; order: any; theme: any; totalAmount: number; onClose: () => void; onPrint: () => void; }
export const OrderInvoiceDetailsModal: React.FC<OrderInvoiceDetailsModalProps> = ({ visible, order, theme, totalAmount, onClose, onPrint }) => (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
            <View style={{ backgroundColor: theme.panel, borderColor: theme.textDark + '20' }} className="w-full max-w-xl rounded-2xl border p-6 shadow-2xl flex-col max-h-[85vh]">
                <View className="flex-row justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-800">
                    <Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 18 }} className="font-black">Invoice Sheet Summary</Text>
                    <TouchableOpacity onPress={onClose} className="p-1"><Text style={{ fontFamily: theme.font.bold, color: '#f43f5e', fontSize: 15 }}>Close</Text></TouchableOpacity>
                </View>
                {order && (
                    <View className="flex-1 mt-4">
                        <ScrollView showsVerticalScrollIndicator={true} className="flex-1 pr-1">
                            <View style={{ backgroundColor: theme.background }} className="p-4 rounded-xl mb-4 space-y-2 flex-col">
                                <Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 15 }}>Order Signature: {order.order_number || '--'}</Text>
                                <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 13 }}>Draft ID Key: {order.draft_id}</Text>
                                {order.remote_id ? <Text style={{ fontFamily: theme.font.mono, color: theme.textDark, fontSize: 12 }}>Cloud UUID: {order.remote_id}</Text> : null}
                                <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 13 }}>Buyer Profile: {order.customerName || 'Walk-in'}</Text>
                                {order.customerPhone ? <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 13 }}>Phone Contact: {order.customerPhone}</Text> : null}
                                <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 13 }}>Fulfillment Channel: {order.deliveryMethod || 'PICKUP'}</Text>
                                <Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 13 }}>Status: {String(order.status || 'OPEN').toUpperCase()}</Text>
                            </View>
                            <Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 13 }} className="uppercase tracking-wider mb-2 text-slate-400">Purchased Items</Text>
                            <View className="flex-col space-y-2 mb-4">
                                {(order.customerOrderItems || []).map((item: any, i: number) => (
                                    <View key={i} className="flex-row justify-between items-start py-3 border-b border-slate-100 dark:border-slate-800/40">
                                        <View className="flex-col flex-1 min-w-0 pr-3">
                                            <Text style={{ fontFamily: theme.font.bold, color: theme.text, fontSize: 14 }} className="truncate">{item.product_name}</Text>
                                            <Text style={{ fontFamily: theme.font.medium, color: theme.textDark, fontSize: 12 }} className="mt-0.5">{item.purchased_quantity} unit(s) • KES {Number(item.unit_selling_price).toFixed(2)} each</Text>
                                        </View>
                                        <Text style={{ fontFamily: theme.font.mono, color: theme.text, fontSize: 14 }} className="font-bold">KES {(item.purchased_quantity * item.unit_selling_price - item.item_discount).toFixed(2)}</Text>
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                        <View style={{ backgroundColor: theme.background }} className="p-4 rounded-xl mt-3 flex-row justify-between items-center">
                            <View className="flex-col">
                                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 11 }} className="uppercase tracking-wider">Net Bill Payable</Text>
                                <Text style={{ fontFamily: theme.font.mono, color: theme.primary, fontSize: 18 }} className="font-black mt-0.5">KES {totalAmount.toFixed(2)}</Text>
                            </View>
                            <TouchableOpacity onPress={onPrint} style={{ backgroundColor: '#10b981' }} className="px-6 py-3 rounded-xl shadow-md flex-row items-center space-x-2"><Text style={{ fontFamily: theme.font.bold, color: '#ffffff', fontSize: 15 }}>🖨️ Print PDF Receipt</Text></TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </View>
    </Modal>
);
