// components/church/denomination/DenominationsDesk.tsx
//
// Admin Panel → Denominations (WaziPOS admins only): add church denominations /
// fellowships (e.g. Free Pentecostal Fellowship in Kenya), rename them, and appoint
// each one's head by phone. Shows how many parishes each has and requests waiting.

import churchesApi, { type Denomination } from '@/api/churchesApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, FormSection } from '@/components/common/listScreen';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { useRouter } from 'expo-router';
import { Landmark, Pencil, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyNote, runWrite } from '../churchShared';
import { pickDenomination } from './denominationShared';

export default function DenominationsDesk() {
    const { theme } = useAuth();
    const router = useRouter();
    const [rows, setRows] = useState<Denomination[] | null>(null);
    const [q, setQ] = useState('');
    const [show, setShow] = useState<'ALL' | 'WAITING' | 'NO_HEAD' | 'NO_PARISHES'>('ALL');
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState<Denomination | 'new' | null>(null);

    const load = useCallback(async () => {
        const res: any = await churchesApi.desk().catch(() => null);
        if (isServerOk(res)) {
            setRows(res.data.result.denominations);
            setError(null);
        } else setError(res ? describeResponse(res, 'Could not load denominations.').message : "You're offline.");
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const shown = useMemo(() => {
        const t = q.trim().toLowerCase();
        return (rows ?? []).filter((d) => {
            if (show === 'WAITING' && !d.pending) return false;
            if (show === 'NO_HEAD' && d.heads?.length) return false;
            if (show === 'NO_PARISHES' && d.parishes) return false;
            return !t || `${d.title} ${d.description} ${(d.heads ?? []).join(' ')}`.toLowerCase().includes(t);
        });
    }, [rows, q, show]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 980, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.primary} />} keyboardShouldPersistTaps="handled">
                <PosHeader icon={Landmark} title="Denominations" subtitle="Church bodies above parishes" right={<SoftButton label="Add" icon={Plus} tone="navy" onPress={() => setEditing('new')} />} />
                <CustomTextField value={q} onChangeText={setQ} placeholder="Search denominations or their heads" />
                <Segmented
                    options={[
                        ['ALL', 'All'],
                        ['WAITING', 'Parishes waiting'],
                        ['NO_HEAD', 'No head'],
                        ['NO_PARISHES', 'No parishes'],
                    ]}
                    value={show}
                    onChange={setShow}
                />
                {error ? <InlineNotice tone="warning" message={error} /> : null}
                {rows === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {rows && !shown.length ? <EmptyNote icon={Landmark} title="No denominations" text="Add a denomination, then appoint its head. Its parishes ask to join from their church settings." /> : null}
                {shown.map((d) => (
                    <Card key={d.id}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{d.title}</Text>
                            <Chip label={`${d.regions ?? 0} regions`} color={theme.textMuted} />
                            <Chip label={`${d.parishes} parishes`} color={theme.primary} />
                            {d.pending ? <Chip label={`${d.pending} waiting`} color={theme.warning} /> : null}
                        </View>
                        {d.description ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13 }}>{d.description}</Text> : null}
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{d.heads?.length ? `Head: ${d.heads.join(', ')}` : 'No head appointed yet'}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            <SoftButton label="Edit / appoint head" icon={Pencil} tone="neutral" onPress={() => setEditing(d)} />
                            <SoftButton label="Open head office" icon={Landmark} onPress={() => { pickDenomination(d.id); router.push('/denomination' as any); }} />
                        </View>
                    </Card>
                ))}
            </ScrollView>
            <DenominationForm
                visible={!!editing}
                item={editing && editing !== 'new' ? editing : null}
                onClose={() => setEditing(null)}
                onSaved={(d) => {
                    setEditing(null);
                    setRows((r) => (r ?? []).some((x) => x.id === d.id) ? (r ?? []).map((x) => (x.id === d.id ? d : x)) : [...(r ?? []), d].sort((a, b) => a.title.localeCompare(b.title)));
                }}
            />
        </View>
    );
}

function DenominationForm({ visible, item, onClose, onSaved }: { visible: boolean; item: Denomination | null; onClose: () => void; onSaved: (d: Denomination) => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [headPhone, setHeadPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setTitle(item?.title ?? '');
        setDescription(item?.description ?? '');
        setHeadPhone('');
        setError(null);
    }, [visible, item]);

    const save = async () => {
        if (!title.trim()) return setError('Enter the name.');
        if (headPhone && headPhone.replace(/\D/g, '').length < 9) return setError("Enter the head's full phone number, or leave it blank.");
        setBusy(true);
        const { data, error: err } = await runWrite<Denomination>(churchesApi.saveDenomination({ organization_id: item?.id, title, description, head_phone: headPhone || undefined }), 'denomination', item ? 'Denomination updated' : 'Denomination added');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={item ? 'Edit denomination' : 'Add a denomination'} subtitle={item?.title} icon="business-outline" submitLabel="Save" submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Denomination">
                <CustomTextField label="Name" required value={title} onChangeText={setTitle} placeholder="e.g. Free Pentecostal Fellowship in Kenya" />
                <CustomTextField label="Short description" value={description} onChangeText={setDescription} placeholder="e.g. FPFK — headquarters, Nairobi" />
            </FormSection>
            <FormSection title="Head / overseer" hint="Optional. They must already have a WaziPOS account; they then appoint the rest of head office.">
                <CustomTextField label="Head's WaziPOS phone number" value={headPhone} onChangeText={setHeadPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
            </FormSection>
        </AdminFormSheet>
    );
}
