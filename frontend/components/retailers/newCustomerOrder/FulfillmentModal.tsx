// components/retailers/newCustomerOrder/FulfillmentModal.tsx

import { DateField } from '@/components/common/DateField';
import LocationPinPicker from '@/components/common/LocationPinPicker';
import type { LatLng } from '@/components/common/locationPinShared';
import { StaffDeliveryPlanner, type StaffDeliveryState } from '@/components/deliveries/StaffDeliveryPlanner';
import { FloatingSheet } from '@/components/common/listScreen/AdminSheet';
import { useAuth } from '@/context/AuthContext';
import { ctaStyle, money, PaymentMethodCards } from '@/components/ui/pos';
import InsuranceOffer from '@/components/insurance/InsuranceOffer';
import React from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
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


/** Days from today until a credit sale's due date (1–90, what TradeGuard can cover). */
function creditDays(due?: string) {
    const d = due ? new Date(`${String(due).slice(0, 10)}T23:59:59`) : null;
    if (!d || isNaN(d.getTime())) return 30;
    return Math.min(90, Math.max(1, Math.ceil((d.getTime() - Date.now()) / 86400000)));
}

function pressHandlers(onPress: () => void, stopPropagation = false) {
    return isWeb
        ? { onClick: (e: any) => { if (stopPropagation) e?.stopPropagation?.(); onPress(); } }
        : { onStartShouldSetResponder: () => true, onResponderRelease: (e: any) => { if (stopPropagation) e?.stopPropagation?.(); onPress(); } };
}

