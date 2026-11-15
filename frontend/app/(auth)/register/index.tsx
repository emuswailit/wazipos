// app/(auth)/register/index.tsx
//
// Self sign-up — one form for phones, tablets and web:
//   1. Continue with Google / Facebook (placeholders until their keys are set),
//      or fill in name, phone, email and password. Gender, date of birth and an
//      ID / passport (number + photo) are optional, under "More details".
//   2. The server creates the account (default WAZIPOS entity), replies with a
//      session, and texts a consent code. The person enters it here — their
//      consent to SMS and calls from vendors and their staff — or skips it
//      (they can confirm later at /consent). Then they're signed in.

import authService, { type SelfRegisterInput } from '@/api/authApi';
import adminUsersApi from '@/api/adminUsersApi';
import FacebookSignInButton from '@/components/auth/FacebookSignInButton';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import { ChoiceChips, FormRow } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { pickImage, previewUri, type PickedImage } from '@/components/common/imagePicker';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Formik } from 'formik';
import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Yup from 'yup';

const KE_PHONE = /^(?:\+?254|0)?(7|1)\d{8}$/;
const MIN_AGE_YEARS = 18;

const schema = Yup.object({
    first_name: Yup.string().trim().required('Enter your first name'),
    middle_name: Yup.string().trim().optional(),
    last_name: Yup.string().trim().required('Enter your last name'),
    phone: Yup.string()
        .trim()
        .required('Enter your phone number')
        .test('ke', 'Enter a valid number, e.g. 0712345678', (v) => KE_PHONE.test(String(v || '').replace(/\s+/g, ''))),
    email: Yup.string().trim().email('Enter a valid email address').required('Enter your email address'),
    password: Yup.string().min(8, 'Use at least 8 characters').required('Choose a password'),
    confirm_password: Yup.string().oneOf([Yup.ref('password')], "Passwords don't match").required('Repeat your password'),
    gender: Yup.string().optional(),
    date_of_birth: Yup.string()
        .optional()
        .test('age', `You must be at least ${MIN_AGE_YEARS}`, (v) => {
            if (!v) return true;
            const [y, m, d] = v.split('-').map(Number);
            const dob = new Date(y, m - 1, d);
            const now = new Date();
            const age = now.getFullYear() - dob.getFullYear() - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
            return age >= MIN_AGE_YEARS;
        }),
    identifier_type: Yup.string().oneOf(['', 'NationalId', 'Passport']).optional(),
    identifier_number: Yup.string().trim().when('identifier_type', {
        is: (t: string) => !!t,
        then: (s) => s.required('Enter the document number'),
        otherwise: (s) => s.optional(),
    }),
    accepted_terms: Yup.boolean().oneOf([true], 'Accept the terms to continue'),
});

type Pending = { token: string; phone: string; consentSent: boolean; consentError: string | null };

