// app/(auth)/consent.tsx — public page: /consent
//
// The "handshake": someone registered on WaziPOS gets an SMS with a 6-digit
// code. Entering it here (with the phone it was sent to) records their consent
// to SMS and calls from WaziPOS vendors and their staff. No sign-in needed.

import adminUsersApi from '@/api/adminUsersApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Formik } from 'formik';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Yup from 'yup';

const schema = Yup.object({
    phone: Yup.string()
        .trim()
        .required('Enter your phone number')
        .test('ke', 'Enter a valid number, e.g. 0712345678', (v) => /^(?:\+?254|0)?(7|1)\d{8}$/.test(String(v || '').replace(/\s+/g, ''))),
    code: Yup.string().trim().matches(/^\d{6}$/, 'Enter the 6-digit code from the SMS').required('Enter the 6-digit code from the SMS'),
});

export default function ConsentScreen() {
    const { theme } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams<{ phone?: string }>();
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }} keyboardShouldPersistTaps="handled">
                <View
                    className="w-full rounded-3xl p-6"
                    style={{
                        maxWidth: 440,
                        backgroundColor: theme.panel,
                        gap: 18,
                        ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 40px rgba(15,23,42,0.08)' } as any) : { elevation: 3 }),
                    }}
                >
                    <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                        <Ionicons name={done ? 'shield-checkmark' : 'chatbubble-ellipses-outline'} size={28} color={done ? '#10b981' : theme.primary} />
                    </View>

                    {done ? (
                        <View style={{ gap: 8 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>Thank you</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                                Your consent is recorded. WaziPOS vendors and their staff may now send you SMS and call you on this number.
                            </Text>
                            <Pressable onPress={() => router.replace('/welcome' as any)} className="mt-2 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: theme.primary }}>
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>Continue to WaziPOS</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <Formik
                            initialValues={{ phone: String(params.phone ?? ''), code: '' }}
                            validationSchema={schema}
                            onSubmit={async (v) => {
                                setError(null);
                                try {
                                    const res: any = await adminUsersApi.confirmOwnConsent(v.phone.replace(/\s+/g, ''), v.code.trim());
                                    if (res.ok && String(res.data?.response_code) === '0') setDone(true);
                                    else {
                                        const errs = res.data?.errors;
                                        setError((Array.isArray(errs) && errs.join(' ')) || res.data?.response_message || 'That code did not work.');
                                    }
                                } catch (e: any) {
                                    setError(e?.message || 'Could not reach the server.');
                                }
                            }}
                        >
                            {(f) => (
                                <View style={{ gap: 14 }}>
                                    <View style={{ gap: 6 }}>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>Confirm your consent</Text>
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                                            Enter the code we sent you by SMS. It allows WaziPOS vendors and their staff to text and call you on that number.
                                        </Text>
                                    </View>
                                    <CustomTextField name="phone" label="Phone number" required placeholder="0712345678" keyboardType="phone-pad" />
                                    <CustomTextField
                                        name="code"
                                        label="6-digit code"
                                        required
                                        placeholder="••••••"
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        transform={(t: string) => t.replace(/[^0-9]/g, '')}
                                    />
                                    {error ? (
                                        <View className="flex-row items-center rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.10)', gap: 8 }}>
                                            <Ionicons name="alert-circle" size={16} color="#f43f5e" />
                                            <Text style={{ flex: 1, color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text>
                                        </View>
                                    ) : null}
                                    <Pressable
                                        onPress={() => f.handleSubmit()}
                                        disabled={f.isSubmitting}
                                        className="h-12 rounded-xl items-center justify-center"
                                        style={{ backgroundColor: theme.primary, opacity: f.isSubmitting ? 0.7 : 1 }}
                                    >
                                        {f.isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>I agree — confirm</Text>}
                                    </Pressable>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, textAlign: 'center' }}>
                                        Didn't ask to register? Ignore the SMS — nothing happens without this code.
                                    </Text>
                                </View>
                            )}
                        </Formik>
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
