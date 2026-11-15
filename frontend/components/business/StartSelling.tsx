// components/business/StartSelling.tsx
//
// Business tab. Shoppers (including email-only Google / Facebook accounts) open
// their own shop in two steps:
//   1. Seller profile — phone, National ID / passport number and a copy of it
//      (the copy is mandatory). A new phone gets the SMS consent code.
//   2. Business — name, kind, where it is (and optionally a map pin).
// The server makes them the owner + super admin and returns a fresh session, so
// the new business menus appear straight away. People who already run a shop
// see it here instead.

import sellerApi, { type SellerReadiness } from '@/api/sellerOnboardingApi';
import { ChoiceChips, FormRow, SheetButton, useListTokens } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import LocationPinPicker from '@/components/common/LocationPinPicker';
import type { LatLng } from '@/components/common/locationPinShared';
import { pickImage, previewUri, type PickedImage } from '@/components/common/imagePicker';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Yup from 'yup';

const KE_PHONE = /^(?:\+?254|0)?(7|1)\d{8}$/;

const profileSchema = Yup.object({
    phone: Yup.string().trim().required('Enter your phone number').test('ke', 'Enter a valid number, e.g. 0712345678', (v) => KE_PHONE.test(String(v || '').replace(/\s+/g, ''))),
    identifier_type: Yup.string().oneOf(['NationalId', 'Passport'], 'Pick National ID or passport').required('Pick National ID or passport'),
    identifier_number: Yup.string().trim().required('Enter the document number'),
});

const businessSchema = Yup.object({
    title: Yup.string().trim().required('Give your business a name'),
    entity_type: Yup.string().required('Pick what kind of business it is'),
    town: Yup.string().trim().required('Enter the town'),
    road: Yup.string().trim().required('Enter the road / street'),
    building: Yup.string().trim().required('Enter the building'),
    description: Yup.string().trim().optional(),
});

const errorsOf = (res: any, fallback: string): string[] => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.map(String);
    return [res?.data?.response_message || res?.problem || fallback];
};

