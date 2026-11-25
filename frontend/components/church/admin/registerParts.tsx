// components/church/admin/registerParts.tsx
//
// Family-register pieces used by Church admin → Families and → Members:
//   MemberForm     add / edit a member (with the family they belong to)
//   MemberSheet    a member's details and history, with Edit / Promote / Status / Remove
//   PromoteForm    a child marries: start a new family, or join the spouse's family
//   StatusForm     deceased / transferred out / visitor / active again (dated, kept in history)

import type { FamilyRole, MemberFull, MemberStatus } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, AdminSheet, ChoiceChips, FormRow, FormSection, SheetButton } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { isServerOk } from '@/utils/serverResponse';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Chip, fmtDate, runWrite, todayIso, type ChurchAdminState } from '../churchShared';

export const ROLE_OPTIONS: { value: FamilyRole; label: string }[] = [
    { value: 'HEAD', label: 'Household head' },
    { value: 'SPOUSE', label: 'Spouse' },
    { value: 'CHILD', label: 'Child' },
    { value: 'DEPENDANT', label: 'Other dependant' },
];
export const STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'VISITOR', label: 'Visitor' },
    { value: 'TRANSFERRED', label: 'Transferred out' },
    { value: 'DECEASED', label: 'Deceased' },
];
const GENDER_OPTIONS: { value: 'Female' | 'Male'; label: string }[] = [
    { value: 'Female', label: 'Female' },
    { value: 'Male', label: 'Male' },
];

export interface MemberInput {
    member_id?: string;
    family_id?: string;
    first_name: string;
    last_name: string;
    gender: string;
    date_of_birth: string;
    phone: string;
    id_number: string;
    role_in_family: FamilyRole;
    baptised_on: string;
    confirmed_on: string;
    notes: string;
}

export const blankMember = (role: FamilyRole = 'CHILD'): MemberInput => ({
    first_name: '', last_name: '', gender: '', date_of_birth: '', phone: '', id_number: '', role_in_family: role, baptised_on: '', confirmed_on: '', notes: '',
});

const fromMember = (m: MemberFull): MemberInput => ({
    member_id: m.id, family_id: m.family_id, first_name: m.first_name, last_name: m.last_name, gender: m.gender || '',
    date_of_birth: m.date_of_birth || '', phone: m.phone || '', id_number: m.id_number || '', role_in_family: m.role_in_family,
    baptised_on: m.baptised_on || '', confirmed_on: m.confirmed_on || '', notes: m.notes || '',
});

/** The fields of one person (used inside the family form for the household head, and by MemberForm). */
export function MemberFields({ value, onChange, errors, showRole = true }: { value: MemberInput; onChange: (v: MemberInput) => void; errors: Record<string, string>; showRole?: boolean }) {
    const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) => onChange({ ...value, [k]: v });
    return (
        <>
            <FormRow>
                <CustomTextField label="First name" required value={value.first_name} onChangeText={(t) => set('first_name', t)} error={errors.first_name} />
                <CustomTextField label="Last name" value={value.last_name} onChangeText={(t) => set('last_name', t)} />
            </FormRow>
            <ChoiceChips label="Gender" options={GENDER_OPTIONS} value={value.gender as any} onChange={(g) => set('gender', g)} />
            {showRole ? <ChoiceChips label="Place in the family" options={ROLE_OPTIONS} value={value.role_in_family} onChange={(r) => set('role_in_family', r)} /> : null}
            <FormRow>
                <DateField label="Date of birth" value={value.date_of_birth} onChangeText={(t) => set('date_of_birth', t)} error={errors.date_of_birth} />
                <CustomTextField label="Phone" value={value.phone} onChangeText={(t) => set('phone', t)} keyboardType="phone-pad" placeholder="07XX XXX XXX" error={errors.phone} hint="Links them to their WaziPOS account and gets church SMS" />
            </FormRow>
            <FormRow>
                <CustomTextField label="ID number (adults)" value={value.id_number} onChangeText={(t) => set('id_number', t)} />
                <DateField label="Baptised on" value={value.baptised_on} onChangeText={(t) => set('baptised_on', t)} />
            </FormRow>
            <DateField label="Confirmed on" value={value.confirmed_on} onChangeText={(t) => set('confirmed_on', t)} />
        </>
    );
}

