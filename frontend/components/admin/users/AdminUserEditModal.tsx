// components/admin/users/AdminUserEditModal.tsx
//
// Add / edit a user in steps:
//   1. Person & contact   name, date of birth, gender, phone, email
//   2. ID & business      optional National ID / passport (+ photo), optional
//                         entity (default WAZIPOS), active — Save happens here
//   3. Confirm phone      saving texts a 6-digit code to the phone; the person
//                         reads it out and the admin enters it. That proves the
//                         phone is theirs and records SMS/call consent.
//   4. Done               where phone and email stand. Email is confirmed later
//                         by the person, from the link emailed to them.

import adminUsersApi, { type AdminUser, type AdminUserDetails, type IdentifierType, type PickedDocument } from '@/api/adminUsersApi';
import { AdminFormSheet, ChoiceChips, FormRow, FormSection, SheetButton, useListTokens } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { pickImage, previewUri } from '@/components/common/imagePicker';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { Ionicons } from '@expo/vector-icons';
import { Formik, type FormikProps } from 'formik';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import * as Yup from 'yup';

import { METHOD_LABEL } from './usersConfig';

interface Props {
    visible: boolean;
    onClose: () => void;
    initialData: AdminUser | null;
    submitting: boolean;
    error?: string | null;
    /** Saves the user; resolves with the saved record (null when it failed). */
    onSubmit: (details: AdminUserDetails, doc: PickedDocument | null) => Promise<AdminUser | null>;
    /** The record changed outside the form (code sent / confirmed, email link). */
    onUserChanged: (u: AdminUser) => void;
}

type Step = 'PERSON' | 'IDENTITY' | 'PHONE' | 'DONE';
const STEPS: { key: Step; label: string }[] = [
    { key: 'PERSON', label: 'Person' },
    { key: 'IDENTITY', label: 'ID & business' },
    { key: 'PHONE', label: 'Confirm phone' },
    { key: 'DONE', label: 'Done' },
];
const PERSON_FIELDS = ['first_name', 'middle_name', 'last_name', 'phone', 'email', 'gender', 'date_of_birth'];

const KE_PHONE = /^(?:\+?254|0)?(7|1)\d{8}$/;

const schema = Yup.object({
    first_name: Yup.string().trim().required('Enter the first name'),
    middle_name: Yup.string().trim().optional(),
    last_name: Yup.string().trim().required('Enter the last name'),
    phone: Yup.string().trim().required('Enter the phone number').test('ke', 'Enter a valid Kenyan number, e.g. 0712345678', (v) => KE_PHONE.test(String(v || '').replace(/\s+/g, ''))),
    email: Yup.string().trim().email('Enter a valid email').optional(),
    gender: Yup.string().optional(),
    date_of_birth: Yup.string().optional(),
    identifier_type: Yup.string().oneOf(['', 'NationalId', 'Passport']).optional(),
    identifier_number: Yup.string().trim().when('identifier_type', {
        is: (t: string) => !!t,
        then: (s) => s.required('Enter the document number'),
        otherwise: (s) => s.optional(),
    }),
    entity: Yup.string().optional(),
});

const ID_TYPES: { value: IdentifierType | ''; label: string; icon: any }[] = [
    { value: '', label: 'None', icon: 'remove-circle-outline' },
    { value: 'NationalId', label: 'National ID', icon: 'id-card-outline' },
    { value: 'Passport', label: 'Passport', icon: 'airplane-outline' },
];

const errText = (res: any, fallback: string) => {
    const e = res?.data?.errors;
    return (Array.isArray(e) && e.join(' ')) || res?.data?.response_message || fallback;
};

