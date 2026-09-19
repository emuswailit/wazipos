// components/GlobalSyncIndicator.tsx

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { useRetailerOutOfStocksSync } from '@/context/RetailerOutOfStocksSyncContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* ================================================================== */
/* VARIANT                                                             */
/* ================================================================== */
type IndicatorVariant = 'auto' | 'pill' | 'bar';

export interface GlobalSyncIndicatorProps {
    /** 'auto' picks bar on web, pill on native. */
    variant?: IndicatorVariant;
    /** Where to anchor the pill. Ignored when variant='bar'. */
    position?: 'bottom' | 'top';
}

/* ================================================================== */
/* COMPONENT                                                           */
/* ================================================================== */
export function GlobalSyncIndicator({
    variant = 'auto',
    position = 'bottom',
}: GlobalSyncIndicatorProps) {
    const { theme } = useAuth();
    const insets = useSafeAreaInsets();

    const indents = useRetailerIndentsSync();
    const oos = useRetailerOutOfStocksSync();

    /* --------------------------------------------------------------
     * Composite "is syncing" signal
     * ------------------------------------------------------------ */
    const isSyncing = useMemo(() => {
        return (
            indents.isSyncing ||
            indents.isManualRefreshing ||
            indents.pendingIndentItemCount > 0 ||
            oos.isManualRefreshing ||
            !oos.isLiveConnected
        );
    }, [
        indents.isSyncing,
        indents.isManualRefreshing,
        indents.pendingIndentItemCount,
        oos.isManualRefreshing,
        oos.isLiveConnected,
    ]);

    /* --------------------------------------------------------------
     * Label — describe what's currently happening
     * ------------------------------------------------------------ */
    const label = useMemo(() => {
        if (indents.pendingIndentItemCount > 0) {
            const n = indents.pendingIndentItemCount;
            return `Syncing ${n} item${n === 1 ? '' : 's'}`;
        }
        if (indents.isManualRefreshing) return 'Syncing';
        if (oos.isManualRefreshing) return 'Reconnecting';
        if (!oos.isLiveConnected) return 'Reconnecting';
        if (indents.isSyncing) return 'Syncing';
        return 'Syncing';
    }, [
        indents.pendingIndentItemCount,
        indents.isManualRefreshing,
        oos.isManualRefreshing,
        oos.isLiveConnected,
        indents.isSyncing,
    ]);

    /* --------------------------------------------------------------
     * Keep visible briefly after the last activity to avoid flicker
     * ------------------------------------------------------------ */
    const [visible, setVisible] = useState(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );

    useEffect(() => {
        if (isSyncing) {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
            setVisible(true);
            return;
        }

        // Hold for 500ms then hide.
        hideTimerRef.current = setTimeout(() => {
            setVisible(false);
            hideTimerRef.current = null;
        }, 500);

        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
        };
    }, [isSyncing]);

    /* --------------------------------------------------------------
     * Resolve which rendering to use
     * ------------------------------------------------------------ */
    const resolvedVariant: 'pill' | 'bar' =
        variant === 'auto'
            ? Platform.OS === 'web'
                ? 'bar'
                : 'pill'
            : variant;

    /* --------------------------------------------------------------
     * Fade value
     * ------------------------------------------------------------ */
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: visible ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.quad),
            // useNativeDriver isn't supported for opacity on
            // react-native-web; fall back to JS driver there.
            useNativeDriver: Platform.OS !== 'web',
        }).start();
    }, [visible, opacity]);

    if (resolvedVariant === 'bar') {
        return (
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.barWrap,
                    {
                        top: 0,
                        opacity,
                        backgroundColor: theme.primary,
                    },
                ]}
            >
                <IndeterminateBar color={theme.primary} />
            </Animated.View>
        );
    }

    /* Pill */
    const anchorStyle =
        position === 'bottom'
            ? { bottom: Math.max(insets.bottom, 16) + 8 }
            : { top: Math.max(insets.top, 16) + 8 };

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.pillWrap,
                anchorStyle,
                {
                    opacity,
                    backgroundColor: theme.isDarkMode
                        ? 'rgba(15,20,32,0.94)'
                        : 'rgba(255,255,255,0.97)',
                    borderColor: theme.isDarkMode
                        ? '#334155'
                        : '#e2e8f0',
                },
            ]}
        >
            <ActivityIndicator size="small" color={theme.primary} />
            <Text
                numberOfLines={1}
                style={{
                    marginLeft: 8,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                }}
            >
                {label}
            </Text>
        </Animated.View>
    );
}

/* ================================================================== */
/* Indeterminate progress bar — pure RN, no external deps             */
/* ================================================================== */
function IndeterminateBar({ color }: { color: string }) {
    const { width } = useWindowDimensionsSafe();
    const translate = useRef(new Animated.Value(0)).current;
    const [trackWidth, setTrackWidth] = useState(0);

    const segmentWidth = Math.max(
        120,
        Math.min(360, trackWidth * 0.35)
    );

    useEffect(() => {
        translate.setValue(-segmentWidth);

        const loop = Animated.loop(
            Animated.timing(translate, {
                toValue: trackWidth || 1,
                duration: 1200,
                easing: Easing.inOut(Easing.linear),
                useNativeDriver: Platform.OS !== 'web',
            })
        );
        loop.start();

        return () => loop.stop();
    }, [translate, segmentWidth, trackWidth]);

    return (
        <View
            onLayout={(e) =>
                setTrackWidth(e.nativeEvent.layout.width)
            }
            style={styles.barTrack}
        >
            <Animated.View
                style={[
                    styles.barSegment,
                    {
                        width: segmentWidth,
                        backgroundColor: color,
                        transform: [
                            { translateX: translate },
                        ],
                    },
                ]}
            />
        </View>
    );
}

/* ================================================================== */
/* Small helper — safe window dims on web + native                    */
/* ================================================================== */
function useWindowDimensionsSafe() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useWindowDimensions } =
        require('react-native') as typeof import('react-native');
    return useWindowDimensions();
}

/* ================================================================== */
/* STYLES                                                              */
/* ================================================================== */
const styles = StyleSheet.create({
    barWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        overflow: 'hidden',
    },
    barTrack: {
        flex: 1,
        overflow: 'hidden',
    },
    barSegment: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        borderRadius: 2,
        opacity: 0.9,
    },
    pillWrap: {
        position: 'absolute',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
        zIndex: 9999,
    },
});