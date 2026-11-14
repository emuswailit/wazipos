// components/common/PaymentStatusModal.tsx

import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, Text, View } from 'react-native';

interface Props {
    visible: boolean;
    status: string | null;
    description: string | null;
    onClose: () => void;
    onSuccess?: () => void; // 🟢 Added to distinguish success from close
    onRetry?: () => void;
}

export default function PaymentStatusModal({ visible, status, description, onClose, onSuccess, onRetry }: Props) {
    const { theme, isDarkMode } = useAuth();
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (status === 'SUCCESS' || status === 'FAILED') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [status, pulseAnim]);

    if (!visible || !status) return null;

    const isPending = status === 'PENDING' || status === 'CONNECTING';
    const isSuccess = status === 'SUCCESS';
    const isFailed = status === 'FAILED' || status === 'ERROR' || status === 'CLOSED';

    const iconColor = isSuccess ? '#10b981' : isFailed ? '#f43f5e' : '#3b82f6';
    const borderColor = isSuccess ? '#10b981' : isFailed ? '#f43f5e' : '#3b82f6';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/60 items-center justify-center p-4">
                <View
                    style={{ backgroundColor: theme.panel, borderColor }}
                    className="w-full max-w-[400px] rounded-2xl border shadow-2xl p-6 items-center"
                >
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }} className="mb-4">
                        {isPending ? (
                            <ActivityIndicator size="large" color={iconColor} />
                        ) : isSuccess ? (
                            <CheckCircle2 size={64} color={iconColor} />
                        ) : (
                            <XCircle size={64} color={iconColor} />
                        )}
                    </Animated.View>

                    <Text style={{ fontFamily: theme.font.bold, color: theme.text }} className="text-xl text-center mb-2">
                        {isPending ? 'Processing Payment' : isSuccess ? 'Payment Successful' : 'Payment Failed'}
                    </Text>

                    <Text style={{ fontFamily: theme.font.medium, color: theme.textDark }} className="text-sm text-center mb-6 px-2">
                        {description || (isPending ? 'Waiting for confirmation...' : 'No description provided.')}
                    </Text>

                    <View className="flex-row gap-3 w-full">
                        {isFailed ? (
                            <>
                                <Pressable
                                    onPress={onClose}
                                    className="flex-1 py-3 rounded-xl border items-center justify-center"
                                    style={{ borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}
                                >
                                    <Text style={{ fontFamily: theme.font.bold, color: theme.textDark }}>Close</Text>
                                </Pressable>
                                {onRetry && (
                                    <Pressable
                                        onPress={onRetry}
                                        className="flex-1 py-3 rounded-xl items-center justify-center"
                                        style={{ backgroundColor: theme.primary }}
                                    >
                                        <Text style={{ fontFamily: theme.font.bold, color: '#fff' }}>Try Again</Text>
                                    </Pressable>
                                )}
                            </>
                        ) : isSuccess ? (
                            <Pressable
                                // 🟢 Call onSuccess if provided, else fallback to onClose
                                onPress={onSuccess || onClose}
                                className="flex-1 py-3 rounded-xl items-center justify-center"
                                style={{ backgroundColor: theme.primary }}
                            >
                                <Text style={{ fontFamily: theme.font.bold, color: '#fff' }}>Done</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                onPress={onClose}
                                className="flex-1 py-3 rounded-xl border items-center justify-center"
                                style={{ borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}
                            >
                                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark }}>Cancel</Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}