export default function RegisterScreen() {
    const { theme, login } = useAuth();
    const router = useRouter();
    const [errors, setErrors] = useState<string[]>([]);
    const [socialBusy, setSocialBusy] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [doc, setDoc] = useState<PickedImage | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);

    const signIn = async (token: string) => {
        await login(token);
        router.replace('/(tabs)' as any);
    };

    /** Google: the same exchange as the login screen (creates the account if new). */
    const onGoogleIdToken = async (idToken: string) => {
        setErrors([]);
        setSocialBusy(true);
        try {
            const res: any = await authService.googleLogin(idToken);
            const token = res.data?.tokens?.access;
            if (res.ok && String(res.data?.response_code) === '0' && token) await signIn(token);
            else setErrors([res.data?.response_message || 'Google sign-up did not work. Please try again.']);
        } catch (e: any) {
            setErrors([e?.message || 'Could not reach the server.']);
        } finally {
            setSocialBusy(false);
        }
    };

    const card = {
        maxWidth: 560,
        backgroundColor: theme.panel,
        ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 40px rgba(15,23,42,0.08)' } as any) : { elevation: 3 }),
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <View className="w-full rounded-3xl p-5 md:p-8" style={[card, { gap: 18 }]}>
                    {pending ? (
                        <ConsentStep pending={pending} onDone={() => void signIn(pending.token)} />
                    ) : (
                        <>
                            {/* Header */}
                            <View style={{ gap: 6 }}>
                                <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                                    <Ionicons name="person-add-outline" size={24} color={theme.primary} />
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 26, marginTop: 6 }}>Create your account</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                                    Shop, pay and manage your business on WaziPOS.
                                </Text>
                            </View>

                            {/* Social sign-up (placeholders until keys are set — never breaks dev builds) */}
                            <View style={{ gap: 10 }}>
                                <GoogleSignInButton onIdToken={onGoogleIdToken} onError={(m) => setErrors([m])} loading={socialBusy} />
                                <FacebookSignInButton onError={(m) => setErrors([m])} />
                            </View>

                            <View className="flex-row items-center" style={{ gap: 10 }}>
                                <View className="flex-1 h-px" style={{ backgroundColor: theme.border }} />
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>or sign up with your details</Text>
                                <View className="flex-1 h-px" style={{ backgroundColor: theme.border }} />
                            </View>

                            <Formik
                                initialValues={{
                                    first_name: '',
                                    middle_name: '',
                                    last_name: '',
                                    phone: '',
                                    email: '',
                                    password: '',
                                    confirm_password: '',
                                    gender: '',
                                    date_of_birth: '',
                                    identifier_type: '' as '' | 'NationalId' | 'Passport',
                                    identifier_number: '',
                                    accepted_terms: false,
                                }}
                                validationSchema={schema}
                                onSubmit={async (v) => {
                                    setErrors([]);
                                    const input: SelfRegisterInput = {
                                        first_name: v.first_name.trim(),
                                        middle_name: v.middle_name.trim(),
                                        last_name: v.last_name.trim(),
                                        phone: v.phone.replace(/\s+/g, ''),
                                        email: v.email.trim().toLowerCase(),
                                        password: v.password,
                                        accepted_terms: v.accepted_terms,
                                        gender: v.gender,
                                        date_of_birth: v.date_of_birth,
                                        identifier_type: v.identifier_type,
                                        identifier_number: v.identifier_type ? v.identifier_number.trim() : '',
                                    };
                                    try {
                                        const res: any = await authService.register(input, v.identifier_type ? doc : null);
                                        const token = res.data?.tokens?.access;
                                        if (res.ok && String(res.data?.response_code) === '0' && token) {
                                            setPending({ token, phone: input.phone, consentSent: !!res.data?.consent_sent, consentError: res.data?.consent_error ?? null });
                                        } else {
                                            const errs = res.data?.errors;
                                            setErrors(Array.isArray(errs) && errs.length ? errs : [res.data?.response_message || res.problem || 'Your account could not be created.']);
                                        }
                                    } catch (e: any) {
                                        setErrors([e?.message || 'Could not reach the server.']);
                                    }
                                }}
                            >
                                {(f) => (
                                    <View style={{ gap: 14 }}>
                                        <FormRow>
                                            <CustomTextField name="first_name" label="First name" required placeholder="Jane" autoCapitalize="words" textContentType="givenName" />
                                            <CustomTextField name="last_name" label="Last name" required placeholder="Wanjiku" autoCapitalize="words" textContentType="familyName" />
                                        </FormRow>
                                        <FormRow>
                                            <CustomTextField name="phone" label="Phone" required placeholder="0712345678" keyboardType="phone-pad" textContentType="telephoneNumber" />
                                            <CustomTextField name="email" label="Email" required placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" />
                                        </FormRow>
                                        <FormRow>
                                            <CustomTextField name="password" label="Password" required placeholder="At least 8 characters" secureTextEntry={!showPassword} autoCapitalize="none" textContentType="newPassword" />
                                            <CustomTextField name="confirm_password" label="Repeat password" required placeholder="Type it again" secureTextEntry={!showPassword} autoCapitalize="none" textContentType="newPassword" />
                                        </FormRow>
                                        <Pressable onPress={() => setShowPassword((s) => !s)} className="flex-row items-center self-start" style={{ gap: 6 }}>
                                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={15} color={theme.primary} />
                                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{showPassword ? 'Hide passwords' : 'Show passwords'}</Text>
                                        </Pressable>

                                        {/* Optional details */}
                                        <Pressable
                                            onPress={() => setMoreOpen((o) => !o)}
                                            className="flex-row items-center justify-between rounded-xl px-3 h-11"
                                            style={{ borderWidth: 1, borderColor: theme.border }}
                                        >
                                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>More details (optional)</Text>
                                            <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textDark} />
                                        </Pressable>
                                        {moreOpen ? (
                                            <View style={{ gap: 14 }}>
                                                <FormRow>
                                                    <CustomTextField name="middle_name" label="Middle name" placeholder="Optional" autoCapitalize="words" />
                                                    <DateField name="date_of_birth" label="Date of birth" placeholder="Optional" />
                                                </FormRow>
                                                <ChoiceChips<string>
                                                    label="Gender"
                                                    options={[
                                                        { value: '', label: 'Prefer not to say' },
                                                        { value: 'Female', label: 'Female' },
                                                        { value: 'Male', label: 'Male' },
                                                        { value: 'Other', label: 'Other' },
                                                    ]}
                                                    value={f.values.gender}
                                                    onChange={(g) => f.setFieldValue('gender', g)}
                                                />
                                                <ChoiceChips<'' | 'NationalId' | 'Passport'>
                                                    label="Identity document"
                                                    hint="Optional — helps sellers trust your orders."
                                                    options={[
                                                        { value: '', label: 'None', icon: 'remove-circle-outline' },
                                                        { value: 'NationalId', label: 'National ID', icon: 'id-card-outline' },
                                                        { value: 'Passport', label: 'Passport', icon: 'airplane-outline' },
                                                    ]}
                                                    value={f.values.identifier_type}
                                                    onChange={(t) => {
                                                        f.setFieldValue('identifier_type', t);
                                                        if (!t) setDoc(null);
                                                    }}
                                                />
                                                {f.values.identifier_type ? (
                                                    <View style={{ gap: 10 }}>
                                                        <CustomTextField
                                                            name="identifier_number"
                                                            label={f.values.identifier_type === 'Passport' ? 'Passport number' : 'ID number'}
                                                            required
                                                            autoCapitalize="characters"
                                                        />
                                                        <Pressable
                                                            onPress={async () => {
                                                                const picked = await pickImage({ allowsEditing: false, quality: 0.8 });
                                                                if (picked) setDoc(picked);
                                                            }}
                                                            className="flex-row items-center rounded-xl p-2.5"
                                                            style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, gap: 10 }}
                                                        >
                                                            <View className="rounded-lg items-center justify-center overflow-hidden" style={{ width: 64, height: 44, backgroundColor: `${theme.primary}10` }}>
                                                                {doc ? <Image source={{ uri: previewUri(doc)! }} style={{ width: 64, height: 44 }} /> : <Ionicons name="camera-outline" size={20} color={theme.primary} />}
                                                            </View>
                                                            <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                                                {doc ? `${doc.name} — tap to change` : 'Add a photo of the document (optional)'}
                                                            </Text>
                                                        </Pressable>
                                                    </View>
                                                ) : null}
                                            </View>
                                        ) : null}

                                        {/* Terms */}
                                        <Pressable onPress={() => f.setFieldValue('accepted_terms', !f.values.accepted_terms)} className="flex-row items-start" style={{ gap: 10 }}>
                                            <View
                                                className="w-5 h-5 rounded-md items-center justify-center mt-0.5"
                                                style={{ borderWidth: 1.5, borderColor: f.values.accepted_terms ? theme.primary : theme.border, backgroundColor: f.values.accepted_terms ? theme.primary : 'transparent' }}
                                            >
                                                {f.values.accepted_terms ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                                            </View>
                                            <Text className="flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>
                                                I accept the WaziPOS terms and privacy policy.
                                            </Text>
                                        </Pressable>
                                        {f.submitCount > 0 && f.errors.accepted_terms ? (
                                            <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{String(f.errors.accepted_terms)}</Text>
                                        ) : null}

                                        {errors.length ? (
                                            <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.10)', gap: 4 }}>
                                                {errors.map((e) => (
                                                    <Text key={e} style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                                        • {e}
                                                    </Text>
                                                ))}
                                            </View>
                                        ) : null}

                                        <Pressable
                                            onPress={() => f.handleSubmit()}
                                            disabled={f.isSubmitting}
                                            className="h-12 rounded-xl items-center justify-center"
                                            style={{ backgroundColor: theme.primary, opacity: f.isSubmitting ? 0.7 : 1 }}
                                        >
                                            {f.isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>Create account</Text>}
                                        </Pressable>
                                    </View>
                                )}
                            </Formik>

                            <Pressable onPress={() => router.push('/(auth)/login' as any)} hitSlop={8} className="items-center py-1">
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                                    Already have an account? <Text style={{ color: theme.primary, fontFamily: theme.font.bold }}>Sign in</Text>
                                </Text>
                            </Pressable>
                        </>
                    )}
                </View>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 16 }}>Powered by JamboPay</Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/** After sign-up: the consent code texted to their phone (or skip for now). */
