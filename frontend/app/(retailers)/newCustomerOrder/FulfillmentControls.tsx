import { useAuth } from '@/context/AuthContext';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FulfillmentCalendarModal } from './FulfillmentCalendarModal';
interface FulfillmentControlsProps {
    deliveryMethod: 'PICKUP' | 'DELIVERY';
    setDeliveryMethod: (method: 'PICKUP' | 'DELIVERY') => void;
    paymentMethodsList: any[];
    selectedPaymentMethodId: string | null;
    setSelectedPaymentMethodId: (id: string | null) => void;
    isPaymentSyncing: boolean;
    paymentDetails: any;
    setPaymentDetails: React.Dispatch<React.SetStateAction<any>>;
    isMobileBackground?: boolean;
    totals: { totalDiscount: number; orderTotal: number };
}
export const FulfillmentControls: React.FC<FulfillmentControlsProps> = ({ deliveryMethod, setDeliveryMethod, paymentMethodsList, selectedPaymentMethodId, setSelectedPaymentMethodId, isPaymentSyncing, paymentDetails, setPaymentDetails, isMobileBackground = false, totals }) => {
    const { theme } = useAuth();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const currentMethodObj = paymentMethodsList.find(m => m.id === selectedPaymentMethodId);
    const normalizedPaymentTitle = currentMethodObj?.title?.toUpperCase() || '';
    const containerBg = isMobileBackground ? "bg-slate-50 dark:bg-slate-955" : "bg-white dark:bg-slate-900";
    return (
        <View className="flex-col space-y-5 w-full">
            <View className="w-full">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-wider mb-2.5">Delivery Method</Text>
                <View className={`flex-row p-1 rounded-xl border border-slate-200 dark:border-slate-800 ${isMobileBackground ? 'bg-slate-100 dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-955'}`}>
                    <TouchableOpacity onPress={() => setDeliveryMethod('PICKUP')} className={`flex-1 py-2.5 rounded-lg items-center justify-center ${deliveryMethod === 'PICKUP' ? 'bg-slate-200 dark:bg-slate-700 shadow-sm' : 'bg-transparent active:bg-slate-100'}`}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>Pickup</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDeliveryMethod('DELIVERY')} className={`flex-1 py-2.5 rounded-lg items-center justify-center ${deliveryMethod === 'DELIVERY' ? 'bg-slate-200 dark:bg-slate-700 shadow-sm' : 'bg-transparent active:bg-slate-100'}`}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>Delivery</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <View className="w-full space-y-4">
                <View>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-wider mb-2.5">Payment Method {isPaymentSyncing && <Text className="text-blue-500 normal-case animate-pulse">(updating...)</Text>}</Text>
                    <View className="flex-col gap-2">
                        {paymentMethodsList.map((method) => {
                            const isSelected = selectedPaymentMethodId === method.id;
                            return (
                                <TouchableOpacity key={method.id} onPress={() => setSelectedPaymentMethodId(method.id)} className={`px-4 py-3 rounded-xl border flex-row items-center ${isSelected ? 'bg-blue-500/10 border-primary' : 'border-slate-200 dark:border-slate-800 active:bg-slate-50'}`}>
                                    <View className={`h-4 w-4 rounded-full border items-center justify-center mr-3 ${isSelected ? 'border-primary' : 'border-slate-300 dark:border-slate-700'}`}>
                                        {isSelected && <View style={{ backgroundColor: theme.primary }} className="h-2 w-2 rounded-full" />}
                                    </View>
                                    <Text style={{ fontFamily: isSelected ? theme.font.bold : theme.font.medium, fontSize: theme.fontSize.sm, color: isSelected ? theme.primary : theme.text }}>{method.title}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
                {normalizedPaymentTitle === 'MOBILE MONEY' && (
                    <View className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 ${containerBg}`}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Mobile Money Number</Text>
                        <TextInput style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text }} className="w-full h-11 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3 outline-none" placeholder="e.g. +2547XXXXXXXX" keyboardType="phone-pad" placeholderTextColor="#94a3b8" value={paymentDetails.mobileMoneyNumber} onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, mobileMoneyNumber: text }))} />
                    </View>
                )}
                {normalizedPaymentTitle === 'CREDIT' && (
                    <View className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 ${containerBg}`}>
                        <View className="space-y-1.5">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Customer Name</Text>
                            <TextInput style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text }} className="w-full h-11 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3 outline-none" placeholder="Enter full name" placeholderTextColor="#94a3b8" value={paymentDetails.customerName} onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerName: text }))} />
                        </View>
                        <View className="space-y-1.5">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Customer Phone</Text>
                            <TextInput style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text }} className="w-full h-11 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3 outline-none" placeholder="Enter phone" keyboardType="phone-pad" placeholderTextColor="#94a3b8" value={paymentDetails.customerPhone} onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerPhone: text }))} />
                        </View>
                        <View className="space-y-1.5">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Order Due Date</Text>
                            <TouchableOpacity onPress={() => setIsCalendarOpen(true)} className="w-full h-11 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3 justify-center">
                                <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text }}>{paymentDetails.dueDate}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                <View className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <View className="flex-row justify-between items-center">
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Total Discount:</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className="text-rose-500 font-bold">KES -{totals.totalDiscount.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between items-center pt-1">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>Order Total:</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.lg, color: theme.primary }} className="font-black">KES {totals.orderTotal.toFixed(2)}</Text>
                    </View>
                </View>
            </View>
            <FulfillmentCalendarModal visible={isCalendarOpen} onClose={() => setIsCalendarOpen(false)} dueDate={paymentDetails.dueDate} onSelectDate={(date) => { setPaymentDetails((prev: any) => ({ ...prev, dueDate: date })); setIsCalendarOpen(false); }} theme={theme} />
        </View>
    );
};
