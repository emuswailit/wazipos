// components/retailers/newCustomerOrder/FulfillmentModal.tsx

import { DateField } from '@/components/common/DateField';
import LocationPinPicker from '@/components/common/LocationPinPicker';
import type { LatLng } from '@/components/common/locationPinShared';
import { StaffDeliveryPlanner, type StaffDeliveryState } from '@/components/deliveries/StaffDeliveryPlanner';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View,
} from 'react-native';

const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};
const webNoOutline = isWeb ? ({ outlineStyle: 'none' } as any) : {};

interface FulfillmentControlsProps {
    paymentMethodsList: any[];
    selectedPaymentMethodId: string | null;
    setSelectedPaymentMethodId: (id: string | null) => void;
    isPaymentSyncing: boolean;
    paymentDetails: any;
    setPaymentDetails: React.Dispatch<React.SetStateAction<any>>;
    isMobileBackground?: boolean;
    totals: { subtotal: number; totalDiscount: number; shippingCost: number; total: number };

    // Fulfilment: collected now, or one of the shop's priced deliveries (useCreateOrder).
    delivery: StaffDeliveryState;
    destination: LatLng | null;
    setDestination: (v: LatLng | null) => void;
    shopCenter?: LatLng | null;
    loadDeliveryOptions: (() => Promise<any>) | null;
    deliveryOptionsKey: string;
    deliveryNotReadyHint?: string;
}

function pressHandlers(onPress: () => void, stopPropagation = false) {
    return isWeb
        ? { onClick: (e: any) => { if (stopPropagation) e?.stopPropagation?.(); onPress(); } }
        : { onStartShouldSetResponder: () => true, onResponderRelease: (e: any) => { if (stopPropagation) e?.stopPropagation?.(); onPress(); } };
}

