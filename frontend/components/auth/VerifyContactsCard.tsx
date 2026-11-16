// components/auth/VerifyContactsCard.tsx
//
// "Confirm your phone / email" reminder for the signed-in person (Profile).
// Phone: enter the 6-digit code texted to it (or get a new one).
// Email: confirmed only by opening the link emailed to it — here they can send a
// new link and check whether it has been opened.
// Hidden once both are confirmed (or there is nothing to confirm).

import verifyApi, { type MyVerification } from '@/api/verifyApi';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const errText = (res: any, fallback: string) => {
    const e = res?.data?.errors;
    return (Array.isArray(e) && e.join(' ')) || res?.data?.response_message || fallback;
};

/** `compact`: a one-line reminder (home) that opens Profile, where the full card is. */
export default function VerifyContactsCard({ compact = false }: { compact?: boolean } = {}) {
    const { theme } = useAuth();
    const [v, setV] = useState<MyVerification | null>(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState<'phone-send' | 'phone-confirm' | 'email-send' | 'email-check' | null>(null);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const load = useCallback(async () => {
        try {
            const res: any = await verifyApi.status();
            if (res.ok && res.data?.verification) setV(res.data.verification);
        } catch {
            /* the card just stays hidden */
        }
    }, []);
    // Re-check whenever Profile is opened (e.g. after opening the email link).
    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const run = async (kind: NonNullable<typeof busy>) => {
        setBusy(kind);
        setMsg(null);
        try {
            const res: any =
                kind === 'phone-send'
                    ? await verifyApi.sendPhoneCode()
                    : kind === 'phone-confirm'
                        ? await verifyApi.confirmPhone(code)
                        : kind === 'email-send'
                            ? await verifyApi.sendEmailLink()
                            : await verifyApi.status();
            if (res.ok && String(res.data?.response_code ?? '0') === '0' && res.data?.verification) {
                const next: MyVerification = res.data.verification;
                setV(next);
                if (kind === 'phone-send') setMsg({ text: `A new code was sent to ${next.phone}.`, ok: true });
                if (kind === 'phone-confirm') {
                    setCode('');
                    setMsg({ text: 'Phone confirmed. Thank you.', ok: true });
                }
                if (kind === 'email-send') setMsg({ text: `A new link was sent to ${next.email}.`, ok: true });
                if (kind === 'email-check') setMsg(next.email_verified ? { text: 'Email confirmed. Thank you.', ok: true } : { text: 'Not confirmed yet. Open the link in the email, then check again.', ok: false });
            } else {
                setMsg({ text: errText(res, 'That did not work.'), ok: false });
            }
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    if (!v) return null;
    const phoneTodo = !!v.phone && !v.phone_verified;
    const emailTodo = v.has_email && !v.email_verified;
    if (!phoneTodo && !emailTodo) return msg?.ok ? <Done text={msg.text} /> : null;

    if (compact) {
        const what = phoneTodo && emailTodo ? 'phone and email' : phoneTodo ? 'phone' : 'email';
        return (
            <Pressable
                onPress={() => router.push('/(tabs)/profile' as any)}
                accessibilityRole="button"
                accessibilityLabel={`Confirm your ${what}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.07)', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, ...webPointer }}
            >
                <Ionicons name="shield-half-outline" size={18} color="#d97706" />
                <Text numberOfLines={2} style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                    <Text style={{ fontFamily: theme.font.bold }}>Confirm your {what}</Text>
                    {phoneTodo && v.phone_code_pending ? ': enter the code we texted you' : emailTodo && !phoneTodo ? ': open the link we emailed you' : ''}
                </Text>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>Confirm</Text>
                <Ionicons name="chevron-forward" size={15} color={theme.primary} />
            </Pressable>
        );
    }

    const border = 'rgba(245,158,11,0.35)';
    const smallBtn = (label: string, onPress: () => void, loading: boolean, primary = false, disabled = false) => (
        <Pressable
            onPress={onPress}
            disabled={!!busy || disabled}
            accessibilityRole="button"
            style={{ height: 38, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? theme.primary : 'transparent', borderWidth: primary ? 0 : 1, borderColor: theme.border, opacity: disabled ? 0.55 : 1, ...webPointer }}
        >
            {loading ? <ActivityIndicator size="small" color={primary ? '#fff' : theme.primary} /> : <Text style={{ color: primary ? '#fff' : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{label}</Text>}
        </Pressable>
    );

    return (
        <View style={{ borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: 'rgba(245,158,11,0.06)', padding: 16, gap: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,158,11,0.16)' }}>
                    <Ionicons name="shield-half-outline" size={18} color="#d97706" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                        Confirm your {phoneTodo && emailTodo ? 'phone and email' : phoneTodo ? 'phone' : 'email'}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>So sellers can reach you about orders, and you can recover your account.</Text>
                </View>
            </View>

            {phoneTodo ? (
                <View style={{ gap: 8 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                        <Ionicons name="phone-portrait-outline" size={13} color={theme.text} /> {v.phone}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {v.phone_code_pending ? 'Enter the 6-digit code we texted you.' : 'Get a code by SMS, then enter it here.'}
                        {v.phone_sms_error ? ` Last SMS failed: ${v.phone_sms_error}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        {v.phone_code_pending ? (
                            <>
                                <TextInput
                                    value={code}
                                    onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                                    placeholder="••••••"
                                    placeholderTextColor={theme.textDark}
                                    keyboardType="number-pad"
                                    textContentType="oneTimeCode"
                                    autoComplete="sms-otp"
                                    maxLength={6}
                                    style={{ width: 130, height: 38, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.panel, color: theme.text, fontFamily: theme.font.bold, fontSize: 16, letterSpacing: 5, textAlign: 'center' }}
                                />
                                {smallBtn('Confirm', () => void run('phone-confirm'), busy === 'phone-confirm', true, code.length !== 6)}
                            </>
                        ) : null}
                        {smallBtn(v.phone_code_pending ? 'New code' : 'Text me a code', () => void run('phone-send'), busy === 'phone-send', !v.phone_code_pending)}
                    </View>
                </View>
            ) : null}

            {emailTodo ? (
                <View style={{ gap: 8, paddingTop: phoneTodo ? 12 : 0, borderTopWidth: phoneTodo ? 1 : 0, borderTopColor: border }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                        <Ionicons name="mail-outline" size={13} color={theme.text} /> {v.email}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {v.email_link_sent_at
                            ? `Open the link we emailed you on ${new Date(v.email_link_sent_at).toLocaleDateString()} (it works for 3 days).`
                            : 'We’ll email you a link; opening it confirms your email.'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {v.email_link_sent_at ? smallBtn('I’ve opened it', () => void run('email-check'), busy === 'email-check') : null}
                        {smallBtn(v.email_link_sent_at ? 'Send a new link' : 'Email me a link', () => void run('email-send'), busy === 'email-send', !v.email_link_sent_at)}
                    </View>
                </View>
            ) : null}

            {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
        </View>
    );
}

function Done({ text }: { text: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, padding: 12, marginBottom: 16, backgroundColor: 'rgba(16,185,129,0.08)' }}>
            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
            <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>{text}</Text>
        </View>
    );
}
