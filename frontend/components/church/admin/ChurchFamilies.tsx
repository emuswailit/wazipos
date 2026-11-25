// components/church/admin/ChurchFamilies.tsx
//
// Church admin → Families: the family register. Search families, register a new
// family with its household head, open a family to see its members, add children /
// spouse, edit, and from a member: promote on marriage, change status, remove.

import type { Family, Group } from '@/api/churchesApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, AdminSheet, FormRow, FormSection, SheetButton } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import { ChevronRight, HouseHeart, Plus } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, ChurchAdminGate, ChurchSwitcher, EmptyNote, fmtDate, pointer, runWrite, todayIso, useChurchAdmin, type ChurchAdminState } from '../churchShared';
import { blankMember, MemberFields, MemberForm, MemberSheet, validateMember, type MemberInput } from './registerParts';

type StatusFilter = 'ACTIVE' | 'TRANSFERRED' | 'INACTIVE' | 'ALL';

/** The value after the person stops typing (server-side search). */
export function useDebounced(value: string, ms = 400) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

export default function ChurchFamilies() {
    const state = useChurchAdmin();
    return <ChurchAdminGate state={state}>{(home) => <FamiliesBody state={state} canEdit={home.can.edit_register} canView={home.can.view_register} />}</ChurchAdminGate>;
}

function FamiliesBody({ state, canEdit, canView }: { state: ChurchAdminState; canEdit: boolean; canView: boolean }) {
    const { theme } = useAuth();
    const [q, setQ] = useState('');
    const [status, setStatus] = useState<StatusFilter>('ACTIVE');
    const [adding, setAdding] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const term = useDebounced(q.trim());

    const list = useCachedList<Family>({
        key: `church_families:${state.church}:${status}:${term}`,
        fetch: () => state.api('Families', { status, q: term || undefined, page_size: 200 }) as any,
        pick: (d) => d?.result?.families,
        enabled: !!state.church && canView,
    });

    const rows = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return list.items;
        return list.items.filter((f) => `${f.number} ${f.name} ${f.head} ${f.area} ${f.phone}`.toLowerCase().includes(t));
    }, [list.items, q]);

    if (!canView) return <View style={{ padding: 16 }}><InlineNotice tone="warning" message="Your church role can't see the family register." /></View>;

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 980, width: '100%', alignSelf: 'center', gap: 10 }}
                refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}
                keyboardShouldPersistTaps="handled"
            >
                <ChurchSwitcher state={state} />
                <PosHeader icon={HouseHeart} title="Families" subtitle={`${list.items.length} ${status === 'ALL' ? '' : status.toLowerCase()} families · ${list.sourceLabel}`} right={canEdit ? <SoftButton label="New family" icon={Plus} tone="navy" onPress={() => setAdding(true)} /> : null} />
                <CustomTextField value={q} onChangeText={setQ} placeholder="Search by family name, number, head, area or phone" />
                <Segmented<StatusFilter>
                    options={[
                        ['ACTIVE', 'Active'],
                        ['TRANSFERRED', 'Transferred'],
                        ['INACTIVE', 'Inactive'],
                        ['ALL', 'All'],
                    ]}
                    value={status}
                    onChange={setStatus}
                />
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {!list.loading && !rows.length ? (
                    <EmptyNote icon={HouseHeart} title={q ? 'No family matches' : 'No families yet'} text={q ? undefined : 'Register each household: the head (father, mother or guardian), then the spouse and children.'} action={canEdit && !q ? <SoftButton label="New family" icon={Plus} onPress={() => setAdding(true)} /> : undefined} />
                ) : null}
                {rows.map((f) => (
                    <Pressable key={f.id} onPress={() => setOpenId(f.id)} accessibilityRole="button" accessibilityLabel={f.name} style={pointer}>
                        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{ width: 54, alignItems: 'center' }}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>{f.number}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>{f.name}</Text>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                                    {[f.head, `${f.size} ${f.size === 1 ? 'person' : 'people'}`, f.area, f.cell_group?.name].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                            {f.status !== 'ACTIVE' ? <Chip label={f.status === 'TRANSFERRED' ? 'Transferred' : 'Inactive'} color={theme.warning} /> : null}
                            <ChevronRight size={16} color={theme.textMuted} />
                        </Card>
                    </Pressable>
                ))}
            </ScrollView>

            <FamilyForm state={state} visible={adding} family={null} onClose={() => setAdding(false)} onSaved={(f) => { setAdding(false); void list.refresh(); setOpenId(f.id); }} />
            <FamilySheet state={state} familyId={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onChanged={() => void list.refresh()} />
        </View>
    );
}

/* ------------------------------------------------------------ family form */

