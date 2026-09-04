import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PaymentPollingModal from './PaymentPollingModal';
import { useRecordPayment } from './useRecordPayment';

interface RecordPaymentModalProps {
    isOpen: boolean; orderId: string; orderRef: string; onClose: () => void; onRefreshParentLedger?: () => void;
}

export default function RecordPaymentModal({ isOpen, orderId, orderRef, onClose, onRefreshParentLedger }: RecordPaymentModalProps) {
    const { theme } = useAuth();
    const { paymentMethods, selectedMethod, setSelectedMethod, mobileNumber, setMpesaNumber, toastMessage, isProcessing, isFetchLoading, isPollingOpen, setIsPollingOpen, pollingError, executeSubmitPaymentReceipt } = useRecordPayment(orderId, () => { if (onRefreshParentLedger) onRefreshParentLedger(); onClose(); });

    return (
        <>
            <Modal visible={isOpen && !isPollingOpen} animationType="fade" transparent={true} onRequestClose={onClose}>
                <View className="flex-1 justify-center items-center p-4 bg-black/50 backdrop-blur-sm">
                    <View className="w-full max-w-md rounded-2xl p-6 border shadow-2xl relative bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                        {toastMessage && (
                            <View className={`absolute -top-4 left-6 right-6 p-3 rounded-xl shadow-md items-center justify-center ${toastMessage.includes('Success') ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ zIndex: 99999 }}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white uppercase text-center">{toastMessage}</Text></View>
                        )}
                        <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
                            <View className="flex-col"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }} className="uppercase tracking-wide text-slate-900 dark:text-slate-100">Record Order Payment</Text><Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs }} className="text-slate-500 dark:text-slate-400">REF: {orderRef}</Text></View>
                            <TouchableOpacity onPress={onClose} disabled={isProcessing} className="p-1"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-slate-500 dark:text-slate-400">✕</Text></TouchableOpacity>
                        </View>
                        {isFetchLoading ? (
                            <View className="py-8 items-center justify-center"><ActivityIndicator size="small" className="text-blue-600" /></View>
                        ) : (
                            <View className="flex-col w-full mb-6">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="uppercase tracking-wider mb-2.5 text-slate-900 dark:text-slate-100">Select Settlement Method</Text>
                                <View className="flex-col gap-y-2">
                                    {paymentMethods.map((method: any) => {
                                        const isSelected = selectedMethod?.id === method.id;
                                        return (
                                            <TouchableOpacity key={method.id} onPress={() => setSelectedMethod(method)} className={`w-full px-4 py-3 rounded-xl border flex-row items-center gap-x-3 shadow-sm ${isSelected ? 'border-blue-600 bg-blue-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
                                                <View className={`w-4 h-4 rounded-full border items-center justify-center ${isSelected ? 'border-blue-600' : 'border-slate-400'}`}>{isSelected && <View className="w-2.5 h-2.5 rounded-full bg-blue-600" />}</View>
                                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="uppercase tracking-wide text-slate-900 dark:text-slate-100">{method.title}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {selectedMethod?.title === 'MOBILE MONEY' && (
                                    <View className="mt-4 w-full">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase mb-1 tracking-wider text-slate-500 dark:text-slate-400">M-Pesa Phone *</Text>
                                        <TextInput keyboardType="phone-pad" value={mobileNumber} onChangeText={setMpesaNumber} placeholder="e.g. 07XXXXXXXX" placeholderTextColor="#94a3b8" style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.base }} className="w-full border rounded-xl px-3.5 h-11 text-sm font-semibold outline-none shadow-sm bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100" />
                                    </View>
                                )}
                            </View>
                        )}
                        <View className="flex-row items-center justify-end gap-x-3 border-t pt-4 border-slate-200 dark:border-slate-800">
                            <TouchableOpacity onPress={onClose} disabled={isProcessing} className="px-4 h-11 border rounded-xl items-center justify-center bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="uppercase tracking-wide text-slate-500 dark:text-slate-400">Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={executeSubmitPaymentReceipt} disabled={isProcessing || isFetchLoading} className="px-5 h-11 rounded-xl items-center justify-center shadow-md flex-row gap-x-2 bg-blue-600">
                                {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white uppercase tracking-wide">Submit Payment</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            <PaymentPollingModal isOpen={isPollingOpen} orderRef={orderRef} mobileNumber={mobileNumber} serverError={pollingError} onClose={() => setIsPollingOpen(false)} onSuccess={() => { setIsPollingOpen(false); if (onRefreshParentLedger) onRefreshParentLedger(); onClose(); }} />
        </>
    );
}
