// components/common/LiveAlertBanner.tsx
//
// Floating banner for live events (e.g. "Prescription ready"). Tap to act,
// ✕ to dismiss; hides itself after `autoHideMs`.

import { useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface LiveAlert {
    id: string;
    title: string;
    message: string;
    icon?: keyof typeof Ionicons.glyphMap;
    color?: string;
    onPress?: () => void;
}

export function LiveAlertBanner({ alert, onDismiss, autoHideMs = 10_000 }: { alert: LiveAlert | null; onDismiss: () => void; autoHideMs?: number }) {
    const { theme } = useListTokens();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (!alert) return;
        const t = setTimeout(onDismiss, autoHideMs);
        return () => clearTimeout(t);
    }, [alert, onDismiss, autoHideMs]);

    if (!alert) return null;
    const color = alert.color ?? theme.primary;

    return (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 8, alignItems: 'center', paddingHorizontal: 12, zIndex: 50 }}>
            <Pressable
                onPress={() => {
                    alert.onPress?.();
                    onDismiss();
                }}
                accessibilityRole="alert"
                style={{
                    width: '100%',
                    maxWidth: 520,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: `${color}55`,
                    shadowColor: '#0f172a',
                    shadowOpacity: 0.18,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 8,
                    ...webPointer,
                }}
            >
                <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1A` }}>
                    <Ionicons name={alert.icon ?? 'notifications'} size={20} color={color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                        {alert.title}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 1 }} numberOfLines={3}>
                        {alert.message}
                    </Text>
                </View>
                <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={webPointer}>
                    <Ionicons name="close" size={18} color={theme.textDark} />
                </Pressable>
            </Pressable>
        </View>
    );
}

