// components/common/SubscriptionErrorModal.tsx

import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

interface Props {
    visible: boolean;
    message: string | null;
    onClose: () => void;
}

export function SubscriptionErrorModal({ visible, message, onClose }: Props) {
    const { theme } = useAuth();
    const router = useRouter();

    if (!message) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/60 items-center justify-center p-4">
                <View className="w-full max-w-[420px] rounded-2xl border overflow-hidden shadow-2xl" style={{ backgroundColor: theme.panel, borderColor: theme.border }}>
                    <View className="p-6 items-center">
                        <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
                            <Ionicons name="lock-closed" size={32} color="#f59e0b" />
                        </View>
                        <Text className="text-center font-bold text-lg mb-2" style={{ color: theme.text, fontFamily: theme.font.bold }}>
                            Subscription Required
                        </Text>
                        <Text className="text-center text-sm mb-2" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>
                            {message}
                        </Text>
                        <Text className="text-center text-xs opacity-75" style={{ color: theme.textDark, fontFamily: theme.font.regular }}>
                            Please renew your subscription to continue using this feature.
                        </Text>
                    </View>
                    <View className="flex-row border-t" style={{ borderTopColor: theme.border }}>
                        <Pressable onPress={onClose} className="flex-1 py-4 items-center border-r" style={{ borderRightColor: theme.border }}>
                            <Text className="font-bold uppercase tracking-wider text-xs" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>Dismiss</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => {
                                onClose();
                                router.push('/subscriptions'); // Adjust route if needed
                            }}
                            className="flex-1 py-4 items-center"
                        >
                            <Text className="font-bold uppercase tracking-wider text-xs" style={{ color: theme.primary, fontFamily: theme.font.bold }}>Subscribe Now</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}