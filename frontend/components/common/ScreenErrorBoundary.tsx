// components/common/ScreenErrorBoundary.tsx
//
// What a screen shows instead of crashing the app (expo-router error boundaries:
// app/_layout.tsx exports it as ErrorBoundary and as unstable_settings.screenErrorBoundary,
// so every screen and nested layout falls back to it and the navigator stays mounted).
//
// On web, screens load on demand (asyncRoutes.web). When that download fails —
// dev server restarted, connection dropped — the browser throws
// "NetworkError when attempting to fetch resource" / "Failed to fetch" / "Load failed".
// Those get a friendly "couldn't load" with Retry and Reload; anything else shows the
// error with Retry. Every error is logged to the console with its stack.

import { useAuth } from '@/context/AuthContext';
import type { ErrorBoundaryProps } from 'expo-router';
import { RefreshCw, WifiOff, AlertTriangle } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

const LOAD_FAILED = /NetworkError|Failed to fetch|Load failed|Network request failed|Loading chunk|ChunkLoadError|Importing a module script failed|dynamically imported module/i;

export function isLoadFailure(error: unknown): boolean {
    const e = error as any;
    return LOAD_FAILED.test(String(e?.message ?? e ?? '')) || e?.name === 'ChunkLoadError';
}

const FALLBACK_THEME = {
    background: '#f5f7fb',
    panel: '#ffffff',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    primary: '#2a6ff3',
    danger: '#ef4444',
    warning: '#f59e0b',
    font: { bold: undefined as any, medium: undefined as any },
};

/** Works even above the auth provider (falls back to a plain theme). */
function useSafeTheme() {
    try {
        return (useAuth() as any)?.theme ?? FALLBACK_THEME;
    } catch {
        return FALLBACK_THEME;
    }
}

export default function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
    const theme = useSafeTheme();
    const loadFailed = isLoadFailure(error);

    useEffect(() => {
        console.error(loadFailed ? '[screen] could not load this screen (network / dev server):' : '[screen] crashed:', error);
    }, [error, loadFailed]);

    const reload = () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
        else void retry();
    };

    const Icon = loadFailed ? WifiOff : AlertTriangle;
    const tint = loadFailed ? theme.warning : theme.danger;

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.background }}>
            <View style={{ width: '100%', maxWidth: 440, backgroundColor: theme.panel, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 22, alignItems: 'center', gap: 10 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint}1f` }}>
                    <Icon size={26} color={tint} />
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font?.bold, fontWeight: '800', fontSize: 19, textAlign: 'center' }}>
                    {loadFailed ? "Couldn't load this screen" : 'Something went wrong on this screen'}
                </Text>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font?.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
                    {loadFailed
                        ? 'The connection dropped while the screen was downloading. Check your internet (or that the dev server is running) and try again.'
                        : 'The rest of the app still works. Try again, and if it keeps happening, tell support what you were doing.'}
                </Text>
                {!loadFailed && error?.message ? (
                    <ScrollView style={{ maxHeight: 110, alignSelf: 'stretch', backgroundColor: `${theme.danger}12`, borderRadius: 12, padding: 10 }}>
                        <Text selectable style={{ color: theme.danger, fontSize: 12.5, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{error.message}</Text>
                    </ScrollView>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 }}>
                    <Pressable onPress={() => void retry()} style={{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: theme.primary }}>
                        <RefreshCw size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontFamily: theme.font?.bold, fontWeight: '700', fontSize: 14.5 }}>Try again</Text>
                    </Pressable>
                    {Platform.OS === 'web' ? (
                        <Pressable onPress={reload} style={{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font?.bold, fontWeight: '700', fontSize: 14.5 }}>Reload page</Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </View>
    );
}
