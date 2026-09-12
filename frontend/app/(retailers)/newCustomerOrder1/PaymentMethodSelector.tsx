import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface PaymentMethodItem {
    id: string;
    title: string;
    is_active?: boolean;
}

interface PaymentMethodSelectorProps {
    selectedMethodId: string;
    onSelectMethod: (id: string) => void;
    isLoading: boolean;
    theme: any;
}

export default function PaymentMethodSelector({
    selectedMethodId,
    onSelectMethod,
    isLoading,
    theme,
}: PaymentMethodSelectorProps) {
    const { paymentMethodsList } = usePaymentMethodsSync();
    const [modalVisible, setModalVisible] = useState(false);

    const activePaymentTitle = paymentMethodsList?.find((m: any) => m.id === selectedMethodId)?.title || "Choose Payment Channel";

    return (
        <View className="mb-6 w-full flex-col border-b border-black/5 pb-5">
            <View className="flex-row items-center mb-2.5">
                <Text className="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-slate-500">
                    Select Settlement Method:
                </Text>
                {isLoading && <ActivityIndicator size="small" color={theme.primary} className="ml-2" />}
            </View>

            {/* 🚀 EXPANDED 48px TRIGGER BOX: High target touch element */}
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setModalVisible(true)}
                className="h-12 px-4 rounded-xl border w-full flex-row justify-between items-center bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
            >
                <Text style={{ fontFamily: theme?.font?.medium || 'System', fontSize: theme?.fontSize?.sm || 14, color: selectedMethodId ? (theme?.text || '#0f172a') : '#94a3b8' }}>
                    {activePaymentTitle}
                </Text>
                <Text style={{ fontSize: 12, color: '#94a3b8' }}>▼</Text>
            </TouchableOpacity>

            {/* 🚀 NATIVE INTERACTIVE PICKER DRAWER SHEET */}
            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
                    <View style={styles.modalContent} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <View className="flex-row justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                            <Text style={{ fontFamily: theme?.font?.bold || 'System' }} className="text-base font-black text-slate-900 dark:text-white">
                                Choose Settlement Channel
                            </Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                                <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: 11 }} className="text-slate-500">Close</Text>
                            </TouchableOpacity>
                        </View>

                        {paymentMethodsList.length === 0 && !isLoading ? (
                            <Text className="text-xs italic p-4 text-center text-slate-400">
                                No remote payment profiles retrieved.
                            </Text>
                        ) : (
                            <ScrollView className="max-h-60" showsVerticalScrollIndicator={false}>
                                {paymentMethodsList.map((method) => {
                                    const isSelected = selectedMethodId === method.id;
                                    return (
                                        <TouchableOpacity
                                            key={method.id}
                                            onPress={() => { onSelectMethod(method.id); setModalVisible(false); }}
                                            className="py-3.5 px-2 border-b border-slate-50 dark:border-slate-800/40 last:border-b-0 flex-row justify-between items-center"
                                        >
                                            <Text style={{ fontFamily: isSelected ? (theme?.font?.bold || 'System') : (theme?.font?.medium || 'System'), color: isSelected ? theme.primary : (theme.text || '#0f172a') }} className="text-sm">
                                                {method.title}
                                            </Text>
                                            {isSelected && <Text style={{ color: theme.primary }} className="text-sm font-bold">✓</Text>}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }
});
