// app/verify-email/index.tsx
//
// Public page opened from the confirmation email: /verify-email?u=<user id>&t=<token>.
// Works signed in or not (see app/_layout.tsx public routes).

import adminUsersApi from '@/api/adminUsersApi';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type State = { kind: 'checking' } | { kind: 'ok' } | { kind: 'error'; text: string };

export default function VerifyEmailScreen() {
    const { theme, user } = useAuth() as any;
    const { u, t } = useLocalSearchParams<{ u?: string; t?: string }>();
    const [state, setState] = useState<State>({ kind: 'checking' });

    useEffect(() => {
        const id = Array.isArray(u) ? u[0] : u;
        const token = Array.isArray(t) ? t[0] : t;
        if (!id || !token) {
            setState({ kind: 'error', text: 'This link is incomplete. Open the full link from the email.' });
            return;
        }
        adminUsersApi
            .confirmEmail(id, token)
            .then((res: any) => {
                if (res.ok && String(res.data?.response_code) === '0') setState({ kind: 'ok' });
                else {
                    const e = res.data?.errors;
                    setState({ kind: 'error', text: (Array.isArray(e) && e.join(' ')) || res.data?.response_message || 'This link did not work.' });
                }
            })
            .catch(() => setState({ kind: 'error', text: 'Could not reach WaziPOS. Check your connection and open the link again.' }));
    }, [u, t]);

    const ok = state.kind === 'ok';
    const color = ok ? '#10b981' : state.kind === 'error' ? '#f43f5e' : theme.primary;
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.background }}>
            <View style={{ width: '100%', maxWidth: 420, alignItems: 'center', gap: 14, padding: 24, borderRadius: 24, backgroundColor: theme.panel }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1f` }}>
                    {state.kind === 'checking' ? <ActivityIndicator color={color} /> : <Ionicons name={ok ? 'mail-open' : 'alert-circle-outline'} size={30} color={color} />}
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20, textAlign: 'center' }}>
                    {state.kind === 'checking' ? 'Confirming your email…' : ok ? 'Email confirmed' : 'Couldn’t confirm your email'}
                </Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
                    {state.kind === 'checking' ? 'One moment.' : ok ? 'Thank you. Your email address is confirmed for WaziPOS.' : state.text}
                </Text>
                {state.kind !== 'checking' ? (
                    <Pressable
                        onPress={() => router.replace((user ? '/(tabs)' : '/welcome') as any)}
                        accessibilityRole="button"
                        style={{ marginTop: 6, paddingHorizontal: 20, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary }}
                    >
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>{user ? 'Go to WaziPOS' : 'Open WaziPOS'}</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}