export const FulfillmentControls: React.FC<FulfillmentControlsProps> = ({
    paymentMethodsList, selectedPaymentMethodId, setSelectedPaymentMethodId,
    isPaymentSyncing, paymentDetails, setPaymentDetails, totals,
    delivery, destination, setDestination, shopCenter, loadDeliveryOptions, deliveryOptionsKey, deliveryNotReadyHint,
}) => {
    const { theme } = useAuth();
    const currentMethodObj = paymentMethodsList.find((m) => m.id === selectedPaymentMethodId);
    const normalizedPaymentTitle = currentMethodObj?.title?.toUpperCase() || '';

    return (
        <View style={{ gap: 18 }} className="flex-col w-full">
            <View className="w-full">
                <Text style={{ fontFamily: theme.font.bold, fontSize: 11, color: theme.textMuted, letterSpacing: 0.8, marginBottom: 8 }}>FULFILMENT</Text>
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
                                        style={{ flex: 1, fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, ...webNoOutline }}
                                        className="h-11 border rounded-xl px-3"
                                        placeholder="Customer name"
                                        placeholderTextColor="#94a3b8"
                                        value={paymentDetails.customerName}
                                        onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerName: text }))}
                                    />
                                    <TextInput
                                        style={{ flex: 1, fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, ...webNoOutline }}
                                        className="h-11 border rounded-xl px-3"
                                        placeholder="Customer phone"
                                        keyboardType="phone-pad"
                                        placeholderTextColor="#94a3b8"
                                        value={paymentDetails.customerPhone}
                                        onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerPhone: text }))}
                                    />
                                </View>
                            ) : null}
                            <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>Deliver to</Text>
                            <LocationPinPicker value={destination} onChange={setDestination} center={shopCenter} height={180} />
                        </View>
                    }
                />
            </View>

            <View style={{ gap: 14 }} className="w-full">
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 11, color: theme.textMuted, letterSpacing: 0.8 }}>PAYMENT METHOD</Text>
                        {isPaymentSyncing ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                    </View>
                    <PaymentMethodCards
                        methods={paymentMethodsList.map((m) => ({ id: m.id, title: m.title }))}
                        value={selectedPaymentMethodId}
                        onChange={(id) => setSelectedPaymentMethodId(id)}
                    />
                </View>

                {normalizedPaymentTitle === 'MOBILE MONEY' && (
                    <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 12, gap: 6 }}>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>Mobile Money Number</Text>
                        <TextInput style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, ...webNoOutline }} className="w-full h-11 border rounded-xl px-3" placeholder="e.g. +2547XXXXXXXX" keyboardType="phone-pad" placeholderTextColor="#94a3b8" value={paymentDetails.mobileMoneyNumber} onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, mobileMoneyNumber: text }))} />
                    </View>
                )}

                {normalizedPaymentTitle === 'CREDIT' && (
                    <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 12, gap: 10 }}>
                        <View className="space-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>Customer Name</Text>
                            <TextInput
                                style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, ...webNoOutline }}
                                className="w-full h-11 border rounded-xl px-3"
                                placeholder="Enter full name"
                                placeholderTextColor="#94a3b8"
                                value={paymentDetails.customerName}
                                onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerName: text }))}
                            />
                        </View>
                        <View className="space-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>Customer Phone</Text>
                            <TextInput
                                style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, ...webNoOutline }}
                                className="w-full h-11 border rounded-xl px-3"
                                placeholder="Enter phone"
                                keyboardType="phone-pad"
                                placeholderTextColor="#94a3b8"
                                value={paymentDetails.customerPhone}
                                onChangeText={(text) => setPaymentDetails((prev: any) => ({ ...prev, customerPhone: text }))}
                            />
                        </View>
                        <View className="space-y-1">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>Due Date</Text>
                            <DateField
                                bare
                                placeholder="Select due date"
                                value={paymentDetails.dueDate}
                                onChangeText={(date) => setPaymentDetails((prev: any) => ({ ...prev, dueDate: date }))}
                            />
                        </View>
                        {/* WaziPOS Cover: insure this credit sale — 80% back if the customer doesn't pay. */}
                        {totals.total > 0 && paymentDetails.customerPhone && paymentDetails.dueDate ? (
                            <InsuranceOffer
                                product="TRADE_GUARD"
                                source="pos_credit"
                                variant="strip"
                                context={{
                                    inputs: {
                                        amount: Math.round(totals.total),
                                        days: creditDays(paymentDetails.dueDate),
                                        buyer_name: paymentDetails.customerName,
                                        buyer_phone: paymentDetails.customerPhone,
                                    },
                                }}
                                subjectLabel={`Credit to ${paymentDetails.customerName || 'this customer'}`}
                                locked={['amount', 'days', 'buyer_name', 'buyer_phone']}
                            />
                        ) : null}
                    </View>
                )}

                <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 14, gap: 6 }}>
                    <View className="flex-row justify-between items-center">
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textMuted }}>Subtotal</Text>
                        <Text style={{ fontFamily: theme.font.semibold, fontSize: theme.fontSize.sm, color: theme.text }}>KES {money(totals.subtotal + totals.totalDiscount)}</Text>
                    </View>
                    {totals.totalDiscount > 0 ? (
                        <View className="flex-row justify-between items-center">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textMuted }}>Discount</Text>
                            <Text style={{ fontFamily: theme.font.semibold, fontSize: theme.fontSize.sm, color: theme.danger }}>− KES {money(totals.totalDiscount)}</Text>
                        </View>
                    ) : null}
                    {delivery.method === 'DELIVERY' && (
                        <View className="flex-row justify-between items-center">
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textMuted }}>Delivery</Text>
                            <Text style={{ fontFamily: theme.font.semibold, fontSize: theme.fontSize.sm, color: delivery.option ? theme.text : theme.warning }}>
                                {delivery.option ? `KES ${money(totals.shippingCost)}` : 'Choose an option'}
                            </Text>
                        </View>
                    )}
                    <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />
                    <View className="flex-row justify-between items-end">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>Total</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 22, color: theme.text, letterSpacing: -0.3 }}>
                            <Text style={{ fontSize: 13, color: theme.textMuted }}>KES </Text>{money(totals.total)}
                        </Text>
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
        // FloatingSheet: clear of the bottom edge, height capped in pixels, backdrop
        // behind the panel — so the list scrolls and the Pay button stays visible.
        <FloatingSheet visible={visible} onClose={onClose}>
                        <View style={{ backgroundColor: theme.panel, flexShrink: 1, minHeight: 0 }} className="p-6 pb-5">
                            <View className="items-center mb-4">
                                <View className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                            </View>

                            <View className="flex-row justify-between items-center mb-4">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>
                                    Review & pay
                                </Text>
                                <TouchableOpacity onPress={onClose}>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base }} className="text-slate-400">✕</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView className="mb-4" style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <FulfillmentControls {...controlProps} />
                            </ScrollView>

                            <TouchableOpacity
                                onPress={onSave}
                                disabled={isSubmitDisabled}
                                style={[saveButtonStyle(theme), { opacity: isSubmitDisabled ? 0.5 : 1 }]}
                                className="w-full py-4 rounded-2xl items-center justify-center active:opacity-90 flex-row"
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
        </FloatingSheet>
    );
};

/** Primary call to action: brand cobalt -> sky gradient on web, solid cobalt with a glow on native. */
export function saveButtonStyle(theme: any) {
    return ctaStyle(theme);
}
