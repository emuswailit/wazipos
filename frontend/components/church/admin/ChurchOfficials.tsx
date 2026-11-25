// components/church/admin/ChurchOfficials.tsx
//
// Church admin → Officials & settings:
//   Settings    denomination + region (asks head office / the region to approve), about,
//               listed in Find a church (parish admin / pastor / secretary / owner)
//   Officials   who helps run the parish. Roles come from higher up:
//               parish admin, pastor, secretary, treasurer, welfare — appointed by the
//               region admin or head office (an independent church's owner appoints them);
//               group leaders — appointed here by the parish admin / pastor.

import churchesApi, { type Denomination, type Group, type Official } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, ChoiceChips, FormSection } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, PrimaryCTA, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { isServerOk } from '@/utils/serverResponse';
import { Plus, Share2, Trash2, UserCog } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Card, Chip, ChurchAdminGate, ChurchSwitcher, fmtDate, runWrite, SectionHeading, shareChurch, useChurchAdmin, type ChurchAdminState } from '../churchShared';

export default function ChurchOfficials() {
    const state = useChurchAdmin();
    return (
        <ChurchAdminGate state={state}>
            {(home) => (
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 10 }} keyboardShouldPersistTaps="handled">
                    <ChurchSwitcher state={state} />
                    <PosHeader icon={UserCog} title="Officials & settings" subtitle={`${home.church.title} · you are ${home.office_label}`} />
                    {home.can.settings ? <Settings state={state} /> : <InlineNotice tone="info" message="Only the parish admin, pastor or secretary can change these settings." />}
                    {home.can.officials ? <Officials state={state} /> : <InlineNotice tone="info" message="Officials are appointed by the parish admin or pastor (group leaders) and by your region admin or head office (parish offices)." />}
                </ScrollView>
            )}
        </ChurchAdminGate>
    );
}

function Settings({ state }: { state: ChurchAdminState }) {
    const { theme } = useAuth();
    const c = state.home!.church;
    const approved = c.org_status === 'APPROVED' && !!c.denomination_id;
    // The denomination it belongs to, or the one it asked to join.
    const linked = c.denomination_id || (c.org_status === 'PENDING' ? c.org_request?.id : '') || '';
    const [orgId, setOrgId] = useState(linked);
    const [orgs, setOrgs] = useState<{ value: string; label: string }[]>([]);
    const [regionId, setRegionId] = useState(c.region_id || '');
    const [regions, setRegions] = useState<{ value: string; label: string }[]>([]);
    const [denomination, setDenomination] = useState(c.free_denomination || '');
    const [about, setAbout] = useState(c.about || '');
    const [listed, setListed] = useState(c.is_listed !== false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        churchesApi.denominations().then((res: any) => {
            if (isServerOk(res)) setOrgs([{ value: '', label: 'Independent (no denomination)' }, ...res.data.result.denominations.map((d: Denomination) => ({ value: d.id, label: d.title, description: `${d.parishes} parishes on WaziPOS` }))]);
        });
    }, []);

    // The chosen denomination's regions.
    useEffect(() => {
        setRegions([]);
        if (!orgId) return;
        churchesApi.regionsOf(orgId).then((res: any) => {
            if (isServerOk(res)) setRegions(res.data.result.regions.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name })));
        });
        if (orgId !== linked) setRegionId('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    const save = async () => {
        if (orgId && !approved && regions.length && !regionId) return setError('Pick your region.');
        setBusy(true);
        const body: any = { denomination: orgId ? '' : denomination, about, is_listed: listed };
        const asking = orgId !== linked || (!approved && !!orgId && regionId !== (c.region_id || ''));
        if (asking) {
            body.organization_id = orgId; // asks the region / head office (or leaves)
            body.region_id = regionId;
        }
        const { data, error: err } = await runWrite(state.api('SaveSettings', body), 'church', asking && orgId ? 'Saved — your region / head office has been asked to approve' : 'Church details saved');
        setBusy(false);
        if (data) void state.reload();
        else setError(err);
    };

    const statusNote = approved
        ? { tone: 'success' as const, text: `A parish of ${c.denomination}${c.region ? `, ${c.region}` : ''}. Head-office and region notices and events show on your church page. Head office moves parishes between regions.` }
        : c.org_status === 'PENDING'
          ? { tone: 'info' as const, text: `Waiting for ${c.org_request?.title ?? 'head office'}${c.region ? ` (${c.region})` : ''} to approve. Until then your church runs on its own.` }
          : c.org_status === 'REJECTED'
            ? { tone: 'warning' as const, text: `${c.org_request?.title ?? 'Head office'} did not accept the request${c.org_note ? `: ${c.org_note}` : ''}. Contact them, then ask again.` }
            : null;

    return (
        <>
            <SectionHeading title="Church page" hint="What people see in Find a church and on your shared link" right={c.code ? <SoftButton label="Share link" icon={Share2} tone="neutral" onPress={() => void shareChurch(c)} /> : null} />
            <Card>
                {statusNote ? <InlineNotice tone={statusNote.tone} message={statusNote.text} /> : null}
                <SelectDropdown
                    label="Denomination / fellowship"
                    options={orgs}
                    value={orgId}
                    onChange={setOrgId}
                    placeholder="Independent (no denomination)"
                    helperText="Choosing one asks its region admin / head office to approve this church as a parish. Not listed? Ask WaziPOS to add it."
                />
                {orgId && regions.length ? (
                    <SelectDropdown label="Region" options={regions} value={regionId} onChange={setRegionId} placeholder="Pick your region" disabled={approved} helperText={approved ? 'Head office moves parishes between regions.' : undefined} />
                ) : null}
                {!orgId ? <CustomTextField label="Denomination (as you call it)" value={denomination} onChangeText={setDenomination} placeholder="e.g. Independent Pentecostal" /> : null}
                <CustomTextField label="About" value={about} onChangeText={setAbout} multiline placeholder="A short welcome, the parish, how to reach the office" />
                <ChoiceChips
                    label="Listed in Find a church"
                    options={[
                        { value: 'yes', label: 'Listed (public page on)' },
                        { value: 'no', label: 'Hidden (members only)' },
                    ]}
                    value={listed ? 'yes' : 'no'}
                    onChange={(v) => setListed(v === 'yes')}
                />
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>Address, phone and map location come from the business details (Business tab).</Text>
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                <PrimaryCTA label="Save" onPress={() => void save()} loading={busy} disabled={busy} />
            </Card>
        </>
    );
}

