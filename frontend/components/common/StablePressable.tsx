// components/common/StablePressable.tsx
//
// Drop-in replacement for React Native's Pressable that accepts a function
// `style={({ pressed }) => ...}` (and function children) but always hands
// Pressable a plain style. On native, NativeWind's Pressable wrapper dropped
// function styles entirely: buttons lost their background, height and layout
// (white labels on a white sheet — e.g. "Save" and "Start preparing" vanished).
//
// Import it instead of the react-native one wherever a style is a function:
//   import { Pressable } from '@/components/common/StablePressable';

import React, { forwardRef, useCallback, useState } from 'react';
import {
    Platform,
    Pressable as RNPressable,
    type GestureResponderEvent,
    type PressableProps,
    type PressableStateCallbackType,
    type View,
} from 'react-native';

export const Pressable = forwardRef<View, PressableProps>(function StablePressable(
    { style, children, onPressIn, onPressOut, ...rest },
    ref,
) {
    const [pressed, setPressed] = useState(false);
    const dynamic = typeof style === 'function' || typeof children === 'function';

    const handleIn = useCallback(
        (e: GestureResponderEvent) => {
            if (dynamic) setPressed(true);
            onPressIn?.(e);
        },
        [dynamic, onPressIn],
    );
    const handleOut = useCallback(
        (e: GestureResponderEvent) => {
            if (dynamic) setPressed(false);
            onPressOut?.(e);
        },
        [dynamic, onPressOut],
    );

    // Web handles function styles (and hover state) itself: pass them through.
    if (Platform.OS === 'web') {
        return (
            <RNPressable ref={ref} {...rest} onPressIn={onPressIn} onPressOut={onPressOut} style={style}>
                {children}
            </RNPressable>
        );
    }

    const state = { pressed, hovered: false } as PressableStateCallbackType;
    const resolvedStyle = typeof style === 'function' ? style(state) : style;
    const resolvedChildren = typeof children === 'function' ? children(state) : children;

    return (
        <RNPressable ref={ref} {...rest} onPressIn={handleIn} onPressOut={handleOut} style={resolvedStyle}>
            {resolvedChildren}
        </RNPressable>
    );
});

export default Pressable;
