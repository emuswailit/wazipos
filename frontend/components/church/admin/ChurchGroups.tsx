// components/church/admin/ChurchGroups.tsx
//
// Church admin → Groups: ministries, cells, choir, youth, women, men, Sunday school.
// Runners add and edit groups; a group's own leader (and runners) add / remove its
// members. Group leaders are appointed in Officials & settings.

import type { Group, GroupKind, MemberBrief } from '@/api/churchesApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, AdminSheet, ChoiceChips, FormSection, SheetButton } from '@/components/common/listScreen';
import { InlineNotice, PosHeader, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import { Minus, Plus, UsersRound } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, ChurchAdminGate, ChurchSwitcher, EmptyNote, pointer, runWrite, useChurchAdmin, type ChurchAdminState } from '../churchShared';
import { useDebounced } from './ChurchFamilies';

const KINDS: { value: GroupKind; label: string }[] = [
    { value: 'MINISTRY', label: 'Ministry' },
    { value: 'CELL', label: 'Cell / home fellowship' },
    { value: 'CHOIR', label: 'Choir / praise' },
    { value: 'YOUTH', label: 'Youth' },
    { value: 'WOMEN', label: 'Women' },
    { value: 'MEN', label: 'Men' },
    { value: 'CHILDREN', label: 'Sunday school' },
    { value: 'OTHER', label: 'Other' },
];

export default function ChurchGroups() {
    const state = useChurchAdmin();
    return <ChurchAdminGate state={state}>{(home) => <GroupsBody state={state} canManage={home.can.manage_groups} myGroups={home.my_groups} />}</ChurchAdminGate>;
}

function GroupsBody({ state, canManage, myGroups }: { state: ChurchAdminState; canManage: boolean; myGroups: string[] }) {
    const { theme } = useAuth();
    const [editing, setEditing] = useState<Group | 'new' | null>(null);
    const [membersOf, setMembersOf] = useState<Group | null>(null);
    const list = useCachedList<Group>({ key: `church_groups:${state.church}`, fetch: () => state.api('Groups', { active: 'ALL' }) as any, pick: (d) => d?.result?.groups, enabled: !!state.church });
    const upsert = (g: Group) => list.patch((rows) => (rows.some((r) => r.id === g.id) ? rows.map((r) => (r.id === g.id ? g : r)) : [...rows, g]));

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 980, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}>
                <ChurchSwitcher state={state} />
                <PosHeader icon={UsersRound} title="Groups" subtitle={`${list.items.filter((g) => g.is_active).length} active · ${list.sourceLabel}`} right={canManage ? <SoftButton label="New group" icon={Plus} tone="navy" onPress={() => setEditing('new')} /> : null} />
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {!list.loading && !list.items.length ? <EmptyNote icon={UsersRound} title="No groups yet" text="Add ministries, cells, the choir, youth, women's and men's fellowships, Sunday school…" action={canManage ? <SoftButton label="New group" icon={Plus} onPress={() => setEditing('new')} /> : undefined} /> : null}
                {list.items.map((g) => {
                    const leads = myGroups.includes(g.id);
                    return (
                        <Card key={g.id} style={{ opacity: g.is_active ? 1 : 0.6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{g.name}</Text>
                                <Chip label={g.kind_label} color={theme.primary} />
                                {!g.is_active ? <Chip label="Inactive" color={theme.textMuted} /> : null}
                                {leads ? <Chip label="You lead" color={theme.success} /> : null}
                            </View>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                {[`${g.members ?? 0} members`, g.meets, g.leaders.length ? `Led by ${g.leaders.map((l) => l.name).join(', ')}` : null].filter(Boolean).join(' · ')}
                            </Text>
                            {g.description ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13.5 }}>{g.description}</Text> : null}
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                {canManage || leads ? <SoftButton label="Members" icon={UsersRound} onPress={() => setMembersOf(g)} /> : null}
                                {canManage ? <SoftButton label="Edit" tone="neutral" onPress={() => setEditing(g)} /> : null}
                            </View>
                        </Card>
                    );
                })}
            </ScrollView>
            <GroupForm state={state} visible={!!editing} group={editing && editing !== 'new' ? editing : null} onClose={() => setEditing(null)} onSaved={(g) => { upsert(g); setEditing(null); }} />
            <GroupMembersSheet state={state} group={membersOf} onClose={() => setMembersOf(null)} onChanged={(g) => upsert(g)} />
        </View>
    );
}

