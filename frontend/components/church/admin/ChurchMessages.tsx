// components/church/admin/ChurchMessages.tsx
//
// Church admin → Send SMS: text members by audience (everyone, household heads, a
// group, a family, an age band, women / men), see how many it reaches and the month's
// allowance before sending, and the log of what was sent. Group leaders text their group.

import type { Family, Group, SmsAudience, SmsMessage, SmsPreview } from '@/api/churchesApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { ChoiceChips } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, PrimaryCTA } from '@/components/ui/pos';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import { MessageSquare } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, ChurchAdminGate, ChurchSwitcher, fmtDateTime, runWrite, SectionHeading, useChurchAdmin, type ChurchAdminState } from '../churchShared';

const MAX = 459;
const TEMPLATES: { label: string; text: string }[] = [
    { label: 'Service reminder', text: 'Reminder: Sunday service starts at 9:00am. Come with a friend. God bless you.' },
    { label: 'Condolence notice', text: 'With sorrow we announce the passing of ... Funeral service: ... at ... Let us support the family in prayer.' },
    { label: 'Harambee appeal', text: 'Our church harambee for ... is on ... Your support is welcome. Thank you and God bless.' },
    { label: 'Meeting', text: 'All members of ... are invited to a meeting on ... at ... in the church hall.' },
];

export default function ChurchMessages() {
    const state = useChurchAdmin();
    return <ChurchAdminGate state={state}>{(home) => <MessagesBody state={state} isLeaderOnly={home.office === 'GROUP_LEADER'} canSend={home.can.send_sms} />}</ChurchAdminGate>;
}

