// app/(auth)/register/index.tsx
//
// Self sign-up — one form for phones, tablets and web:
//   1. Continue with Google / Facebook (placeholders until their keys are set),
//      or fill in name, phone, email and password. Gender, date of birth and an
//      ID / passport (number + photo) are optional, under "More details".
//   2. Confirm phone: the server creates the account (default WAZIPOS entity),
//      replies with a session and texts a 6-digit code. Entering it proves the
//      phone is theirs (and is their consent to SMS and calls from sellers).
//      They can resend it, or do it later.
//   3. Confirm email: a link is emailed; the email is verified only by opening
//      it (/verify-email). They can resend it, check, or continue and do it later.
//   Then they're signed in.

import authService, { type SelfRegisterInput } from '@/api/authApi';
import verifyApi from '@/api/verifyApi';
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

type Pending = {
    token: string;
    phone: string;
    email: string;
    consentSent: boolean;
    consentError: string | null;
    emailLinkSent: boolean;
    emailLinkError: string | null;
};

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
                        <VerifySteps pending={pending} onDone={() => void signIn(pending.token)} />
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
                                            setPending({
                                                token,
                                                phone: input.phone,
                                                email: input.email,
                                                consentSent: !!res.data?.consent_sent,
                                                consentError: res.data?.consent_error ?? null,
                                                emailLinkSent: !!res.data?.email_link_sent,
                                                emailLinkError: res.data?.email_link_error ?? null,
                                            });
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

const errText = (res: any, fallback: string) => {
    const e = res?.data?.errors;
    return (Array.isArray(e) && e.join(' ')) || res?.data?.response_message || fallback;
};

/** Account created → Confirm phone → Confirm email → signed in. */
function VerifySteps({ pending, onDone }: { pending: Pending; onDone: () => void }) {
    const [step, setStep] = useState<'PHONE' | 'EMAIL'>('PHONE');
    const [phoneOk, setPhoneOk] = useState(false);
    return (
        <View style={{ gap: 18 }}>
            <Steps current={step === 'PHONE' ? 1 : 2} phoneOk={phoneOk} />
            {step === 'PHONE' ? (
                <PhoneStep
                    pending={pending}
                    onNext={(ok) => {
                        setPhoneOk(ok);
                        setStep('EMAIL');
                    }}
                />
            ) : (
                <EmailStep pending={pending} onDone={onDone} />
            )}
        </View>
    );
}

