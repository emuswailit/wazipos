// components/church/denomination/DenominationParishes.tsx
//
// Denomination → Parishes. Head office sees every parish; a region admin sees their
// region's. Approved parishes with members / families (search, filter by region),
// join requests to approve or decline, and the declined list.
//   Officials   appoint / remove a parish's admin, pastor, secretary, treasurer, welfare
//               (region admins for their region, head office anywhere). Group leaders are
//               appointed inside the parish by its admin / pastor.
//   Move        head office puts a parish in another region.
//   New parish  head office (any region) or a region admin (theirs) registers a parish
//               directly, pinned on the map, optionally with its parish admin.

import type { Official, Parish } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, AdminSheet, ChoiceChips, FormSection, SheetButton } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import { useLocalSearchParams } from 'expo-router';
import LocationPinPicker from '@/components/common/LocationPinPicker';
import type { LatLng } from '@/components/common/locationPinShared';
import { ArrowRightLeft, Check, Church, MapPin, Phone, Plus, User, UserCog, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyNote, fmtDate, Meta, runWrite } from '../churchShared';
import { DenominationGate, useDenomination, type DenominationState } from './denominationShared';
import type { DenominationHome } from '@/api/churchesApi';

type Tab = 'APPROVED' | 'PENDING' | 'REJECTED';

export default function DenominationParishes() {
    const state = useDenomination();
    return <DenominationGate state={state}>{(home) => <Body state={state} home={home} />}</DenominationGate>;
}