export default function AdminUserEditModal({ visible, onClose, initialData, submitting, error, onSubmit, onUserChanged }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { entitiesList, forceEntitiesRefresh, isEntitiesSyncing } = useEntitiesSync();
    const [doc, setDoc] = useState<PickedDocument | null>(null);
    const [step, setStep] = useState<Step>('PERSON');
    /** The user as saved in step 2 (drives steps 3–4). */
    const [saved, setSaved] = useState<AdminUser | null>(null);

    // Phone step state
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState<'send' | 'confirm' | 'email' | null>(null);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        if (!visible) return;
        setDoc(null);
        setStep('PERSON');
        setSaved(null);
        setCode('');
        setMsg(null);
        if (entitiesList.length === 0) void forceEntitiesRefresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const entityOptions = useMemo(
        () => entitiesList.filter((e) => e.remote_id).map((e) => ({ id: String(e.remote_id), title: (e as any).title || 'Unnamed entity' })),
        [entitiesList],
    );

    const updateSaved = (u: AdminUser) => {
        setSaved(u);
        onUserChanged(u);
    };

    const sendCode = async () => {
        if (!saved) return;
        setBusy('send');
        setMsg(null);
        try {
            const res: any = await adminUsersApi.sendConsent(saved.id);
            if (res.ok && String(res.data?.response_code) === '0') {
                updateSaved(res.data.user);
                setCode('');
                setMsg({ text: `A new code was sent to ${saved.phone}.`, ok: true });
            } else setMsg({ text: errText(res, 'The code could not be sent.'), ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    const confirmCode = async () => {
        if (!saved || code.length !== 6) return;
        setBusy('confirm');
        setMsg(null);
        try {
            const res: any = await adminUsersApi.confirmConsent(saved.id, code);
            if (res.ok && String(res.data?.response_code) === '0') {
                updateSaved(res.data.user);
                setCode('');
                setStep('DONE');
            } else setMsg({ text: errText(res, 'That code did not work.'), ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    const sendEmailLink = async () => {
        if (!saved) return;
        setBusy('email');
        setMsg(null);
        try {
            const res: any = await adminUsersApi.sendEmailVerification(saved.id);
            if (res.ok && String(res.data?.response_code) === '0') {
                updateSaved(res.data.user);
                setMsg({ text: `Verification link emailed to ${saved.email}.`, ok: true });
            } else setMsg({ text: errText(res, 'The email could not be sent.'), ok: false });
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    /** Validates only the fields of step 1 before moving on. */
    const nextFromPerson = async (f: FormikProps<any>) => {
        const errs = await f.validateForm();
        const bad = PERSON_FIELDS.filter((k) => (errs as any)[k]);
        if (bad.length) {
            f.setTouched(Object.fromEntries(bad.map((k) => [k, true])), false);
            return;
        }
        setStep('IDENTITY');
    };

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                first_name: initialData?.first_name ?? '',
                middle_name: initialData?.middle_name ?? '',
                last_name: initialData?.last_name ?? '',
                phone: initialData?.phone ?? '',
                email: initialData?.email?.endsWith('@users.wazipos.co.ke') ? '' : (initialData?.email ?? ''),
                gender: initialData?.gender ?? '',
                date_of_birth: initialData?.date_of_birth ?? '',
                identifier_type: (initialData?.identifier_type ?? '') as IdentifierType | '',
                identifier_number: initialData?.identifier_number ?? '',
                entity: initialData?.entity ?? '',
                is_active: initialData ? initialData.is_active : true,
            }}
            validationSchema={schema}
            onSubmit={async (v) => {
                const u = await onSubmit(
                    {
                        first_name: v.first_name.trim(),
                        middle_name: v.middle_name.trim(),
                        last_name: v.last_name.trim(),
                        phone: v.phone.replace(/\s+/g, ''),
                        email: v.email.trim(),
                        gender: v.gender,
                        date_of_birth: v.date_of_birth,
                        identifier_type: v.identifier_type,
                        identifier_number: v.identifier_type ? v.identifier_number.trim() : '',
                        entity: v.entity,
                        is_active: v.is_active,
                    },
                    v.identifier_type ? doc : null,
                );
                if (!u) return; // error shown by the sheet
                setSaved(u);
                setMsg(u.consent_note && u.consent_note !== 'Consent code sent by SMS' ? { text: `${u.consent_note}. Send the code again.`, ok: false } : null);
                // A phone that is already proven skips straight to the summary.
                setStep(u.phone_verified ? 'DONE' : 'PHONE');
            }}
        >
            {(f) => {
                const footer =
                    step === 'PERSON'
                        ? { submitLabel: 'Next', submitIcon: 'arrow-forward' as const, onSubmit: () => void nextFromPerson(f), cancelLabel: 'Cancel', onCancel: onClose }
                        : step === 'IDENTITY'
                            ? { submitLabel: isEdit ? 'Save & continue' : 'Create & text code', submitIcon: 'checkmark' as const, onSubmit: () => f.handleSubmit(), cancelLabel: 'Back', onCancel: () => setStep('PERSON') }
                            : step === 'PHONE'
                                ? { submitLabel: 'Confirm phone', submitIcon: 'shield-checkmark-outline' as const, onSubmit: () => void confirmCode(), cancelLabel: 'Confirm later', onCancel: () => setStep('DONE'), disabled: code.length !== 6 }
                                : { submitLabel: 'Finish', submitIcon: 'checkmark-done' as const, onSubmit: onClose, cancelLabel: 'Close', onCancel: onClose };
                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title={isEdit ? 'Edit user' : 'New user'}
                        subtitle={
                            isEdit
                                ? `${initialData?.name} · joined via ${METHOD_LABEL[initialData?.registration_method ?? ''] ?? initialData?.registration_method}`
                                : 'Their phone is confirmed with a code texted to it'
                        }
                        icon="person-add-outline"
                        submitLabel={footer.submitLabel}
                        submitIcon={footer.submitIcon}
                        submitDisabled={(footer as any).disabled}
                        submitting={(step === 'IDENTITY' && (f.isSubmitting || submitting)) || busy === 'confirm'}
                        onSubmit={footer.onSubmit}
                        cancelLabel={footer.cancelLabel}
                        onCancel={footer.onCancel}
                        error={step === 'IDENTITY' ? error : null}
                        header={<Stepper step={step} />}
                    >
                        {step === 'PERSON' ? (
                            <>
                                <FormSection title="Person">
                                    <FormRow>
                                        <CustomTextField name="first_name" label="First name" required placeholder="e.g. Jane" autoCapitalize="words" />
                                        <CustomTextField name="middle_name" label="Middle name" placeholder="Optional" autoCapitalize="words" />
                                    </FormRow>
                                    <FormRow>
                                        <CustomTextField name="last_name" label="Last name" required placeholder="e.g. Wanjiku" autoCapitalize="words" />
                                        <DateField name="date_of_birth" label="Date of birth" placeholder="Optional" />
                                    </FormRow>
                                    <ChoiceChips<string>
                                        label="Gender"
                                        options={[
                                            { value: '', label: 'Not given' },
                                            { value: 'Female', label: 'Female' },
                                            { value: 'Male', label: 'Male' },
                                            { value: 'Other', label: 'Other' },
                                        ]}
                                        value={f.values.gender}
                                        onChange={(g) => f.setFieldValue('gender', g)}
                                    />
                                </FormSection>
                                <FormSection
                                    title="Contact"
                                    hint="We text a 6-digit code to this phone to confirm it is theirs. The email gets a link they open later to confirm it."
                                >
                                    <FormRow>
                                        <CustomTextField name="phone" label="Phone" required placeholder="0712345678" keyboardType="phone-pad" />
                                        <CustomTextField name="email" label="Email" placeholder="Optional" keyboardType="email-address" autoCapitalize="none" />
                                    </FormRow>
                                </FormSection>
                            </>
                        ) : null}

                        {step === 'IDENTITY' ? (
                            <>
                                <FormSection title="Identity document" hint="Optional. A National ID or passport number, and a photo or scan of it.">
                                    <ChoiceChips<IdentifierType | ''>
                                        label="Document"
                                        options={ID_TYPES}
                                        value={f.values.identifier_type}
                                        onChange={(t) => {
                                            f.setFieldValue('identifier_type', t);
                                            if (!t) setDoc(null);
                                        }}
                                    />
                                    {f.values.identifier_type ? (
                                        <>
                                            <CustomTextField
                                                name="identifier_number"
                                                label={f.values.identifier_type === 'Passport' ? 'Passport number' : 'ID number'}
                                                required
                                                placeholder={f.values.identifier_type === 'Passport' ? 'e.g. AK0123456' : 'e.g. 12345678'}
                                                autoCapitalize="characters"
                                            />
                                            <DocumentPicker value={doc} existingUrl={initialData?.document_url ?? null} onChange={setDoc} />
                                        </>
                                    ) : null}
                                </FormSection>

                                <FormSection title="Entity" hint="Optional. Without one, the user joins WAZIPOS." zIndex={30}>
                                    <CustomAutocompletePicker
                                        name="entity"
                                        label="Attach to entity"
                                        options={entityOptions}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        loading={isEntitiesSyncing && entityOptions.length === 0}
                                        placeholder="Search entities (leave empty for WAZIPOS)…"
                                        loadingPlaceholder="Loading entities…"
                                        initialTitle={initialData?.entity_title ?? undefined}
                                    />
                                    {f.values.entity ? (
                                        <Pressable onPress={() => f.setFieldValue('entity', '')}>
                                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear — use WAZIPOS</Text>
                                        </Pressable>
                                    ) : null}
                                </FormSection>

                                <FormSection title="Status">
                                    <SwitchField name="is_active" label="Active" hint="Inactive users can't sign in." />
                                </FormSection>
                            </>
                        ) : null}

                        {step === 'PHONE' && saved ? (
                            <PhoneStep user={saved} code={code} setCode={setCode} busy={busy} msg={msg} onResend={() => void sendCode()} />
                        ) : null}

                        {step === 'DONE' && saved ? (
                            <DoneStep
                                user={saved}
                                busy={busy}
                                msg={msg}
                                onConfirmPhone={() => {
                                    setMsg(null);
                                    setStep('PHONE');
                                }}
                                onEmailLink={() => void sendEmailLink()}
                            />
                        ) : null}
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}

/* ------------------------------------------------------------------ steps */

function Stepper({ step }: { step: Step }) {
    const { theme, border } = useListTokens();
    const at = STEPS.findIndex((s) => s.key === step);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            {STEPS.map((s, i) => {
                const done = i < at;
                const current = i === at;
                const color = done ? '#10b981' : current ? theme.primary : theme.textDark;
                return (
                    <React.Fragment key={s.key}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done || current ? color : 'transparent', borderWidth: done || current ? 0 : 1, borderColor: border }}>
                                {done ? <Ionicons name="checkmark" size={13} color="#fff" /> : <Text style={{ color: current ? '#fff' : theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>{i + 1}</Text>}
                            </View>
                            <Text numberOfLines={1} style={{ color, fontFamily: current ? theme.font.bold : theme.font.medium, fontSize: 12, flexShrink: 1 }}>
                                {s.label}
                            </Text>
                        </View>
                        {i < STEPS.length - 1 ? <View style={{ flex: 1, minWidth: 8, height: 1, backgroundColor: done ? '#10b981' : border }} /> : null}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

function PhoneStep({
    user,
    code,
    setCode,
    busy,
    msg,
    onResend,
}: {
    user: AdminUser;
    code: string;
    setCode: (c: string) => void;
    busy: string | null;
    msg: { text: string; ok: boolean } | null;
    onResend: () => void;
}) {
    const { theme, border, inputBg } = useListTokens();
    return (
        <View style={{ gap: 14 }}>
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.primary}18` }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={26} color={theme.primary} />
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, textAlign: 'center' }}>Confirm {user.phone} is {user.first_name}’s</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 420 }}>
                    We texted a 6-digit code to {user.phone}. Ask {user.first_name} to read the message to you, then enter the code here. This also records their consent to SMS and calls.
                </Text>
            </View>
            <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="••••••"
                placeholderTextColor={theme.textDark}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
                style={{ alignSelf: 'center', width: 220, height: 56, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: inputBg, color: theme.text, fontFamily: theme.font.bold, fontSize: 26, letterSpacing: 10, textAlign: 'center' }}
            />
            {user.consent_sms_error ? (
                <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12, textAlign: 'center' }}>Last SMS failed: {user.consent_sms_error}</Text>
            ) : null}
            {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5, textAlign: 'center' }}>{msg.text}</Text> : null}
            <View style={{ alignItems: 'center' }}>
                <SheetButton label="Didn’t get it? Send a new code" icon="refresh-outline" variant="ghost" loading={busy === 'send'} loadingLabel="Sending…" onPress={onResend} />
            </View>
        </View>
    );
}

function StatusRow({ icon, ok, title, detail, action }: { icon: any; ok: boolean | null; title: string; detail: string; action?: React.ReactNode }) {
    const { theme, border } = useListTokens();
    const color = ok === true ? '#10b981' : ok === false ? '#f59e0b' : theme.textDark;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: border }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1f` }}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{title}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{detail}</Text>
            </View>
            {action}
        </View>
    );
}

function DoneStep({
    user,
    busy,
    msg,
    onConfirmPhone,
    onEmailLink,
}: {
    user: AdminUser;
    busy: string | null;
    msg: { text: string; ok: boolean } | null;
    onConfirmPhone: () => void;
    onEmailLink: () => void;
}) {
    const { theme } = useListTokens();
    const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');
    return (
        <View style={{ gap: 10 }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{user.name} is saved</Text>
            <StatusRow
                icon={user.phone_verified ? 'shield-checkmark' : 'phone-portrait-outline'}
                ok={!!user.phone_verified}
                title={user.phone_verified ? `Phone confirmed · ${user.phone}` : `Phone not confirmed yet · ${user.phone}`}
                detail={user.phone_verified ? `Confirmed ${when(user.phone_verified_at)}; SMS and calls allowed.` : 'Enter the code they received to confirm it.'}
                action={user.phone_verified ? null : <SheetButton label="Confirm" variant="secondary" onPress={onConfirmPhone} />}
            />
            <StatusRow
                icon={user.email_verified ? 'mail-open' : 'mail-outline'}
                ok={user.has_email === false ? null : !!user.email_verified}
                title={user.has_email === false ? 'No email' : user.email_verified ? `Email confirmed · ${user.email}` : `Email to confirm · ${user.email}`}
                detail={
                    user.has_email === false
                        ? 'Add one later to send a confirmation link.'
                        : user.email_verified
                            ? `Confirmed ${when(user.email_verified_at)}.`
                            : user.email_link_sent_at
                                ? `Link emailed ${when(user.email_link_sent_at)}. They confirm it later by opening it.`
                                : 'No link sent yet.'
                }
                action={
                    user.has_email === false || user.email_verified ? null : (
                        <SheetButton label={user.email_link_sent_at ? 'Resend' : 'Send link'} variant="secondary" loading={busy === 'email'} loadingLabel="Sending…" onPress={onEmailLink} />
                    )
                }
            />
            {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{msg.text}</Text> : null}
        </View>
    );
}

/* ------------------------------------------------------------------ pieces */

function DocumentPicker({ value, existingUrl, onChange }: { value: PickedDocument | null; existingUrl: string | null; onChange: (d: PickedDocument | null) => void }) {
    const { theme, border, chipBg } = useListTokens();
    const shown = value ? previewUri(value) : existingUrl;
    return (
        <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="rounded-xl items-center justify-center overflow-hidden" style={{ width: 96, height: 64, borderWidth: 1, borderColor: border, backgroundColor: chipBg }}>
                {shown ? <Image source={{ uri: shown }} style={{ width: 96, height: 64 }} resizeMode="cover" /> : <Ionicons name="image-outline" size={22} color={theme.textDark} />}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                    {value ? value.name : existingUrl ? 'A document is on file; upload to replace it.' : 'No file — optional.'}
                </Text>
                <View className="flex-row" style={{ gap: 8 }}>
                    <SheetButton
                        label={shown ? 'Replace photo' : 'Upload photo'}
                        icon="cloud-upload-outline"
                        variant="secondary"
                        onPress={async () => {
                            const picked = await pickImage({ allowsEditing: false, quality: 0.8 });
                            if (picked) onChange(picked);
                        }}
                    />
                    {value ? <SheetButton label="Remove" variant="ghost" onPress={() => onChange(null)} /> : null}
                </View>
            </View>
        </View>
    );
}
