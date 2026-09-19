import { useAuth } from '@/context/AuthContext';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRecordPayment } from './useRecordPayment';

interface RecordPaymentModalProps {
    isOpen: boolean;
    orderId: string;
    orderRef: string;
    onClose: () => void;
    onRefreshParentLedger?: () => void;
}

export default function RecordPaymentModal({ isOpen, orderId, orderRef, onClose, onRefreshParentLedger }: RecordPaymentModalProps) {
    const { theme } = useAuth();
    const {
        paymentMethods,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMpesaNumber,
        toastMessage,
        isProcessing,
        isFetchLoading,
        executeSubmitPaymentReceipt
    } = useRecordPayment(orderId, () => {
        if (onRefreshParentLedger) onRefreshParentLedger();
        onClose();
    });

    return (
        <Modal visible={isOpen} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center p-4 bg-black/50 backdrop-blur-sm">
                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full max-w-md rounded-2xl p-6 border shadow-2xl relative">
                    {toastMessage && (
                        <View style={{ backgroundColor: toastMessage.includes('Success') ? '#10b981' : '#f43f5e', zIndex: 99999 }} className="absolute -top-4 left-6 right-6 p-3 rounded-xl shadow-md items-center justify-center">
                            <Text className="text-white text-xs font-black uppercase text-center">{toastMessage}</Text>
                        </View>
                    )}
                    <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderBottomColor: theme.border }}>
                        <View className="flex-col">
                            <Text style={{ color: theme.text }} className="text-base font-black uppercase tracking-wide">Record Order Payment</Text>
                            <Text style={{ color: theme.textDark }} className="text-[11px] font-medium font-mono">REF: {orderRef}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={isProcessing} className="p-1">
                            <Text style={{ color: theme.textDark }} className="text-xs font-black">✕</Text>
                        </TouchableOpacity>
                    </View>
                    {isFetchLoading ? (
                        <View className="py-8 items-center justify-center">
                            <ActivityIndicator size="small" color={theme.primary} />
                        </View>
                    ) : (
                        <View className="flex-col w-full mb-6">
                            <Text style={{ color: theme.text }} className="text-xs font-bold uppercase tracking-wider mb-2.5">Select Settlement Method</Text>
                            <View className="flex-col gap-y-2">
                                {paymentMethods.map((method: any) => {
                                    const isSelected = selectedMethod?.id === method.id;
                                    return (
                                        <TouchableOpacity
                                            key={method.id}
                                            onPress={() => setSelectedMethod(method)}
                                            style={{
                                                borderColor: isSelected ? theme.primary : theme.border,
                                                backgroundColor: isSelected ? `${theme.primary}10` : 'transparent'
                                            }}
                                            className="w-full px-4 py-3 rounded-xl border flex-row items-center gap-x-3 shadow-sm"
                                        >
                                            <View style={{ borderColor: isSelected ? theme.primary : theme.textDark }} className="w-4 h-4 rounded-full border items-center justify-center">
                                                {isSelected && <View style={{ backgroundColor: theme.primary }} className="w-2.5 h-2.5 rounded-full" />}
                                            </View>
                                            <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wide">{method.title}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {selectedMethod?.title === 'MOBILE MONEY' && (
                                <View className="mt-4 w-full">
                                    <Text style={{ color: theme.textDark }} className="text-[10px] font-black uppercase mb-1 tracking-wider">M-Pesa Mobile Subscriber Phone *</Text>
                                    <TextInput
                                        keyboardType="phone-pad"
                                        value={mobileNumber}
                                        onChangeText={setMpesaNumber}
                                        placeholder="e.g. 07XXXXXXXX"
                                        placeholderTextColor="#94a3b8"
                                        style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
                                        className="w-full border rounded-xl px-3.5 h-11 text-sm font-semibold outline-none shadow-sm"
                                    />
                                </View>
                            )}
                        </View>
                    )}
                    <View className="flex-row items-center justify-end gap-x-3 border-t pt-4" style={{ borderTopColor: theme.border }}>
                        <TouchableOpacity
                            onPress={onClose}
                            disabled={isProcessing}
                            style={{ backgroundColor: theme.background, borderColor: theme.border }}
                            className="px-4 h-11 border rounded-xl items-center justify-center"
                        >
                            <Text style={{ color: theme.textDark }} className="text-xs font-black uppercase tracking-wide">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={executeSubmitPaymentReceipt}
                            disabled={isProcessing || isFetchLoading}
                            style={{ backgroundColor: theme.primary, opacity: (isProcessing || isFetchLoading) ? 0.6 : 1 }}
                            className="px-5 h-11 rounded-xl items-center justify-center shadow-md flex-row gap-x-2"
                        >
                            {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white text-xs font-black uppercase tracking-wide">Submit Payment</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
