import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';

interface CustomModalProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function CustomModal({ visible, onClose, children }: CustomModalProps) {
    const { width } = useWindowDimensions();
    const { theme } = useAuth();
    const isLargeScreen = width >= 768;

    // Use crisp fade transitions on large screens, standard slide transitions on mobile screens
    const animationType = isLargeScreen ? 'fade' : 'slide';

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType={animationType}
            onRequestClose={onClose}
        >
            {/* 1. Backdrop overlay element */}
            <View
                className="flex-1 justify-end md:justify-center items-center bg-black/50 p-0 md:p-4"
                style={{
                    ...Platform.select({
                        web: { backdropFilter: 'blur(4px)' } as any, // Premium glassmorphism on web viewports
                        default: {}
                    })
                }}
            >
                {/* Dismiss trigger layer for tapping outside the modal framework safely */}
                <Pressable className="absolute inset-0 w-full h-full" onPress={onClose} />

                {/* 2. Primary Modal Window Wrapper Content Panel */}
                <View
                    className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-2xl p-6 border shadow-2xl border-slate-100 dark:border-slate-800"
                    style={{
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        maxHeight: isLargeScreen ? '85%' : '90%'
                    }}
                >
                    {/* Subtle Mobile UI Bottom Sheet Pull Indicator handle tab layout element */}
                    {!isLargeScreen && (
                        <View className="items-center mb-4 -mt-2">
                            <View className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
                        </View>
                    )}

                    {/* Render target children data templates passed at layout time */}
                    <View className="w-full">
                        {children}
                    </View>
                </View>
            </View>
        </Modal>
    );
}