function Steps({ current, phoneOk }: { current: number; phoneOk: boolean }) {
    const { theme } = useAuth();
    const items = ['Your details', 'Confirm phone', 'Confirm email'];
    return (
        <View className="flex-row items-center" style={{ gap: 6 }}>
            {items.map((label, i) => {
                const done = i < current && (i !== 1 || phoneOk);
                const skipped = i < current && i === 1 && !phoneOk;
                const active = i === current;
                const color = done ? '#10b981' : active ? theme.primary : skipped ? '#f59e0b' : theme.textDark;
                return (
                    <React.Fragment key={label}>
                        <View className="flex-row items-center" style={{ gap: 6, flexShrink: 1 }}>
                            <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: done || active ? color : 'transparent', borderWidth: done || active ? 0 : 1, borderColor: color }}>
                                {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={{ color: active ? '#fff' : color, fontFamily: theme.font.bold, fontSize: 11 }}>{i + 1}</Text>}
                            </View>
                            <Text numberOfLines={1} style={{ color, fontFamily: active ? theme.font.bold : theme.font.medium, fontSize: 12, flexShrink: 1 }}>
                                {label}
                            </Text>
                        </View>
                        {i < items.length - 1 ? <View className="flex-1 h-px" style={{ minWidth: 8, backgroundColor: done ? '#10b981' : theme.border }} /> : null}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

function PhoneStep({ pending, onNext }: { pending: Pending; onNext: (confirmed: boolean) => void }) {
    const { theme } = useAuth();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState<'confirm' | 'send' | null>(null);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(
        pending.consentSent ? null : { text: `We couldn't text ${pending.phone} just now${pending.consentError ? ` (${pending.consentError})` : ''}. Tap “Send a new code”.`, ok: false },
    );

    const confirm = async () => {
        setBusy('confirm');
        setMsg(null);
        try {
            const res: any = await verifyApi.confirmPhone(code, pending.token);
            if (res.ok && String(res.data?.response_code) === '0') onNext(true);
            else setMsg({ text: errText(res, 'That code did not work.'), ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };
    const resend = async () => {
        setBusy('send');
        setMsg(null);
        try {
            const res: any = await verifyApi.sendPhoneCode(pending.token);
            if (res.ok && String(res.data?.response_code) === '0') {
                setCode('');
                setMsg({ text: `A new code was sent to ${pending.phone}.`, ok: true });
            } else setMsg({ text: errText(res, 'The code could not be sent.'), ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={{ gap: 16 }}>
            <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.primary} />
            </View>
            <View style={{ gap: 6 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Confirm your phone</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                    Your account is created. Enter the 6-digit code we texted to {pending.phone}. It shows the number is yours and lets sellers send you SMS and call you about your orders.
                </Text>
            </View>
            <CustomTextField
                label="6-digit code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="••••••"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
            />
            {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
            <Pressable
                onPress={() => void confirm()}
                disabled={!!busy || code.length !== 6}
                className="h-12 rounded-xl items-center justify-center"
                style={{ backgroundColor: theme.primary, opacity: busy || code.length !== 6 ? 0.6 : 1 }}
            >
                {busy === 'confirm' ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>Confirm phone</Text>}
            </Pressable>
            <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                <Pressable onPress={() => void resend()} disabled={!!busy} hitSlop={8}>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>{busy === 'send' ? 'Sending…' : 'Send a new code'}</Text>
                </Pressable>
                <Pressable onPress={() => onNext(false)} disabled={!!busy} hitSlop={8}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 13 }}>Do this later</Text>
                </Pressable>
            </View>
        </View>
    );
}

function EmailStep({ pending, onDone }: { pending: Pending; onDone: () => void }) {
    const { theme } = useAuth();
    const [busy, setBusy] = useState<'check' | 'send' | null>(null);
    const [verified, setVerified] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(
        pending.emailLinkSent ? null : { text: `We couldn't email ${pending.email} just now${pending.emailLinkError ? ` (${pending.emailLinkError})` : ''}. Tap “Send a new link”.`, ok: false },
    );

    const check = async () => {
        setBusy('check');
        setMsg(null);
        try {
            const res: any = await verifyApi.status(pending.token);
            const v = res.data?.verification;
            if (res.ok && v?.email_verified) setVerified(true);
            else setMsg({ text: 'Not confirmed yet. Open the link in the email, then check again.', ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };
    const resend = async () => {
        setBusy('send');
        setMsg(null);
        try {
            const res: any = await verifyApi.sendEmailLink(pending.token);
            if (res.ok && String(res.data?.response_code) === '0') setMsg({ text: `A new link was sent to ${pending.email}.`, ok: true });
            else setMsg({ text: errText(res, 'The email could not be sent.'), ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={{ gap: 16 }}>
            <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: verified ? 'rgba(16,185,129,0.12)' : `${theme.primary}14` }}>
                <Ionicons name={verified ? 'mail-open' : 'mail-outline'} size={24} color={verified ? '#10b981' : theme.primary} />
            </View>
            <View style={{ gap: 6 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>{verified ? 'Email confirmed' : 'Confirm your email'}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                    {verified
                        ? `Thank you. ${pending.email} is confirmed.`
                        : `We sent a link to ${pending.email}. Open it on any device to confirm your email. You can do this later; the link works for 3 days.`}
                </Text>
            </View>
            {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
            {!verified ? (
                <View className="flex-row" style={{ gap: 10 }}>
                    <Pressable onPress={() => void check()} disabled={!!busy} className="flex-1 h-11 rounded-xl items-center justify-center" style={{ borderWidth: 1, borderColor: theme.border }}>
                        {busy === 'check' ? <ActivityIndicator color={theme.primary} /> : <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>I’ve opened it</Text>}
                    </Pressable>
                    <Pressable onPress={() => void resend()} disabled={!!busy} className="flex-1 h-11 rounded-xl items-center justify-center" style={{ borderWidth: 1, borderColor: theme.border }}>
                        {busy === 'send' ? <ActivityIndicator color={theme.primary} /> : <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Send a new link</Text>}
                    </Pressable>
                </View>
            ) : null}
            <Pressable onPress={onDone} className="h-12 rounded-xl items-center justify-center" style={{ backgroundColor: theme.primary }}>
                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{verified ? 'Continue to WaziPOS' : 'Continue — I’ll confirm later'}</Text>
            </Pressable>
        </View>
    );
}