function Body({ state, home }: { state: DenominationState; home: DenominationHome }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const params = useLocalSearchParams<{ tab?: string; region?: string }>();
    const [tab, setTab] = useState<Tab>(params.tab === 'PENDING' || params.tab === 'REJECTED' ? params.tab : 'APPROVED');
    const [q, setQ] = useState('');
    const [region, setRegion] = useState(params.region ?? '');
    const [busy, setBusy] = useState<string | null>(null);
    const [officialsOf, setOfficialsOf] = useState<Parish | null>(null);
    const [moving, setMoving] = useState<Parish | null>(null);
    const [creating, setCreating] = useState(false);

    const regionOptions = useMemo(
        () => [
            { value: '', label: home.level === 'REGION' ? 'All my regions' : 'All regions' },
            ...home.regions.filter((r) => r.id).map((r) => ({ value: r.id, label: r.name })),
            ...(home.level === 'DENOMINATION' ? [{ value: 'NONE', label: 'No region set' }] : []),
        ],
        [home],
    );

    const list = useCachedList<Parish>({
        key: `denom_parishes:${state.org}:${tab}:${region}`,
        fetch: () => state.api('DenominationParishes', { status: tab, region_id: region || undefined }) as any,
        pick: (d) => d?.result?.parishes,
        enabled: !!state.org,
    });

    const rows = useMemo(() => {
        const t = q.trim().toLowerCase();
        return list.items.filter((p) => !t || `${p.title} ${p.town} ${p.region?.name ?? ''} ${p.admin}`.toLowerCase().includes(t));
    }, [list.items, q]);
    const totals = useMemo(() => rows.reduce((a, p) => ({ members: a.members + p.members, families: a.families + p.families }), { members: 0, families: 0 }), [rows]);

    const decide = (p: Parish, decision: 'APPROVE' | 'REJECT' | 'REMOVE') => {
        const copy = {
            APPROVE: { title: `Approve ${p.title}?`, text: `It becomes a parish${p.region ? ` in ${p.region.name}` : ''} and shows your notices and events.`, button: 'Approve', style: 'default' as const },
            REJECT: { title: `Decline ${p.title}?`, text: 'The church stays independent. Its admin is told; they can ask again.', button: 'Decline', style: 'destructive' as const },
            REMOVE: { title: `Remove ${p.title}?`, text: 'It stops being listed as a parish and becomes independent. Its register is not affected.', button: 'Remove', style: 'destructive' as const },
        }[decision];
        alert(copy.title, copy.text, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: copy.button,
                style: copy.style,
                onPress: async () => {
                    setBusy(p.id);
                    const { data } = await runWrite<Parish>(state.api('DecideParish', { church: p.id, decision }), 'parish', decision === 'APPROVE' ? 'Parish approved' : decision === 'REJECT' ? 'Request declined' : 'Parish removed');
                    setBusy(null);
                    if (data) {
                        list.patch((items) => items.filter((x) => x.id !== p.id));
                        void state.reload();
                    }
                },
            },
        ]);
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 980, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />} keyboardShouldPersistTaps="handled">
                <PosHeader
                    icon={Church}
                    title="Parishes"
                    subtitle={tab === 'APPROVED' ? `${rows.length} parishes · ${totals.members.toLocaleString()} members · ${totals.families.toLocaleString()} families` : list.sourceLabel}
                    right={home.can.decide_parishes ? <SoftButton label="New parish" icon={Plus} tone="navy" onPress={() => setCreating(true)} /> : null}
                />
                <Segmented<Tab>
                    options={[
                        ['APPROVED', 'Parishes'],
                        ['PENDING', `Requests${home.counts.pending ? ` (${home.counts.pending})` : ''}`],
                        ['REJECTED', 'Declined'],
                    ]}
                    value={tab}
                    onChange={setTab}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexGrow: 2, minWidth: 220 }}>
                        <CustomTextField value={q} onChangeText={setQ} placeholder="Search by parish, town or admin" />
                    </View>
                    {regionOptions.length > 2 || home.level === 'DENOMINATION' ? (
                        <View style={{ flexGrow: 1, minWidth: 180 }}>
                            <SelectDropdown options={regionOptions} value={region} onChange={setRegion} placeholder="All regions" />
                        </View>
                    ) : null}
                </View>
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {!list.loading && !rows.length ? (
                    <EmptyNote icon={Church} title={tab === 'PENDING' ? 'No requests waiting' : tab === 'REJECTED' ? 'Nothing declined' : 'No parishes here yet'} text={tab === 'APPROVED' ? "A parish's admin picks the denomination and its region in Church admin → Officials & settings; it then appears under Requests." : undefined} />
                ) : null}
                {rows.map((p) => (
                    <Card key={p.id}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{p.title}</Text>
                            {p.region ? <Chip label={p.region.name} color={theme.primary} /> : <Chip label="No region" color={theme.warning} />}
                            {!p.is_active ? <Chip label="Deactivated" color={theme.danger} /> : null}
                        </View>
                        {p.town ? <Meta icon={MapPin} text={p.town} /> : null}
                        {p.admin ? <Meta icon={User} text={`Registered by ${p.admin}${p.admin_phone ? ` · ${p.admin_phone}` : ''}`} /> : null}
                        {p.phone ? <Meta icon={Phone} text={p.phone} /> : null}
                        {tab === 'APPROVED' ? (
                            <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>
                                {p.members.toLocaleString()} members · {p.families.toLocaleString()} families
                            </Text>
                        ) : (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                {tab === 'PENDING' ? 'Asked' : 'Declined'} {fmtDate(p.updated)}
                                {p.org_note ? ` · ${p.org_note}` : ''}
                            </Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {busy === p.id ? <ActivityIndicator color={theme.primary} /> : null}
                            {tab === 'APPROVED' ? <SoftButton label="Officials" icon={UserCog} onPress={() => setOfficialsOf(p)} /> : null}
                            {tab === 'APPROVED' && home.can.move_parishes ? <SoftButton label="Move region" icon={ArrowRightLeft} tone="neutral" onPress={() => setMoving(p)} /> : null}
                            {home.can.decide_parishes && tab !== 'APPROVED' ? <SoftButton label="Approve" icon={Check} onPress={() => decide(p, 'APPROVE')} disabled={!!busy} /> : null}
                            {home.can.decide_parishes && tab === 'PENDING' ? <SoftButton label="Decline" icon={X} tone="danger" onPress={() => decide(p, 'REJECT')} disabled={!!busy} /> : null}
                            {home.can.decide_parishes && tab === 'APPROVED' ? <SoftButton label="Remove" icon={X} tone="danger" onPress={() => decide(p, 'REMOVE')} disabled={!!busy} /> : null}
                        </View>
                    </Card>
                ))}
            </ScrollView>
            <ParishOfficialsSheet state={state} parish={officialsOf} onClose={() => setOfficialsOf(null)} />
            <NewParishForm
                state={state}
                visible={creating}
                regions={(home.level === 'REGION' ? home.my_regions.map((r) => ({ value: r.id, label: r.name })) : home.regions.filter((r) => r.id && r.is_active).map((r) => ({ value: r.id, label: r.name })))}
                defaultRegion={region && region !== 'NONE' ? region : ''}
                onClose={() => setCreating(false)}
                onSaved={(p) => {
                    setCreating(false);
                    if (tab === 'APPROVED' && (!region || p.region?.id === region)) list.patch((items) => [p, ...items].sort((a, b) => a.title.localeCompare(b.title)));
                    void state.reload();
                }}
            />
            <MoveRegionForm
                state={state}
                parish={moving}
                regions={home.regions.filter((r) => r.id && r.is_active).map((r) => ({ value: r.id, label: r.name }))}
                onClose={() => setMoving(null)}
                onSaved={(p) => {
                    setMoving(null);
                    list.patch((items) => (region && p.region?.id !== region ? items.filter((x) => x.id !== p.id) : items.map((x) => (x.id === p.id ? p : x))));
                    void state.reload();
                }}
            />
        </View>
    );
}

