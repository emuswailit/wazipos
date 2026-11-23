// components/common/OfflinePill.tsx
//
// One small floating pill while the device is offline ("work is saved on this
// device"), and a short "Back online" toast when the connection returns.

import { toast } from '@/components/common/Toast';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { WifiOff } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflinePill() {
    const { isOnline } = useNetworkStatus();
    const { theme } = useAuth();
    const insets = useSafeAreaInsets();
    const anim = useRef(new Animated.Value(isOnline ? 0 : 1)).current;
    const wasOnline = useRef(isOnline);

    useEffect(() => {
        Animated.timing(anim, { toValue: isOnline ? 0 : 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
        if (isOnline && !wasOnline.current) {
            toast.show({ key: 'net', tone: 'success', title: 'Back online', message: 'Syncing anything saved while you were offline.', duration: 3000 });
        }
        wasOnline.current = isOnline;
    }, [isOnline, anim]);

    if (isOnline) return null;
    return (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + (Platform.OS === 'web' ? 18 : 88), alignItems: 'center', zIndex: 99990, elevation: 90 }}>
            <Animated.View
                accessibilityRole="alert"
                style={{
                    opacity: anim,
                    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
                    backgroundColor: theme.navy ?? '#0b1733',
                    shadowColor: '#0b1733', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
                }}
            >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.warning }} />
                <WifiOff size={14} color="#fff" strokeWidth={2.4} />
                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>Offline</Text>
                <Text style={{ color: 'rgba(255,255,255,0.72)', fontFamily: theme.font.medium, fontSize: 12 }}>· work is saved on this device</Text>
            </Animated.View>
        </View>
    );
}