function FamilyForm({ state, visible, family, onClose, onSaved }: { state: ChurchAdminState; visible: boolean; family: Family | null; onClose: () => void; onSaved: (f: Family) => void }) {
    const [name, setName] = useState('');
    const [area, setArea] = useState('');
    const [cell, setCell] = useState('');
    const [joined, setJoined] = useState('');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<Family['status']>('ACTIVE');
    const [head, setHead] = useState<MemberInput>(blankMember('HEAD'));
    const [errs, setErrs] = useState<Record<string, string>>({});
    const [cells, setCells] = useState<{ value: string; label: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setName(family?.name ?? '');
        setArea(family?.area ?? '');
        setCell(family?.cell_group?.id ?? '');
        setJoined(family?.joined_on ?? todayIso());
        setNotes(family?.notes ?? '');
        setStatus(family?.status ?? 'ACTIVE');
        setHead(blankMember('HEAD'));
        setErrs({});
        setError(null);
        state.api('Groups').then((res: any) => {
            if (isServerOk(res)) setCells([{ value: '', label: 'No cell group' }, ...res.data.result.groups.map((g: Group) => ({ value: g.id, label: `${g.name} (${g.kind_label})` }))]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, family]);

    const save = async () => {
        const e = family ? {} : validateMember(head);
        setErrs(e);
        if (Object.keys(e).length) return setError('Fix the highlighted fields.');
        setBusy(true);
        const body: any = { name, area, cell_group_id: cell, joined_on: joined, notes };
        if (family) {
            body.family_id = family.id;
            body.status = status;
        } else body.head = head;
        const { data, error: err } = await runWrite<Family>(state.api('SaveFamily', body), 'family', family ? 'Family updated' : 'Family registered');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={family ? 'Edit family' : 'Register a family'} subtitle={family ? `${family.number} ${family.name}` : 'Start with the household head'} icon="home-outline" submitLabel={family ? 'Save' : 'Register family'} submitting={busy} onSubmit={() => void save()} error={error} width={720}>
            <FormSection title="Family">
                <FormRow>
                    <CustomTextField label="Family name" value={name} onChangeText={setName} placeholder={family ? '' : 'e.g. Otieno family (blank: from the head)'} />
                    <CustomTextField label="Area / estate" value={area} onChangeText={setArea} />
                </FormRow>
                <FormRow>
                    <SelectDropdown label="Cell group" options={cells} value={cell} onChange={setCell} placeholder="No cell group" />
                    <DateField label="Joined the church" value={joined} onChangeText={setJoined} />
                </FormRow>
                {family ? (
                    <SelectDropdown
                        label="Status"
                        options={[
                            { value: 'ACTIVE', label: 'Active' },
                            { value: 'TRANSFERRED', label: 'Transferred out' },
                            { value: 'INACTIVE', label: 'Inactive' },
                        ]}
                        value={status}
                        onChange={(v) => setStatus(v as Family['status'])}
                    />
                ) : null}
                <CustomTextField label="Notes" value={notes} onChangeText={setNotes} multiline />
            </FormSection>
            {!family ? (
                <FormSection title="Household head" hint="Father, mother or guardian. Add the spouse and children next.">
                    <MemberFields value={head} onChange={setHead} errors={errs} showRole={false} />
                </FormSection>
            ) : null}
        </AdminFormSheet>
    );
}

/* ------------------------------------------------------------ family sheet */

function FamilySheet({ state, familyId, canEdit, onClose, onChanged }: { state: ChurchAdminState; familyId: string | null; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
    const { theme } = useAuth();
    const [f, setF] = useState<Family | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<'edit' | 'add' | null>(null);
    const [memberId, setMemberId] = useState<string | null>(null);

    const load = async (id: string) => {
        const res: any = await state.api('Family', { family_id: id }).catch(() => null);
        if (isServerOk(res)) {
            setF(res.data.family);
            setError(null);
        } else setError('Could not open this family.');
    };

    useEffect(() => {
        setF(null);
        if (familyId) void load(familyId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [familyId]);

    const refresh = () => {
        if (familyId) void load(familyId);
        onChanged();
    };

    return (
        <>
            <AdminSheet
                visible={!!familyId && !form && !memberId}
                onClose={onClose}
                title={f ? f.name : 'Family'}
                subtitle={f ? `${f.number}${f.area ? ` · ${f.area}` : ''}` : null}
                icon="home-outline"
                width={680}
                footer={
                    canEdit && f ? (
                        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flex: 1 }}>
                            <SheetButton label="Edit family" variant="secondary" icon="create-outline" onPress={() => setForm('edit')} />
                            <SheetButton label="Add member" icon="person-add-outline" onPress={() => setForm('add')} />
                        </View>
                    ) : undefined
                }
            >
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                {!f && !error ? <ActivityIndicator color={theme.primary} /> : null}
                {f ? (
                    <View style={{ gap: 10 }}>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>
                            {[f.cell_group ? `Cell: ${f.cell_group.name}` : null, f.joined_on ? `Joined ${fmtDate(f.joined_on)}` : null, f.parent_family ? `From ${f.parent_family.number} ${f.parent_family.name}` : null].filter(Boolean).join(' · ')}
                        </Text>
                        {f.notes ? <Text style={{ color: theme.text, fontFamily: theme.font.regular }}>{f.notes}</Text> : null}
                        {(f.members ?? []).map((m) => (
                            <Pressable key={m.id} onPress={() => setMemberId(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderColor: theme.border, ...pointer }}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 14.5, opacity: m.status === 'ACTIVE' || m.status === 'VISITOR' ? 1 : 0.55 }}>{m.name}</Text>
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                        {[m.role_label, m.age != null ? `${m.age} yrs` : null, m.phone].filter(Boolean).join(' · ')}
                                    </Text>
                                </View>
                                {m.status !== 'ACTIVE' ? <Chip label={m.status_label} color={m.status === 'DECEASED' ? theme.textMuted : theme.warning} /> : null}
                                <ChevronRight size={15} color={theme.textMuted} />
                            </Pressable>
                        ))}
                        {(f.branch_families ?? []).length ? (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 6 }}>
                                Families started by its children: {f.branch_families!.map((b) => `${b.number} ${b.name}`).join(', ')}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
            </AdminSheet>
            <FamilyForm state={state} visible={form === 'edit'} family={f} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />
            <MemberForm state={state} visible={form === 'add'} familyId={f?.id} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />
            <MemberSheet state={state} memberId={memberId} canEdit={canEdit} onClose={() => setMemberId(null)} onChanged={refresh} />
        </>
    );
}