/* ------------------------------------------------------------ parish officials */

function ParishOfficialsSheet({ state, parish, onClose }: { state: DenominationState; parish: Parish | null; onClose: () => void }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [rows, setRows] = useState<Official[] | null>(null);
    const [offices, setOffices] = useState<{ value: string; label: string }[]>([]);
    const [canAppoint, setCanAppoint] = useState(false);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const take = (r: any) => {
        setRows(r.officials);
        setOffices(r.offices);
        setCanAppoint(r.can_appoint);
    };

    useEffect(() => {
        setRows(null);
        setError(null);
        if (!parish) return;
        state.api('ParishOfficials', { church: parish.id }).then((res: any) => (isServerOk(res) ? take(res.data.result) : setError('Could not load the officials.')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parish?.id]);

    const remove = (o: Official) =>
        alert(`Remove ${o.name}?`, `They stop being ${o.office_label}${o.group ? ` of ${o.group.name}` : ''} at ${parish?.title}.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data, error: err } = await runWrite(state.api('RemoveParishOfficial', { church: parish?.id, official_id: o.id }), 'result', 'Official removed');
                    if (data) take(data);
                    else setError(err);
                },
            },
        ]);

    return (
        <>
            <AdminSheet
                visible={!!parish && !adding}
                onClose={onClose}
                title={parish ? `${parish.title} officials` : 'Officials'}
                subtitle="Parish admin, pastor, secretary, treasurer, welfare"
                icon="people-outline"
                width={640}
                footer={canAppoint ? <SheetButton label="Appoint" icon="person-add-outline" onPress={() => setAdding(true)} /> : <SheetButton label="Done" onPress={onClose} />}
            >
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                {rows === null && !error ? <ActivityIndicator color={theme.primary} /> : null}
                {rows && !rows.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>No officials yet. Appoint the parish admin first; they then appoint group leaders.</Text> : null}
                {(rows ?? []).map((o) => (
                    <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderColor: theme.border }}>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.semibold }}>{o.name}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                                <Chip label={o.office_label} color={o.office === 'ADMIN' ? theme.success : theme.primary} />
                                {o.group ? <Chip label={o.group.name} color={theme.textMuted} /> : null}
                            </View>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{[o.phone, o.added_by ? `by ${o.added_by}` : null, `since ${fmtDate(o.since)}`].filter(Boolean).join(' · ')}</Text>
                        </View>
                        {canAppoint && o.office !== 'GROUP_LEADER' ? <SoftButton label="Remove" icon={X} tone="danger" onPress={() => remove(o)} /> : null}
                    </View>
                ))}
            </AdminSheet>
            <AppointForm
                state={state}
                parish={adding ? parish : null}
                offices={offices}
                onClose={() => setAdding(false)}
                onSaved={(r) => {
                    take(r);
                    setAdding(false);
                }}
            />
        </>
    );
}

function AppointForm({ state, parish, offices, onClose, onSaved }: { state: DenominationState; parish: Parish | null; offices: { value: string; label: string }[]; onClose: () => void; onSaved: (r: any) => void }) {
    const [phone, setPhone] = useState('');
    const [office, setOffice] = useState('ADMIN');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setPhone('');
        setOffice('ADMIN');
        setError(null);
    }, [parish?.id]);

    const save = async () => {
        if (phone.replace(/\D/g, '').length < 9) return setError('Enter their phone number.');
        setBusy(true);
        const { data, error: err } = await runWrite(state.api('AppointParishOfficial', { church: parish?.id, phone, office }), 'result', 'Official appointed');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={!!parish} onClose={onClose} title="Appoint a parish official" subtitle={parish?.title} icon="person-add-outline" submitLabel="Appoint" submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Who" hint="They must already have a WaziPOS account. They see Church admin for this parish after signing in again.">
                <CustomTextField label="Their WaziPOS phone number" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
                <ChoiceChips label="Office" options={offices as any} value={office} onChange={(v) => setOffice(v as string)} />
            </FormSection>
        </AdminFormSheet>
    );
}

/* ------------------------------------------------------------ move region */

function MoveRegionForm({ state, parish, regions, onClose, onSaved }: { state: DenominationState; parish: Parish | null; regions: { value: string; label: string }[]; onClose: () => void; onSaved: (p: Parish) => void }) {
    const [region, setRegion] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setRegion(parish?.region?.id ?? '');
        setError(null);
    }, [parish?.id]);

    const save = async () => {
        setBusy(true);
        const { data, error: err } = await runWrite<Parish>(state.api('MoveParish', { church: parish?.id, region_id: region }), 'parish', 'Parish moved');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={!!parish} onClose={onClose} title="Move to a region" subtitle={parish?.title} icon="swap-horizontal-outline" submitLabel="Move" submitting={busy} onSubmit={() => void save()} error={error}>
            <SelectDropdown label="Region" options={[{ value: '', label: 'No region' }, ...regions]} value={region} onChange={setRegion} />
        </AdminFormSheet>
    );
}

/* ------------------------------------------------------------ new parish */

function NewParishForm({ state, visible, regions, defaultRegion, onClose, onSaved }: { state: DenominationState; visible: boolean; regions: { value: string; label: string }[]; defaultRegion: string; onClose: () => void; onSaved: (p: Parish) => void }) {
    const [title, setTitle] = useState('');
    const [regionId, setRegionId] = useState('');
    const [town, setTown] = useState('');
    const [road, setRoad] = useState('');
    const [phone, setPhone] = useState('');
    const [adminPhone, setAdminPhone] = useState('');
    const [pin, setPin] = useState<LatLng | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setTitle('');
        setRegionId(defaultRegion || (regions.length === 1 ? regions[0].value : ''));
        setTown('');
        setRoad('');
        setPhone('');
        setAdminPhone('');
        setPin(null);
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const save = async () => {
        if (!title.trim()) return setError('Name the parish.');
        if (regions.length && !regionId) return setError('Pick the region.');
        if (!pin) return setError('Pin the parish on the map — every church needs its GPS location.');
        if (adminPhone && adminPhone.replace(/\D/g, '').length < 9) return setError("Enter the parish admin's full phone number, or leave it blank.");
        setBusy(true);
        const { data, error: err } = await runWrite<Parish>(
            state.api('CreateParish', { title, region_id: regionId, town, road, phone, admin_phone: adminPhone || undefined, latitude: pin.latitude, longitude: pin.longitude }),
            'parish',
            'Parish registered',
        );
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title="Register a parish" subtitle="It joins the denomination straight away" icon="add-circle-outline" submitLabel="Register" submitting={busy} onSubmit={() => void save()} error={error} width={720}>
            <FormSection title="Parish">
                <CustomTextField label="Name" required value={title} onChangeText={setTitle} placeholder="e.g. FPFK Kayole" />
                {regions.length ? <SelectDropdown label="Region" options={regions} value={regionId} onChange={setRegionId} placeholder="Pick the region" /> : null}
                <CustomTextField label="Town" value={town} onChangeText={setTown} />
                <CustomTextField label="Road / landmark" value={road} onChangeText={setRoad} />
                <CustomTextField label="Church phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </FormSection>
            <FormSection title="Location" hint="Required. Drag the pin to the church building.">
                <LocationPinPicker value={pin} onChange={setPin} height={220} />
            </FormSection>
            <FormSection title="Parish admin" hint="Optional. Their WaziPOS phone number; they run the parish's register and appoint its group leaders. You can appoint officials later too.">
                <CustomTextField label="Parish admin's WaziPOS phone" value={adminPhone} onChangeText={setAdminPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
            </FormSection>
        </AdminFormSheet>
    );
}