export function validateMember(v: MemberInput): Record<string, string> {
    const e: Record<string, string> = {};
    if (!v.first_name.trim()) e.first_name = 'Required';
    if (v.date_of_birth && v.date_of_birth > todayIso()) e.date_of_birth = "Can't be in the future";
    if (v.phone && v.phone.replace(/\D/g, '').length < 9) e.phone = 'Enter a full phone number';
    return e;
}

export function MemberForm({ state, visible, familyId, member, onClose, onSaved }: { state: ChurchAdminState; visible: boolean; familyId?: string; member?: MemberFull | null; onClose: () => void; onSaved: (m: MemberFull) => void }) {
    const [f, setF] = useState<MemberInput>(blankMember());
    const [errs, setErrs] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setF(member ? fromMember(member) : { ...blankMember(), family_id: familyId });
        setErrs({});
        setError(null);
    }, [visible, member, familyId]);

    const save = async () => {
        const e = validateMember(f);
        setErrs(e);
        if (Object.keys(e).length) return setError('Fix the highlighted fields.');
        setBusy(true);
        const { data, error: err } = await runWrite<MemberFull>(state.api('SaveMember', { ...f, family_id: f.family_id || familyId }), 'member', member ? 'Member updated' : 'Member added');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={member ? 'Edit member' : 'Add to family'} subtitle={member ? member.name : 'A child, spouse or dependant'} icon="person-add-outline" submitLabel={member ? 'Save' : 'Add member'} submitting={busy} onSubmit={() => void save()} error={error} width={680}>
            <FormSection title="Person">
                <MemberFields value={f} onChange={setF} errors={errs} />
            </FormSection>
            <FormSection title="Notes">
                <CustomTextField value={f.notes} onChangeText={(t) => setF({ ...f, notes: t })} multiline placeholder="Anything the church office should know" />
            </FormSection>
        </AdminFormSheet>
    );
}

