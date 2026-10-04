// components/common/ImageWithFallback.tsx
//
// Image that renders a placeholder emoji if the URI is missing OR
// the image fails to load. Prevents blank boxes when a server URL
// 404s.

import { useAuth } from '@/context/AuthContext';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';

export interface ImageWithFallbackProps {
    uri: string | null | undefined;
    width: number | string;
    height: number | string;
    fallback?: string;
    fallbackSize?: number;
    resizeMode?: 'cover' | 'contain' | 'stretch';
    borderRadius?: number;
    backgroundColor?: string;
}

export default function ImageWithFallback({
    uri,
    width,
    height,
    fallback = '📦',
    fallbackSize = 18,
    resizeMode = 'cover',
    borderRadius = 0,
    backgroundColor,
}: ImageWithFallbackProps) {
    const { theme } = useAuth();
    const [errored, setErrored] = useState(false);

    if (!uri || errored) {
        return (
            <View
                style={{
                    width,
                    height,
                    borderRadius,
                    backgroundColor:
                        backgroundColor ??
                        (theme.isDarkMode
                            ? '#0f172a'
                            : '#e2e8f0'),
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Text
                    style={{
                        fontSize: fallbackSize,
                        opacity: 0.4,
                    }}
                >
                    {fallback}
                </Text>
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={{ width, height, borderRadius }}
            resizeMode={resizeMode}
            onError={() => setErrored(true)}
        />
    );
}