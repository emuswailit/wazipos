// components/church/denomination/DenominationRegions.tsx
//
// Denomination → Regions: head office (head / admins, WaziPOS admins) adds regions
// (region, diocese, presbytery…) and appoints each region's admins by WaziPOS phone.
// Region admins approve parishes joining their region and appoint parish officials.
// A region admin sees their own region here, read-only.

import type { Region } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, ChoiceChips, FormSection } from '@/components/common/listScreen';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { useRouter } from 'expo-router';
import { Church, Map, Pencil, Plus, Trash2, UserPlus } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyNote, runWrite } from '../churchShared';
import { DenominationGate, useDenomination, type DenominationState } from './denominationShared';

export default function DenominationRegions() {
    const state = useDenomination();
    return <DenominationGate state={state}>{(home) => <Body state={state} canManage={home.can.manage_regions} />}</DenominationGate>;
}

function Body({ state, canManage }: { state: DenominationState; canManage: boolean }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const router = useRouter();
    const [editing, setEditing] = useState<Region | 'new' | null>(null);
    const [adminFor, setAdminFor] = useState<Region | null>(null);
    const list = useCachedList<Region>({ key: `denom_regions:${state.org}`, fetch: () => state.api('Regions') as any, pick: (d) => d?.result?.regions, enabled: !!state.org });
    const [q, setQ] = useState('');
    const [show, setShow] = useState<'ACTIVE' | 'NO_ADMIN' | 'INACTIVE' | 'ALL'>('ACTIVE');
    const rows = useMemo(() => {
        const t = q.trim().toLowerCase();
        return list.items.filter((r) => {
            if (show === 'ACTIVE' && !r.is_active) return false;
            if (show === 'INACTIVE' && r.is_active) return false;
            if (show === 'NO_ADMIN' && (r.admins.length || !r.is_active)) return false;
            return !t || `${r.name} ${r.description} ${r.admins.map((a) => a.name).join(' ')}`.toLowerCase().includes(t);
        });
    }, [list.items, q, show]);
    const upsert = (r: Region) => list.patch((rows) => (rows.some((x) => x.id === r.id) ? rows.map((x) => (x.id === r.id ? { ...x, ...r, parishes: x.parishes, members: x.members, families: x.families } : x)) : [...rows, r].sort((a, b) => a.name.localeCompare(b.name))));

    const removeAdmin = (r: Region, a: Region['admins'][number]) =>
        alert(`Remove ${a.name}?`, `They stop being admin of ${r.name}.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data } = await runWrite<Region>(state.api('RemoveRegionAdmin', { admin_id: a.id }), 'region', 'Region admin removed');
                    if (data) upsert(data);
                },
            },
        ]);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 980, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}>
                <PosHeader icon={Map} title="Regions" subtitle="Parishes belong to a region; region admins look after them" right={canManage ? <SoftButton label="New region" icon={Plus} tone="navy" onPress={() => setEditing('new')} /> : null} />
                {!canManage ? <InlineNotice tone="info" message="Regions and their admins are set by head office." /> : null}
                {list.items.length > 1 ? (
                    <>
                        <CustomTextField value={q} onChangeText={setQ} placeholder="Search regions or their admins" />
                        <Segmented
                            options={[
                                ['ACTIVE', 'Active'],
                                ['NO_ADMIN', 'No admin'],
                                ['INACTIVE', 'Inactive'],
                                ['ALL', 'All'],
                            ]}
                            value={show}
                            onChange={setShow}
                        />
                    </>
                ) : null}
                {list.items.length > 0 && !rows.length ? <EmptyNote icon={Map} title="No region matches" /> : null}
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {!list.loading && !list.items.length ? <EmptyNote icon={Map} title="No regions yet" text="Add regions (e.g. Nairobi Region, Coast Region), then appoint an admin for each." action={canManage ? <SoftButton label="New region" icon={Plus} onPress={() => setEditing('new')} /> : undefined} /> : null}
                {rows.map((r) => (
                    <Card key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{r.name}</Text>
                            {!r.is_active ? <Chip label="Inactive" color={theme.textMuted} /> : null}
                        </View>
                        {r.description ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13 }}>{r.description}</Text> : null}
                        <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>
                            {r.parishes} {r.parishes === 1 ? 'parish' : 'parishes'} · {r.members.toLocaleString()} members · {r.families.toLocaleString()} families
                        </Text>
                        <View style={{ gap: 6 }}>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>Region admins</Text>
                            {!r.admins.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13 }}>None yet</Text> : null}
                            {r.admins.map((a) => (
                                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold }}>
                                        {a.name}
                                        {a.phone ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>{`  ${a.phone}`}</Text> : null}
                                    </Text>
                                    {canManage ? <SoftButton label="Remove" icon={Trash2} tone="danger" onPress={() => removeAdmin(r, a)} /> : null}
                                </View>
                            ))}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            <SoftButton label="Parishes" icon={Church} onPress={() => router.push(`/denominationParishes?region=${r.id}` as any)} />
                            {canManage ? <SoftButton label="Add admin" icon={UserPlus} tone="neutral" onPress={() => setAdminFor(r)} /> : null}
                            {canManage ? <SoftButton label="Edit" icon={Pencil} tone="neutral" onPress={() => setEditing(r)} /> : null}
                        </View>
                    </Card>
                ))}
            </ScrollView>
            <RegionForm state={state} visible={!!editing} region={editing && editing !== 'new' ? editing : null} onClose={() => setEditing(null)} onSaved={(r) => { setEditing(null); upsert(r); }} />
            <RegionAdminForm state={state} region={adminFor} onClose={() => setAdminFor(null)} onSaved={(r) => { setAdminFor(null); upsert(r); }} />
        </View>
    );
}

function RegionForm({ state, visible, region, onClose, onSaved }: { state: DenominationState; visible: boolean; region: Region | null; onClose: () => void; onSaved: (r: Region) => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [active, setActive] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setName(region?.name ?? '');
        setDescription(region?.description ?? '');
        setActive(region?.is_active ?? true);
        setError(null);
    }, [visible, region]);

    const save = async () => {
        if (!name.trim()) return setError('Name the region.');
        setBusy(true);
        const { data, error: err } = await runWrite<Region>(state.api('SaveRegion', { region_id: region?.id, name, description, is_active: active }), 'region', region ? 'Region updated' : 'Region added');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={region ? 'Edit region' : 'New region'} subtitle={region?.name} icon="map-outline" submitLabel="Save" submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Region">
                <CustomTextField label="Name" required value={name} onChangeText={setName} placeholder="e.g. Nairobi Region, Diocese of Nakuru" />
                <CustomTextField label="Description" value={description} onChangeText={setDescription} placeholder="Counties or areas it covers" />
                {region ? (
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

function RegionAdminForm({ state, region, onClose, onSaved }: { state: DenominationState; region: Region | null; onClose: () => void; onSaved: (r: Region) => void }) {
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setPhone('');
        setError(null);
    }, [region?.id]);

    const save = async () => {
        if (phone.replace(/\D/g, '').length < 9) return setError('Enter their phone number.');
        setBusy(true);
        const { data, error: err } = await runWrite<Region>(state.api('SaveRegionAdmin', { region_id: region?.id, phone }), 'region', 'Region admin appointed');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={!!region} onClose={onClose} title="Appoint a region admin" subtitle={region?.name} icon="person-add-outline" submitLabel="Appoint" submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Who" hint="They must already have a WaziPOS account. They approve parishes joining the region and appoint parish officials.">
                <CustomTextField label="Their WaziPOS phone number" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
            </FormSection>
        </AdminFormSheet>
    );
}