function Officials({ state }: { state: ChurchAdminState }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [rows, setRows] = useState<Official[] | null>(null);
    const [offices, setOffices] = useState<{ value: string; label: string }[]>([]);
    const [fromAbove, setFromAbove] = useState(false);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const take = (r: any) => {
        setRows(r.officials);
        setOffices(r.offices);
        setFromAbove(!!r.appointed_above);
    };

    useEffect(() => {
        state.api('Officials').then((res: any) => (isServerOk(res) ? take(res.data.result) : setError('Could not load officials.')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.church]);

    const canRemove = (o: Official) => offices.some((x) => x.value === o.office);

    const remove = (o: Official) =>
        alert(`Remove ${o.name}?`, `They stop being ${o.office_label}${o.group ? ` of ${o.group.name}` : ''} and lose access to Church admin.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data, error: err } = await runWrite(state.api('RemoveOfficial', { official_id: o.id }), 'result', 'Official removed');
                    if (data) take(data);
                    else setError(err);
                },
            },
        ]);

    return (
        <>
            <SectionHeading title="Officials" hint="They see Church admin after signing in again" right={offices.length ? <SoftButton label={fromAbove ? 'Add group leader' : 'Add official'} icon={Plus} tone="navy" onPress={() => setAdding(true)} /> : null} />
            {fromAbove ? <InlineNotice tone="info" message="Your parish admin, pastor, secretary, treasurer and welfare officials are appointed by your region admin or head office. You appoint group leaders." /> : null}
            {error ? <InlineNotice tone="warning" message={error} /> : null}
            {rows && !rows.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>No officials yet.</Text> : null}
            {(rows ?? []).map((o) => (
                <Card key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>{o.name}</Text>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                            <Chip label={o.office_label} color={o.office === 'ADMIN' ? theme.success : theme.primary} />
                            {o.group ? <Chip label={o.group.name} color={theme.success} /> : null}
                        </View>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{[o.phone, o.added_by ? `by ${o.added_by}` : null, `since ${fmtDate(o.since)}`].filter(Boolean).join(' · ')}</Text>
                    </View>
                    {canRemove(o) ? <SoftButton label="Remove" icon={Trash2} tone="danger" onPress={() => remove(o)} /> : null}
                </Card>
            ))}
            <AddOfficial state={state} offices={offices} visible={adding} onClose={() => setAdding(false)} onSaved={(r) => { take(r); setAdding(false); }} />
        </>
    );
}

function AddOfficial({ state, offices, visible, onClose, onSaved }: { state: ChurchAdminState; offices: { value: string; label: string }[]; visible: boolean; onClose: () => void; onSaved: (r: any) => void }) {
    const [phone, setPhone] = useState('');
    const [office, setOffice] = useState('GROUP_LEADER');
    const [group, setGroup] = useState('');
    const [groups, setGroups] = useState<{ value: string; label: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setPhone('');
        setOffice(offices[0]?.value ?? 'GROUP_LEADER');
        setGroup('');
        setError(null);
        state.api('Groups').then((res: any) => isServerOk(res) && setGroups(res.data.result.groups.map((g: Group) => ({ value: g.id, label: g.name }))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const save = async () => {
        if (phone.replace(/\D/g, '').length < 9) return setError('Enter their phone number.');
        if (office === 'GROUP_LEADER' && !group) return setError('Pick the group they lead.');
        setBusy(true);
        const { data, error: err } = await runWrite(state.api('SaveOfficial', { phone, office, group_id: group || undefined }), 'result', 'Official added');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={offices.length === 1 ? 'Add a group leader' : 'Add an official'} subtitle="They must already have a WaziPOS account" icon="person-add-outline" submitLabel="Add" submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Who">
                <CustomTextField label="Their WaziPOS phone number" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
                {offices.length > 1 ? <ChoiceChips label="Office" options={offices as any} value={office} onChange={(v) => setOffice(v as string)} /> : null}
                {office === 'GROUP_LEADER' ? <SelectDropdown label="Group they lead" options={groups} value={group} onChange={setGroup} placeholder="Pick a group" /> : null}
            </FormSection>
        </AdminFormSheet>
    );
}