/** A member's details + history, with actions for people who run the register. */
export function MemberSheet({ state, memberId, onClose, onChanged, canEdit }: { state: ChurchAdminState; memberId: string | null; onClose: () => void; onChanged: () => void; canEdit: boolean }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [m, setM] = useState<MemberFull | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<'edit' | 'promote' | 'status' | null>(null);

    const load = async (id: string) => {
        setError(null);
        const res: any = await state.api('Member', { member_id: id }).catch(() => null);
        if (isServerOk(res)) setM(res.data.member);
        else setError('Could not load this member.');
    };

    useEffect(() => {
        setM(null);
        if (memberId) void load(memberId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberId]);

    const changed = (next?: MemberFull | null) => {
        if (next) setM(next);
        else if (memberId) void load(memberId);
        setForm(null);
        onChanged();
    };

    const remove = () =>
        alert('Remove this member?', 'Only for someone entered by mistake: it deletes them and their history. For a death or a move, change their status instead.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data, error: err } = await runWrite(state.api('RemoveMember', { member_id: memberId }), 'result', 'Member removed');
                    if (data) {
                        onChanged();
                        onClose();
                    } else if (err) setError(err);
                },
            },
        ]);

    return (
        <>
            <AdminSheet
                visible={!!memberId && !form}
                onClose={onClose}
                title={m?.name ?? 'Member'}
                subtitle={m ? `${m.family_number} ${m.family_name} · ${m.role_label}` : null}
                icon="person-outline"
                width={640}
                footer={
                    canEdit && m ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', flex: 1 }}>
                            <SheetButton label="Remove" variant="ghost" onPress={remove} />
                            <SheetButton label="Status" variant="secondary" icon="pulse-outline" onPress={() => setForm('status')} />
                            {m.role_in_family === 'CHILD' || m.role_in_family === 'DEPENDANT' ? <SheetButton label="Married: new family" variant="secondary" icon="heart-outline" onPress={() => setForm('promote')} /> : null}
                            <SheetButton label="Edit" icon="create-outline" onPress={() => setForm('edit')} />
                        </View>
                    ) : undefined
                }
            >
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                {!m && !error ? <ActivityIndicator color={theme.primary} /> : null}
                {m ? (
                    <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            <Chip label={m.status_label} color={m.status === 'ACTIVE' ? theme.success : m.status === 'DECEASED' ? theme.textMuted : theme.warning} />
                            {m.has_account ? <Chip label="On WaziPOS" color={theme.primary} /> : null}
                            {m.groups.map((g) => (
                                <Chip key={g.id} label={g.name} color={theme.primary} />
                            ))}
                        </View>
                        <Detail label="Gender" value={m.gender} />
                        <Detail label="Born" value={m.date_of_birth ? `${fmtDate(m.date_of_birth)}${m.age != null ? ` (${m.age} yrs)` : ''}` : ''} />
                        <Detail label="Phone" value={m.phone} />
                        <Detail label="ID number" value={m.id_number} />
                        <Detail label="Baptised" value={fmtDate(m.baptised_on)} />
                        <Detail label="Confirmed" value={fmtDate(m.confirmed_on)} />
                        <Detail label="Married" value={fmtDate(m.married_on)} />
                        <Detail label="Died" value={fmtDate(m.died_on)} />
                        <Detail label="Grew up in" value={m.origin_family ? `${m.origin_family.number} ${m.origin_family.name}` : ''} />
                        <Detail label="Notes" value={m.notes} />
                        {m.events?.length ? (
                            <View style={{ gap: 6, marginTop: 4 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>History</Text>
                                {m.events.map((e) => (
                                    <Text key={e.id} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>
                                        {fmtDate(e.date) || '—'} · {e.kind_label}
                                        {e.details ? ` — ${e.details}` : ''}
                                    </Text>
                                ))}
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </AdminSheet>
            <MemberForm state={state} visible={form === 'edit'} member={m} onClose={() => setForm(null)} onSaved={(x) => changed(x)} />
            <PromoteForm state={state} visible={form === 'promote'} member={m} onClose={() => setForm(null)} onDone={() => changed()} />
            <StatusForm state={state} visible={form === 'status'} member={m} onClose={() => setForm(null)} onDone={(x) => changed(x)} />
        </>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    const { theme } = useAuth();
    if (!value) return null;
    return (
        <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ width: 96, color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>{label}</Text>
            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }}>{value}</Text>
        </View>
    );
}

export function PromoteForm({ state, visible, member, onClose, onDone }: { state: ChurchAdminState; visible: boolean; member: MemberFull | null; onClose: () => void; onDone: () => void }) {
    const [mode, setMode] = useState<'NEW_FAMILY' | 'JOIN_FAMILY'>('NEW_FAMILY');
    const [marriedOn, setMarriedOn] = useState('');
    const [familyName, setFamilyName] = useState('');
    const [familyId, setFamilyId] = useState('');
    const [families, setFamilies] = useState<{ value: string; label: string }[]>([]);
    const [addSpouse, setAddSpouse] = useState(true);
    const [spouse, setSpouse] = useState<MemberInput>(blankMember('SPOUSE'));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible || !member) return;
        setMode('NEW_FAMILY');
        setMarriedOn('');
        setFamilyName(`${member.last_name || member.first_name} family`);
        setFamilyId('');
        setSpouse(blankMember('SPOUSE'));
        setAddSpouse(true);
        setError(null);
    }, [visible, member]);

    useEffect(() => {
        if (!visible || mode !== 'JOIN_FAMILY' || families.length) return;
        state.api('Families', { page_size: 200 }).then((res: any) => {
            if (isServerOk(res)) setFamilies(res.data.result.families.filter((f: any) => f.id !== member?.family_id).map((f: any) => ({ value: f.id, label: `${f.number} ${f.name}${f.head ? ` — ${f.head}` : ''}` })));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, mode]);

    const save = async () => {
        if (mode === 'JOIN_FAMILY' && !familyId) return setError("Pick the spouse's family.");
        if (mode === 'NEW_FAMILY' && addSpouse && spouse.first_name.trim() === '') return setError("Enter the spouse's first name, or untick adding them.");
        setBusy(true);
        const body: any = { member_id: member?.id, mode, married_on: marriedOn || undefined };
        if (mode === 'NEW_FAMILY') {
            body.family_name = familyName;
            if (addSpouse) body.spouse = spouse;
        } else body.family_id = familyId;
        const { data, error: err } = await runWrite(state.api('PromoteMember', body), 'family', mode === 'NEW_FAMILY' ? 'New family started' : "Moved to the spouse's family");
        setBusy(false);
        if (data) onDone();
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title="Married: move to a family" subtitle={member ? `${member.name} leaves ${member.family_name}` : null} icon="heart-outline" submitLabel="Save" submitting={busy} onSubmit={() => void save()} error={error} width={680}>
            <FormSection title="Where they go" hint="The family they grew up in stays on record.">
                <ChoiceChips
                    options={[
                        { value: 'NEW_FAMILY', label: 'Start a new family' },
                        { value: 'JOIN_FAMILY', label: "Join spouse's family" },
                    ]}
                    value={mode}
                    onChange={setMode}
                />
                <DateField label="Wedding date" value={marriedOn} onChangeText={setMarriedOn} />
                {mode === 'NEW_FAMILY' ? (
                    <CustomTextField label="New family name" value={familyName} onChangeText={setFamilyName} />
                ) : (
                    <SelectDropdown label="Spouse's family" options={families} value={familyId} onChange={setFamilyId} placeholder="Pick a family" />
                )}
            </FormSection>
            {mode === 'NEW_FAMILY' ? (
                <FormSection title="Spouse" hint="Add the husband or wife to the new family now (you can also add them later).">
                    <ChoiceChips
                        options={[
                            { value: 'yes', label: 'Add spouse now' },
                            { value: 'no', label: 'Later' },
                        ]}
                        value={addSpouse ? 'yes' : 'no'}
                        onChange={(v) => setAddSpouse(v === 'yes')}
                    />
                    {addSpouse ? <MemberFields value={spouse} onChange={setSpouse} errors={{}} showRole={false} /> : null}
                </FormSection>
            ) : null}
        </AdminFormSheet>
    );
}

export function StatusForm({ state, visible, member, onClose, onDone }: { state: ChurchAdminState; visible: boolean; member: MemberFull | null; onClose: () => void; onDone: (m: MemberFull) => void }) {
    const [status, setStatus] = useState<MemberStatus>('ACTIVE');
    const [on, setOn] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible || !member) return;
        setStatus(member.status === 'ACTIVE' ? 'DECEASED' : 'ACTIVE');
        setOn(todayIso());
        setNote('');
        setError(null);
    }, [visible, member]);

    const save = async () => {
        setBusy(true);
        const { data, error: err } = await runWrite<MemberFull>(state.api('SetMemberStatus', { member_id: member?.id, status, date: on, note }), 'member', 'Member updated');
        setBusy(false);
        if (data) onDone(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title="Change status" subtitle={member?.name} icon="pulse-outline" submitLabel="Save" submitting={busy} onSubmit={() => void save()} error={error}>
            <ChoiceChips label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            <DateField label={status === 'DECEASED' ? 'Date of death' : 'Date'} value={on} onChangeText={setOn} />
            <CustomTextField label="Note" value={note} onChangeText={setNote} placeholder={status === 'TRANSFERRED' ? 'e.g. Moved to PCEA Nakuru' : 'Optional'} />
        </AdminFormSheet>
    );
}