export default function StartSelling() {
    const { theme, border } = useListTokens();
    const { login } = useAuth();
    const router = useRouter();
    const [readiness, setReadiness] = useState<SellerReadiness | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editProfile, setEditProfile] = useState(false);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const res: any = await sellerApi.getReadiness();
            if (res.ok && String(res.data?.response_code) === '0') setReadiness(res.data.readiness);
            else setLoadError(errorsOf(res, 'Could not load your profile.')[0]);
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const cardStyle = {
        backgroundColor: theme.panel,
        borderWidth: 1,
        borderColor: border,
        ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 24px rgba(15,23,42,0.06)' } as any) : {}),
    };

    if (!readiness) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background, gap: 10 }}>
                {loadError ? (
                    <>
                        <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{loadError}</Text>
                        <SheetButton label="Try again" onPress={() => void load()} />
                    </>
                ) : (
                    <ActivityIndicator color={theme.primary} />
                )}
            </View>
        );
    }

    // ---- already running a shop
    if (readiness.business) {
        return (
            <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
                <View className="w-full rounded-3xl p-6" style={[cardStyle, { maxWidth: 560, gap: 12 }]}>
                    <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                        <Ionicons name="storefront" size={24} color={theme.primary} />
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{readiness.business.title}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14 }}>
                        {readiness.business_types.find((t) => t.value === readiness.business!.entity_type)?.label ?? readiness.business.entity_type} · you are the owner
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        Use the menu to receive stock, sell and manage orders.
                    </Text>
                </View>
            </ScrollView>
        );
    }

    const step = readiness.ready && !editProfile ? 2 : 1;

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, alignItems: 'center', paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View className="w-full" style={{ maxWidth: 620, gap: 16 }}>
                {/* Hero */}
                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 26 }}>Start selling on WaziPOS</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>
                        Shopping needs only your email. To open a shop we need to know who you are — it keeps buyers and sellers safe.
                    </Text>
                </View>

                {/* Steps */}
                <View className="flex-row" style={{ gap: 8 }}>
                    {[
                        { n: 1, label: 'Your details', done: readiness.ready },
                        { n: 2, label: 'Your business', done: false },
                    ].map((s) => {
                        const active = step === s.n;
                        return (
                            <View key={s.n} className="flex-1 flex-row items-center rounded-2xl px-3 py-2.5" style={{ gap: 8, backgroundColor: active ? `${theme.primary}12` : theme.panel, borderWidth: 1, borderColor: active ? theme.primary : border }}>
                                <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: s.done ? '#10b981' : active ? theme.primary : border }}>
                                    {s.done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>{s.n}</Text>}
                                </View>
                                <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{s.label}</Text>
                            </View>
                        );
                    })}
                </View>

                <View className="w-full rounded-3xl p-5" style={[cardStyle, { gap: 14 }]}>
                    {step === 1 ? (
                        <ProfileStep
                            readiness={readiness}
                            onSaved={(r) => {
                                setReadiness(r);
                                setEditProfile(false);
                            }}
                        />
                    ) : (
                        <BusinessStep
                            readiness={readiness}
                            onEditProfile={() => setEditProfile(true)}
                            onCreated={async (token) => {
                                await login(token);
                                router.replace('/(tabs)/business' as any);
                                void load();
                            }}
                        />
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

/* ------------------------------------------------------------ step 1 */

function ProfileStep({ readiness, onSaved }: { readiness: SellerReadiness; onSaved: (r: SellerReadiness) => void }) {
    const { theme } = useListTokens();
    const [doc, setDoc] = useState<PickedImage | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [note, setNote] = useState<string | null>(null);
    const onFile = !!readiness.document_url;
    const shown = doc ? previewUri(doc) : readiness.document_url;

    return (
        <Formik
            initialValues={{
                phone: readiness.phone ?? '',
                identifier_type: (readiness.identifier_type ?? '') as '' | 'NationalId' | 'Passport',
                identifier_number: readiness.identifier_number ?? '',
            }}
            validationSchema={profileSchema}
            onSubmit={async (v) => {
                setErrors([]);
                // The copy is mandatory: a new upload, or the one already on file
                // for the same document.
                const sameDoc = onFile && v.identifier_type === readiness.identifier_type && v.identifier_number.trim() === (readiness.identifier_number ?? '');
                if (!doc && !sameDoc) {
                    setErrors(['Upload a photo or scan of your ID / passport']);
                    return;
                }
                try {
                    const res: any = await sellerApi.completeProfile(
                        { phone: v.phone.replace(/\s+/g, ''), identifier_type: v.identifier_type as any, identifier_number: v.identifier_number.trim() },
                        doc,
                    );
                    if (res.ok && String(res.data?.response_code) === '0') {
                        const r: SellerReadiness = res.data.readiness;
                        setNote(r.consent_note ?? null);
                        onSaved(r);
                    } else setErrors(errorsOf(res, 'Your details could not be saved.'));
                } catch (e: any) {
                    setErrors([e?.message || 'Could not reach the server.']);
                }
            }}
        >
            {(f) => (
                <View style={{ gap: 14 }}>
                    <View style={{ gap: 4 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Your details</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                            Your phone, and a National ID or passport with a photo of it. We text a code to confirm buyers and suppliers may contact you.
                        </Text>
                    </View>
                    <CustomTextField name="phone" label="Phone" required placeholder="0712345678" keyboardType="phone-pad" />
                    <ChoiceChips<'' | 'NationalId' | 'Passport'>
                        label="Identity document"
                        required
                        options={[
                            { value: 'NationalId', label: 'National ID', icon: 'id-card-outline' },
                            { value: 'Passport', label: 'Passport', icon: 'airplane-outline' },
                        ]}
                        value={f.values.identifier_type}
                        onChange={(t) => f.setFieldValue('identifier_type', t)}
                        error={f.submitCount > 0 ? (f.errors.identifier_type as string | undefined) : undefined}
                    />
                    <CustomTextField
                        name="identifier_number"
                        label={f.values.identifier_type === 'Passport' ? 'Passport number' : 'ID number'}
                        required
                        autoCapitalize="characters"
                        placeholder={f.values.identifier_type === 'Passport' ? 'e.g. AK0123456' : 'e.g. 12345678'}
                    />
                    <Pressable
                        onPress={async () => {
                            const picked = await pickImage({ allowsEditing: false, quality: 0.8 });
                            if (picked) setDoc(picked);
                        }}
                        className="flex-row items-center rounded-2xl p-3"
                        style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: doc || onFile ? '#10b981' : theme.primary, gap: 12 }}
                    >
                        <View className="rounded-xl items-center justify-center overflow-hidden" style={{ width: 88, height: 58, backgroundColor: `${theme.primary}10` }}>
                            {shown ? <Image source={{ uri: shown }} style={{ width: 88, height: 58 }} /> : <Ionicons name="camera-outline" size={24} color={theme.primary} />}
                        </View>
                        <View className="flex-1" style={{ gap: 2 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                                {doc ? 'Document ready to upload' : onFile ? 'Document on file' : 'Upload your ID / passport *'}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                {doc ? `${doc.name} — tap to change` : onFile ? 'Tap to upload a newer copy' : 'A clear photo of the page with your details. Required.'}
                            </Text>
                        </View>
                    </Pressable>
                    {errors.length ? (
                        <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.10)', gap: 3 }}>
                            {errors.map((e) => (
                                <Text key={e} style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>• {e}</Text>
                            ))}
                        </View>
                    ) : null}
                    {note ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{note}</Text> : null}
                    <SheetButton label="Save & continue" icon="arrow-forward" loading={f.isSubmitting} loadingLabel="Saving…" onPress={() => f.handleSubmit()} />
                </View>
            )}
        </Formik>
    );
}

/* ------------------------------------------------------------ step 2 */

function BusinessStep({ readiness, onEditProfile, onCreated }: { readiness: SellerReadiness; onEditProfile: () => void; onCreated: (token: string) => Promise<void> }) {
    const { theme } = useListTokens();
    const [pin, setPin] = useState<LatLng | null>(null);
    const [errors, setErrors] = useState<string[]>([]);

    return (
        <Formik
            initialValues={{ title: '', entity_type: '', town: '', road: '', building: '', description: '' }}
            validationSchema={businessSchema}
            onSubmit={async (v) => {
                setErrors([]);
                try {
                    const res: any = await sellerApi.createBusiness({
                        title: v.title.trim(),
                        entity_type: v.entity_type,
                        town: v.town.trim(),
                        road: v.road.trim(),
                        building: v.building.trim(),
                        description: v.description.trim(),
                        ...(pin ? { latitude: pin.latitude, longitude: pin.longitude } : {}),
                    });
                    const token = res.data?.business?.tokens?.access;
                    if (res.ok && String(res.data?.response_code) === '0' && token) await onCreated(token);
                    else setErrors(errorsOf(res, 'Your business could not be created.'));
                } catch (e: any) {
                    setErrors([e?.message || 'Could not reach the server.']);
                }
            }}
        >
            {(f) => (
                <View style={{ gap: 14 }}>
                    <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
                        <View style={{ flex: 1, gap: 4 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Your business</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                Your details: {readiness.identifier_type === 'Passport' ? 'passport' : 'ID'} {readiness.identifier_number} · {readiness.phone}
                            </Text>
                        </View>
                        <Pressable onPress={onEditProfile} hitSlop={8}>
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>Edit details</Text>
                        </Pressable>
                    </View>
                    <CustomTextField name="title" label="Business name" required placeholder="e.g. Mama Njeri Pharmacy" autoCapitalize="words" />
                    <ChoiceChips<string>
                        label="Kind of business"
                        required
                        options={readiness.business_types.map((t) => ({ value: t.value, label: t.label }))}
                        value={f.values.entity_type}
                        onChange={(t) => f.setFieldValue('entity_type', t)}
                        error={f.submitCount > 0 ? (f.errors.entity_type as string | undefined) : undefined}
                    />
                    <FormRow>
                        <CustomTextField name="town" label="Town" required placeholder="e.g. Nairobi" autoCapitalize="words" />
                        <CustomTextField name="road" label="Road / street" required placeholder="e.g. Moi Avenue" autoCapitalize="words" />
                    </FormRow>
                    <CustomTextField name="building" label="Building" required placeholder="e.g. Imenti House, 2nd floor" autoCapitalize="words" />
                    <View style={{ gap: 6 }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>LOCATION ON THE MAP (OPTIONAL — NEEDED FOR DELIVERY)</Text>
                        <LocationPinPicker value={pin} onChange={setPin} height={190} />
                    </View>
                    <CustomTextField name="description" label="About the business" placeholder="Optional" multiline />
                    {errors.length ? (
                        <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.10)', gap: 3 }}>
                            {errors.map((e) => (
                                <Text key={e} style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>• {e}</Text>
                            ))}
                        </View>
                    ) : null}
                    <SheetButton label="Open my business" icon="storefront-outline" loading={f.isSubmitting} loadingLabel="Opening…" onPress={() => f.handleSubmit()} />
                </View>
            )}
        </Formik>
    );
}
