// components/admin/users/AdminUserEditModal.tsx
//
// Add / edit a user. Identity document (National ID or passport) is optional,
// and so is the entity — without one the user joins WAZIPOS. Saving a new
// user (or a new phone) texts them a consent code; the panel at the top shows
// where that handshake stands and lets the admin resend the code or enter the
// code the person reads out to them.

import adminUsersApi, { type AdminUser, type AdminUserDetails, type IdentifierType, type PickedDocument } from '@/api/adminUsersApi';
import { AdminBadgePill, AdminFormSheet, ChoiceChips, FormRow, FormSection, SheetButton, useListTokens } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { pickImage, previewUri } from '@/components/common/imagePicker';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { Ionicons } from '@expo/vector-icons';
import { Formik } from 'formik';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import * as Yup from 'yup';

import { CONSENT_META, METHOD_LABEL } from './usersConfig';

interface Props {
    visible: boolean;
    onClose: () => void;
    initialData: AdminUser | null;
    submitting: boolean;
    error?: string | null;
    onSubmit: (details: AdminUserDetails, doc: PickedDocument | null) => Promise<void>;
    /** The record changed outside the form (consent sent / confirmed). */
    onUserChanged: (u: AdminUser) => void;
}

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

export default function AdminUserEditModal({ visible, onClose, initialData, submitting, error, onSubmit, onUserChanged }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { entitiesList, forceEntitiesRefresh, isEntitiesSyncing } = useEntitiesSync();
    const [doc, setDoc] = useState<PickedDocument | null>(null);

    useEffect(() => {
        if (visible) setDoc(null);
        if (visible && entitiesList.length === 0) void forceEntitiesRefresh();
    }, [visible, entitiesList.length, forceEntitiesRefresh]);

    const entityOptions = useMemo(
        () => entitiesList.filter((e) => e.remote_id).map((e) => ({ id: String(e.remote_id), title: (e as any).title || 'Unnamed entity' })),
        [entitiesList],
    );

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
                await onSubmit(
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
            }}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit user' : 'New user'}
                    subtitle={isEdit ? `${initialData?.name} · joined via ${METHOD_LABEL[initialData?.registration_method ?? ''] ?? initialData?.registration_method}` : 'They get an SMS code to consent to calls and messages'}
                    icon="person-add-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create & send consent SMS'}
                    submitting={f.isSubmitting || submitting}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    {isEdit && initialData ? <ConsentPanel user={initialData} onUserChanged={onUserChanged} /> : null}

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
                        hint={isEdit ? 'Changing the phone sends a new consent code to the new number.' : 'A consent code is sent to this number. When they share it, vendors and their staff may SMS and call them.'}
                    >
                        <FormRow>
                            <CustomTextField name="phone" label="Phone" required placeholder="0712345678" keyboardType="phone-pad" />
                            <CustomTextField name="email" label="Email" placeholder="Optional" keyboardType="email-address" autoCapitalize="none" />
                        </FormRow>
                    </FormSection>

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
                </AdminFormSheet>
            )}
        </Formik>
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

/** Where the SMS/call consent handshake stands, with resend + enter-code. */
function ConsentPanel({ user, onUserChanged }: { user: AdminUser; onUserChanged: (u: AdminUser) => void }) {
    const { theme, border, inputBg } = useListTokens();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState<'send' | 'confirm' | null>(null);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const meta = CONSENT_META[user.consent_status] ?? CONSENT_META.NONE;
    const waiting = user.consent_status === 'PENDING';

    const run = async (kind: 'send' | 'confirm') => {
        setBusy(kind);
        setMsg(null);
        try {
            const res: any = kind === 'send' ? await adminUsersApi.sendConsent(user.id) : await adminUsersApi.confirmConsent(user.id, code.trim());
            if (res.ok && String(res.data?.response_code) === '0') {
                onUserChanged(res.data.user);
                setCode('');
                setMsg({ text: kind === 'send' ? 'A new code was sent by SMS.' : 'Consent recorded.', ok: true });
            } else {
                const errs = res.data?.errors;
                setMsg({ text: (Array.isArray(errs) && errs.join(' ')) || res.data?.response_message || 'That did not work.', ok: false });
            }
        } catch (e: any) {
            setMsg({ text: e?.message || 'Could not reach the server.', ok: false });
        } finally {
            setBusy(null);
        }
    };

    return (
        <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 10 }}>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>SMS & call consent</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        {user.consent_status === 'CONFIRMED'
                            ? `Given${user.consent_confirmed_at ? ` on ${new Date(user.consent_confirmed_at).toLocaleDateString()}` : ''} for ${user.phone}.`
                            : user.phone
                                ? `Ask them for the code texted to ${user.phone}, or send a new one.`
                                : 'Add a phone number to ask for consent.'}
                    </Text>
                </View>
                <AdminBadgePill badge={meta} size="md" />
            </View>
            {user.consent_sms_error ? (
                <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 11.5 }}>Last SMS failed: {user.consent_sms_error}</Text>
            ) : null}
            {user.phone && user.consent_status !== 'CONFIRMED' ? (
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                    {waiting ? (
                        <>
                            <TextInput
                                value={code}
                                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                                placeholder="Code they read out"
                                placeholderTextColor={theme.textDark}
                                keyboardType="number-pad"
                                className="rounded-xl px-3 h-10"
                                style={{ minWidth: 150, flex: 1, borderWidth: 1, borderColor: border, backgroundColor: inputBg, color: theme.text, fontFamily: theme.font.bold, fontSize: 15, letterSpacing: 3 }}
                            />
                            <SheetButton label="Confirm" icon="shield-checkmark-outline" loading={busy === 'confirm'} loadingLabel="Checking…" disabled={code.length !== 6} onPress={() => void run('confirm')} />
                        </>
                    ) : null}
                    <SheetButton label={waiting ? 'Resend code' : 'Send consent code'} icon="chatbubble-ellipses-outline" variant="secondary" loading={busy === 'send'} loadingLabel="Sending…" onPress={() => void run('send')} />
                </View>
            ) : null}
            {msg ? <Text style={{ color: msg.ok ? '#10b981' : '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{msg.text}</Text> : null}
        </View>
    );
}