function MessagesBody({ state, isLeaderOnly, canSend }: { state: ChurchAdminState; isLeaderOnly: boolean; canSend: boolean }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [aud, setAud] = useState<SmsAudience>({ kind: isLeaderOnly ? 'GROUP' : 'ALL' });
    const [text, setText] = useState('');
    const [preview, setPreview] = useState<SmsPreview | null>(null);
    const [groups, setGroups] = useState<{ value: string; label: string }[]>([]);
    const [families, setFamilies] = useState<{ value: string; label: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const log = useCachedList<SmsMessage>({ key: `church_sms:${state.church}`, fetch: () => state.api('SmsLog') as any, pick: (d) => d?.result?.messages, enabled: !!state.church, pollMs: 20000 });

    useEffect(() => {
        if (!state.church) return;
        state.api('Groups').then((res: any) => isServerOk(res) && setGroups(res.data.result.groups.map((g: Group) => ({ value: g.id, label: g.name }))));
        if (!isLeaderOnly) state.api('Families', { page_size: 200 }).then((res: any) => isServerOk(res) && setFamilies(res.data.result.families.map((f: Family) => ({ value: f.id, label: `${f.number} ${f.name}` }))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.church]);

    const ready = useMemo(() => {
        if (aud.kind === 'GROUP') return !!aud.group_id;
        if (aud.kind === 'FAMILY') return !!aud.family_id;
        if (aud.kind === 'GENDER') return !!aud.gender;
        return true;
    }, [aud]);

    // Live count of recipients for the chosen audience.
    useEffect(() => {
        if (!state.church || !ready) return setPreview(null);
        const t = setTimeout(() => {
            state.api('SmsPreview', { audience: aud, message: text }).then((res: any) => {
                if (isServerOk(res)) {
                    setPreview(res.data.preview);
                    setError(null);
                } else setPreview(null);
            });
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aud, ready, state.church, text.length > 160]);

    const send = () => {
        if (!text.trim()) return setError('Write the message.');
        if (!preview?.recipients) return setError('Nobody in this audience has a phone number.');
        alert(`Send to ${preview.recipients} ${preview.recipients === 1 ? 'person' : 'people'}?`, `"${text.trim().slice(0, 140)}${text.length > 140 ? '…' : ''}"\n\n${preview.label}. Uses ${preview.recipients} of your ${preview.left} SMS left this month.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Send',
                onPress: async () => {
                    setBusy(true);
                    const { data, error: err } = await runWrite<SmsMessage>(state.api('SendSms', { audience: aud, message: text.trim() }), 'message', 'Sending your message');
                    setBusy(false);
                    if (data) {
                        setText('');
                        log.patch((rows) => [data, ...rows]);
                        setTimeout(() => void log.refresh(), 4000);
                    } else setError(err);
                },
            },
        ]);
    };

    if (!canSend) return <View style={{ padding: 16 }}><InlineNotice tone="warning" message="Your church role can't send SMS." /></View>;

    const kinds = isLeaderOnly
        ? [{ value: 'GROUP' as const, label: 'My group' }]
        : [
              { value: 'ALL' as const, label: 'All members' },
              { value: 'HEADS' as const, label: 'Household heads' },
              { value: 'GROUP' as const, label: 'A group' },
              { value: 'FAMILY' as const, label: 'A family' },
              { value: 'AGE' as const, label: 'Age band' },
              { value: 'GENDER' as const, label: 'Women / men' },
          ];

    return (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 12 }} refreshControl={<RefreshControl refreshing={log.refreshing} onRefresh={() => void log.refresh()} tintColor={theme.primary} />} keyboardShouldPersistTaps="handled">
            <ChurchSwitcher state={state} />
            <PosHeader icon={MessageSquare} title="Send SMS" subtitle={preview ? `${preview.used} of ${preview.quota} SMS used this month` : 'Text members by group, family or age'} />
            <Card>
                <ChoiceChips label="Who gets it" options={kinds} value={aud.kind} onChange={(kind) => setAud({ kind, include_visitors: aud.include_visitors })} />
                {aud.kind === 'GROUP' ? <SelectDropdown label="Group" options={groups} value={aud.group_id ?? ''} onChange={(v) => setAud({ ...aud, group_id: v })} placeholder="Pick a group" /> : null}
                {aud.kind === 'FAMILY' ? <SelectDropdown label="Family" options={families} value={aud.family_id ?? ''} onChange={(v) => setAud({ ...aud, family_id: v })} placeholder="Pick a family" /> : null}
                {aud.kind === 'GENDER' ? (
                    <ChoiceChips
                        options={[
                            { value: 'Female', label: 'Women' },
                            { value: 'Male', label: 'Men' },
                        ]}
                        value={aud.gender ?? null}
                        onChange={(g) => setAud({ ...aud, gender: g as 'Female' | 'Male' })}
                    />
                ) : null}
                {aud.kind === 'AGE' ? (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <CustomTextField label="From age" value={aud.min_age ?? ''} onChangeText={(t) => setAud({ ...aud, min_age: t.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="13" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <CustomTextField label="To age" value={aud.max_age ?? ''} onChangeText={(t) => setAud({ ...aud, max_age: t.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="35" />
                        </View>
                    </View>
                ) : null}
                <ChoiceChips
                    options={[
                        { value: 'no', label: 'Members only' },
                        { value: 'yes', label: 'Include visitors' },
                    ]}
                    value={aud.include_visitors ? 'yes' : 'no'}
                    onChange={(v) => setAud({ ...aud, include_visitors: v === 'yes' })}
                />
            </Card>

            <Card>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {TEMPLATES.map((t) => (
                        <Text key={t.label} onPress={() => setText(t.text)} style={{ color: theme.primary, fontFamily: theme.font.semibold, fontSize: 12.5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.primarySoft, overflow: 'hidden' }}>
                            {t.label}
                        </Text>
                    ))}
                </View>
                <CustomTextField label="Message" value={text} onChangeText={(t) => setText(t.slice(0, MAX))} multiline placeholder="Write your message" />
                <Text style={{ color: text.length > 160 ? theme.warning : theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {text.length}/{MAX} characters{text.length > 160 ? ` · ${Math.ceil(text.length / 153)} SMS each` : ''}
                </Text>
                {preview ? (
                    <Text style={{ color: theme.text, fontFamily: theme.font.semibold }}>
                        Reaches {preview.recipients} {preview.recipients === 1 ? 'person' : 'people'} ({preview.label}) · {preview.left} SMS left this month
                    </Text>
                ) : null}
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                <PrimaryCTA label={busy ? 'Sending…' : 'Send SMS'} onPress={send} disabled={busy || !ready || !text.trim()} loading={busy} />
            </Card>

            <SectionHeading title="Sent" hint={log.sourceLabel} />
            {!log.items.length ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>Nothing sent yet.</Text> : null}
            {log.items.map((m) => (
                <Card key={m.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold }}>{m.audience_label}</Text>
                        <Chip label={m.status === 'SENT' ? 'Sent' : m.status === 'PARTIAL' ? 'Partly sent' : m.status === 'FAILED' ? 'Failed' : 'Sending'} color={m.status === 'SENT' ? theme.success : m.status === 'FAILED' ? theme.danger : theme.warning} />
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13.5 }}>{m.body}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {fmtDateTime(m.created)} · {m.sent}/{m.recipients} delivered to the network{m.failed ? ` · ${m.failed} failed` : ''}
                        {m.sent_by ? ` · by ${m.sent_by}` : ''}
                    </Text>
                </Card>
            ))}
        </ScrollView>
    );
}
