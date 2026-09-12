import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { FulfillmentControls } from './FulfillmentControls';
interface FulfillmentModalProps {
    visible: boolean;
    onClose: () => void;
    deliveryMethod: 'PICKUP' | 'DELIVERY';
    setDeliveryMethod: (method: 'PICKUP' | 'DELIVERY') => void;
    paymentMethodsList: any[];
    selectedPaymentMethodId: string | null;
    setSelectedPaymentMethodId: (id: string | null) => void;
    isPaymentSyncing: boolean;
    paymentDetails: any;
    setPaymentDetails: React.Dispatch<React.SetStateAction<any>>;
    onSave: () => void;
    totals: { totalDiscount: number; orderTotal: number };
    theme: any;
}
export const FulfillmentModal: React.FC<FulfillmentModalProps> = ({ visible, onClose, deliveryMethod, setDeliveryMethod, paymentMethodsList, selectedPaymentMethodId, setSelectedPaymentMethodId, isPaymentSyncing, paymentDetails, setPaymentDetails, onSave, totals, theme }) => {
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-black/40 justify-end lg:hidden">
                    <TouchableWithoutFeedback onPress={() => { }}>
                        <View style={{ backgroundColor: theme.panel }} className="rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-6 pb-8 max-h-[85%]">
                            <View className="items-center mb-4"><View className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" /></View>
                            <View className="flex-row justify-between items-center mb-4">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>Fulfillment Details</Text>
                                <TouchableOpacity onPress={onClose}><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-slate-400">✕</Text></TouchableOpacity>
                            </View>
                            <ScrollView className="mb-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <FulfillmentControls deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod} paymentMethodsList={paymentMethodsList} selectedPaymentMethodId={selectedPaymentMethodId} setSelectedPaymentMethodId={setSelectedPaymentMethodId} isPaymentSyncing={isPaymentSyncing} paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails} isMobileBackground={true} totals={totals} />
                            </ScrollView>
                            <TouchableOpacity onPress={onSave} style={{ backgroundColor: theme.primary }} className="w-full py-3.5 rounded-xl items-center justify-center shadow-md active:opacity-90">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-white">Save Order Layout</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};
