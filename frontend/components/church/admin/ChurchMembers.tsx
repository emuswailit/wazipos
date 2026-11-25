// components/church/admin/ChurchMembers.tsx
//
// Church admin → Members: everyone in the register, searchable (name, phone, family),
// filtered by status / group / gender. Group leaders see only their group's members.
// Opens the member sheet (details, history, edit, promote on marriage, status).

import type { Group, MemberBrief, MemberStatus } from '@/api/churchesApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import { ChevronRight, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, ChurchAdminGate, ChurchSwitcher, EmptyNote, pointer, useChurchAdmin, type ChurchAdminState } from '../churchShared';
import { useDebounced } from './ChurchFamilies';
import { MemberSheet } from './registerParts';

export default function ChurchMembers() {
    const state = useChurchAdmin();
    return <ChurchAdminGate state={state}>{(home) => <MembersBody state={state} canEdit={home.can.edit_register} />}</ChurchAdminGate>;
}

function MembersBody({ state, canEdit }: { state: ChurchAdminState; canEdit: boolean }) {
    const { theme } = useAuth();
    const [q, setQ] = useState('');
    const [status, setStatus] = useState<MemberStatus | 'ALL'>('ACTIVE');
    const [group, setGroup] = useState('');
    const [gender, setGender] = useState('');
    const [groups, setGroups] = useState<{ value: string; label: string }[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const term = useDebounced(q.trim());

    useEffect(() => {
        if (!state.church) return;
        state.api('Groups').then((res: any) => {
            if (isServerOk(res)) setGroups([{ value: '', label: 'All groups' }, ...res.data.result.groups.map((g: Group) => ({ value: g.id, label: g.name }))]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.church]);

    const list = useCachedList<MemberBrief>({
        key: `church_members:${state.church}:${status}:${group}:${gender}:${term}`,
        fetch: () => state.api('Members', { status, q: term || undefined, group_id: group || undefined, gender: gender || undefined, page_size: 200 }) as any,
        pick: (d) => d?.result?.members,
        enabled: !!state.church,
    });

    const rows = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return list.items;
        return list.items.filter((m) => `${m.name} ${m.phone ?? ''} ${m.family_name ?? ''} ${m.family_number ?? ''}`.toLowerCase().includes(t));
    }, [list.items, q]);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 980, width: '100%', alignSelf: 'center', gap: 10 }}
                refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}
                keyboardShouldPersistTaps="handled"
            >
                <ChurchSwitcher state={state} />
                <PosHeader icon={Users} title="Members" subtitle={`${rows.length} shown · ${list.sourceLabel}`} />
                <CustomTextField value={q} onChangeText={setQ} placeholder="Search by name, phone or family" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexGrow: 1, minWidth: 160 }}>
                        <SelectDropdown
                            label="Status"
                            options={[
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'VISITOR', label: 'Visitors' },
                                { value: 'TRANSFERRED', label: 'Transferred out' },
                                { value: 'DECEASED', label: 'Deceased' },
                                { value: 'ALL', label: 'Everyone' },
                            ]}
                            value={status}
                            onChange={(v) => setStatus(v as any)}
                        />
                    </View>
                    <View style={{ flexGrow: 1, minWidth: 160 }}>
                        <SelectDropdown label="Group" options={groups} value={group} onChange={setGroup} placeholder="All groups" />
                    </View>
                    <View style={{ flexGrow: 1, minWidth: 140 }}>
                        <SelectDropdown
                            label="Gender"
                            options={[
                                { value: '', label: 'All' },
                                { value: 'Female', label: 'Female' },
                                { value: 'Male', label: 'Male' },
                            ]}
                            value={gender}
                            onChange={setGender}
                        />
                    </View>
                </View>
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {!list.loading && !rows.length ? <EmptyNote icon={Users} title="No members match" text="Members are added from Families: register the household, then add its people." /> : null}
                {rows.map((m) => (
                    <Pressable key={m.id} onPress={() => setOpenId(m.id)} accessibilityRole="button" accessibilityLabel={m.name} style={pointer}>
                        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }} numberOfLines={1}>{m.name}</Text>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                                    {[`${m.family_number} ${m.family_name}`, m.role_label, m.age != null ? `${m.age} yrs` : null, m.phone].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                            {m.status !== 'ACTIVE' ? <Chip label={m.status_label} color={m.status === 'DECEASED' ? theme.textMuted : theme.warning} /> : null}
                            {m.has_account ? <Chip label="On WaziPOS" color={theme.primary} /> : null}
                            <ChevronRight size={16} color={theme.textMuted} />
                        </Card>
                    </Pressable>
                ))}
                {list.items.length >= 200 ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, textAlign: 'center' }}>Showing the first 200 — search or filter to narrow down.</Text> : null}
            </ScrollView>
            <MemberSheet state={state} memberId={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onChanged={() => void list.refresh()} />
        </View>
    );
}