function GroupForm({ state, visible, group, onClose, onSaved }: { state: ChurchAdminState; visible: boolean; group: Group | null; onClose: () => void; onSaved: (g: Group) => void }) {
    const [name, setName] = useState('');
    const [kind, setKind] = useState<GroupKind>('MINISTRY');
    const [meets, setMeets] = useState('');
    const [description, setDescription] = useState('');
    const [active, setActive] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setName(group?.name ?? '');
        setKind(group?.kind ?? 'MINISTRY');
        setMeets(group?.meets ?? '');
        setDescription(group?.description ?? '');
        setActive(group?.is_active ?? true);
        setError(null);
    }, [visible, group]);

    const save = async () => {
        if (!name.trim()) return setError('Give the group a name.');
        setBusy(true);
        const { data, error: err } = await runWrite<Group>(state.api('SaveGroup', { group_id: group?.id, name, kind, meets, description, is_active: active }), 'group', group ? 'Group updated' : 'Group added');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={group ? 'Edit group' : 'New group'} subtitle={group?.name} icon="people-outline" submitLabel={group ? 'Save' : 'Add group'} submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Group">
                <CustomTextField label="Name" required value={name} onChangeText={setName} placeholder="e.g. Youth fellowship, Kilimani cell" />
                <ChoiceChips label="Kind" options={KINDS} value={kind} onChange={setKind} />
                <CustomTextField label="When and where it meets" value={meets} onChangeText={setMeets} placeholder="e.g. Thursdays 6pm, church hall" />
                <CustomTextField label="About" value={description} onChangeText={setDescription} multiline />
                {group ? (
                    <ChoiceChips
                        label="Status"
                        options={[
                            { value: 'on', label: 'Active' },
                            { value: 'off', label: 'Inactive' },
                        ]}
                        value={active ? 'on' : 'off'}
                        onChange={(v) => setActive(v === 'on')}
                    />
                ) : null}
            </FormSection>
        </AdminFormSheet>
    );
}

function GroupMembersSheet({ state, group, onClose, onChanged }: { state: ChurchAdminState; group: Group | null; onClose: () => void; onChanged: (g: Group) => void }) {
    const { theme } = useAuth();
    const [inGroup, setInGroup] = useState<MemberBrief[]>([]);
    const [q, setQ] = useState('');
    const term = useDebounced(q.trim());
    const [found, setFound] = useState<MemberBrief[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadMembers = async (id: string) => {
        const res: any = await state.api('Members', { group_id: id, status: 'ALL', page_size: 200 }).catch(() => null);
        if (isServerOk(res)) setInGroup(res.data.result.members);
    };

    useEffect(() => {
        setInGroup([]);
        setQ('');
        setFound([]);
        setError(null);
        if (group) void loadMembers(group.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group?.id]);

    useEffect(() => {
        if (!group || term.length < 2) return setFound([]);
        state.api('Members', { q: term, page_size: 20 }).then((res: any) => {
            if (isServerOk(res)) setFound(res.data.result.members);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term, group?.id]);

    const change = async (memberId: string, add: boolean) => {
        if (!group) return;
        setBusy(memberId);
        const { data, error: err } = await runWrite<Group>(state.api('SetGroupMembers', { group_id: group.id, [add ? 'add' : 'remove']: [memberId] }), 'group', add ? 'Added to the group' : 'Removed from the group');
        setBusy(null);
        if (data) {
            onChanged(data);
            void loadMembers(group.id);
        } else setError(err);
    };

    const ids = new Set(inGroup.map((m) => m.id));
    return (
        <AdminSheet visible={!!group} onClose={onClose} title={group ? `${group.name} members` : 'Members'} subtitle={`${inGroup.length} in the group`} icon="people-outline" width={640} footer={<SheetButton label="Done" onPress={onClose} />}>
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            <CustomTextField label="Add people" value={q} onChangeText={setQ} placeholder="Search the register by name or phone" />
            {found.filter((m) => !ids.has(m.id)).map((m) => (
                <Row key={m.id} m={m} busy={busy === m.id} action="add" onPress={() => void change(m.id, true)} />
            ))}
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, marginTop: 10 }}>In the group</Text>
            {!inGroup.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>Nobody yet. Search above to add people.</Text> : null}
            {inGroup.map((m) => (
                <Row key={m.id} m={m} busy={busy === m.id} action="remove" onPress={() => void change(m.id, false)} />
            ))}
        </AdminSheet>
    );
}

function Row({ m, busy, action, onPress }: { m: MemberBrief; busy: boolean; action: 'add' | 'remove'; onPress: () => void }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: theme.border }}>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.semibold }}>{m.name}</Text>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{[m.family_number ? `${m.family_number} ${m.family_name}` : null, m.age != null ? `${m.age} yrs` : null].filter(Boolean).join(' · ')}</Text>
            </View>
            {busy ? (
                <ActivityIndicator color={theme.primary} />
            ) : (
                <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={action === 'add' ? `Add ${m.name}` : `Remove ${m.name}`} style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: action === 'add' ? theme.primarySoft : theme.dangerSoft, ...pointer }}>
                    {action === 'add' ? <Plus size={16} color={theme.primary} /> : <Minus size={16} color={theme.danger} />}
                </Pressable>
            )}
        </View>
    );
}
