import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PaymentPollingModal from '../retailerRequisitions/PaymentPollingModal';
import { useRecordCustomerPayment } from './useRecordCustomerPayment';
interface RecordCustomerPaymentModalProps {
    isOpen: boolean; orderId: string; orderRef: string; onClose: () => void; onRefreshParentLedger?: () => void;
}
export default function RecordCustomerPaymentModal({ isOpen, orderId, orderRef, onClose, onRefreshParentLedger }: RecordCustomerPaymentModalProps) {
    const { theme } = useAuth();
    const { paymentMethods, selectedMethod, setSelectedMethod, mobileNumber, setMpesaNumber, toastMessage, isProcessing, isFetchLoading, isPollingOpen, setIsPollingOpen, pollingError, executeSubmitPaymentReceipt } = useRecordCustomerPayment(orderId, () => { if (onRefreshParentLedger) onRefreshParentLedger(); onClose(); });
    return (
        <>
            <Modal visible={isOpen && !isPollingOpen} animationType="fade" transparent={true} onRequestClose={onClose}>
                <View className="flex-1 justify-center items-center p-4 bg-black/50 backdrop-blur-sm">
                    <View style={{ backgroundColor: theme.panel, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full max-w-md rounded-2xl p-6 border shadow-2xl relative">
                        {toastMessage && (
                            <View className={`absolute -top-4 left-6 right-6 p-3 rounded-xl shadow-md items-center justify-center ${toastMessage.includes('Success') ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ zIndex: 99999 }}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white uppercase text-center">{toastMessage}</Text></View>
                        )}
                        <View style={{ borderBottomColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="flex-row justify-between items-center pb-3 mb-4 border-b">
                            <View className="flex-col">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }} className="uppercase tracking-wide font-bold">Record Customer Payment</Text>
                                <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, color: theme.textDark }} className="font-mono mt-0.5">REF: {orderRef}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} disabled={isProcessing} className="p-1"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.textDark }} className="font-bold">✕</Text></TouchableOpacity>
                        </View>
                        {isFetchLoading ? (
                            <View className="py-8 items-center justify-center"><ActivityIndicator size="small" color={theme.primary} /></View>
                        ) : (
                            <View className="flex-col w-full mb-6">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="uppercase tracking-wider mb-2.5 font-bold">Select Settlement Method</Text>
                                <View className="flex-col gap-y-2">
                                    {paymentMethods.map((method: any) => {
                                        const isSelected = selectedMethod?.id === method.id;
                                        return (
                                            <TouchableOpacity key={method.id} onPress={() => setSelectedMethod(method)} style={{ borderColor: isSelected ? theme.primary : (theme.isDarkMode ? '#334155' : '#e2e8f0'), backgroundColor: isSelected ? `${theme.primary}10` : 'transparent' }} className="w-full px-4 py-3 rounded-xl border flex-row items-center gap-x-3 shadow-sm">
                                                <View style={{ borderColor: isSelected ? theme.primary : theme.textDark }} className="w-4 h-4 rounded-full border items-center justify-center">{isSelected && <View style={{ backgroundColor: theme.primary }} className="w-2.5 h-2.5 rounded-full" />}</View>
                                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.text }} className="font-bold uppercase tracking-wide">{method.title}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {selectedMethod?.title === 'MOBILE MONEY' && (
                                    <View className="mt-4 w-full">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.textDark }} className="uppercase mb-1 tracking-wider font-bold">M-Pesa Phone *</Text>
                                        <TextInput keyboardType="phone-pad" value={mobileNumber} onChangeText={setMpesaNumber} placeholder="e.g. 07XXXXXXXX" placeholderTextColor={theme.isDarkMode ? '#475569' : '#94a3b8'} style={{ backgroundColor: theme.isDarkMode ? '#0f172a' : '#f8fafc', color: theme.text, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1', fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="w-full border rounded-xl px-3.5 h-11 text-sm font-semibold outline-none shadow-sm" />
                                    </View>
                                )}
                            </View>
                        )}
                        <View style={{ borderTopColor: theme.isDarkMode ? '#334155' : '#e2e8f0' }} className="flex-row items-center justify-end gap-x-3 border-t pt-4">
                            <TouchableOpacity onPress={onClose} disabled={isProcessing} style={{ backgroundColor: theme.isDarkMode ? '#0f172a' : '#f8fafc', borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="px-4 h-11 border rounded-xl items-center justify-center"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.textDark }} className="uppercase tracking-wide font-bold">Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={executeSubmitPaymentReceipt} disabled={isProcessing || isFetchLoading} style={{ backgroundColor: theme.primary }} className="px-5 h-11 rounded-xl items-center justify-center shadow-md flex-row gap-x-2"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white uppercase tracking-wide font-bold">Submit Payment</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            <PaymentPollingModal isOpen={isPollingOpen} orderRef={orderRef} mobileNumber={mobileNumber} serverError={pollingError} onClose={() => setIsPollingOpen(false)} onSuccess={() => { setIsPollingOpen(false); if (onRefreshParentLedger) onRefreshParentLedger(); onClose(); }} />
        </>
    );
}
