// components/common/InitialsAvatar.tsx
//
// Round avatar showing a name's initials on a stable tint (same name -> same colour).

import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { Text, View } from 'react-native';

const TINTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

function initialsOf(name?: string | null): string {
    const words = String(name || '')
        .replace(/[^A-Za-z\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '#';
    return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

function tintOf(seed?: string | null): string {
    const s = String(seed || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TINTS[h % TINTS.length];
}

export function InitialsAvatar({ name, size = 32 }: { name?: string | null; size?: number }) {
    const { theme } = useAuth();
    const tint = tintOf(name);
    return (
        <View className="items-center justify-center rounded-full" style={{ width: size, height: size, backgroundColor: `${tint}1f` }}>
            <Text style={{ color: tint, fontFamily: theme.font.bold, fontSize: size * 0.36 }}>{initialsOf(name)}</Text>
        </View>
    );
}