export const FulfillmentControls: React.FC<FulfillmentControlsProps> = ({
    paymentMethodsList, selectedPaymentMethodId, setSelectedPaymentMethodId,
    isPaymentSyncing, paymentDetails, setPaymentDetails, isMobileBackground = false, totals,
    delivery, destination, setDestination, shopCenter, loadDeliveryOptions, deliveryOptionsKey, deliveryNotReadyHint,
}) => {
    const { theme } = useAuth();
    const currentMethodObj = paymentMethodsList.find((m) => m.id === selectedPaymentMethodId);
    const normalizedPaymentTitle = currentMethodObj?.title?.toUpperCase() || '';
    const containerBg = isMobileBackground ? "bg-slate-50 dark:bg-slate-955" : "bg-white dark:bg-slate-900";

    return (
        <View className="flex-col space-y-4 w-full">
            <View className="w-full">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-wider mb-1.5">Fulfilment</Text>
                <StaffDeliveryPlanner
                    state={delivery}
                    loadOptions={loadDeliveryOptions}
                    optionsKey={deliveryOptionsKey}
                    notReadyHint={deliveryNotReadyHint}
                    pickupLabel="Over the counter"
                    destinationSlot={
                        <View style={{ gap: 6 }}>
                            {normalizedPaymentTitle !== 'CREDIT' ? (
                                <View className="flex-row" style={{ gap: 6 }}>
                                    <TextInput
                                        style={{ flex: 1, fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, ...webNoOutline }}
                                        className="h-9 bg-white border border-slate-200 rounded-md px-2"
                                        placeholder="Customer name"
                                        placeholderTextColor="#94a3b8"
                                        value={paymentDetails.customerName}
                                        onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerName: text }))}
                                    />
                                    <TextInput
                                        style={{ flex: 1, fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, ...webNoOutline }}
                                        className="h-9 bg-white border border-slate-200 rounded-md px-2"
                                        placeholder="Customer phone"
                                        keyboardType="phone-pad"
                                        placeholderTextColor="#94a3b8"
                                        value={paymentDetails.customerPhone}
                                        onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerPhone: text }))}
                                    />
                                </View>
                            ) : null}
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Deliver to</Text>
                            <LocationPinPicker value={destination} onChange={setDestination} center={shopCenter} height={180} />
                        </View>
                    }
                />
            </View>

            <View className="w-full space-y-3">
                <View>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase tracking-wider mb-1.5">
                        Payment Method {isPaymentSyncing && <Text className="text-blue-500 normal-case">(updating...)</Text>}
                    </Text>
                    <View className="flex-col gap-1.5">
                        {paymentMethodsList.map((method) => {
                            const isSelected = selectedPaymentMethodId === method.id;
                            return (
                                <TouchableOpacity key={method.id} onPress={() => setSelectedPaymentMethodId(method.id)} className={`px-3 py-2 rounded-lg border flex-row items-center ${isSelected ? 'bg-blue-500/10 border-primary' : 'border-slate-200 dark:border-slate-800 active:bg-slate-50'}`}>
                                    <View className={`h-3.5 w-3.5 rounded-full border items-center justify-center mr-2 ${isSelected ? 'border-primary' : 'border-slate-300'}`}>
                                        {isSelected && <View style={{ backgroundColor: theme.primary }} className="h-1.5 w-1.5 rounded-full" />}
                                    </View>
                                    <Text style={{ fontFamily: isSelected ? theme.font.bold : theme.font.medium, fontSize: theme.fontSize.sm, color: isSelected ? theme.primary : theme.text }}>{method.title}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {normalizedPaymentTitle === 'MOBILE MONEY' && (
                    <View className={`p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 ${containerBg}`}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Mobile Money Number</Text>
                        <TextInput style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, ...webNoOutline }} className="w-full h-9 bg-white border border-slate-200 rounded-md px-2 outline-none" placeholder="e.g. +2547XXXXXXXX" keyboardType="phone-pad" placeholderTextColor="#94a3b8" value={paymentDetails.mobileMoneyNumber} onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, mobileMoneyNumber: text }))} />
                    </View>
                )}

                {normalizedPaymentTitle === 'CREDIT' && (
                    <View className={`p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 ${containerBg}`}>
                        <View className="space-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Customer Name</Text>
                            <TextInput
                                style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, ...webNoOutline }}
                                className="w-full h-9 bg-white border border-slate-200 rounded-md px-2 outline-none"
                                placeholder="Enter full name"
                                placeholderTextColor="#94a3b8"
                                value={paymentDetails.customerName}
                                onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerName: text }))}
                            />
                        </View>
                        <View className="space-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Customer Phone</Text>
                            <TextInput
                                style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, ...webNoOutline }}
                                className="w-full h-9 bg-white border border-slate-200 rounded-md px-2 outline-none"
                                placeholder="Enter phone"
                                keyboardType="phone-pad"
                                placeholderTextColor="#94a3b8"
                                value={paymentDetails.customerPhone}
                                onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerPhone: text }))}
                            />
                        </View>
                        <View className="space-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Due Date</Text>
                            <DateField
                                bare
                                placeholder="Select due date"
                                value={paymentDetails.dueDate}
                                onChangeText={(date) => setPaymentDetails((prev: any) => ({ ...prev, dueDate: date }))}
                            />
                        </View>
                    </View>
                )}

                <View className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
                    <View className="flex-row justify-between items-center">
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Subtotal:</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className="text-slate-600">KES {(totals.subtotal + totals.totalDiscount).toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between items-center">
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Discount:</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className="text-rose-500 font-bold">KES -{totals.totalDiscount.toFixed(2)}</Text>
                    </View>

                    {delivery.method === 'DELIVERY' && (
                        <View className="flex-row justify-between items-center">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400">Delivery:</Text>
                            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm }} className="text-slate-600">
                                {delivery.option ? `KES ${totals.shippingCost.toFixed(2)}` : 'choose an option'}
                            </Text>
                        </View>
                    )}

                    <View className="flex-row justify-between items-center pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>Order Total:</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.base, color: theme.primary }} className="font-black">KES {totals.total.toFixed(2)}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

interface FulfillmentModalProps extends FulfillmentControlsProps {
    visible: boolean;
    onClose: () => void;
    onSave: () => void;
    theme: any;
    isSaving?: boolean;
    isRetryingPayment?: boolean;
}

export const FulfillmentModal: React.FC<FulfillmentModalProps> = ({
    visible, onClose, onSave, theme, isSaving = false, isRetryingPayment = false, ...controlProps
}) => {
    const { width } = useWindowDimensions();

    if (Platform.OS === 'web' && width >= 1024) {
        return null;
    }

    const isSubmitDisabled = isSaving || !controlProps.selectedPaymentMethodId;

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-black/40 justify-end">
                    <TouchableWithoutFeedback onPress={() => { }}>
                        <View style={{ backgroundColor: theme.panel }} className="rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-6 pb-8 max-h-[85%]">
                            <View className="items-center mb-4">
                                <View className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                            </View>

                            <View className="flex-row justify-between items-center mb-4">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>
                                    Fulfillment Details
                                </Text>
                                <TouchableOpacity onPress={onClose}>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-slate-400">✕</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView className="mb-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <FulfillmentControls {...controlProps} />
                            </ScrollView>

                            <TouchableOpacity
                                onPress={onSave}
                                disabled={isSubmitDisabled}
                                style={{ backgroundColor: theme.primary, opacity: isSubmitDisabled ? 0.5 : 1 }}
                                className="w-full py-3.5 rounded-xl items-center justify-center shadow-md active:opacity-90 flex-row"
                            >
                                {isSaving ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-white">
                                        {isRetryingPayment ? 'Retry Payment' : `Pay KES ${controlProps.totals.total.toFixed(2)}`}
                                    </Text>
                                )}
                            </TouchableOpacity>

                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};