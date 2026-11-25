// components/church/denomination/DenominationAdmins.tsx
//
// Denomination → Head office: who runs the denomination on WaziPOS (head, admins,
// communications). Appointed by WaziPOS admins, by the phone number on their WaziPOS
// account; head office in turn appoints region admins (Regions).

import type { HqAdmin } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, ChoiceChips, FormSection } from '@/components/common/listScreen';
import { InlineNotice, PosHeader, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { isServerOk } from '@/utils/serverResponse';
import { Plus, Trash2, UserCog } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Card, Chip, fmtDate, runWrite } from '../churchShared';
import { DenominationGate, useDenomination, type DenominationState } from './denominationShared';

const ROLES = [
    { value: 'HEAD', label: 'Head / overseer' },
    { value: 'ADMIN', label: 'Head-office admin' },
    { value: 'COMMUNICATIONS', label: 'Communications' },
] as const;

export default function DenominationAdmins() {
    const state = useDenomination();
    return <DenominationGate state={state}>{() => <Body state={state} />}</DenominationGate>;
}

function Body({ state }: { state: DenominationState }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [rows, setRows] = useState<HqAdmin[] | null>(null);
    const [canManage, setCanManage] = useState(false);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        state.api('DenominationAdmins').then((res: any) => {
            if (isServerOk(res)) {
                setRows(res.data.result.admins);
                setCanManage(res.data.result.can_manage);
            } else setError('Could not load head office.');
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.org]);

    const remove = (a: HqAdmin) =>
        alert(`Remove ${a.name}?`, `They stop being ${a.role_label} and lose the Denomination menu.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data, error: err } = await runWrite<{ admins: HqAdmin[] }>(state.api('RemoveDenominationAdmin', { admin_id: a.id }), 'result', 'Removed');
                    if (data) setRows(data.admins);
                    else setError(err);
                },
            },
        ]);

    return (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 10 }}>
            <PosHeader icon={UserCog} title="Head office" subtitle="People who run the denomination on WaziPOS" right={canManage ? <SoftButton label="Add" icon={Plus} tone="navy" onPress={() => setAdding(true)} /> : null} />
            {!canManage ? <InlineNotice tone="info" message="Denomination roles are appointed by WaziPOS admins. Head office appoints region admins (Regions)." /> : null}
            {error ? <InlineNotice tone="danger" message={error} /> : null}
            {rows && !rows.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>Nobody appointed yet.</Text> : null}
            {(rows ?? []).map((a) => (
                <Card key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>{a.name}</Text>
                        <Chip label={a.role_label} color={a.role === 'HEAD' ? theme.success : theme.primary} />
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{[a.phone, `since ${fmtDate(a.since)}`].filter(Boolean).join(' · ')}</Text>
                    </View>
                    {canManage ? <SoftButton label="Remove" icon={Trash2} tone="danger" onPress={() => remove(a)} /> : null}
                </Card>
            ))}
            <AddAdmin state={state} visible={adding} onClose={() => setAdding(false)} onSaved={(list) => { setRows(list); setAdding(false); }} />
        </ScrollView>
    );
}

function AddAdmin({ state, visible, onClose, onSaved }: { state: DenominationState; visible: boolean; onClose: () => void; onSaved: (rows: HqAdmin[]) => void }) {
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<(typeof ROLES)[number]['value']>('ADMIN');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setPhone('');
        setRole('ADMIN');
        setError(null);
    }, [visible]);

    const save = async () => {
        if (phone.replace(/\D/g, '').length < 9) return setError('Enter their phone number.');
        setBusy(true);
        const { data, error: err } = await runWrite<{ admins: HqAdmin[] }>(state.api('SaveDenominationAdmin', { phone, role }), 'result', 'Added to head office');
        setBusy(false);
        if (data) onSaved(data.admins);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title="Add to head office" subtitle="They must already have a WaziPOS account" icon="person-add-outline" submitLabel="Add" submitting={busy} onSubmit={() => void save()} error={error}>
            <FormSection title="Who">
                <CustomTextField label="Their WaziPOS phone number" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
                <ChoiceChips label="Role" options={ROLES as any} value={role} onChange={(v) => setRole(v as any)} />
            </FormSection>
        </AdminFormSheet>
    );
}
