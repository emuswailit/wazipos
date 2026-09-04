import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
export default function OrderSummaryPane({ theme, customerName, setCustomerName, customerPhone, setCustomerPhone, dueDate, setDueDate, deliveryMethod, setDeliveryMethod, shippingCost, setShippingCost, paymentAccountNumber, setPaymentAccountNumber, selectedPaymentMethodId, setSelectedPaymentMethodMethodId, paymentMethodsList, isCreditSelected, isMobileMoneySelected, computedTotals, onSubmitOrder, isSubmitting }: any) {
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [delivModalOpen, setDelivModalOpen] = useState(false);
    const isWeb = Platform.OS === 'web';
    const activePaymentTitle = paymentMethodsList?.find((p: any) => p.id === selectedPaymentMethodId)?.title || "Select Payment Channel";
    const renderSelectorTrigger = (label: string, currentTitle: string, onPress: () => void) => (
        <View className="flex-col w-full mb-3">
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase font-bold tracking-wider">
                {label} <Text className="text-rose-500">*</Text>
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ backgroundColor: isWeb ? 'transparent' : theme.background, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full h-11 border rounded-xl px-3.5 flex-row justify-between items-center">
                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.base }}>{currentTitle}</Text>
                <Text style={{ color: theme.textDark }} className="text-xs">▼</Text>
            </TouchableOpacity>
        </View>
    );
    return (
        <View style={{ backgroundColor: theme.panel, borderColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="w-full rounded-2xl p-5 border shadow-sm flex-col">
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }} className="font-black mb-4 tracking-tight">Order Execution Summary</Text>
            {renderSelectorTrigger("Delivery Channel", deliveryMethod || "Select Fulfilment Type", () => setDelivModalOpen?.(true))}
            {renderSelectorTrigger("Payment Method", activePaymentTitle, () => setPayModalOpen?.(true))}
            {deliveryMethod === 'DELIVERY' && (
                <View className="flex-col w-full mb-3">
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase font-bold tracking-wider">Shipping Fee</Text>
                    <TextInput keyboardType="numeric" value={shippingCost} onChangeText={setShippingCost} style={{ backgroundColor: isWeb ? 'transparent' : theme.background, color: theme.text, fontFamily: theme.font.medium, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full h-11 border rounded-xl px-4 shadow-sm" placeholder="0.00" placeholderTextColor={theme.isDarkMode ? '#475569' : '#94a3b8'} />
                </View>
            )}
            {isMobileMoneySelected && (
                <View className="flex-col w-full mb-3">
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase font-bold tracking-wider">Payment Phone Number</Text>
                    <TextInput keyboardType="phone-pad" value={paymentAccountNumber} onChangeText={setPaymentAccountNumber} style={{ backgroundColor: isWeb ? 'transparent' : theme.background, color: theme.text, fontFamily: theme.font.medium, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full h-11 border rounded-xl px-4 shadow-sm" placeholder="e.g., 07XXXXXXXX" placeholderTextColor={theme.isDarkMode ? '#475569' : '#94a3b8'} />
                </View>
            )}
            {isCreditSelected && (
                <View className="flex-col w-full gap-y-3 mb-3">
                    <View className="flex-col w-full">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase font-bold tracking-wider">Customer Name</Text>
                        <TextInput value={customerName} onChangeText={setCustomerName} style={{ backgroundColor: isWeb ? 'transparent' : theme.background, color: theme.text, fontFamily: theme.font.medium, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full h-11 border rounded-xl px-4 shadow-sm" placeholder="Enter full name" placeholderTextColor={theme.isDarkMode ? '#475569' : '#94a3b8'} />
                    </View>
                    <View className="flex-col w-full">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase font-bold tracking-wider">Customer Phone</Text>
                        <TextInput keyboardType="phone-pad" value={customerPhone} onChangeText={setCustomerPhone} style={{ backgroundColor: isWeb ? 'transparent' : theme.background, color: theme.text, fontFamily: theme.font.medium, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full h-11 border rounded-xl px-4 shadow-sm" placeholder="Enter contact line" placeholderTextColor={theme.isDarkMode ? '#475569' : '#94a3b8'} />
                    </View>
                    <View className="flex-col w-full">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase font-bold tracking-wider">Credit Due Date</Text>
                        <TextInput value={dueDate} onChangeText={setDueDate} style={{ backgroundColor: isWeb ? 'transparent' : theme.background, color: theme.text, fontFamily: theme.font.medium, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full h-11 border rounded-xl px-4 shadow-sm" placeholder="YYYY-MM-DD" placeholderTextColor={theme.isDarkMode ? '#475569' : '#94a3b8'} />
                    </View>
                </View>
            )}
            <View className="w-full border-t border-b border-slate-100 dark:border-slate-800/80 py-3.5 my-4 flex-row justify-between items-center">
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }} className="text-xs">Est. Grand Total:</Text>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold }} className="text-lg font-black">KES {parseFloat(computedTotals?.grandTotal || '0').toFixed(2)}</Text>
            </View>
            <TouchableOpacity disabled={isSubmitting} onPress={onSubmitOrder} style={{ backgroundColor: theme.primary }} className="w-full h-12 rounded-xl items-center justify-center shadow-md">
                {isSubmitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={{ fontFamily: theme.font.bold, color: '#ffffff' }} className="font-bold uppercase tracking-wider text-sm">Register Checkout Indent</Text>}
            </TouchableOpacity>
            <Modal visible={delivModalOpen} animationType="fade" transparent>
                <TouchableOpacity activeOpacity={1} onPress={() => setDelivModalOpen?.(false)} className="flex-1 justify-center items-center bg-slate-900/40 p-6">
                    <View style={{ backgroundColor: theme.panel }} className="w-full max-w-sm rounded-2xl p-4 max-h-[300px] border border-slate-200 dark:border-slate-700">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold }} className="text-sm font-bold mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Select Fulfilment Method</Text>
                        <FlatList data={['WALK_IN', 'DELIVERY']} keyExtractor={i => i} renderItem={({ item: i }) => (
                            <TouchableOpacity onPress={() => { setDeliveryMethod?.(i); setDelivModalOpen?.(false); }} className="py-3 px-2 border-b last:border-0 border-slate-100 dark:border-slate-800">
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium }} className="text-sm font-semibold">{i}</Text>
                            </TouchableOpacity>
                        )} />
                    </View>
                </TouchableOpacity>
            </Modal>
            <Modal visible={payModalOpen} animationType="fade" transparent>
                <TouchableOpacity activeOpacity={1} onPress={() => setPayModalOpen?.(false)} className="flex-1 justify-center items-center bg-slate-900/40 p-6">
                    <View style={{ backgroundColor: theme.panel }} className="w-full max-w-sm rounded-2xl p-4 max-h-[350px] border border-slate-200 dark:border-slate-700">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold }} className="text-sm font-bold mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">Select Payment Method</Text>
                        <FlatList data={paymentMethodsList || []} keyExtractor={(i: any) => String(i.id)} renderItem={({ item: i }: any) => (
                            <TouchableOpacity onPress={() => { setSelectedPaymentMethodMethodId?.(i.id); setPayModalOpen?.(false); }} className="py-3 px-2 border-b last:border-0 border-slate-100 dark:border-slate-800 flex-col">
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium }} className="text-sm font-semibold">{i.title}</Text>
                                {i.description && <Text style={{ color: theme.textDark }} className="text-[10px] mt-0.5 opacity-60">{i.description}</Text>}
                            </TouchableOpacity>
                        )} />
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}