function ConsentStep({ pending, onDone }: { pending: Pending; onDone: () => void }) {
    const { theme } = useAuth();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            const res: any = await adminUsersApi.confirmOwnConsent(pending.phone, code);
            if (res.ok && String(res.data?.response_code) === '0') onDone();
            else {
                const errs = res.data?.errors;
                setError((Array.isArray(errs) && errs.join(' ')) || res.data?.response_message || 'That code did not work.');
            }
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={{ gap: 16 }}>
            <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                <Ionicons name="checkmark-circle" size={26} color="#10b981" />
            </View>
            <View style={{ gap: 6 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Your account is ready</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                    {pending.consentSent
                        ? `We texted a 6-digit code to ${pending.phone}. Entering it lets sellers and their staff send you SMS and call you about your orders.`
                        : `We couldn't text ${pending.phone} right now${pending.consentError ? ` (${pending.consentError})` : ''}. You can continue and confirm later.`}
                </Text>
            </View>
            {pending.consentSent ? (
                <CustomTextField
                    label="6-digit code"
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="••••••"
                    keyboardType="number-pad"
                    maxLength={6}
                />
            ) : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
            {pending.consentSent ? (
                <Pressable
                    onPress={() => void confirm()}
                    disabled={busy || code.length !== 6}
                    className="h-12 rounded-xl items-center justify-center"
                    style={{ backgroundColor: theme.primary, opacity: busy || code.length !== 6 ? 0.6 : 1 }}
                >
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>Confirm & continue</Text>}
                </Pressable>
            ) : null}
            <Pressable onPress={onDone} className="h-11 rounded-xl items-center justify-center" style={{ borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{pending.consentSent ? 'Skip for now' : 'Continue'}</Text>
            </Pressable>
        </View>
    );
}
