// components/wholesalers/newWholesaleOrder/OrderManifestHeader.tsx

import React, { useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Animated,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type SyncStatus =
    | 'idle'
    | 'syncing'
    | 'ok'
    | 'error';

interface OrderManifestHeaderProps {
    theme: any;
    user: any;
    syncStatus: SyncStatus;
    isNetworkLoading: boolean;
    onResetWorkspaceTrigger: () => void;
}

export default function OrderManifestHeader({
    theme,
    user,
    syncStatus,
    isNetworkLoading,
    onResetWorkspaceTrigger,
}: OrderManifestHeaderProps) {
    const isDark = (theme as any).isDarkMode;

    const isOk = syncStatus === 'ok';
    const isError = syncStatus === 'error';
    const isSyncing = syncStatus === 'syncing';

    /* -------- Pill colors -------- */
    const okColor = '#22c55e';
    const warnColor = '#f59e0b';
    const errColor = '#ef4444';
    const infoColor = theme.primary;

    const pillColor = isOk
        ? okColor
        : isError
            ? errColor
            : isSyncing
                ? infoColor
                : warnColor;

    const pillBg = `${pillColor}15`;
    const pillBorder = `${pillColor}40`;

    const pillLabel = isOk
        ? '✓ SYSTEM SYNCED'
        : isError
            ? '⚠ SYNC ERROR'
            : isSyncing
                ? '↻ SYNCING'
                : '📝 LOCAL DRAFT';

    /* -------- Pulse animation -------- */
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isSyncing) {
            pulse.setValue(1);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 0.3,
                    duration: 700,
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 700,
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [isSyncing, pulse]);

    return (
        <View className="w-full">
            {/* -------- Sync status pill -------- */}
            <View
                style={{
                    position: 'absolute',
                    top: -12,
                    right: 0,
                    zIndex: 50,
                    backgroundColor: pillBg,
                    borderColor: pillBorder,
                }}
                className="border px-3 py-1 rounded-full flex-row items-center gap-x-1.5 shadow-sm"
            >
                <Animated.View
                    style={{
                        backgroundColor: pillColor,
                        opacity: pulse,
                    }}
                    className="w-2 h-2 rounded-full"
                />
                <Text
                    style={{
                        color: pillColor,
                        fontFamily: theme.font?.bold,
                    }}
                    className="text-[10px] font-black tracking-widest uppercase"
                >
                    {pillLabel}
                </Text>
            </View>

            {/* -------- Title row -------- */}
            <View className="flex-row justify-between items-center mb-1">
                <Text
                    className="text-2xl font-bold"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font?.bold,
                    }}
                >
                    New Wholesale Order Form
                </Text>
                {isNetworkLoading ? (
                    <ActivityIndicator
                        size="small"
                        color={theme.primary}
                    />
                ) : null}
            </View>

            {/* -------- Manager + reset row -------- */}
            <View className="flex-row justify-between items-center mb-4">
                {user?.name ? (
                    <Text
                        className="text-xs font-medium"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.medium,
                        }}
                    >
                        Creating order as manager:{' '}
                        <Text
                            className="font-bold"
                            style={{
                                fontFamily: theme.font?.bold,
                            }}
                        >
                            {user.name}
                        </Text>
                    </Text>
                ) : (
                    <View />
                )}

                <TouchableOpacity
                    onPress={onResetWorkspaceTrigger}
                    activeOpacity={0.6}
                    hitSlop={10}
                    className="px-2 py-1 rounded-md"
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font?.bold,
                        }}
                        className="text-xs font-black uppercase tracking-wide"
                    >
                        🔄 Reset Form / Start New
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}